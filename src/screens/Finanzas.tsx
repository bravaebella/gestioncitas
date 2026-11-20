import { useState } from 'react'
import { ConfirmButton } from '../components/ConfirmButton'
import { Header, Icon, Segmented, Sheet, useUI } from '../components/ui'
import { claveDia, desdeClave, dinero, mayus, nombreMes } from '../lib/format'
import { useStore } from '../lib/store'
import type { Gasto, TipoCita } from '../lib/types'
import { COLOR_TIPO } from './Hoy'

const CATEGORIAS = ['Materiales', 'Herramientas', 'Alquiler del local', 'Luz, agua e internet', 'Publicidad', 'Otros']

export function Finanzas() {
  const { db, acc } = useStore()
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [nuevo, setNuevo] = useState(false)
  const aj = db.ajustes
  const m = mes.getMonth()
  const y = mes.getFullYear()
  const enMes = (d: Date) => d.getMonth() === m && d.getFullYear() === y

  const atendidas = db.citas.filter((c) => c.estado === 'atendida' && enMes(new Date(c.inicio)))
  const porAtender = db.citas.filter((c) => c.estado === 'agendada' && enMes(new Date(c.inicio)))
  const gastos = db.gastos.filter((g) => enMes(desdeClave(g.fecha))).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const ingresos = atendidas.reduce((s, c) => s + c.total, 0)
  const egresos = gastos.reduce((s, g) => s + g.monto, 0)
  const ganancia = ingresos - egresos
  const pendiente = porAtender.reduce((s, c) => s + c.total, 0)

  const porTipo: Record<TipoCita, number> = { manicura: 0, pedicura: 0, ambas: 0 }
  for (const c of atendidas) porTipo[c.tipo] += c.total

  const ultimoDia = new Date(y, m + 1, 0).getDate()
  const semanas = [[1, 7], [8, 14], [15, 21], [22, 28], [29, ultimoDia]].filter(([a]) => a <= ultimoDia)
  const filas = semanas.map(([a, b]) => {
    const dentro = (d: number) => d >= a && d <= b
    return {
      etiqueta: `${a} al ${b}`,
      ing: atendidas.filter((c) => dentro(new Date(c.inicio).getDate())).reduce((s, c) => s + c.total, 0),
      egr: gastos.filter((g) => dentro(desdeClave(g.fecha).getDate())).reduce((s, g) => s + g.monto, 0),
    }
  })
  const maxSemana = Math.max(1, ...filas.map((f) => Math.max(f.ing, f.egr)))

  const categorias = Object.entries(
    gastos.reduce<Record<string, number>>((acc2, g) => ({ ...acc2, [g.categoria]: (acc2[g.categoria] ?? 0) + g.monto }), {}),
  ).sort((a, b) => b[1] - a[1])

  return (
    <main className="screen">
      <Header title="Finanzas" sub={`${mayus(nombreMes(m))} ${y}`}>
        <button type="button" className="icon-btn" aria-label="Mes anterior" onClick={() => setMes(new Date(y, m - 1, 1))}><Icon name="back" size={18} /></button>
        <button type="button" className="icon-btn" aria-label="Mes siguiente" onClick={() => setMes(new Date(y, m + 1, 1))}><Icon name="next" size={18} /></button>
      </Header>

      <div className="kpis">
        <div className="kpi"><span className="label">Ingresos</span><b>{dinero(ingresos, aj.moneda)}</b></div>
        <div className="kpi"><span className="label">Gastos y costos</span><b>{dinero(egresos, aj.moneda)}</b></div>
        <div className="kpi dark"><span className="label">Ganancia</span><b>{dinero(ganancia, aj.moneda)}</b></div>
      </div>

      {porAtender.length > 0 && (
        <div className="card row" style={{ borderRadius: 16, minHeight: 46 }}>
          <span className="row-main"><span className="row-title" style={{ fontSize: 14 }}>
            Por atender este mes: {porAtender.length} {porAtender.length === 1 ? 'cita' : 'citas'}
          </span></span>
          <span className="row-end">{dinero(pendiente, aj.moneda)}</span>
        </div>
      )}

      <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Ingresos por servicio">
        <h2 className="section-title">Ingresos por servicio</h2>
        {ingresos > 0 ? (
          <div className="stack" role="img" aria-label={`Manicura ${dinero(porTipo.manicura, aj.moneda)}, pedicura ${dinero(porTipo.pedicura, aj.moneda)}, ambas ${dinero(porTipo.ambas, aj.moneda)}`}>
            {(['manicura', 'pedicura', 'ambas'] as TipoCita[]).filter((t) => porTipo[t] > 0).map((t) => (
              <i key={t} style={{ flex: `${porTipo[t]} 1 0`, background: COLOR_TIPO[t] }} />
            ))}
          </div>
        ) : <p className="note">Las citas marcadas como atendidas suman aquí.</p>}
        <div className="grid-3">
          {(['manicura', 'pedicura', 'ambas'] as TipoCita[]).map((t) => (
            <div key={t} style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i style={{ width: 8, height: 8, borderRadius: 4, background: COLOR_TIPO[t], display: 'inline-block' }} />
                {t === 'manicura' ? 'Manicura' : t === 'pedicura' ? 'Pedicura' : 'Ambas'}
              </span>
              <b style={{ fontSize: 15, fontWeight: 600 }}>{dinero(porTipo[t], aj.moneda)}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Por semana">
        <div className="section-head">
          <h2 className="section-title">Por semana</h2>
          <div className="legend">
            <span><i style={{ background: 'var(--c-mani)', borderRadius: 3 }} />Ingresos</span>
            <span><i style={{ background: 'var(--c-ambas)', borderRadius: 3 }} />Gastos</span>
          </div>
        </div>
        {filas.map((f) => (
          <div key={f.etiqueta} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label" style={{ width: 54, flexShrink: 0 }}>{f.etiqueta}</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="hbar" style={{ width: `${(f.ing / maxSemana) * 72}%`, background: 'var(--c-mani)' }} />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{dinero(f.ing, aj.moneda)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="hbar" style={{ width: `${(f.egr / maxSemana) * 72}%`, background: 'var(--c-ambas)' }} />
                <span className="label">{dinero(f.egr, aj.moneda)}</span>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Gastos y costos">
        <div className="section-head">
          <h2 className="section-title">Gastos y costos</h2>
          <button type="button" className="btn btn-ghost" onClick={() => setNuevo(true)}><Icon name="plus" size={16} stroke={2.2} /> Registrar gasto</button>
        </div>
        {categorias.length > 1 && (
          <p className="note">{categorias.map(([c, v]) => `${c} ${dinero(v, aj.moneda)}`).join(' · ')}</p>
        )}
        <div className="card list">
          {gastos.map((g) => (
            <div key={g.id} className="row">
              <span className="row-main">
                <span className="row-title">{g.categoria}</span>
                <span className="row-sub">
                  {g.clase === 'costo' ? 'Costo' : 'Gasto'} · {desdeClave(g.fecha).getDate()} de {nombreMes(m)}{g.descripcion ? ` · ${g.descripcion}` : ''}
                </span>
              </span>
              <span className="row-end">{dinero(g.monto, aj.moneda)}</span>
              <ConfirmButton className="icon-btn small" confirmar="Borrar" ariaLabel={`Borrar ${g.categoria}`} onConfirm={() => acc.borrarGasto(g.id)}>
                <Icon name="trash" size={16} />
              </ConfirmButton>
            </div>
          ))}
          {gastos.length === 0 && <div className="empty">Sin gastos registrados este mes.</div>}
        </div>
      </section>

      {nuevo && <NuevoGasto mes={mes} onClose={() => setNuevo(false)} />}
    </main>
  )
}

function NuevoGasto({ mes, onClose }: { mes: Date; onClose: () => void }) {
  const { db, acc } = useStore()
  const ui = useUI()
  const hoy = new Date()
  const mismoMes = hoy.getMonth() === mes.getMonth() && hoy.getFullYear() === mes.getFullYear()
  const [fecha, setFecha] = useState(claveDia(mismoMes ? hoy : mes))
  const [clase, setClase] = useState<Gasto['clase']>('costo')
  const [categoria, setCategoria] = useState('Materiales')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const valor = Number(monto.replace(',', '.'))
  const valido = valor > 0 && categoria.trim() && fecha

  const guardar = () => {
    if (!valido) return
    acc.guardarGasto({ fecha, clase, categoria: categoria.trim(), descripcion: descripcion.trim(), monto: valor })
    ui.avisar('Gasto registrado')
    onClose()
  }

  return (
    <Sheet title="Registrar gasto" onClose={onClose}
      footer={<button type="button" className="btn btn-primary btn-block" disabled={!valido} onClick={guardar}>Guardar gasto</button>}>
      <Segmented label="Clase" value={clase} onChange={setClase}
        options={[{ value: 'costo', label: 'Costo de trabajo' }, { value: 'gasto', label: 'Gasto fijo' }]} />
      <p className="note">{clase === 'costo' ? 'Lo que se gasta para atender: materiales, herramientas.' : 'Lo que se paga cada mes aunque no haya citas: alquiler, luz, internet.'}</p>
      <div className="grid-2">
        <div className="field">
          <label className="label" htmlFor="g-monto">Monto ({db.ajustes.moneda})</label>
          <input id="g-monto" className="input" inputMode="decimal" placeholder="0" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="g-fecha">Fecha</label>
          <input id="g-fecha" className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="g-cat">Categoría</label>
        <input id="g-cat" className="input" list="g-cats" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
        <datalist id="g-cats">{CATEGORIAS.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div className="chips" role="group" aria-label="Categorías frecuentes">
        {CATEGORIAS.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={categoria === c} onClick={() => setCategoria(c)}>{c}</button>
        ))}
      </div>
      <div className="field">
        <label className="label" htmlFor="g-desc">Detalle (opcional)</label>
        <input id="g-desc" className="input" placeholder="Geles, limas, recibo de luz…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>
    </Sheet>
  )
}
