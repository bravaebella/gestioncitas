import { useEffect, useState, type ReactNode } from 'react'
import { cerrarSesion } from '../components/Acceso'
import { ConfirmButton } from '../components/ConfirmButton'
import { Header, Icon, Segmented, Sheet, Switch, useUI } from '../components/ui'
import { dinero, duracion, uid } from '../lib/format'
import { exportarRespaldo, useStore } from '../lib/store'
import { sb, SUPABASE_URL } from '../lib/supabase'
import type { Tratamiento, TipoTratamiento } from '../lib/types'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function Seccion({ titulo, children, nota }: { titulo: string; children: ReactNode; nota?: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-label={titulo}>
      <h2 className="section-title">{titulo}</h2>
      {children}
      {nota && <p className="note">{nota}</p>}
    </section>
  )
}

export function Ajustes() {
  const { db, acc, pendientes, carga } = useStore()
  const ui = useUI()
  const aj = db.ajustes
  const [editando, setEditando] = useState<Tratamiento | null>(null)


  const grupos: { tipo: TipoTratamiento; titulo: string }[] = [
    { tipo: 'manicura', titulo: 'Manicura' },
    { tipo: 'pedicura', titulo: 'Pedicura' },
  ]

  const [correo, setCorreo] = useState<string | null>(null)
  useEffect(() => { sb.auth.getUser().then(({ data }) => setCorreo(data.user?.email ?? null)).catch(() => {}) }, [])

  return (
    <main className="screen">
      <Header title="Configuración" sub={aj.nombreEstudio} />

      <Seccion titulo="Apariencia" nota={aj.tema === 'auto' ? 'Cambia sola cuando el iPhone pasa a modo oscuro.' : undefined}>
        <Segmented label="Apariencia" value={aj.tema} onChange={(v) => acc.guardarAjustes({ tema: v })}
          options={[{ value: 'auto', label: 'Automático' }, { value: 'claro', label: 'Claro' }, { value: 'oscuro', label: 'Oscuro' }]} />
      </Seccion>

      <CalendarioSuscrito />

      <Seccion titulo="Recordatorios a la clienta"
        nota="Cuando toca mandar un aviso, aparece en Hoy con el mensaje listo; lo envías con un toque.">
        <div className="card list">
          <div className="row">
            <span className="row-main"><span className="row-title">1 hora antes</span></span>
            <Switch label="Aviso 1 hora antes" checked={aj.aviso60} onChange={(v) => acc.guardarAjustes({ aviso60: v })} />
          </div>
          <div className="row">
            <span className="row-main"><span className="row-title">30 minutos antes</span></span>
            <Switch label="Aviso 30 minutos antes" checked={aj.aviso30} onChange={(v) => acc.guardarAjustes({ aviso30: v })} />
          </div>
          <div className="row">
            <span className="row-main"><span className="row-title">Enviar por</span></span>
            <div style={{ width: 190 }}>
              <Segmented label="Canal" value={aj.canal} onChange={(v) => acc.guardarAjustes({ canal: v })}
                options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }]} />
            </div>
          </div>
          <div className="row">
            <label className="row-main" htmlFor="a-pais"><span className="row-title">Código de país</span><span className="row-sub">Se agrega a números de 8 dígitos</span></label>
            <input id="a-pais" className="input" inputMode="numeric" style={{ width: 90, height: 40 }} value={aj.codigoPais}
              onChange={(e) => acc.guardarAjustes({ codigoPais: e.target.value.replace(/\D/g, '') })} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Horario del estudio" nota="Las horas libres para agendar se calculan dentro de este horario.">
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="a-abre">Abre</label>
            <input id="a-abre" className="input" type="time" value={aj.apertura} onChange={(e) => e.target.value && acc.guardarAjustes({ apertura: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="a-cierra">Cierra</label>
            <input id="a-cierra" className="input" type="time" value={aj.cierre} onChange={(e) => e.target.value && acc.guardarAjustes({ cierre: e.target.value })} />
          </div>
        </div>
        <span className="label">Días cerrados</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }} role="group" aria-label="Días cerrados">
          {DIAS.map((d, i) => {
            const cerrado = aj.diasCerrados.includes(i)
            return (
              <button key={d} type="button" className="chip" style={{ padding: 0 }} aria-pressed={cerrado}
                onClick={() => acc.guardarAjustes({ diasCerrados: cerrado ? aj.diasCerrados.filter((x) => x !== i) : [...aj.diasCerrados, i] })}>
                {d}
              </button>
            )
          })}
        </div>
      </Seccion>

      <Seccion titulo="Tratamientos y precios"
        nota="Cambiar un precio no altera las citas ya agendadas.">
        {grupos.map((g) => {
          const lista = db.tratamientos.filter((t) => t.tipo === g.tipo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
          return (
            <div key={g.tipo} className="card list">
              <div className="label" style={{ padding: '8px 14px 2px' }}>{g.titulo}</div>
              {lista.map((t) => (
                <button key={t.id} type="button" className={`row${t.activo ? '' : ' is-done'}`} onClick={() => setEditando(t)}>
                  <span className="row-main">
                    <span className="row-title">{t.nombre}</span>
                    <span className="row-sub">{duracion(t.duracionMin)}{t.activo ? '' : ' · oculto'}</span>
                  </span>
                  <span className="row-end">{dinero(t.precio, aj.moneda)}</span>
                </button>
              ))}
              <button type="button" className="row" style={{ color: 'var(--wine-text)', fontWeight: 600, minHeight: 46 }}
                onClick={() => setEditando({ id: uid(), tipo: g.tipo, nombre: '', duracionMin: 30, precio: 0, activo: true, orden: lista.length + 1 })}>
                <Icon name="plus" size={16} stroke={2.2} /> Agregar a {g.titulo.toLowerCase()}
              </button>
            </div>
          )
        })}
      </Seccion>

      <Seccion titulo="Estudio">
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 90px' }}>
          <div className="field">
            <label className="label" htmlFor="a-nombre">Nombre en los mensajes</label>
            <input id="a-nombre" className="input" value={aj.nombreEstudio} onChange={(e) => acc.guardarAjustes({ nombreEstudio: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="a-moneda">Moneda</label>
            <input id="a-moneda" className="input" value={aj.moneda} onChange={(e) => acc.guardarAjustes({ moneda: e.target.value })} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Cuenta" nota="Tus datos se guardan en la nube: si cambias de teléfono, entra con el mismo correo.">
        <div className="card row">
          <span className="row-main">
            <span className="row-title">{correo ?? 'Sesión iniciada'}</span>
            <span className={'nube-estado'} data-estado={pendientes ? 'pendiente' : 'ok'}>
              {pendientes ? `${pendientes} ${pendientes === 1 ? 'cambio espera' : 'cambios esperan'} señal para subir` : carga === 'sin_conexion' ? 'Sin conexión: usando la copia del teléfono' : 'Todo guardado en la nube'}
            </span>
          </span>
        </div>
        <div className="grid-2">
          <button type="button" className="btn" onClick={async () => {
            const r = await exportarRespaldo(db)
            if (r === 'descargado') ui.avisar('Respaldo descargado')
          }}>Guardar respaldo</button>
          <ConfirmButton confirmar={pendientes ? '¿Perder cambios sin subir?' : '¿Cerrar sesión?'} onConfirm={() => { void cerrarSesion() }}>
            Cerrar sesión
          </ConfirmButton>
        </div>
      </Seccion>

      {editando && <EditarTratamiento inicial={editando} onClose={() => setEditando(null)} />}
    </main>
  )
}

function EditarTratamiento({ inicial, onClose }: { inicial: Tratamiento; onClose: () => void }) {
  const { db, acc } = useStore()
  const existe = db.tratamientos.some((t) => t.id === inicial.id)
  const [t, setT] = useState(inicial)
  const [precio, setPrecio] = useState(inicial.precio ? String(inicial.precio) : '')
  const [dur, setDur] = useState(String(inicial.duracionMin))
  const p = Number(precio.replace(',', '.'))
  const d = Math.round(Number(dur))
  const valido = t.nombre.trim() && d > 0 && p >= 0 && precio !== ''

  const guardar = () => {
    if (!valido) return
    acc.guardarTratamiento({ ...t, nombre: t.nombre.trim(), precio: p, duracionMin: d })
    onClose()
  }

  return (
    <Sheet title={existe ? 'Editar tratamiento' : 'Nuevo tratamiento'} onClose={onClose}
      footer={<button type="button" className="btn btn-primary btn-block" disabled={!valido} onClick={guardar}>Guardar</button>}>
      <div className="field">
        <label className="label" htmlFor="t-nombre">Nombre</label>
        <input id="t-nombre" className="input" value={t.nombre} placeholder="Esmaltado en gel" onChange={(e) => setT({ ...t, nombre: e.target.value })} />
      </div>
      <Segmented label="Tipo" value={t.tipo} onChange={(v) => setT({ ...t, tipo: v })}
        options={[{ value: 'manicura', label: 'Manicura' }, { value: 'pedicura', label: 'Pedicura' }]} />
      <div className="grid-2">
        <div className="field">
          <label className="label" htmlFor="t-dur">Duración (minutos)</label>
          <input id="t-dur" className="input" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="field">
          <label className="label" htmlFor="t-precio">Precio ({db.ajustes.moneda})</label>
          <input id="t-precio" className="input" inputMode="decimal" value={precio} placeholder="0" onChange={(e) => setPrecio(e.target.value)} />
        </div>
      </div>
      <div className="card row">
        <span className="row-main"><span className="row-title">Visible al agendar</span></span>
        <Switch label="Visible al agendar" checked={t.activo} onChange={(v) => setT({ ...t, activo: v })} />
      </div>
      {existe && (
        <ConfirmButton onConfirm={() => { acc.borrarTratamiento(t.id); onClose() }}>
          <Icon name="trash" size={17} /> Borrar tratamiento
        </ConfirmButton>
      )}
    </Sheet>
  )
}

const CLAVE_CAL = 'brava-calendario-token'

/** Se configura una vez: el Calendario del teléfono trae solo las citas y sus cambios. */
function CalendarioSuscrito() {
  const ui = useUI()
  const [token, setToken] = useState<string | null>(() => { try { return localStorage.getItem(CLAVE_CAL) } catch { return null } })
  useEffect(() => {
    sb.from('ajustes').select('calendario_token').maybeSingle().then(({ data }) => {
      const t = (data as { calendario_token?: string } | null)?.calendario_token
      if (t) { setToken(t); try { localStorage.setItem(CLAVE_CAL, t) } catch { /* nada */ } }
    })
  }, [])

  const https = token ? `${SUPABASE_URL}/functions/v1/brava-calendario?t=${token}` : ''
  const webcal = https.replace(/^https:/, 'webcal:')
  const copiar = async () => {
    try { await navigator.clipboard.writeText(https); ui.avisar('Enlace copiado') } catch { ui.avisar('No se pudo copiar') }
  }

  return (
    <Seccion titulo="Calendario del teléfono"
      nota={<>Se hace una sola vez. Al suscribirte, deja <b>apagado</b> «Eliminar alertas» para que suenen los avisos de 1 h y 30 min. Las citas nuevas, cambiadas o canceladas llegan solas (el iPhone revisa cada pocos minutos).</>}>
      <a className={'btn btn-primary btn-block'} href={webcal || undefined} aria-disabled={!token}
        onClick={(e) => { if (!token) { e.preventDefault(); ui.avisar('Necesitas señal la primera vez.') } }}>
        <Icon name="cal" size={17} /> Suscribir el calendario del iPhone
      </a>
      <div className="grid-2">
        <button type="button" className="btn" disabled={!token} onClick={copiar}>Copiar enlace</button>
        <a className="btn" href={token ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` : undefined}
          target="_blank" rel="noopener noreferrer">Google Calendar</a>
      </div>
    </Seccion>
  )
}
