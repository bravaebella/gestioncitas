import { useMemo, useState } from 'react'
import { diaCerrado, horasLibres } from '../lib/agenda'
import { claveDia, conHora, desdeClave, diaCorto, dinero, duracion, ETIQUETA_TIPO, fechaLarga, hora, mismoDia, sumarDias } from '../lib/format'
import { useAhora } from '../lib/hooks'
import { useStore } from '../lib/store'
import type { TipoCita, Tratamiento } from '../lib/types'
import { Icon, Segmented, Sheet, type AbrirNuevaCita } from '../components/ui'

const TIPOS: { value: TipoCita; label: string }[] = [
  { value: 'manicura', label: 'Manicura' },
  { value: 'pedicura', label: 'Pedicura' },
  { value: 'ambas', label: 'Ambas' },
]

export function CitaForm({ inicial, onClose, onGuardada }: {
  inicial: AbrirNuevaCita
  onClose: () => void
  onGuardada: (id: string, nueva: boolean) => void
}) {
  const { db, acc } = useStore()
  const ahora = useAhora()
  const previa = inicial.citaId ? db.citas.find((c) => c.id === inicial.citaId) : undefined
  const clientaPrevia = previa ? db.clientas.find((c) => c.id === previa.clientaId) : undefined

  const [clientaId, setClientaId] = useState<string | undefined>(clientaPrevia?.id)
  const [nombre, setNombre] = useState(clientaPrevia?.nombre ?? '')
  const [telefono, setTelefono] = useState(clientaPrevia?.telefono ?? '')
  const [tipo, setTipo] = useState<TipoCita>(previa?.tipo ?? 'manicura')
  const [sel, setSel] = useState<Set<string>>(() => new Set(previa?.items.map((i) => i.tratamientoId) ?? []))
  const diaInicial = inicial.inicio ?? (previa ? new Date(previa.inicio) : inicial.fecha ?? new Date())
  const [dia, setDia] = useState<Date>(() => desdeClave(claveDia(diaInicial)))
  const [inicio, setInicio] = useState<Date | null>(() => inicial.inicio ?? (previa ? new Date(previa.inicio) : null))
  const [horaManual, setHoraManual] = useState('')
  const [notas, setNotas] = useState(previa?.notas ?? '')
  const [error, setError] = useState('')

  const catalogo = db.tratamientos.filter((t) => t.activo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
  const visibles = catalogo.filter((t) => tipo === 'ambas' || t.tipo === tipo)
  const elegidos = visibles.filter((t) => sel.has(t.id))
  const durMin = elegidos.reduce((s, t) => s + t.duracionMin, 0)
  const total = elegidos.reduce((s, t) => s + t.precio, 0)
  const moneda = db.ajustes.moneda

  const libres = useMemo(() => horasLibres(db, dia, durMin, ahora, previa?.id), [db, dia, durMin, ahora, previa?.id])
  const inicioFinal = horaManual ? conHora(dia, horaManual) : inicio
  const inicioValido = !!inicioFinal && (!!horaManual || libres.some((l) => l.inicio.getTime() === inicioFinal.getTime()))

  const coincidencias = useMemo(() => {
    const q = nombre.trim().toLowerCase()
    if (clientaId || q.length < 1) return []
    const qd = q.replace(/\D/g, '')
    return db.clientas
      .filter((c) => c.nombre.toLowerCase().includes(q) || (qd.length >= 3 && c.telefono.replace(/\D/g, '').includes(qd)))
      .slice(0, 4)
  }, [db.clientas, nombre, clientaId])

  const dias = useMemo(() => {
    const base = desdeClave(claveDia(ahora))
    const lista = Array.from({ length: 21 }, (_, i) => sumarDias(base, i))
    if (!lista.some((d) => mismoDia(d, dia))) lista.unshift(dia)
    return lista
  }, [ahora, dia])

  const cambiarTipo = (t: TipoCita) => {
    setTipo(t)
    setSel((prev) => new Set([...prev].filter((id) => {
      const tr = catalogo.find((x) => x.id === id)
      return tr && (t === 'ambas' || tr.tipo === t)
    })))
  }

  const alternar = (t: Tratamiento) => {
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(t.id)) n.delete(t.id)
      else n.add(t.id)
      return n
    })
  }

  const guardar = () => {
    if (!inicioFinal) return setError('Elige una hora.')
    const r = acc.guardarCita({
      id: previa?.id,
      clienta: { id: clientaId, nombre, telefono },
      tipo,
      inicio: inicioFinal,
      items: elegidos,
      notas,
    })
    if (!r.ok) return setError(r.error)
    onGuardada(r.id, !previa)
  }

  const grupos: { titulo: string; items: Tratamiento[] }[] =
    tipo === 'ambas'
      ? [
          { titulo: 'Manos', items: visibles.filter((t) => t.tipo === 'manicura') },
          { titulo: 'Pies', items: visibles.filter((t) => t.tipo === 'pedicura') },
        ]
      : [{ titulo: '', items: visibles }]

  let resumen = 'Elige al menos un tratamiento'
  if (elegidos.length) {
    resumen = `${elegidos.length} ${elegidos.length === 1 ? 'tratamiento' : 'tratamientos'} · ${duracion(durMin)}`
    if (inicioFinal && inicioValido) resumen += ` · ${hora(inicioFinal)}`
  }

  return (
    <Sheet
      full
      title={previa ? 'Cambiar cita' : 'Nueva cita'}
      onClose={onClose}
      footer={
        <>
          <div style={{ minWidth: 0 }}>
            <div className="total">{dinero(total, moneda)}</div>
            <div className="note">{resumen}</div>
          </div>
          <button type="button" className="btn btn-primary" disabled={!elegidos.length || !inicioValido || !nombre.trim()} onClick={guardar}>
            {previa ? 'Guardar cambios' : 'Agendar'}
          </button>
        </>
      }
    >
      {/* Clienta */}
      {clientaId ? (
        <div className="card row" style={{ borderRadius: 16 }}>
          <div className="row-main">
            <span className="row-title">{nombre}</span>
            <span className="row-sub">{telefono || 'Sin teléfono'}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => { setClientaId(undefined); setNombre(''); setTelefono('') }}>
            Cambiar
          </button>
        </div>
      ) : (
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="f-nombre">Clienta</label>
            <input id="f-nombre" className="input" autoComplete="off" placeholder="Nombre" value={nombre}
              onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="f-tel">WhatsApp</label>
            <input id="f-tel" className="input" type="tel" inputMode="tel" placeholder="Número" value={telefono}
              onChange={(e) => setTelefono(e.target.value)} />
          </div>
        </div>
      )}
      {coincidencias.length > 0 && (
        <div className="card list" aria-label="Clientas guardadas">
          {coincidencias.map((c) => (
            <button key={c.id} type="button" className="row" style={{ minHeight: 46 }}
              onClick={() => { setClientaId(c.id); setNombre(c.nombre); setTelefono(c.telefono) }}>
              <span className="row-main"><span className="row-title">{c.nombre}</span><span className="row-sub">{c.telefono}</span></span>
              <span className="label">Elegir</span>
            </button>
          ))}
        </div>
      )}

      <Segmented label="Servicio" value={tipo} options={TIPOS} onChange={cambiarTipo} />

      {/* Tratamientos */}
      <div className="field">
        <span className="label">Tratamientos de {ETIQUETA_TIPO[tipo].toLowerCase()}</span>
        <div className="card list">
          {grupos.map((g) => (
            <div key={g.titulo || 'todo'}>
              {g.titulo && <div className="label" style={{ padding: '8px 14px 2px' }}>{g.titulo}</div>}
              {g.items.map((t) => (
                <button key={t.id} type="button" className="row check-row" aria-pressed={sel.has(t.id)} onClick={() => alternar(t)}>
                  <span className="box">{sel.has(t.id) && <Icon name="check" size={14} stroke={3} />}</span>
                  <span className="row-main">
                    <span className="row-title">{t.nombre}</span>
                    <span className="row-sub">{duracion(t.duracionMin)}</span>
                  </span>
                  <span className="row-end">{dinero(t.precio, moneda)}</span>
                </button>
              ))}
            </div>
          ))}
          {visibles.length === 0 && <div className="empty">No hay tratamientos activos. Agrégalos en Más → Configuración.</div>}
        </div>
      </div>

      {/* Día */}
      <div className="field">
        <span className="label">Día</span>
        <div className="chips" role="group" aria-label="Día">
          {dias.map((d) => {
            const cerrado = diaCerrado(db.ajustes, d)
            const activo = mismoDia(d, dia)
            return (
              <button key={claveDia(d)} type="button" className="chip" aria-pressed={activo}
                style={{ minHeight: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15, opacity: cerrado && !activo ? 0.55 : 1 }}
                onClick={() => { setDia(d); setInicio(null); setHoraManual(''); setError('') }}>
                <span style={{ fontSize: 12 }}>{mismoDia(d, ahora) ? 'hoy' : diaCorto(d)}</span>
                <span style={{ fontSize: 17, fontWeight: 600 }}>{d.getDate()}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Hora */}
      <div className="field">
        <span className="label">Hora libre el {fechaLarga(dia)}{diaCerrado(db.ajustes, dia) ? ' (día cerrado)' : ''}</span>
        {durMin === 0 ? (
          <p className="note">Elige los tratamientos y aquí salen solo las horas donde cabe la cita.</p>
        ) : libres.length === 0 ? (
          <p className="note">No queda un hueco de {duracion(durMin)} ese día. Prueba con otro día.</p>
        ) : (
          <div className="slots">
            {libres.map((l) => {
              const on = !horaManual && inicio?.getTime() === l.inicio.getTime()
              return (
                <button key={l.inicio.getTime()} type="button" className="slot" aria-pressed={on}
                  onClick={() => { setInicio(l.inicio); setHoraManual(''); setError('') }}>
                  <b>{hora(l.inicio)}</b>
                  <span>libre {duracion(Math.round(l.libreMin))}</span>
                </button>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <label className="note" htmlFor="f-hora">Otra hora exacta</label>
          <input id="f-hora" className="input" type="time" step={300} style={{ width: 130, height: 40 }} value={horaManual}
            onChange={(e) => { setHoraManual(e.target.value); setError('') }} />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="f-notas">Notas</label>
        <textarea id="f-notas" className="input" rows={2} placeholder="Color, diseño, alergias…" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      {error && <p className="error" role="alert">{error}</p>}
    </Sheet>
  )
}
