import { useEffect, useState } from 'react'
import completo from '../assets/logo/completo.webp'
import marco from '../assets/logo/marco.webp'
import monograma from '../assets/logo/monograma.webp'
import pavo from '../assets/logo/pavo.webp'
import texto from '../assets/logo/texto.webp'

// Posición de cada capa dentro del logo (en % del logo completo)
const CAPAS = [
  { id: 'marco', src: marco, left: 19.537, top: 7.656, width: 67.544, height: 83.014 },
  { id: 'pavo', src: pavo, left: 10.845, top: 22.727, width: 33.892, height: 58.931 },
  { id: 'monograma', src: monograma, left: 26.794, top: 19.139, width: 35.726, height: 40.51 },
  { id: 'texto', src: texto, left: 44.657, top: 24.322, width: 41.069, height: 42.823 },
]

// Destellos alrededor del aro: [left %, top %, tamaño px, retraso s]
const DESTELLOS: [number, number, number, number][] = [
  [86, 18, 14, 1.5], [93, 44, 9, 1.9], [80, 80, 12, 2.2], [14, 16, 10, 1.7],
  [6, 52, 8, 2.4], [58, 4, 11, 2.0], [97, 66, 7, 2.6], [30, 95, 9, 2.3],
]

const DURACION = 3300

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
                style={{ left: `${c.left}%`, top: `${c.top}%`, width: `${c.width}%`, height: `${c.height}%` }} />
            ))}
            <span className="logo-destello" style={{ WebkitMaskImage: `url(${completo})`, maskImage: `url(${completo})` }} />
            {DESTELLOS.map(([l, t, s, d], i) => (
              <span key={i} className="chispa" style={{ left: `${l}%`, top: `${t}%`, width: s, height: s, animationDelay: `${d}s` }} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
