import { useEffect, useState } from 'react'

/** Hora actual que se refresca sola (para avisos y la línea de "ahora"). */
export function useAhora(cadaMs = 30000) {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), cadaMs)
    const alVolver = () => document.visibilityState === 'visible' && setAhora(new Date())
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [cadaMs])
  return ahora
}
