import { useState } from 'react'
import { Header, Icon, Segmented, useUI } from '../components/ui'
import { citasDelDia, diaCerrado, huecosDelDia, minutosJornada, minutosOcupados } from '../lib/agenda'
import { claveDia, conHora, desdeClave, diaCorto, dinero, duracion, ETIQUETA_TIPO, fechaLarga, hora, horaCorta, inicioSemana, mayus, mismoDia, nombreMes, sumarDias } from '../lib/format'
import { useAhora } from '../lib/hooks'
import { useStore } from '../lib/store'
import type { Cita } from '../lib/types'
import { COLOR_TIPO } from './Hoy'

const PX_HORA = 60
const CLASE: Record<Cita['tipo'], string> = { manicura: 'mani', pedicura: 'pedi', ambas: 'ambas' }

export function Agenda({ diaInicial }: { diaInicial?: string }) {
  const { db } = useStore()
  const ui = useUI()
  const ahora = useAhora()
  const [vista, setVista] = useState<'dia' | 'mes'>('dia')
  const [sel, setSel] = useState<Date>(() => (diaInicial ? desdeClave(diaInicial) : desdeClave(claveDia(new Date()))))
  const aj = db.ajustes
  const nombre = (c: Cita) => db.clientas.find((x) => x.id === c.clientaId)?.nombre ?? 'Clienta'

  const mover = (n: number) => {
    if (vista === 'dia') setSel(sumarDias(sel, n * 7))
    else setSel(new Date(sel.getFullYear(), sel.getMonth() + n, 1))
  }

  const citasSel = citasDelDia(db, sel).filter((c) => c.estado !== 'cancelada')
  const activasSel = citasSel.filter((c) => c.estado === 'agendada' || c.estado === 'atendida')
  const sub = `${mayus(fechaLarga(sel))} · ${
    activasSel.length ? `${activasSel.length} ${activasSel.length === 1 ? 'cita' : 'citas'}` : diaCerrado(aj, sel) ? 'cerrado' : 'sin citas'
  }`

  return (
    <main className="screen">
      <Header title={`${mayus(nombreMes(sel.getMonth()))} ${sel.getFullYear()}`} sub={sub}>
        <button type="button" className="icon-btn" aria-label={vista === 'dia' ? 'Semana anterior' : 'Mes anterior'} onClick={() => mover(-1)}>
          <Icon name="back" size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label={vista === 'dia' ? 'Semana siguiente' : 'Mes siguiente'} onClick={() => mover(1)}>
          <Icon name="next" size={18} />
        </button>
      </Header>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Segmented label="Vista" value={vista} onChange={setVista}
            options={[{ value: 'dia', label: 'Día' }, { value: 'mes', label: 'Mes' }]} />
        </div>
        <button type="button" className="btn" onClick={() => setSel(desdeClave(claveDia(new Date())))}>Hoy</button>
      </div>

      {vista === 'dia' ? (
        <>
          <Semana sel={sel} onSel={setSel} ahora={ahora} />
          <Linea dia={sel} ahora={ahora} />
        </>
      ) : (
        <>
          <Mes sel={sel} onSel={setSel} ahora={ahora} />
          <section aria-label="Citas del día elegido" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="section-head">
              <h2 className="section-title">{mayus(fechaLarga(sel))}</h2>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setVista('dia')}>Ver día</button>
                <button type="button" className="btn btn-ghost" onClick={() => ui.nuevaCita({ fecha: sel })}>Agendar</button>
              </div>
            </div>
            <div className="card list">
              {citasSel.map((c) => (
                <button key={c.id} type="button" className={`row${c.estado !== 'agendada' ? ' is-done' : ''}`} onClick={() => ui.verCita(c.id)}>
                  <span className="bar" style={{ background: COLOR_TIPO[c.tipo] }} />
                  <span className="row-time">{horaCorta(new Date(c.inicio))}</span>
                  <span className="row-main">
                    <span className="row-title">{nombre(c)}</span>
                    <span className="row-sub">{ETIQUETA_TIPO[c.tipo]} · {duracion((new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 60000)}</span>
                  </span>
                  <span className="row-end">{dinero(c.total, aj.moneda)}</span>
                </button>
              ))}
              {citasSel.length === 0 && <div className="empty">Sin citas este día.</div>}
            </div>
          </section>
        </>
      )}

      <div className="legend" aria-hidden="true">
        <span><i style={{ background: COLOR_TIPO.manicura }} />Manicura</span>
        <span><i style={{ background: COLOR_TIPO.pedicura }} />Pedicura</span>
        <span><i style={{ background: COLOR_TIPO.ambas }} />Ambas</span>
      </div>
    </main>
  )
}

function Semana({ sel, onSel, ahora }: { sel: Date; onSel: (d: Date) => void; ahora: Date }) {
  const { db } = useStore()
  const lunes = inicioSemana(sel)
  return (
    <div className="week" role="group" aria-label="Días de la semana">
      {Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)).map((d) => {
        const n = citasDelDia(db, d, true).length
        const clases = ['day-btn', diaCerrado(db.ajustes, d) ? 'closed' : '', mismoDia(d, ahora) ? 'today' : ''].join(' ')
        return (
          <button key={claveDia(d)} type="button" className={clases} aria-pressed={mismoDia(d, sel)}
            aria-label={`${fechaLarga(d)}, ${n} citas`} onClick={() => onSel(d)}>
            <small>{diaCorto(d)}</small>
            <b>{d.getDate()}</b>
            <span className="dot" style={{ visibility: n ? 'visible' : 'hidden' }} />
          </button>
        )
      })}
    </div>
  )
}

