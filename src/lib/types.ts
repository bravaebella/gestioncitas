// Mismo modelo que el esquema `brava` de Supabase (brava_schema.sql),
// para que conectar la base después sea un cambio de capa, no de pantallas.

export type TipoTratamiento = 'manicura' | 'pedicura'
export type TipoCita = TipoTratamiento | 'ambas'
export type EstadoCita = 'agendada' | 'atendida' | 'cancelada' | 'no_asistio'
export type Calendario = 'google' | 'iphone'
export type Canal = 'whatsapp' | 'sms'
export type MinutosAviso = 60 | 30
export type Tema = 'auto' | 'claro' | 'oscuro'

export interface Clienta {
  id: string
  nombre: string
  telefono: string
  notas: string
  creadoEn: string
}

export interface Tratamiento {
  id: string
  tipo: TipoTratamiento
  nombre: string
  duracionMin: number
  precio: number
  activo: boolean
  orden: number
}

/** Copia del tratamiento al momento de agendar: si luego cambia el precio, la cita no cambia. */
export interface ItemCita {
  tratamientoId: string
  tipo: TipoTratamiento
  nombre: string
  duracionMin: number
  precio: number
}

export interface Cita {
  id: string
  clientaId: string
  tipo: TipoCita
  inicio: string // ISO
  fin: string // ISO
  estado: EstadoCita
  items: ItemCita[]
  total: number
  notas: string
  /** Momento en que se envió cada aviso, por minutos antes. */
  avisos: Partial<Record<MinutosAviso, string>>
  creadoEn: string
}

export interface Gasto {
  id: string
  fecha: string // YYYY-MM-DD
  clase: 'gasto' | 'costo'
  categoria: string
  descripcion: string
  monto: number
  creadoEn: string
}

export interface Obra {
  id: string
  titulo: string
  tipo: TipoTratamiento
  medio: 'foto' | 'video'
  creadoEn: string
}

export interface Ajustes {
  nombreEstudio: string
  moneda: string
  codigoPais: string
  calendario: Calendario
  aviso60: boolean
  aviso30: boolean
  canal: Canal
  apertura: string // HH:MM
  cierre: string // HH:MM
  diasCerrados: number[] // 0 = domingo
  tema: Tema
}

export interface DB {
  v: 1
  clientas: Clienta[]
  tratamientos: Tratamiento[]
  citas: Cita[]
  gastos: Gasto[]
  portafolio: Obra[]
  ajustes: Ajustes
}

export const ESTADOS_ACTIVOS: EstadoCita[] = ['agendada', 'atendida']
