// Traduce el modelo de la app a las tablas del esquema `brava` y de vuelta.
// Los cambios se guardan como "pasos" serializables: si no hay señal, esperan
// en el teléfono y se envían al volver la conexión.

import { BUCKET, sb } from './supabase'
import type { Ajustes, Cita, Clienta, DB, Gasto, MinutosAviso, Obra, Tratamiento } from './types'

type Fila = Record<string, unknown>

export type Paso =
  | { t: 'upsert'; tabla: string; filas: Fila[]; conflicto?: string }
  | { t: 'update'; tabla: string; valores: Fila; donde: Fila }
  | { t: 'delete'; tabla: string; donde: Fila }
  | { t: 'storage-delete'; rutas: string[] }

/** Un grupo de pasos que va junto: si uno falla, se descartan los demás. */
export interface Envio {
  id: string
  pasos: Paso[]
}

export async function ejecutar(p: Paso): Promise<void> {
  if (p.t === 'storage-delete') {
    const { error } = await sb.storage.from(BUCKET).remove(p.rutas)
    if (error) throw error
    return
  }
  const tabla = sb.from(p.tabla)
  let r
  if (p.t === 'upsert') r = await tabla.upsert(p.filas, p.conflicto ? { onConflict: p.conflicto } : undefined)
  else if (p.t === 'update') r = await tabla.update(p.valores).match(p.donde)
  else r = await tabla.delete().match(p.donde)
  if (r.error) throw r.error
}

// ——— lectura ———

const iso = (v: unknown) => new Date(String(v)).toISOString()
const hhmm = (v: unknown) => String(v).slice(0, 5)
const num = (v: unknown) => Number(v)

async function todas(tabla: string, select = '*', orden = 'id'): Promise<Fila[]> {
  const filas: Fila[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(tabla).select(select).order(orden).range(desde, desde + 999)
    if (error) throw error
    filas.push(...((data ?? []) as unknown as Fila[]))
    if (!data || data.length < 1000) return filas
  }
}

export async function cargarTodo(): Promise<Omit<DB, 'v'>> {
  const [clientas, tratamientos, citas, gastos, portafolio, ajustes] = await Promise.all([
    todas('clientas'),
    todas('tratamientos'),
    todas('citas', '*, cita_tratamientos(*), recordatorios(minutos_antes, whatsapp_en)'),
    todas('gastos'),
    todas('portafolio', '*', 'creado_en'),
    sb.from('ajustes').select('*').maybeSingle(),
  ])
  if (ajustes.error) throw ajustes.error
  return {
    clientas: clientas.map(aClienta),
    tratamientos: tratamientos.map(aTratamiento),
    citas: citas.map(aCita),
    gastos: gastos.map(aGasto),
    portafolio: portafolio.map(aObra).reverse(),
    ajustes: ajustes.data ? aAjustes(ajustes.data) : null as unknown as Ajustes,
  }
}

const aClienta = (r: Fila): Clienta => ({
  id: String(r.id), nombre: String(r.nombre), telefono: String(r.telefono ?? ''), notas: String(r.notas ?? ''), creadoEn: iso(r.creado_en),
})

const aTratamiento = (r: Fila): Tratamiento => ({
  id: String(r.id), tipo: r.tipo as Tratamiento['tipo'], nombre: String(r.nombre), duracionMin: num(r.duracion_min),
  precio: num(r.precio), activo: Boolean(r.activo), orden: num(r.orden),
})

function aCita(r: Fila): Cita {
  const items = (r.cita_tratamientos as Fila[] | null) ?? []
  const recs = (r.recordatorios as Fila[] | null) ?? []
  const avisos: Cita['avisos'] = {}
  for (const x of recs) if (x.whatsapp_en) avisos[num(x.minutos_antes) as MinutosAviso] = iso(x.whatsapp_en)
  return {
    id: String(r.id), clientaId: String(r.clienta_id), tipo: r.tipo as Cita['tipo'], inicio: iso(r.inicio), fin: iso(r.fin),
    estado: r.estado as Cita['estado'],
    items: items.map((i) => ({
      tratamientoId: String(i.tratamiento_id), tipo: i.tipo as Tratamiento['tipo'], nombre: String(i.nombre),
      duracionMin: num(i.duracion_min), precio: num(i.precio),
    })),
    total: num(r.precio_total), notas: String(r.notas ?? ''), avisos, creadoEn: iso(r.creado_en),
  }
}

const aGasto = (r: Fila): Gasto => ({
  id: String(r.id), fecha: String(r.fecha), clase: r.clase as Gasto['clase'], categoria: String(r.categoria),
  descripcion: String(r.descripcion ?? ''), monto: num(r.monto), creadoEn: iso(r.creado_en),
})

const aObra = (r: Fila): Obra => ({
  id: String(r.id), titulo: String(r.titulo ?? ''), tipo: r.tipo as Obra['tipo'], medio: r.medio as Obra['medio'],
  ruta: String(r.ruta), creadoEn: iso(r.creado_en),
})

