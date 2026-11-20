import type { EstadoCita, TipoCita } from './types'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export const diaSemana = (d: Date) => DIAS[d.getDay()]
export const diaCorto = (d: Date) => DIAS_CORTOS[d.getDay()]
export const nombreMes = (m: number) => MESES[m]
export const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const numero = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export function dinero(n: number, moneda: string) {
  const v = Math.round(n * 100) / 100
  return `${v < 0 ? '-' : ''}${moneda} ${numero.format(Math.abs(v))}`
}

export function duracion(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m}`
}

/** 2:00 pm */
export function hora(d: Date) {
  const h = d.getHours()
  const m = d.getMinutes()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/** 2:00 (sin am/pm, para listas compactas) */
export function horaCorta(d: Date) {
  const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** jueves 19 de noviembre */
export function fechaLarga(d: Date) {
  return `${diaSemana(d)} ${d.getDate()} de ${nombreMes(d.getMonth())}`
}

/** YYYY-MM-DD en hora local */
export function claveDia(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function desdeClave(clave: string) {
  const [y, m, d] = clave.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function conHora(dia: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(dia)
  d.setHours(h, m, 0, 0)
  return d
}

export const mismoDia = (a: Date, b: Date) => claveDia(a) === claveDia(b)

export function sumarDias(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function inicioSemana(d: Date) {
  const r = new Date(d)
  const dow = (r.getDay() + 6) % 7 // lunes = 0
  r.setDate(r.getDate() - dow)
  r.setHours(0, 0, 0, 0)
  return r
}

export const ETIQUETA_TIPO: Record<TipoCita, string> = {
  manicura: 'Manicura',
  pedicura: 'Pedicura',
  ambas: 'Manicura y pedicura',
}

export const ETIQUETA_ESTADO: Record<EstadoCita, string> = {
  agendada: 'Agendada',
  atendida: 'Atendida',
  cancelada: 'Cancelada',
  no_asistio: 'No llegó',
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
