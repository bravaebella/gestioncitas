-- =============================================================================
-- Brava e' Bella Nail's Studio — esquema propio dentro del proyecto SCH-CRM
-- Todo vive en el esquema "brava" y en el bucket "brava-portafolio".
-- No toca ninguna tabla, política ni bucket del CRM.
-- =============================================================================

create schema if not exists brava;

-- Las funciones nuevas de este esquema no quedan abiertas a todos por defecto.
alter default privileges in schema brava revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- 1. Quién administra la app (la dueña y, si hace falta, una asistente)
-- -----------------------------------------------------------------------------
create table brava.miembros (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  rol       text not null default 'duena' check (rol in ('duena', 'asistente')),
  creado_en timestamptz not null default now()
);

create function brava.es_miembro()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from brava.miembros m where m.user_id = (select auth.uid()));
$$;

-- -----------------------------------------------------------------------------
-- 2. Clientas (con su acceso al Club por enlace personal)
-- -----------------------------------------------------------------------------
create table brava.clientas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  telefono      text not null default '',
  notas         text not null default '',
  cumpleanos    date,
  acepta_promos boolean not null default false,
  -- Llave secreta del enlace personal del Club: quien la tiene entra a su tarjeta.
  club_token    text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  club_desde    timestamptz,
  creado_en     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Catálogo de tratamientos
-- -----------------------------------------------------------------------------
create table brava.tratamientos (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('manicura', 'pedicura')),
  nombre       text not null,
  duracion_min integer not null check (duracion_min > 0),
  precio       numeric(10, 2) not null check (precio >= 0),
  activo       boolean not null default true,
  orden        integer not null default 0,
  unique (tipo, nombre)
);

-- -----------------------------------------------------------------------------
-- 4. Citas (la base de datos impide que dos citas activas se encimen)
-- -----------------------------------------------------------------------------
create table brava.citas (
  id           uuid primary key default gen_random_uuid(),
  clienta_id   uuid not null references brava.clientas (id),
  tipo         text not null check (tipo in ('manicura', 'pedicura', 'ambas')),
  inicio       timestamptz not null,
  fin          timestamptz not null,
  estado       text not null default 'agendada'
               check (estado in ('agendada', 'atendida', 'cancelada', 'no_asistio')),
  precio_total numeric(10, 2) not null default 0 check (precio_total >= 0),
  notas        text not null default '',
  creado_en    timestamptz not null default now(),
  check (fin > inicio),
  constraint citas_sin_choques
    exclude using gist (tstzrange(inicio, fin) with &&)
    where (estado in ('agendada', 'atendida'))
);
create index citas_inicio_idx on brava.citas (inicio);
create index citas_clienta_idx on brava.citas (clienta_id);

-- Tratamientos de cada cita, con copia del precio y la duración de ese día
create table brava.cita_tratamientos (
  cita_id        uuid not null references brava.citas (id) on delete cascade,
  tratamiento_id uuid not null references brava.tratamientos (id),
  tipo           text not null check (tipo in ('manicura', 'pedicura')),
  nombre         text not null,
  duracion_min   integer not null check (duracion_min > 0),
  precio         numeric(10, 2) not null check (precio >= 0),
  primary key (cita_id, tratamiento_id)
);

-- -----------------------------------------------------------------------------
-- 5. Recordatorios de 1 hora y 30 minutos
-- -----------------------------------------------------------------------------
create table brava.recordatorios (
  id              uuid primary key default gen_random_uuid(),
  cita_id         uuid not null references brava.citas (id) on delete cascade,
  minutos_antes   integer not null check (minutos_antes in (60, 30)),
  enviar_en       timestamptz not null,
  push_duena_en   timestamptz,  -- notificación a la dueña: "toca mandar el WhatsApp"
  push_clienta_en timestamptz,  -- notificación directa a la clienta del Club
  whatsapp_en     timestamptz,  -- cuando la dueña lo mandó por WhatsApp
  unique (cita_id, minutos_antes)
);
create index recordatorios_pendientes_idx on brava.recordatorios (enviar_en)
  where push_duena_en is null or push_clienta_en is null;