const aAjustes = (r: Fila): Ajustes => ({
  nombreEstudio: String(r.nombre_estudio), moneda: String(r.moneda), codigoPais: String(r.codigo_pais),
  calendario: r.calendario as Ajustes['calendario'], aviso60: Boolean(r.aviso_60), aviso30: Boolean(r.aviso_30),
  canal: r.canal as Ajustes['canal'], apertura: hhmm(r.apertura), cierre: hhmm(r.cierre),
  diasCerrados: ((r.dias_cerrados as number[]) ?? []).map(Number), tema: r.tema as Ajustes['tema'],
})

// ——— escritura ———

export const filaClienta = (c: Clienta) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono, notas: c.notas })

export const filaTratamiento = (t: Tratamiento) => ({
  id: t.id, tipo: t.tipo, nombre: t.nombre, duracion_min: t.duracionMin, precio: t.precio, activo: t.activo, orden: t.orden,
})

export const filaGasto = (g: Gasto) => ({
  id: g.id, fecha: g.fecha, clase: g.clase, categoria: g.categoria, descripcion: g.descripcion, monto: g.monto, creado_en: g.creadoEn,
})

export const filaObra = (o: Obra) => ({ id: o.id, titulo: o.titulo, tipo: o.tipo, medio: o.medio, ruta: o.ruta, creado_en: o.creadoEn })

export function filaAjustes(a: Partial<Ajustes>): Fila {
  const m: Record<keyof Ajustes, string> = {
    nombreEstudio: 'nombre_estudio', moneda: 'moneda', codigoPais: 'codigo_pais', calendario: 'calendario',
    aviso60: 'aviso_60', aviso30: 'aviso_30', canal: 'canal', apertura: 'apertura', cierre: 'cierre',
    diasCerrados: 'dias_cerrados', tema: 'tema',
  }
  const f: Fila = {}
  for (const [k, v] of Object.entries(a)) if (m[k as keyof Ajustes] && v !== undefined) f[m[k as keyof Ajustes]] = v
  return f
}

const filaRecordatorio = (c: Cita, min: MinutosAviso, reiniciar: boolean) => ({
  cita_id: c.id,
  minutos_antes: min,
  enviar_en: new Date(new Date(c.inicio).getTime() - min * 60000).toISOString(),
  whatsapp_en: c.avisos[min] ?? null,
  ...(reiniciar ? { push_duena_en: null, push_clienta_en: null } : {}),
})

/** Todo lo que cambia al guardar una cita: clienta, cita, tratamientos y avisos. */
export function pasosCita(c: Cita, clienta: Clienta | null, cambioHora: boolean): Paso[] {
  const pasos: Paso[] = []
  if (clienta) pasos.push({ t: 'upsert', tabla: 'clientas', filas: [filaClienta(clienta)] })
  pasos.push(
    {
      t: 'upsert', tabla: 'citas', filas: [{
        id: c.id, clienta_id: c.clientaId, tipo: c.tipo, inicio: c.inicio, fin: c.fin, estado: c.estado,
        precio_total: c.total, notas: c.notas, creado_en: c.creadoEn,
      }],
    },
    { t: 'delete', tabla: 'cita_tratamientos', donde: { cita_id: c.id } },
  )
  // Un tratamiento repetido en la misma cita se guarda una vez (clave cita + tratamiento).
  const unicos = new Map(c.items.map((i) => [i.tratamientoId, i]))
  if (unicos.size) {
    pasos.push({
      t: 'upsert', tabla: 'cita_tratamientos', filas: [...unicos.values()].map((i) => ({
        cita_id: c.id, tratamiento_id: i.tratamientoId, tipo: i.tipo, nombre: i.nombre, duracion_min: i.duracionMin, precio: i.precio,
      })),
    })
  }
  pasos.push({ t: 'upsert', tabla: 'recordatorios', conflicto: 'cita_id,minutos_antes', filas: [filaRecordatorio(c, 60, cambioHora), filaRecordatorio(c, 30, cambioHora)] })
  return pasos
}

export function pasoAviso(c: Cita, min: MinutosAviso): Paso {
  return { t: 'upsert', tabla: 'recordatorios', conflicto: 'cita_id,minutos_antes', filas: [filaRecordatorio(c, min, false)] }
}

// ——— portafolio ———

export async function subirArchivo(ruta: string, blob: Blob) {
  const { error } = await sb.storage.from(BUCKET).upload(ruta, blob, { contentType: blob.type || undefined, upsert: true })
  if (error) throw error
}

export function rutaPara(id: string, blob: Blob, medio: Obra['medio']) {
  const ext = blob.type.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') || (medio === 'video' ? 'mp4' : 'jpg')
  return `${id}.${ext}`
}

const firmadas = new Map<string, { url: string; vence: number }>()

/** Enlace temporal (1 h) para ver un archivo del bucket privado. */
export async function urlFirmada(ruta: string): Promise<string | null> {
  const c = firmadas.get(ruta)
  if (c && c.vence > Date.now() + 60000) return c.url
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(ruta, 3600)
  if (error || !data) return null
  firmadas.set(ruta, { url: data.signedUrl, vence: Date.now() + 3600 * 1000 })
  return data.signedUrl
}

export async function descargarArchivo(ruta: string): Promise<Blob | null> {
  const { data, error } = await sb.storage.from(BUCKET).download(ruta)
  return error ? null : data
}
