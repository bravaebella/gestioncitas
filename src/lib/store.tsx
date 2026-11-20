// Datos guardados en el teléfono (localStorage).
// Todas las pantallas usan solo estas acciones, así que conectar Supabase
// después es cambiar este archivo, no las pantallas.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { buscarChoque } from './agenda'
import { hora, uid } from './format'
import { borrarArchivo, guardarArchivo } from './media'
import { datosDeEjemplo } from './ejemplo'
import type { Ajustes, Cita, Clienta, DB, EstadoCita, Gasto, MinutosAviso, Obra, Tratamiento } from './types'

const CLAVE = 'brava-db-v1'

export const AJUSTES_INICIALES: Ajustes = {
  nombreEstudio: "Brava e' Bella Nail's Studio",
  moneda: 'C$',
  codigoPais: '505',
  calendario: 'google',
  aviso60: true,
  aviso30: true,
  canal: 'whatsapp',
  apertura: '09:00',
  cierre: '18:00',
  diasCerrados: [0],
}

// Catálogo de arranque: precios y tiempos de ejemplo, se cambian en Ajustes.
const CATALOGO_INICIAL: Omit<Tratamiento, 'id'>[] = [
  { tipo: 'manicura', nombre: 'Limpieza y cutícula', duracionMin: 20, precio: 150, activo: true, orden: 1 },
  { tipo: 'manicura', nombre: 'Esmaltado en gel', duracionMin: 40, precio: 300, activo: true, orden: 2 },
  { tipo: 'manicura', nombre: 'Uñas acrílicas', duracionMin: 75, precio: 600, activo: true, orden: 3 },
  { tipo: 'manicura', nombre: 'Diseño / nail art', duracionMin: 30, precio: 200, activo: true, orden: 4 },
  { tipo: 'manicura', nombre: 'Retiro de gel', duracionMin: 15, precio: 100, activo: true, orden: 5 },
  { tipo: 'pedicura', nombre: 'Pedicura spa', duracionMin: 50, precio: 400, activo: true, orden: 1 },
  { tipo: 'pedicura', nombre: 'Esmaltado en gel', duracionMin: 30, precio: 250, activo: true, orden: 2 },
  { tipo: 'pedicura', nombre: 'Exfoliación y masaje', duracionMin: 20, precio: 150, activo: true, orden: 3 },
  { tipo: 'pedicura', nombre: 'Retiro de gel', duracionMin: 15, precio: 100, activo: true, orden: 4 },
]

export function dbVacia(): DB {
  return {
    v: 1,
    clientas: [],
    tratamientos: CATALOGO_INICIAL.map((t) => ({ ...t, id: uid() })),
    citas: [],
    gastos: [],
    portafolio: [],
    ajustes: { ...AJUSTES_INICIALES },
  }
}

function cargar(): DB {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (raw) {
      const db = JSON.parse(raw) as DB
      return { ...dbVacia(), ...db, ajustes: { ...AJUSTES_INICIALES, ...db.ajustes } }
    }
  } catch {
    /* sin almacenamiento: se trabaja en memoria */
  }
  return dbVacia()
}

export type Resultado = { ok: true; id: string } | { ok: false; error: string }

export interface NuevaCitaDatos {
  id?: string
  clienta: { id?: string; nombre: string; telefono: string }
  tipo: Cita['tipo']
  inicio: Date
  items: Tratamiento[]
  notas: string
}