-- -----------------------------------------------------------------------------
-- 6. Portafolio (el archivo vive en el bucket; aquí va la ficha)
-- -----------------------------------------------------------------------------
create table brava.portafolio (
  id        uuid primary key default gen_random_uuid(),
  titulo    text not null default '',
  tipo      text not null check (tipo in ('manicura', 'pedicura')),
  medio     text not null check (medio in ('foto', 'video')),
  ruta      text not null unique,
  visible   boolean not null default true,
  creado_en timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 7. Gastos y costos
-- -----------------------------------------------------------------------------
create table brava.gastos (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null default current_date,
  clase       text not null check (clase in ('gasto', 'costo')),
  categoria   text not null,
  descripcion text not null default '',
  monto       numeric(10, 2) not null check (monto >= 0),
  creado_en   timestamptz not null default now()
);
create index gastos_fecha_idx on brava.gastos (fecha);

-- -----------------------------------------------------------------------------
-- 8. Fidelización configurable
--    - General: aplica a todas las clientas (puede haber más de una a la vez,
--      por ejemplo la tarjeta de siempre y una campaña de temporada).
--    - Personal: solo para una clienta; puede sumarse a la general o reemplazarla.
-- -----------------------------------------------------------------------------
create table brava.programas_fidelidad (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  sellos_meta       integer not null check (sellos_meta between 1 and 30),
  premio            text not null,
  alcance           text not null default 'general' check (alcance in ('general', 'personal')),
  clienta_id        uuid references brava.clientas (id) on delete cascade,
  reemplaza_general boolean not null default false,
  sellos_por_cita   integer not null default 1 check (sellos_por_cita between 0 and 5),
  sellos_por_ambas  integer not null default 1 check (sellos_por_ambas between 0 and 5),
  activo            boolean not null default true,
  desde             date,
  hasta             date,
  creado_en         timestamptz not null default now(),
  check ((alcance = 'personal') = (clienta_id is not null)),
  check (hasta is null or desde is null or hasta >= desde)
);

-- Una tarjeta por ciclo: al completarla se abre la siguiente
create table brava.tarjetas (
  id            uuid primary key default gen_random_uuid(),
  clienta_id    uuid not null references brava.clientas (id) on delete cascade,
  programa_id   uuid not null references brava.programas_fidelidad (id) on delete cascade,
  numero        integer not null default 1,
  completada_en timestamptz,
  canjeada_en   timestamptz,
  creado_en     timestamptz not null default now(),
  unique (clienta_id, programa_id, numero)
);

create table brava.sellos (
  id         uuid primary key default gen_random_uuid(),
  tarjeta_id uuid not null references brava.tarjetas (id) on delete cascade,
  cita_id    uuid references brava.citas (id) on delete set null,
  cantidad   integer not null check (cantidad > 0),
  motivo     text not null default 'cita' check (motivo in ('cita', 'manual', 'bono')),
  creado_en  timestamptz not null default now(),
  unique (tarjeta_id, cita_id)
);

-- Programas que aplican a una clienta en una fecha
create function brava.programas_de(p_clienta uuid, p_fecha date)
returns setof brava.programas_fidelidad
language sql stable security definer set search_path = ''
as $$
  with vigentes as (
    select p.* from brava.programas_fidelidad p
    where p.activo
      and (p.desde is null or p.desde <= p_fecha)
      and (p.hasta is null or p.hasta >= p_fecha)
      and (p.alcance = 'general' or p.clienta_id = p_clienta)
  )
  select v.* from vigentes v
  where v.alcance = 'personal'
     or not exists (select 1 from vigentes x where x.alcance = 'personal' and x.reemplaza_general);
$$;

-- Da los sellos de una cita atendida; lo que sobra pasa a la tarjeta siguiente
create function brava.dar_sellos(p_cita uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c       brava.citas;
  p       brava.programas_fidelidad;
  t       brava.tarjetas;
  dar     integer;
  tiene   integer;
  ahora_n integer;
begin
  select * into c from brava.citas where id = p_cita;
  if not found or c.estado <> 'atendida' then return; end if;

  for p in select * from brava.programas_de(c.clienta_id, (c.inicio at time zone 'America/Managua')::date) loop
    dar := case when c.tipo = 'ambas' then p.sellos_por_ambas else p.sellos_por_cita end;
    while dar > 0 loop
      select * into t from brava.tarjetas
        where clienta_id = c.clienta_id and programa_id = p.id and completada_en is null
        order by numero desc limit 1;
      if not found then
        insert into brava.tarjetas (clienta_id, programa_id, numero)
        values (c.clienta_id, p.id,
                coalesce((select max(numero) from brava.tarjetas
                          where clienta_id = c.clienta_id and programa_id = p.id), 0) + 1)
        returning * into t;
      end if;

      select coalesce(sum(cantidad), 0) into tiene from brava.sellos where tarjeta_id = t.id;
      ahora_n := least(dar, p.sellos_meta - tiene);
      if ahora_n <= 0 then
        update brava.tarjetas set completada_en = now() where id = t.id;
        continue;
      end if;

      insert into brava.sellos (tarjeta_id, cita_id, cantidad, motivo)
      values (t.id, c.id, ahora_n, 'cita')
      on conflict (tarjeta_id, cita_id) do update set cantidad = brava.sellos.cantidad + excluded.cantidad;

      if tiene + ahora_n >= p.sellos_meta then
        update brava.tarjetas set completada_en = now() where id = t.id;
      end if;
      dar := dar - ahora_n;
    end loop;
  end loop;
end;
$$;

-- Si una cita deja de estar atendida, se quitan sus sellos de tarjetas no canjeadas
create function brava.quitar_sellos(p_cita uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select s.id, s.tarjeta_id from brava.sellos s
    join brava.tarjetas t on t.id = s.tarjeta_id
    where s.cita_id = p_cita and t.canjeada_en is null
  loop
    delete from brava.sellos where id = r.id;
    update brava.tarjetas t set completada_en = null
    where t.id = r.tarjeta_id
      and (select coalesce(sum(cantidad), 0) from brava.sellos where tarjeta_id = t.id)
          < (select sellos_meta from brava.programas_fidelidad where id = t.programa_id);
  end loop;
end;
$$;

create function brava.citas_sellos_trigger()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estado = 'atendida' and (tg_op = 'INSERT' or old.estado is distinct from 'atendida') then
    perform brava.dar_sellos(new.id);
  elsif tg_op = 'UPDATE' and old.estado = 'atendida' and new.estado <> 'atendida' then
    perform brava.quitar_sellos(new.id);
  end if;
  return new;
end;
$$;

create trigger citas_sellos
  after insert or update of estado on brava.citas
  for each row execute function brava.citas_sellos_trigger();

-- -----------------------------------------------------------------------------
-- 9. Mensajes del Club (promociones y avisos) y su buzón por clienta
-- -----------------------------------------------------------------------------
create table brava.mensajes (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null default 'promo'
              check (tipo in ('promo', 'sello', 'premio', 'recordatorio', 'aviso')),
  titulo      text not null,
  cuerpo      text not null default '',
  audiencia   text not null default 'individual'
              check (audiencia in ('todas', 'cumpleaneras', 'inactivas', 'individual', 'automatico')),
  creado_en   timestamptz not null default now(),
  enviar_en   timestamptz not null default now(),
  enviado_en  timestamptz
);

create table brava.mensaje_clientas (
  mensaje_id uuid not null references brava.mensajes (id) on delete cascade,
  clienta_id uuid not null references brava.clientas (id) on delete cascade,
  push_en    timestamptz,
  leido_en   timestamptz,
  primary key (mensaje_id, clienta_id)
);
create index mensaje_clientas_clienta_idx on brava.mensaje_clientas (clienta_id);

-- Teléfonos que aceptaron notificaciones (de la dueña o de una clienta)
create table brava.push_suscripciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete cascade,
  clienta_id uuid references brava.clientas (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  creado_en  timestamptz not null default now(),
  check ((user_id is null) <> (clienta_id is null))
);

-- -----------------------------------------------------------------------------
-- 10. Ajustes del estudio (una sola fila)
-- -----------------------------------------------------------------------------
create table brava.ajustes (
  id              boolean primary key default true check (id),
  nombre_estudio  text not null default 'Brava e'' Bella Nail''s Studio',
  nombre_club     text not null default 'Club Brava e'' Bella',
  moneda          text not null default 'C$',
  codigo_pais     text not null default '505',
  calendario      text not null default 'google' check (calendario in ('google', 'iphone')),
  aviso_60        boolean not null default true,
  aviso_30        boolean not null default true,
  canal           text not null default 'whatsapp' check (canal in ('whatsapp', 'sms')),
  apertura        time not null default '09:00',
  cierre          time not null default '18:00',
  dias_cerrados   integer[] not null default '{0}',
  tema            text not null default 'auto' check (tema in ('auto', 'claro', 'oscuro'))
);
insert into brava.ajustes default values;

-- -----------------------------------------------------------------------------
-- 11. Permisos: la dueña entra con sesión; el resto del mundo no ve nada
-- -----------------------------------------------------------------------------
grant usage on schema brava to authenticated, anon;
grant select, insert, update, delete on all tables in schema brava to authenticated;
revoke insert, update, delete on brava.miembros from authenticated;
grant execute on function brava.es_miembro() to authenticated;
revoke execute on function brava.es_miembro() from anon, public;

do $$
declare t text;
begin
  foreach t in array array['miembros','clientas','tratamientos','citas','cita_tratamientos',
    'recordatorios','portafolio','gastos','programas_fidelidad','tarjetas','sellos',
    'mensajes','mensaje_clientas','push_suscripciones','ajustes']
  loop
    execute format('alter table brava.%I enable row level security', t);
    if t = 'miembros' then
      execute 'create policy "ver mi membresia" on brava.miembros for select to authenticated using (user_id = (select auth.uid()))';
    else
      execute format('create policy "solo miembros" on brava.%I for all to authenticated using (brava.es_miembro()) with check (brava.es_miembro())', t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 12. Acceso de las clientas al Club: solo por estas funciones y con su enlace.
--     No tienen acceso directo a ninguna tabla.
-- -----------------------------------------------------------------------------
create function brava.clienta_por_token(p_token text)
returns brava.clientas
language sql stable security definer set search_path = ''
as $$
  select * from brava.clientas where club_token = p_token and length(p_token) >= 24;
$$;

-- Todo lo que ve la clienta en su app, en una sola llamada
create function brava.club_entrar(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c brava.clientas;
  hoy date := (now() at time zone 'America/Managua')::date;
begin
  select * into c from brava.clienta_por_token(p_token);
  if c.id is null then
    raise exception 'enlace_invalido' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'clienta', jsonb_build_object(
      'nombre', c.nombre, 'cumpleanos', c.cumpleanos,
      'acepta_promos', c.acepta_promos, 'club_desde', c.club_desde),
    'estudio', (select jsonb_build_object('nombre', a.nombre_estudio, 'club', a.nombre_club,
                  'telefono_pais', a.codigo_pais) from brava.ajustes a),
    'tarjetas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'programa', p.nombre, 'premio', p.premio, 'meta', p.sellos_meta,
        'personal', p.alcance = 'personal', 'hasta', p.hasta,
        'sellos', coalesce((select sum(s.cantidad) from brava.sellos s
                            join brava.tarjetas t on t.id = s.tarjeta_id
                            where t.clienta_id = c.id and t.programa_id = p.id
                              and t.completada_en is null), 0),
        'premios_listos', (select count(*) from brava.tarjetas t
                           where t.clienta_id = c.id and t.programa_id = p.id
                             and t.completada_en is not null and t.canjeada_en is null),
        'completadas', (select count(*) from brava.tarjetas t
                        where t.clienta_id = c.id and t.programa_id = p.id
                          and t.completada_en is not null)
      ) order by p.alcance desc, p.creado_en)
      from brava.programas_de(c.id, hoy) p), '[]'::jsonb),
    'proximas', coalesce((
      select jsonb_agg(jsonb_build_object('inicio', ci.inicio, 'fin', ci.fin, 'tipo', ci.tipo,
        'tratamientos', (select jsonb_agg(ct.nombre) from brava.cita_tratamientos ct where ct.cita_id = ci.id))
        order by ci.inicio)
      from brava.citas ci
      where ci.clienta_id = c.id and ci.estado = 'agendada' and ci.fin > now()), '[]'::jsonb),
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object('inicio', h.inicio, 'tipo', h.tipo) order by h.inicio desc)
      from (select ci.inicio, ci.tipo from brava.citas ci
            where ci.clienta_id = c.id and ci.estado = 'atendida'
            order by ci.inicio desc limit 12) h), '[]'::jsonb),
    'mensajes', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'tipo', m.tipo, 'titulo', m.titulo,
        'cuerpo', m.cuerpo, 'fecha', m.enviar_en, 'leido', mc.leido_en is not null)
        order by m.enviar_en desc)
      from brava.mensaje_clientas mc join brava.mensajes m on m.id = mc.mensaje_id
      where mc.clienta_id = c.id and m.enviar_en <= now()), '[]'::jsonb)
  );
