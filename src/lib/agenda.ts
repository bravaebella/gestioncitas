import { claveDia, conHora, mismoDia } from './format'
import type { Ajustes, Cita, DB } from './types'
import { ESTADOS_ACTIVOS } from './types'

export const esActiva = (c: Cita) => ESTADOS_ACTIVOS.includes(c.estado)

export const chocan = (aIni: Date, aFin: Date, bIni: Date, bFin: Date) =>
  aIni < bFin && bIni < aFin

export function citasDelDia(db: DB, dia: Date, soloActivas = false) {
  const clave = claveDia(dia)
  return db.citas
    .filter((c) => claveDia(new Date(c.inicio)) === clave && (!soloActivas || esActiva(c)))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
}

/** Devuelve la cita con la que choca el horario propuesto, o null si está libre. */
export function buscarChoque(db: DB, inicio: Date, fin: Date, ignorarId?: string) {
  return (
    db.citas.find(
      (c) =>
        c.id !== ignorarId &&
        esActiva(c) &&
        chocan(inicio, fin, new Date(c.inicio), new Date(c.fin)),
    ) ?? null
  )
}

export const diaCerrado = (aj: Ajustes, dia: Date) => aj.diasCerrados.includes(dia.getDay())

export interface Hueco {
  desde: Date
  hasta: Date
  min: number
}

/** Espacios libres del día dentro del horario del estudio. */
export function huecosDelDia(db: DB, dia: Date, ignorarId?: string): Hueco[] {
  const abre = conHora(dia, db.ajustes.apertura)
  const cierra = conHora(dia, db.ajustes.cierre)
  const ocupadas = citasDelDia(db, dia, true).filter((c) => c.id !== ignorarId)
  const huecos: Hueco[] = []
  let cursor = abre
  for (const c of ocupadas) {
    const ini = new Date(c.inicio)
    const fin = new Date(c.fin)
    if (ini > cursor) {
      const hasta = ini < cierra ? ini : cierra
      if (hasta > cursor) huecos.push({ desde: cursor, hasta, min: (hasta.getTime() - cursor.getTime()) / 60000 })
    }
    if (fin > cursor) cursor = fin
  }
  if (cierra > cursor) huecos.push({ desde: cursor, hasta: cierra, min: (cierra.getTime() - cursor.getTime()) / 60000 })
  return huecos
}

export interface HoraLibre {
  inicio: Date
  /** Minutos libres desde esta hora hasta la siguiente cita o el cierre. */
  libreMin: number
}

/**
 * Horas donde cabe una cita de `durMin` minutos: cada 30 minutos más
 * el minuto exacto en que termina otra cita, para no desperdiciar huecos.
 */
export function horasLibres(db: DB, dia: Date, durMin: number, ahora: Date, ignorarId?: string): HoraLibre[] {
  if (durMin <= 0) return []
  const huecos = huecosDelDia(db, dia, ignorarId)
  const resultado: HoraLibre[] = []
  const vistos = new Set<number>()
  const limite = mismoDia(dia, ahora) ? ahora.getTime() : -Infinity

  for (const h of huecos) {
    const candidatos: Date[] = [h.desde]
    const t = new Date(h.desde)
    t.setMinutes(Math.ceil(t.getMinutes() / 30) * 30, 0, 0)
    while (t < h.hasta) {
      candidatos.push(new Date(t))
      t.setMinutes(t.getMinutes() + 30)
    }
    for (const c of candidatos) {
      const fin = c.getTime() + durMin * 60000
      if (fin > h.hasta.getTime() || c.getTime() < limite || vistos.has(c.getTime())) continue
      vistos.add(c.getTime())
      resultado.push({ inicio: c, libreMin: (h.hasta.getTime() - c.getTime()) / 60000 })
    }
  }
  return resultado.sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
}

/** Minutos ocupados del día (para la barra de ocupación del calendario). */
export function minutosOcupados(db: DB, dia: Date) {
  return citasDelDia(db, dia, true).reduce(
    (s, c) => s + (new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 60000,
    0,
  )
}

export function minutosJornada(aj: Ajustes) {
  const [ah, am] = aj.apertura.split(':').map(Number)
  const [ch, cm] = aj.cierre.split(':').map(Number)
  return Math.max(0, ch * 60 + cm - (ah * 60 + am))
}
