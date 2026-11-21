import { createClient } from '@supabase/supabase-js'

// La llave publicable puede ir en el código: la seguridad la dan las
// políticas RLS del esquema `brava` (solo la dueña ve los datos).
export const SUPABASE_URL = 'https://fwzlkiowigpnkhjffzpr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_05_HblbORHoyx3iIdjLPew_QMbS6ebG'

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'brava' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'brava-sesion' },
})

export const BUCKET = 'brava-portafolio'

/** Dirección a la que vuelven los correos de confirmación y de nueva contraseña. */
export const urlApp = () => window.location.origin + window.location.pathname

export type Acceso = 'sin_sesion' | 'miembro' | 'no_autorizado' | 'correo_sin_confirmar'

export async function activarMiembro(): Promise<Acceso> {
  const { data, error } = await sb.rpc('activar_miembro')
  if (error) throw error
  return data as Acceso
}

export function mensajeError(e: unknown): string {
  const err = e as { code?: string; message?: string; status?: number }
  if (err?.code === '23P01') return 'Ese horario choca con otra cita. Se recargó la agenda.'
  if (err?.message?.includes('Failed to fetch') || err?.message?.includes('Load failed')) return 'Sin conexión. Se reintentará al volver.'
  return 'No se pudo guardar en la nube: ' + (err?.message ?? 'error desconocido')
}
