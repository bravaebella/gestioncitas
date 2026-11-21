import { useCallback, useEffect, useMemo, useState } from 'react'
import { Acceso } from './components/Acceso'
import { Splash } from './components/Splash'
import { Icon, Sheet, UICtx, type AbrirNuevaCita, type UI } from './components/ui'
import { subirDatosLocales } from './lib/migrar'
import { StoreProvider, useStore } from './lib/store'
import { Agenda } from './screens/Agenda'
import { Ajustes } from './screens/Ajustes'
import { CitaDetalle } from './screens/CitaDetalle'
import { CitaForm } from './screens/CitaForm'
import { Finanzas } from './screens/Finanzas'
import { Hoy } from './screens/Hoy'
import { Portafolio } from './screens/Portafolio'

type Ruta = 'hoy' | 'agenda' | 'portafolio' | 'finanzas' | 'ajustes'

// Rutas: #hoy, #agenda, #agenda-2026-11-21, #portafolio, #finanzas, #ajustes
function leerRuta(): { ruta: Ruta; d?: string } {
  const h = window.location.hash.replace(/^#\/?/, '')
  const m = h.match(/^agenda-(\d{4}-\d{2}-\d{2})$/)
  if (m) return { ruta: 'agenda', d: m[1] }
  const rutas: Ruta[] = ['hoy', 'agenda', 'portafolio', 'finanzas', 'ajustes']
  return { ruta: rutas.includes(h as Ruta) ? (h as Ruta) : 'hoy' }
}

const NAV: { ruta: Ruta; label: string; icon: string }[] = [
  { ruta: 'hoy', label: 'Hoy', icon: 'sun' },
  { ruta: 'agenda', label: 'Agenda', icon: 'cal' },
  { ruta: 'portafolio', label: 'Portafolio', icon: 'photo' },
  { ruta: 'finanzas', label: 'Finanzas', icon: 'chart' },
]

export default function App() {
  const [splash, setSplash] = useState(true)
  const cerrarSplash = useCallback(() => setSplash(false), [])
  return (
    <>
      <Acceso>
        <StoreProvider>
          <Shell />
        </StoreProvider>
      </Acceso>
      {splash && <Splash onDone={cerrarSplash} />}
    </>
  )
}

function AplicarTema() {
  const { db } = useStore()
  const tema = db.ajustes.tema
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const aplicar = () => {
      const oscuro = tema === 'oscuro' || (tema === 'auto' && mq.matches)
      document.documentElement.dataset.theme = oscuro ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#0e0a0b' : '#fbf3f1')
    }
    aplicar()
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [tema])
  return null
}

