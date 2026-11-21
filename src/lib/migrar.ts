// Sube a la nube, una sola vez, lo que la versión anterior guardó en el teléfono.

import { uid } from './format'
import { leerArchivo } from './media'
import { ejecutar, filaAjustes, filaClienta, filaGasto, filaObra, filaTratamiento, pasosCita, rutaPara, subirArchivo } from './remoto'
import type { DB, Obra, Tratamiento } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Informe {
  citas: number
  citasOmitidas: number
  fotos: number
  fotosOmitidas: number
}

export async function subirDatosLocales(v: DB, avance: (texto: string) => void): Promise<Informe> {
  const ids = new Map<string, string>()
  const id = (x: string) => {
    if (UUID.test(x)) return x
    if (!ids.has(x)) ids.set(x, uid())
    return ids.get(x)!
  }

  // Tratamientos, incluidos los que se borraron pero siguen en citas viejas.
  avance('Subiendo tratamientos…')
  const tratamientos = new Map<string, Tratamiento>()
  for (const t of v.tratamientos) tratamientos.set(id(t.id), { ...t, id: id(t.id) })
  for (const c of v.citas) {
    for (const i of c.items) {
      const tid = id(i.tratamientoId)
      if (!tratamientos.has(tid)) {
        tratamientos.set(tid, { id: tid, tipo: i.tipo, nombre: i.nombre, duracionMin: i.duracionMin, precio: i.precio, activo: false, orden: 99 })
      }
    }
  }
  const nombres = new Set<string>()
  const filasT = [...tratamientos.values()].map((t) => {
    let nombre = t.nombre
    for (let n = 2; nombres.has(t.tipo + nombre); n++) nombre = `${t.nombre} (${n})`
    nombres.add(t.tipo + nombre)
    return filaTratamiento({ ...t, nombre })
  })
  if (filasT.length) await ejecutar({ t: 'upsert', tabla: 'tratamientos', filas: filasT })

  avance('Subiendo clientas…')
  const clientas = v.clientas.map((c) => ({ ...c, id: id(c.id) }))
  for (let i = 0; i < clientas.length; i += 200) {
    await ejecutar({ t: 'upsert', tabla: 'clientas', filas: clientas.slice(i, i + 200).map(filaClienta) })
  }

  // Una por una: si alguna choca con otra, se salta y siguen las demás.
  let citas = 0
  let citasOmitidas = 0
  for (const [n, c0] of v.citas.entries()) {
    if (n % 10 === 0) avance(`Subiendo citas… ${n + 1} de ${v.citas.length}`)
    const c = { ...c0, id: id(c0.id), clientaId: id(c0.clientaId), items: c0.items.map((i) => ({ ...i, tratamientoId: id(i.tratamientoId) })) }
    try {
      for (const p of pasosCita(c, null, false)) await ejecutar(p)
      citas++
    } catch {
      citasOmitidas++
      await ejecutar({ t: 'delete', tabla: 'citas', donde: { id: c.id } }).catch(() => {})
    }
  }

  avance('Subiendo gastos…')
  const gastos = v.gastos.map((g) => ({ ...g, id: id(g.id) }))
  for (let i = 0; i < gastos.length; i += 200) {
    await ejecutar({ t: 'upsert', tabla: 'gastos', filas: gastos.slice(i, i + 200).map(filaGasto) })
  }

  let fotos = 0
  let fotosOmitidas = 0
  for (const [n, o] of (v.portafolio ?? []).entries()) {
    avance(`Subiendo portafolio… ${n + 1} de ${v.portafolio.length}`)
    try {
      const blob = await leerArchivo(o.id)
      if (!blob) throw new Error('sin archivo')
      const nid = id(o.id)
      const obra: Obra = { ...o, id: nid, ruta: rutaPara(nid, blob, o.medio) }
      await subirArchivo(obra.ruta, blob)
      await ejecutar({ t: 'upsert', tabla: 'portafolio', filas: [filaObra(obra)] })
      fotos++
    } catch {
      fotosOmitidas++
    }
  }

  if (v.ajustes) {
    await ejecutar({ t: 'update', tabla: 'ajustes', valores: filaAjustes(v.ajustes), donde: { id: true } })
  }
  return { citas, citasOmitidas, fotos, fotosOmitidas }
}
