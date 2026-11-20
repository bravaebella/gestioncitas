import { EnlaceMensaje, Header, Icon, useUI } from '../components/ui'
import { citasDelDia, diaCerrado, huecosDelDia } from '../lib/agenda'
import { enlaceMensaje, textoRecordatorio } from '../lib/enlaces'
import { claveDia, conHora, dinero, duracion, ETIQUETA_TIPO, diaSemana, hora, horaCorta, sumarDias } from '../lib/format'
import { useAhora } from '../lib/hooks'
import { useStore } from '../lib/store'
import type { Cita, MinutosAviso, TipoCita } from '../lib/types'

export const COLOR_TIPO: Record<TipoCita, string> = { manicura: 'var(--c-mani)', pedicura: 'var(--c-pedi)', ambas: 'var(--c-ambas)' }

export function Hoy() {
  const { db, acc } = useStore()
  const ui = useUI()
  const ahora = useAhora()
  const aj = db.ajustes
  const hoy = new Date(ahora)
  const citas = citasDelDia(db, hoy).filter((c) => c.estado !== 'cancelada')
  const activas = citas.filter((c) => c.estado === 'agendada' || c.estado === 'atendida')
  const minutos = activas.reduce((s, c) => s + (new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 60000, 0)
  const total = activas.reduce((s, c) => s + c.total, 0)
  const nombre = (c: Cita) => db.clientas.find((x) => x.id === c.clientaId)?.nombre ?? 'Clienta'

  const proxima = citas.find((c) => c.estado === 'agendada' && new Date(c.fin) > ahora)

  // Avisos que ya toca mandar
  const habilitados: MinutosAviso[] = [...(aj.aviso60 ? [60 as const] : []), ...(aj.aviso30 ? [30 as const] : [])]
  const pendientes = citas
    .filter((c) => c.estado === 'agendada' && new Date(c.inicio) > ahora)
    .flatMap((c) => {
      const ini = new Date(c.inicio).getTime()
      const toca = habilitados.filter((m) => !c.avisos[m] && ahora.getTime() >= ini - m * 60000)
      const m = toca.includes(30) ? 30 : toca[0]
      return m ? [{ cita: c, min: m }] : []
    })

  const urlAviso = (c: Cita, m: MinutosAviso) => {
    const clienta = db.clientas.find((x) => x.id === c.clientaId)
    return clienta ? enlaceMensaje(clienta.telefono, textoRecordatorio(c, clienta, aj, m), aj) : ''
  }

  // Filas del día: citas + huecos libres que aún sirven
  const huecos = huecosDelDia(db, hoy)
    .map((h) => {
      const desde = h.desde < ahora ? new Date(Math.ceil(ahora.getTime() / (15 * 60000)) * 15 * 60000) : h.desde
      return { desde, hasta: h.hasta, min: (h.hasta.getTime() - desde.getTime()) / 60000 }
    })
    .filter((h) => h.min >= 30)
  type Fila = { t: number; cita?: Cita; hueco?: (typeof huecos)[number] }
  const filas: Fila[] = [
    ...citas.map((c) => ({ t: new Date(c.inicio).getTime(), cita: c })),
    ...(diaCerrado(aj, hoy) ? [] : huecos.map((h) => ({ t: h.desde.getTime(), hueco: h }))),
  ].sort((a, b) => a.t - b.t)

  // Mapa del día
  const abre = conHora(hoy, aj.apertura).getTime()
  const cierra = conHora(hoy, aj.cierre).getTime()
  const segmentos: { min: number; color: string }[] = []
  let cursor = abre
  for (const c of activas) {
    const i = Math.max(abre, new Date(c.inicio).getTime())
    const f = Math.min(cierra, new Date(c.fin).getTime())
    if (f <= cursor) continue
    if (i > cursor) segmentos.push({ min: (i - cursor) / 60000, color: 'var(--line-soft)' })
    segmentos.push({ min: (f - Math.max(i, cursor)) / 60000, color: COLOR_TIPO[c.tipo] })
    cursor = f
  }
  if (cierra > cursor) segmentos.push({ min: (cierra - cursor) / 60000, color: 'var(--line-soft)' })

  const manana = sumarDias(hoy, 1)
  const citasManana = citasDelDia(db, manana, true)

  const titulo = `Hoy, ${diaSemana(hoy)} ${hoy.getDate()}`
  const sub = diaCerrado(aj, hoy) && activas.length === 0
    ? 'Día cerrado'
    : activas.length
      ? `${activas.length} ${activas.length === 1 ? 'cita' : 'citas'} · ${duracion(minutos)} · ${dinero(total, aj.moneda)}`
      : 'Sin citas'

  const faltan = proxima ? Math.round((new Date(proxima.inicio).getTime() - ahora.getTime()) / 60000) : 0

  return (
    <main className="screen">
      <Header title={titulo} sub={sub}>
        <a className="icon-btn" href="#ajustes" aria-label="Ajustes"><Icon name="gear" /></a>
      </Header>

      {pendientes.length > 0 && (
        <section className="alert-card" aria-label="Avisos por enviar">
          <div className="section-head" style={{ padding: '10px 14px 0' }}>
            <h2 className="section-title">Avisos por enviar</h2>
          </div>
          <div className="list">
            {pendientes.map(({ cita, min }) => (
              <div key={cita.id + min} className="row" style={{ borderBottomColor: 'var(--alert-line)' }}>
                <span className="row-main">
                  <span className="row-title">{nombre(cita)}</span>
                  <span className="row-sub">Aviso de {min === 60 ? '1 hora' : '30 min'} · cita a las {hora(new Date(cita.inicio))}</span>
                </span>
                <EnlaceMensaje url={urlAviso(cita, min)} className="btn btn-primary" style={{ minHeight: 40 }}
                  onEnviado={() => acc.marcarAviso(cita.id, min)} sinNumero={() => ui.avisar('Esta clienta no tiene número guardado.')}>
                  Enviar
                </EnlaceMensaje>
              </div>
            ))}
          </div>
        </section>
      )}

      {proxima && (
        <button type="button" className="card-dark" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => ui.verCita(proxima.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="label">{faltan <= 0 ? 'En curso' : 'Próxima cita'}</span>
            {faltan > 0 && <span className="pill">en {duracion(faltan)}</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 24, lineHeight: 1.1 }}>
                {hora(new Date(proxima.inicio))} – {hora(new Date(proxima.fin))}
              </span>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{nombre(proxima)}</span>
              <span style={{ fontSize: 13, color: 'var(--dark-sub)' }}>
                {ETIQUETA_TIPO[proxima.tipo]} · {proxima.items.map((i) => i.nombre).join(', ')}
              </span>
            </div>
            <span style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap' }}>{dinero(proxima.total, aj.moneda)}</span>
          </div>
          {habilitados.length > 0 && (
            <div className="tags">
              {habilitados.map((m) => {
                const enviado = proxima.avisos[m]
                const cuando = new Date(new Date(proxima.inicio).getTime() - m * 60000)
                return (
                  <span key={m} className="tag" style={{ color: enviado ? 'var(--on-deep)' : 'var(--dark-sub)' }}>
                    <Icon name={enviado ? 'check' : 'clock'} size={14} stroke={2} />
                    {enviado ? `Aviso ${m === 60 ? '1 h' : '30 min'} enviado` : `Aviso ${m === 60 ? '1 h' : '30 min'} a las ${hora(cuando)}`}
                  </span>
                )
              })}
            </div>
          )}
        </button>
      )}

      {activas.length > 0 && (
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="daymap" role="img" aria-label={`Ocupado ${duracion(minutos)} de la jornada`}>
            {segmentos.map((s, i) => <i key={i} style={{ flex: `${s.min} 1 0`, background: s.color }} />)}
          </div>
          <div className="daymap-axis"><span>{hora(new Date(abre))}</span><span>{hora(new Date(cierra))}</span></div>
        </div>
      )}

      <section aria-label="Citas del día">
        <div className="card list">
          {filas.map((f) =>
            f.cita ? (
              <button key={f.cita.id} type="button"
                className={`row${f.cita.estado !== 'agendada' ? ' is-done' : ''}${f.cita.id === proxima?.id ? ' is-next' : ''}`}
                onClick={() => ui.verCita(f.cita!.id)}>
                <span className="bar" style={{ background: COLOR_TIPO[f.cita.tipo] }} />
                <span className="row-time">{horaCorta(new Date(f.cita.inicio))}</span>
                <span className="row-main">
                  <span className="row-title">{nombre(f.cita)}</span>
                  <span className="row-sub">
                    {ETIQUETA_TIPO[f.cita.tipo]} · {duracion((new Date(f.cita.fin).getTime() - new Date(f.cita.inicio).getTime()) / 60000)}
                    {f.cita.estado === 'atendida' ? ' · Atendida' : f.cita.estado === 'no_asistio' ? ' · No llegó' : ''}
                  </span>
                </span>
                <span className="row-end">{dinero(f.cita.total, aj.moneda)}</span>
              </button>
            ) : (
              <button key={'h' + f.t} type="button" className="row-free" onClick={() => ui.nuevaCita({ inicio: f.hueco!.desde })}>
                <span>Libre {horaCorta(f.hueco!.desde)} a {hora(f.hueco!.hasta)}</span>
                <strong>Agendar</strong>
              </button>
            ),
          )}
          {filas.length === 0 && (
            <div className="empty">
              <span>{diaCerrado(aj, hoy) ? 'Hoy el estudio está cerrado.' : 'Ya no quedan horas libres hoy.'}</span>
              <button type="button" className="btn btn-primary" onClick={() => ui.nuevaCita({ fecha: manana })}>Agendar para otro día</button>
            </div>
          )}
        </div>
      </section>

      {db.citas.length === 0 && (
        <div className="card empty">
          <span>Aún no hay citas guardadas. Puedes empezar a agendar o ver cómo luce la app con datos de prueba.</span>
          <button type="button" className="btn" onClick={() => { acc.cargarEjemplo(); ui.avisar('Datos de ejemplo cargados. Bórralos en Ajustes.') }}>
            Ver con datos de ejemplo
          </button>
        </div>
      )}

      <a className="card row" style={{ textDecoration: 'none', borderRadius: 16 }} href={`#agenda-${claveDia(manana)}`}>
        <span className="row-main">
          <span className="row-title" style={{ fontSize: 14 }}>
            <b>Mañana, {diaSemana(manana)} {manana.getDate()}:</b>{' '}
            {citasManana.length
              ? `${citasManana.length} ${citasManana.length === 1 ? 'cita' : 'citas'}, la primera a las ${hora(new Date(citasManana[0].inicio))}`
              : diaCerrado(aj, manana) ? 'cerrado' : 'sin citas'}
          </span>
        </span>
        <Icon name="next" size={16} />
      </a>
    </main>
  )
}