function Shell() {
  const [loc, setLoc] = useState(leerRuta)
  const [form, setForm] = useState<AbrirNuevaCita | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    const aviso = (e: Event) => setToast((e as CustomEvent<string>).detail)
    window.addEventListener('brava-aviso', aviso)
    return () => window.removeEventListener('brava-aviso', aviso)
  }, [])

  useEffect(() => {
    const cambio = () => { setLoc(leerRuta()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', cambio)
    return () => window.removeEventListener('hashchange', cambio)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(t)
  }, [toast])

  const ui = useMemo<UI>(() => ({
    nuevaCita: (o) => { setDetalle(null); setForm(o ?? {}) },
    verCita: (id) => setDetalle(id),
    avisar: (t) => setToast(t),
  }), [])

  const cerrarForm = useCallback(() => setForm(null), [])
  const cerrarDetalle = useCallback(() => setDetalle(null), [])

  return (
    <UICtx.Provider value={ui}>
      <AplicarTema />
      <div className="app">
        {loc.ruta === 'hoy' && <Hoy />}
        {loc.ruta === 'agenda' && <Agenda key={loc.d ?? 'agenda'} diaInicial={loc.d} />}
        {loc.ruta === 'portafolio' && <Portafolio />}
        {loc.ruta === 'finanzas' && <Finanzas />}
        {loc.ruta === 'ajustes' && <Ajustes />}

        <nav className="nav" aria-label="Secciones">
          <div className="nav-inner">
            {NAV.slice(0, 2).map((n) => <NavLink key={n.ruta} {...n} activa={loc.ruta === n.ruta} />)}
            <button type="button" className="fab" aria-label="Nueva cita" onClick={() => ui.nuevaCita()}>
              <Icon name="plus" size={24} stroke={2.2} />
            </button>
            {NAV.slice(2).map((n) => <NavLink key={n.ruta} {...n} activa={loc.ruta === n.ruta} />)}
          </div>
        </nav>

        {form && (
          <CitaForm inicial={form} onClose={cerrarForm}
            onGuardada={(id, nueva) => { setForm(null); setDetalle(id); setToast(nueva ? 'Cita agendada' : 'Cita actualizada') }} />
        )}
        {detalle && <CitaDetalle id={detalle} onClose={cerrarDetalle} />}
        <DatosDelTelefono />
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </UICtx.Provider>
  )
}

function NavLink({ ruta, label, icon, activa }: { ruta: Ruta; label: string; icon: string; activa: boolean }) {
  return (
    <a href={`#${ruta}`} aria-current={activa ? 'page' : undefined}>
      <Icon name={icon} size={22} stroke={1.7} />
      <span>{label}</span>
    </a>
  )
}

/** Una sola vez: ofrece subir a la nube lo que la versión anterior guardó en este teléfono. */
function DatosDelTelefono() {
  const { db, carga, datosLocales, recargar, olvidarDatosLocales } = useStore()
  const [avance, setAvance] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<string | null>(null)

  // Si la nube ya tiene datos, no se mezclan: se archiva la copia vieja.
  useEffect(() => {
    if (datosLocales && carga === 'listo' && db.tratamientos.length > 0 && !avance && !resumen) olvidarDatosLocales()
  }, [datosLocales, carga, db.tratamientos.length, avance, resumen, olvidarDatosLocales])

  if (resumen) {
    return (
      <Sheet title="Listo" onClose={() => setResumen(null)}
        footer={<button type="button" className="btn btn-primary btn-block" onClick={() => setResumen(null)}>Ver mi agenda</button>}>
        <p>{resumen}</p>
      </Sheet>
    )
  }
  if (!datosLocales || carga !== 'listo' || db.tratamientos.length > 0) return null

  const v = datosLocales
  const partes = [
    v.citas.length && `${v.citas.length} citas`,
    v.clientas.length && `${v.clientas.length} clientas`,
    v.gastos.length && `${v.gastos.length} gastos`,
    v.portafolio?.length && `${v.portafolio.length} fotos o videos`,
  ].filter(Boolean).join(', ')

  const subir = async () => {
    setError(null)
    setAvance('Empezando…')
    try {
      const r = await subirDatosLocales(v, setAvance)
      olvidarDatosLocales()
      await recargar()
      const extra = [
        r.citasOmitidas && `${r.citasOmitidas} citas no se subieron porque chocaban con otra`,
        r.fotosOmitidas && `${r.fotosOmitidas} archivos del portafolio no se encontraron`,
      ].filter(Boolean).join('. ')
      setResumen(`Se subieron ${r.citas} citas y ${r.fotos} trabajos del portafolio.${extra ? ' ' + extra + '.' : ''}`)
    } catch (e) {
      setError('No se pudo terminar: ' + ((e as Error).message ?? 'sin conexión') + '. Puedes intentar de nuevo; lo ya subido no se duplica.')
    }
    setAvance(null)
  }

  const limpio = async () => {
    olvidarDatosLocales()
    await recargar()
  }

  return (
    <Sheet title="Datos en este teléfono" onClose={() => {}}
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <button type="button" className="btn btn-primary btn-block" disabled={!!avance} onClick={subir}>{avance ?? 'Subirlos a la nube'}</button>
          <button type="button" className="btn btn-block" disabled={!!avance} onClick={limpio}>Empezar en limpio</button>
        </div>
      }>
      <p>Este teléfono tiene {partes} guardados antes de conectar la nube. Si eran solo pruebas, empieza en limpio.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </Sheet>
  )
}
