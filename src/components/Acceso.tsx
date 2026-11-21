// Puerta de entrada: solo la dueña (correo autorizado en brava.admins_permitidos)
// llega a la agenda. La sesión queda guardada en el teléfono.

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import completo from '../assets/logo/completo.webp'
import { activarMiembro, sb, urlApp, type Acceso as EstadoAcceso } from '../lib/supabase'
import { limpiarCopiaLocal } from '../lib/store'

type Modo = 'entrar' | 'crear' | 'olvide' | 'nueva'

function traducir(m: string): string {
  if (/fetch|network|Load failed/i.test(m)) return 'Sin conexión. Revisa la señal e intenta de nuevo.'
  if (/already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Usa "Ya tengo cuenta".'
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos.'
  if (/weak|pwned/i.test(m)) return 'Esa contraseña es muy fácil de adivinar. Usa otra.'
  return m
}

export async function cerrarSesion() {
  limpiarCopiaLocal()
  await sb.auth.signOut()
}

export function Acceso({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined)
  const [acceso, setAcceso] = useState<EstadoAcceso | 'revisando' | 'sin_conexion'>('revisando')
  const [modo, setModo] = useState<Modo>('entrar')

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = sb.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setModo('nueva')
      setSesion(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = sesion?.user.id
  useEffect(() => {
    if (sesion === undefined) return
    if (!userId) { setAcceso('sin_sesion'); return }
    setAcceso('revisando')
    let vivo = true
    activarMiembro()
      .then((a) => { if (vivo) setAcceso(a) })
      .catch(() => { if (vivo) setAcceso('sin_conexion') })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sesion === undefined])

  // Sin señal pero con sesión guardada: se abre con la copia del teléfono.
  if (acceso === 'miembro' || (acceso === 'sin_conexion' && sesion)) {
    if (modo === 'nueva') return <Marco><NuevaClave onListo={() => setModo('entrar')} /></Marco>
    return <>{children}</>
  }
  if (sesion === undefined || acceso === 'revisando') return <Marco><p className="sub" style={{ textAlign: 'center' }}>Abriendo…</p></Marco>

  if (sesion && acceso === 'no_autorizado') {
    return (
      <Marco>
        <p style={{ textAlign: 'center' }}>Esta cuenta ({sesion.user.email}) no tiene acceso a la agenda del estudio.</p>
        <button type="button" className="btn btn-block" onClick={cerrarSesion}>Entrar con otra cuenta</button>
      </Marco>
    )
  }
  if (sesion && acceso === 'correo_sin_confirmar') {
    return (
      <Marco>
        <p style={{ textAlign: 'center' }}>Falta confirmar el correo {sesion.user.email}. Abre el enlace que te llegó y vuelve a entrar.</p>
        <button type="button" className="btn btn-block" onClick={cerrarSesion}>Volver</button>
      </Marco>
    )
  }
  return <Marco><Formulario modo={modo} setModo={setModo} /></Marco>
}

function Marco({ children }: { children: ReactNode }) {
  return (
    <main className="acceso">
      <img className="acceso-logo logo-escena" src={completo} alt="Brava e' Bella Nail's Studio" />
      <div className="acceso-caja">{children}</div>
    </main>
  )
}

function Formulario({ modo, setModo }: { modo: Modo; setModo: (m: Modo) => void }) {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const cambiar = (m: Modo) => { setModo(m); setError(null); setAviso(null) }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setAviso(null)
    const email = correo.trim().toLowerCase()
    if (!email.includes('@')) return setError('Escribe tu correo.')
    if (modo !== 'olvide' && clave.length < 8) return setError('La contraseña necesita al menos 8 caracteres.')
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email, password: clave })
        if (error) setError(error.message.includes('not confirmed')
          ? 'Falta confirmar el correo. Abre el enlace que te llegó.'
          : /invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : traducir(error.message))
      } else if (modo === 'crear') {
        const { data, error } = await sb.auth.signUp({ email, password: clave, options: { emailRedirectTo: urlApp() } })
        if (error) setError(traducir(error.message))
        else if (!data.session) {
          setAviso(`Te enviamos un correo a ${email}. Abre el enlace para confirmarlo y luego entra aquí con tu contraseña.`)
          setModo('entrar')
        }
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: urlApp() })
        if (error) setError(traducir(error.message))
        else setAviso('Si el correo tiene cuenta, te llegará un enlace para crear una contraseña nueva.')
      }
    } catch {
      setError('Sin conexión. Revisa la señal e intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const titulo = { entrar: 'Entrar', crear: 'Crear tu cuenta', olvide: 'Recuperar contraseña', nueva: '' }[modo]
  const boton = { entrar: 'Entrar', crear: 'Crear cuenta', olvide: 'Enviar enlace', nueva: '' }[modo]

  return (
    <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
      <h1 className="acceso-titulo">{titulo}</h1>
      {aviso && <p className="note" role="status" style={{ textAlign: 'center' }}>{aviso}</p>}
      <div className="field">
        <label className="label" htmlFor="ac-correo">Correo</label>
        <input id="ac-correo" className="input" type="email" autoComplete="email" inputMode="email" autoCapitalize="none"
          value={correo} onChange={(e) => setCorreo(e.target.value)} />
      </div>
      {modo !== 'olvide' && (
        <div className="field">
          <label className="label" htmlFor="ac-clave">Contraseña</label>
          <input id="ac-clave" className="input" type="password" autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
            value={clave} onChange={(e) => setClave(e.target.value)} />
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={enviando}>{enviando ? 'Un momento…' : boton}</button>
      <div className="acceso-enlaces">
        {modo === 'entrar' && <>
          <button type="button" className="btn btn-ghost" onClick={() => cambiar('crear')}>Es mi primera vez</button>
          <button type="button" className="btn btn-ghost" onClick={() => cambiar('olvide')}>Olvidé la contraseña</button>
        </>}
        {modo !== 'entrar' && <button type="button" className="btn btn-ghost" onClick={() => cambiar('entrar')}>Ya tengo cuenta</button>}
      </div>
    </form>
  )
}

function NuevaClave({ onListo }: { onListo: () => void }) {
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    if (clave.length < 8) return setError('La contraseña necesita al menos 8 caracteres.')
    setEnviando(true)
    const { error } = await sb.auth.updateUser({ password: clave })
    setEnviando(false)
    if (error) setError(traducir(error.message))
    else onListo()
  }
  return (
    <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 className="acceso-titulo">Contraseña nueva</h1>
      <div className="field">
        <label className="label" htmlFor="ac-nueva">Contraseña</label>
        <input id="ac-nueva" className="input" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={enviando}>Guardar contraseña</button>
    </form>
  )
}