end;
$$;

-- Primer ingreso: confirma sus datos y si acepta promociones
create function brava.club_registrar(p_token text, p_nombre text, p_cumpleanos date, p_acepta boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c brava.clientas;
begin
  select * into c from brava.clienta_por_token(p_token);
  if c.id is null then
    raise exception 'enlace_invalido' using errcode = 'P0001';
  end if;
  update brava.clientas
     set nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
         cumpleanos = p_cumpleanos,
         acepta_promos = coalesce(p_acepta, false),
         club_desde = coalesce(club_desde, now())
   where id = c.id;
  return brava.club_entrar(p_token);
end;
$$;

create function brava.club_guardar_push(p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c brava.clientas;
begin
  select * into c from brava.clienta_por_token(p_token);
  if c.id is null then
    raise exception 'enlace_invalido' using errcode = 'P0001';
  end if;
  insert into brava.push_suscripciones (clienta_id, endpoint, p256dh, auth)
  values (c.id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set clienta_id = excluded.clienta_id, user_id = null,
        p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create function brava.club_marcar_leido(p_token text, p_mensaje uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c brava.clientas;
begin
  select * into c from brava.clienta_por_token(p_token);
  if c.id is null then
    raise exception 'enlace_invalido' using errcode = 'P0001';
  end if;
  update brava.mensaje_clientas set leido_en = coalesce(leido_en, now())
   where clienta_id = c.id and mensaje_id = p_mensaje;
end;
$$;

grant execute on function brava.club_entrar(text) to anon, authenticated;
grant execute on function brava.club_registrar(text, text, date, boolean) to anon, authenticated;
grant execute on function brava.club_guardar_push(text, text, text, text) to anon, authenticated;
grant execute on function brava.club_marcar_leido(text, uuid) to anon, authenticated;

-- Funciones internas: nadie las llama directo desde fuera
revoke execute on function brava.clienta_por_token(text) from public, anon, authenticated;
revoke execute on function brava.programas_de(uuid, date) from public, anon, authenticated;
revoke execute on function brava.dar_sellos(uuid) from public, anon, authenticated;
revoke execute on function brava.quitar_sellos(uuid) from public, anon, authenticated;
revoke execute on function brava.citas_sellos_trigger() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 13. Bucket privado para fotos y videos del portafolio
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('brava-portafolio', 'brava-portafolio', false)
on conflict (id) do nothing;

create policy "brava portafolio: ver" on storage.objects
  for select to authenticated using (bucket_id = 'brava-portafolio' and brava.es_miembro());
create policy "brava portafolio: subir" on storage.objects
  for insert to authenticated with check (bucket_id = 'brava-portafolio' and brava.es_miembro());
create policy "brava portafolio: cambiar" on storage.objects
  for update to authenticated
  using (bucket_id = 'brava-portafolio' and brava.es_miembro())
  with check (bucket_id = 'brava-portafolio' and brava.es_miembro());
create policy "brava portafolio: borrar" on storage.objects
  for delete to authenticated using (bucket_id = 'brava-portafolio' and brava.es_miembro());

-- ============================================================
-- Acceso de la dueña y borrado de citas
-- (migraciones brava_acceso_duena_y_borrado_citas y brava_admins_permitidos_cerrada)
-- ============================================================
-- Correos autorizados: al entrar, brava.activar_miembro() agrega a
-- brava.miembros solo si el correo está aquí y ya fue confirmado.
-- Para dar acceso a otra persona:
--   insert into brava.admins_permitidos (email) values ('correo@ejemplo.com');
create table if not exists brava.admins_permitidos (
  email text primary key check (email = lower(email)),
  rol   text not null default 'duena'
);
alter table brava.admins_permitidos enable row level security;
revoke all on brava.admins_permitidos from anon, authenticated;
insert into brava.admins_permitidos (email) values ('fltp.01062001@outlook.com') on conflict do nothing;

create or replace function brava.activar_miembro()
returns text language plpgsql security definer set search_path = '' as $$
declare
  u   auth.users;
  ap  brava.admins_permitidos;
begin
  select * into u from auth.users where id = (select auth.uid());
  if u.id is null then return 'sin_sesion'; end if;
  if exists (select 1 from brava.miembros where user_id = u.id) then return 'miembro'; end if;
  select * into ap from brava.admins_permitidos where email = lower(u.email);
  if ap.email is null then return 'no_autorizado'; end if;
  if u.email_confirmed_at is null then return 'correo_sin_confirmar'; end if;
  insert into brava.miembros (user_id, rol) values (u.id, ap.rol) on conflict do nothing;
  return 'miembro';
end;
$$;
revoke all on function brava.activar_miembro() from public, anon;
grant execute on function brava.activar_miembro() to authenticated;

-- Borrar una cita atendida quita también sus sellos.
create or replace function brava.citas_borrar_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.estado = 'atendida' then
    perform brava.quitar_sellos(old.id);
  end if;
  return old;
end;
$$;
drop trigger if exists citas_borrar_sellos on brava.citas;
create trigger citas_borrar_sellos before delete on brava.citas
  for each row execute function brava.citas_borrar_trigger();
