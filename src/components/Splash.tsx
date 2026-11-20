import { useEffect, useState } from 'react'
import completo from '../assets/logo/completo.webp'
import marco from '../assets/logo/marco.webp'
import monograma from '../assets/logo/monograma.webp'
import pavoCola from '../assets/logo/pavo-cola.webp'
import pavoCuello from '../assets/logo/pavo-cuello.webp'
import pluma1 from '../assets/logo/pluma-1.webp'
import pluma2 from '../assets/logo/pluma-2.webp'
import pluma3 from '../assets/logo/pluma-3.webp'
import texto from '../assets/logo/texto.webp'

// Posición de cada capa dentro del logo (en % del logo completo).
// `origen` es el punto de giro: la base del cuello y la raíz de la cola.
const CAPAS: { id: string; src: string; left: number; top: number; width: number; height: number; origen?: string }[] = [
  { id: 'marco', src: marco, left: 19.537, top: 7.656, width: 67.544, height: 83.014 },
  { id: 'pavo-cola', src: pavoCola, left: 10.845, top: 33.174, width: 33.892, height: 48.485 },
  { id: 'pluma-1', src: pluma1, left: 15.63, top: 56.858, width: 10.128, height: 14.992, origen: '58.3% -28.2%' },
  { id: 'pluma-2', src: pluma2, left: 23.923, top: 57.974, width: 17.225, height: 10.048, origen: '-13.9% -53.2%' },
  { id: 'pluma-3', src: pluma3, left: 25.359, top: 68.022, width: 19.219, height: 12.919, origen: '-19.9% -119.1%' },
  { id: 'pavo-cuello', src: pavoCuello, left: 17.703, top: 22.727, width: 7.815, height: 25.199, origen: '54.1% 98.1%' },
  { id: 'monograma', src: monograma, left: 26.794, top: 19.139, width: 35.726, height: 40.51 },
  { id: 'texto', src: texto, left: 44.657, top: 24.322, width: 41.069, height: 42.823 },
]

// Destellos alrededor del aro: [left %, top %, tamaño px, retraso s]
const DESTELLOS: [number, number, number, number][] = [
  [86, 18, 14, 1.5], [93, 44, 9, 1.9], [80, 80, 12, 2.2], [14, 16, 10, 1.7],
  [6, 52, 8, 2.4], [58, 4, 11, 2.0], [97, 66, 7, 2.6], [30, 95, 9, 2.3],
]

// Ojos de las plumas y bolitas de la corona del pavo real: [left %, top %, retraso s]
const OJOS: [number, number, number][] = [[19.3, 63.8, 1.75], [34.45, 62.68, 1.9], [34.45, 73.37, 2.05]]
const CORONA: [number, number, number][] = [[18.74, 26.08, 1.3], [20.57, 25.52, 1.4], [23.13, 25.04, 1.5]]

const DURACION = 3500

export function Splash({ onDone }: { onDone: () => void }) {
  const [saliendo, setSaliendo] = useState(false)
  const sinMovimiento = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const t = setTimeout(() => setSaliendo(true), sinMovimiento ? 900 : DURACION)
    return () => clearTimeout(t)
  }, [sinMovimiento])

  useEffect(() => {
    if (!saliendo) return
    const t = setTimeout(onDone, 520)
    return () => clearTimeout(t)
  }, [saliendo, onDone])

  return (
    <div
      className={`splash${saliendo ? ' saliendo' : ''}`}
      role="img"
      aria-label="Brava e' Bella Nails Studio. Fuerza en la delicadeza de tus manos"
      onClick={() => setSaliendo(true)}
    >
      <div className="splash-brillo-fondo" aria-hidden="true" />
      <div className="logo-escena" aria-hidden="true">
        {sinMovimiento ? (
          <img className="capa" src={completo} alt="" style={{ left: 0, top: 0, width: '100%', height: '100%' }} />
        ) : (
          <>
            {CAPAS.map((c) => (
              <img key={c.id} className={`capa capa-${c.id}`} src={c.src} alt="" decoding="async"
                style={{ left: `${c.left}%`, top: `${c.top}%`, width: `${c.width}%`, height: `${c.height}%`, transformOrigin: c.origen }} />
            ))}
            <span className="logo-destello" style={{ WebkitMaskImage: `url(${completo})`, maskImage: `url(${completo})` }} />
            {OJOS.map(([l, t, d], i) => (
              <span key={'o' + i} className="ojo-pluma" style={{ left: `${l}%`, top: `${t}%`, animationDelay: `${d}s` }} />
            ))}
            {CORONA.map(([l, t, d], i) => (
              <span key={'c' + i} className="chispa" style={{ left: `${l}%`, top: `${t}%`, width: 9, height: 9, animationDelay: `${d}s` }} />
            ))}
            {DESTELLOS.map(([l, t, s, d], i) => (
              <span key={i} className="chispa" style={{ left: `${l}%`, top: `${t}%`, width: s, height: s, animationDelay: `${d}s` }} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
