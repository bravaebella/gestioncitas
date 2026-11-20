import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon, UICtx, type AbrirNuevaCita, type UI } from './components/ui'
import { StoreProvider } from './lib/store'
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
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const [loc, setLoc] = useState(leerRuta)
  const [form, setForm] = useState<AbrirNuevaCita | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

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
