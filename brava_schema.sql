-- Brava e' Bella Nail's Studio: esquema propio dentro del proyecto SCH-CRM
-- Todo vive en el esquema "brava" y en el bucket "brava-portafolio".
-- No toca ninguna tabla, política ni bucket del CRM.

create schema if not exists brava;

-- 1. Quién puede usar la app -------------------------------------------------
create table brava.miembros (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  rol       text not null default 'duena' check (rol in ('duena', 'asistente')),
  creado_en timestamptz not null default now()
);

create function brava.es_miembro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from brava.miembros m where m.user_id = (select auth.uid())
  );
$$;

revoke all on function brava.es_miembro() from public, anon;
grant execute on function brava.es_miembro() to authenticated;

-- 2. Clientas ----------------------------------------------------------------
create table brava.clientas (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  telefono  text,
  notas     text,
  creado_en timestamptz not null default now()
);

-- 3. Catálogo de tratamientos (subservicios con precio y duración) -----------
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

-- 4. Citas -------------------------------------------------------------------
create table brava.citas (
  id                   uuid primary key default gen_random_uuid(),
  clienta_id           uuid not null references brava.clientas (id),
  tipo                 text not null check (tipo in ('manicura', 'pedicura', 'ambas')),
  inicio               timestamptz not null,
  fin                  timestamptz not null,
  estado               text not null default 'agendada'
                       check (estado in ('agendada', 'atendida', 'cancelada', 'no_asistio')),
  precio_total         numeric(10, 2) not null default 0 check (precio_total >= 0),
  notas                text,
  calendario_evento_id text,
  creado_en            timestamptz not null default now(),
  check (fin > inicio),
  -- La regla "sin choques": dos citas activas no pueden compartir horario.
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

-- 5. Recordatorios (1 hora y 30 minutos antes) -------------------------------
create table brava.recordatorios (
  id            uuid primary key default gen_random_uuid(),
  cita_id       uuid not null references brava.citas (id) on delete cascade,
  minutos_antes integer not null check (minutos_antes in (60, 30)),
  canal         text not null default 'whatsapp' check (canal in ('whatsapp', 'sms')),
  enviar_en     timestamptz not null,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente', 'enviado', 'fallido', 'cancelado')),
  enviado_en    timestamptz,
  unique (cita_id, minutos_antes)
);

create index recordatorios_pendientes_idx
  on brava.recordatorios (enviar_en) where estado = 'pendiente';

-- 6. Portafolio (el archivo vive en el bucket; aquí va la ficha) -------------
create table brava.portafolio (
  id        uuid primary key default gen_random_uuid(),
  titulo    text not null,
  tipo      text not null check (tipo in ('manicura', 'pedicura')),
  medio     text not null check (medio in ('foto', 'video')),
  ruta      text not null unique,
  visible   boolean not null default true,
  creado_en timestamptz not null default now()
);

-- 7. Gastos y costos ---------------------------------------------------------
create table brava.gastos (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null default current_date,
  clase       text not null check (clase in ('gasto', 'costo')),
  categoria   text not null,
  descripcion text,
  monto       numeric(10, 2) not null check (monto >= 0),
  creado_en   timestamptz not null default now()
);

create index gastos_fecha_idx on brava.gastos (fecha);

-- 8. Ajustes del estudio (una sola fila) -------------------------------------
create table brava.ajustes (
  id                boolean primary key default true check (id),
  calendario        text not null default 'google' check (calendario in ('google', 'iphone')),
  guardar_en_calendario boolean not null default true,
  aviso_60          boolean not null default true,
  aviso_30          boolean not null default true,
  canal             text not null default 'whatsapp' check (canal in ('whatsapp', 'sms')),
  hora_apertura     time not null default '09:00',
  hora_cierre       time not null default '18:00'
);

insert into brava.ajustes default values;

-- 9. Permisos y seguridad por fila -------------------------------------------
-- Solo usuarios con sesión; la llave anónima no ve nada de este esquema.
grant usage on schema brava to authenticated;
grant select, insert, update, delete on all tables in schema brava to authenticated;
revoke insert, update, delete on brava.miembros from authenticated;

alter table brava.miembros          enable row level security;
alter table brava.clientas          enable row level security;
alter table brava.tratamientos      enable row level security;
alter table brava.citas             enable row level security;
alter table brava.cita_tratamientos enable row level security;
alter table brava.recordatorios     enable row level security;
alter table brava.portafolio        enable row level security;
alter table brava.gastos            enable row level security;
alter table brava.ajustes           enable row level security;

create policy "ver mi membresia" on brava.miembros
  for select to authenticated using (user_id = (select auth.uid()));

create policy "solo miembros" on brava.clientas
  for all to authenticated using (brava.es_miembro()) with check (brava.es_miembro());
create policy "solo miembros" on brava.tratamientos
  for all to authenticated using (brava.es_miembro()) with check (brava.es_miembro());
create policy "solo miembros" on brava.citas
  for all to authenticated using (brava.es_miembro()) with check (brava.es_miembro());
create policy "solo miembros" on brava.cita_tratamientos
  for all to authenticated using (brava.es_miembro()) with check (brava.es_miembro());
create policy "solo miembros" on brava.recordatorios
  for all to authenticated using (brava.es_miembro()) with check (brava.es_miembro());
create policy "solo miembros" on brava.portafolio
  for all to authenticated using (brava.es_miembro()) with check (brava.es_miembro());
create policy "solo miembros" on brava.gastos
  for all to authenticated using (brava.es_miembro()) with check (brava.es_miembro());
create policy "solo miembros" on brava.ajustes
  for all to authenticated using (brava.es_miembro()) with check (brava.es_miembro());

-- 10. Bucket privado para fotos y videos del portafolio ----------------------
insert into storage.buckets (id, name, public)
values ('brava-portafolio', 'brava-portafolio', false)
on conflict (id) do nothing;

create policy "brava portafolio: ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'brava-portafolio' and brava.es_miembro());
create policy "brava portafolio: subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'brava-portafolio' and brava.es_miembro());
create policy "brava portafolio: cambiar" on storage.objects
  for update to authenticated
  using (bucket_id = 'brava-portafolio' and brava.es_miembro())
  with check (bucket_id = 'brava-portafolio' and brava.es_miembro());
create policy "brava portafolio: borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'brava-portafolio' and brava.es_miembro());