function crearAcciones(get: () => DB, set: (db: DB) => void) {
  const actualizar = (fn: (db: DB) => DB) => set(fn(get()))

  return {
    guardarCita(d: NuevaCitaDatos): Resultado {
      const db = get()
      if (d.items.length === 0) return { ok: false, error: 'Elige al menos un tratamiento.' }
      if (!d.clienta.nombre.trim()) return { ok: false, error: 'Escribe el nombre de la clienta.' }
      const dur = d.items.reduce((s, i) => s + i.duracionMin, 0)
      const fin = new Date(d.inicio.getTime() + dur * 60000)
      const choque = buscarChoque(db, d.inicio, fin, d.id)
      if (choque) {
        const otra = db.clientas.find((c) => c.id === choque.clientaId)
        return { ok: false, error: `Ese horario choca con la cita de ${otra?.nombre ?? 'otra clienta'} a las ${hora(new Date(choque.inicio))}.` }
      }

      let clientas = db.clientas
      let clientaId = d.clienta.id
      const nombre = d.clienta.nombre.trim()
      const telefono = d.clienta.telefono.trim()
      if (clientaId) {
        clientas = clientas.map((c) => (c.id === clientaId ? { ...c, nombre, telefono: telefono || c.telefono } : c))
      } else {
        clientaId = uid()
        clientas = [...clientas, { id: clientaId, nombre, telefono, notas: '', creadoEn: new Date().toISOString() }]
      }

      const previa = d.id ? db.citas.find((c) => c.id === d.id) : undefined
      const cambioHora = !previa || previa.inicio !== d.inicio.toISOString()
      const cita: Cita = {
        id: d.id ?? uid(),
        clientaId,
        tipo: d.tipo,
        inicio: d.inicio.toISOString(),
        fin: fin.toISOString(),
        estado: previa?.estado === 'atendida' ? 'atendida' : 'agendada',
        items: d.items.map((t) => ({ tratamientoId: t.id, nombre: t.nombre, duracionMin: t.duracionMin, precio: t.precio })),
        total: d.items.reduce((s, i) => s + i.precio, 0),
        notas: d.notas.trim(),
        avisos: cambioHora ? {} : (previa?.avisos ?? {}),
        creadoEn: previa?.creadoEn ?? new Date().toISOString(),
      }
      set({
        ...db,
        clientas,
        citas: previa ? db.citas.map((c) => (c.id === cita.id ? cita : c)) : [...db.citas, cita],
      })
      return { ok: true, id: cita.id }
    },

    cambiarEstado(id: string, estado: EstadoCita): Resultado {
      const db = get()
      const cita = db.citas.find((c) => c.id === id)
      if (!cita) return { ok: false, error: 'La cita ya no existe.' }
      if ((estado === 'agendada' || estado === 'atendida') && cita.estado !== 'agendada' && cita.estado !== 'atendida') {
        const choque = buscarChoque(db, new Date(cita.inicio), new Date(cita.fin), id)
        if (choque) return { ok: false, error: 'No se puede reactivar: ese horario ya está ocupado.' }
      }
      set({ ...db, citas: db.citas.map((c) => (c.id === id ? { ...c, estado } : c)) })
      return { ok: true, id }
    },

    borrarCita(id: string) {
      actualizar((db) => ({ ...db, citas: db.citas.filter((c) => c.id !== id) }))
    },

    marcarAviso(id: string, min: MinutosAviso) {
      actualizar((db) => ({
        ...db,
        citas: db.citas.map((c) => (c.id === id ? { ...c, avisos: { ...c.avisos, [min]: new Date().toISOString() } } : c)),
      }))
    },

    guardarClienta(c: Clienta) {
      actualizar((db) => ({ ...db, clientas: db.clientas.map((x) => (x.id === c.id ? c : x)) }))
    },

    guardarTratamiento(t: Tratamiento) {
      actualizar((db) => {
        const existe = db.tratamientos.some((x) => x.id === t.id)
        return { ...db, tratamientos: existe ? db.tratamientos.map((x) => (x.id === t.id ? t : x)) : [...db.tratamientos, t] }
      })
    },

    borrarTratamiento(id: string) {
      actualizar((db) => ({ ...db, tratamientos: db.tratamientos.filter((t) => t.id !== id) }))
    },

    guardarGasto(g: Omit<Gasto, 'id' | 'creadoEn'>) {
      actualizar((db) => ({ ...db, gastos: [...db.gastos, { ...g, id: uid(), creadoEn: new Date().toISOString() }] }))
    },

    borrarGasto(id: string) {
      actualizar((db) => ({ ...db, gastos: db.gastos.filter((g) => g.id !== id) }))
    },

    async agregarObra(datos: Omit<Obra, 'id' | 'creadoEn'>, archivo: Blob) {
      const id = uid()
      await guardarArchivo(id, archivo)
      actualizar((db) => ({ ...db, portafolio: [{ ...datos, id, creadoEn: new Date().toISOString() }, ...db.portafolio] }))
    },

    async borrarObra(id: string) {
      await borrarArchivo(id).catch(() => {})
      actualizar((db) => ({ ...db, portafolio: db.portafolio.filter((o) => o.id !== id) }))
    },

    guardarAjustes(cambios: Partial<Ajustes>) {
      actualizar((db) => ({ ...db, ajustes: { ...db.ajustes, ...cambios } }))
    },

    cargarEjemplo() {
      const db = get()
      const ej = datosDeEjemplo(db.tratamientos)
      set({ ...db, clientas: [...db.clientas, ...ej.clientas], citas: [...db.citas, ...ej.citas], gastos: [...db.gastos, ...ej.gastos] })
    },

    importar(texto: string): Resultado {
      try {
        const datos = JSON.parse(texto) as DB
        if (datos.v !== 1 || !Array.isArray(datos.citas) || !Array.isArray(datos.tratamientos)) {
          return { ok: false, error: 'El archivo no es un respaldo de esta app.' }
        }
        set({ ...dbVacia(), ...datos, ajustes: { ...AJUSTES_INICIALES, ...datos.ajustes } })
        return { ok: true, id: '' }
      } catch {
        return { ok: false, error: 'No se pudo leer el archivo.' }
      }
    },

    borrarTodo() {
      set(dbVacia())
    },
  }
}

type Acciones = ReturnType<typeof crearAcciones>
const Ctx = createContext<{ db: DB; acc: Acciones } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(cargar)
  const ref = useRef(db)

  const set = useCallback((next: DB) => {
    ref.current = next
    setDb(next)
    try {
      localStorage.setItem(CLAVE, JSON.stringify(next))
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }, [])

  const acc = useMemo(() => crearAcciones(() => ref.current, set), [set])
  const valor = useMemo(() => ({ db, acc }), [db, acc])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore fuera de StoreProvider')
  return v
}

export function exportarRespaldo(db: DB) {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `brava-respaldo-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
