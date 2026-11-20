import { useEffect, useState, type ReactNode } from 'react'

/** Botón de dos toques para acciones que borran algo. */
export function ConfirmButton({
  children, confirmar = '¿Seguro? Toca otra vez', onConfirm, className = 'btn btn-danger', ariaLabel,
}: { children: ReactNode; confirmar?: string; onConfirm: () => void; className?: string; ariaLabel?: string }) {
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    if (!armado) return
    const t = setTimeout(() => setArmado(false), 3500)
    return () => clearTimeout(t)
  }, [armado])
  return (
    <button
      type="button"
      className={className}
      aria-label={armado ? confirmar : ariaLabel}
      style={armado ? { background: 'var(--danger-bg)', borderColor: 'var(--danger-bg)', color: '#fff' } : undefined}
      onClick={() => (armado ? (setArmado(false), onConfirm()) : setArmado(true))}
    >
      {armado ? confirmar : children}
    </button>
  )
}