function Linea({ dia, ahora }: { dia: Date; ahora: Date }) {
  const { db } = useStore()
  const ui = useUI()
  const aj = db.ajustes
  const citas = citasDelDia(db, dia).filter((c) => c.estado !== 'cancelada')
  const nombre = (c: Cita) => db.clientas.find((x) => x.id === c.clientaId)?.nombre ?? 'Clienta'

  let desde = conHora(dia, aj.apertura)
  let hasta = conHora(dia, aj.cierre)
  for (const c of citas) {
    if (new Date(c.inicio) < desde) desde = new Date(c.inicio)
    if (new Date(c.fin) > hasta) hasta = new Date(c.fin)
  }
  desde = new Date(desde); desde.setMinutes(0, 0, 0)
  hasta = new Date(hasta); if (hasta.getMinutes() > 0) hasta.setHours(hasta.getHours() + 1, 0, 0, 0)
  const pxMin = PX_HORA / 60
  const y = (d: Date) => ((d.getTime() - desde.getTime()) / 60000) * pxMin
  const alto = y(hasta)
  const horas = Array.from({ length: Math.round(alto / PX_HORA) + 1 }, (_, i) => new Date(desde.getTime() + i * 3600000))

  const libres = diaCerrado(aj, dia)
    ? []
    : huecosDelDia(db, dia)
        .map((h) => {
          const ini = h.desde < ahora ? new Date(Math.ceil(ahora.getTime() / 900000) * 900000) : h.desde
          return { ini, fin: h.hasta, min: (h.hasta.getTime() - ini.getTime()) / 60000 }
        })
        .filter((h) => h.min >= 30)

  return (
    <div className="timeline" style={{ height: alto + 12 }} aria-label="Horario del día">
      {horas.map((h) => (
        <div key={h.getTime()} className="hour-line" style={{ top: y(h) + 6 }} aria-hidden="true">
          <span>{hora(h).replace(':00', '')}</span><i />
        </div>
      ))}
      {libres.map((l) => (
        <button key={l.ini.getTime()} type="button" className="free-block"
          style={{ top: y(l.ini) + 8, height: Math.max(l.min * pxMin - 4, 26) }}
          onClick={() => ui.nuevaCita({ inicio: l.ini })}>
          <span>Libre {horaCorta(l.ini)} – {hora(l.fin)}</span><span>Agendar</span>
        </button>
      ))}
      {citas.map((c) => {
        const ini = new Date(c.inicio)
        const fin = new Date(c.fin)
        const h = Math.max(((fin.getTime() - ini.getTime()) / 60000) * pxMin - 4, 30)
        return (
          <button key={c.id} type="button" className={`block ${CLASE[c.tipo]}${c.estado !== 'agendada' ? ' done' : ''}`}
            style={{ top: y(ini) + 8, height: h }} onClick={() => ui.verCita(c.id)}>
            <b>{nombre(c)} · {ETIQUETA_TIPO[c.tipo]}</b>
            {h > 40 && <span>{horaCorta(ini)} – {hora(fin)} · {dinero(c.total, aj.moneda)}</span>}
          </button>
        )
      })}
      {mismoDia(dia, ahora) && ahora > desde && ahora < hasta && (
        <div className="now-line" style={{ top: y(ahora) + 6 }} aria-hidden="true" />
      )}
    </div>
  )
}

function Mes({ sel, onSel, ahora }: { sel: Date; onSel: (d: Date) => void; ahora: Date }) {
  const { db } = useStore()
  const primero = new Date(sel.getFullYear(), sel.getMonth(), 1)
  const vacios = (primero.getDay() + 6) % 7
  const diasMes = new Date(sel.getFullYear(), sel.getMonth() + 1, 0).getDate()
  const jornada = minutosJornada(db.ajustes) || 1
  return (
    <div className="card" style={{ padding: '6px 6px 8px' }}>
      <div className="month" aria-hidden="true">
        {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => <span key={d} className="month-dow">{d}</span>)}
      </div>
      <div className="month" role="group" aria-label="Días del mes">
        {Array.from({ length: vacios }, (_, i) => <span key={'v' + i} />)}
        {Array.from({ length: diasMes }, (_, i) => new Date(sel.getFullYear(), sel.getMonth(), i + 1)).map((d) => {
          const ocupado = minutosOcupados(db, d)
          const pct = Math.min(100, Math.round((ocupado / jornada) * 100))
          const clases = ['month-day', mismoDia(d, ahora) ? 'today' : '', diaCerrado(db.ajustes, d) ? 'closed' : ''].join(' ')
          return (
            <button key={d.getDate()} type="button" className={clases} aria-pressed={mismoDia(d, sel)}
              aria-label={`${fechaLarga(d)}: ${ocupado ? `${duracion(ocupado)} ocupadas` : 'sin citas'}`} onClick={() => onSel(d)}>
              <b>{d.getDate()}</b>
              <span className="occ" style={{ visibility: ocupado ? 'visible' : 'hidden' }}><i style={{ width: `${pct}%` }} /></span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
