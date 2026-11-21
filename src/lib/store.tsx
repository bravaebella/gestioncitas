// Datos en Supabase (esquema `brava`), con copia en el teléfono para abrir
// al instante y seguir trabajando sin señal. Las pantallas solo usan estas
// acciones: cambian la pantalla al momento y el envío a la nube va en cola.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buscarChoque } from './agenda'
import { hora, uid } from './format'
import { cargarTodo, ejecutar, filaAjustes, filaClienta, filaGasto, filaObra, filaTratamiento, pasoAviso, pasosCita, rutaPara, subirArchivo, type Envio, type Paso } from './remoto'
import { mensajeError } from './supabase'
import type { Ajustes, Cita, Clienta, DB, EstadoCita, Gasto, MinutosAviso, Obra, Tratamiento } from './types'

const CACHE = 'brava-cache-v2'
const COLA = 'brava-cola-v1'
export const CLAVE_LOCAL_VIEJA = 'brava-db-v1'

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
  tema: 'auto',
}

// Catálogo de arranque: precios y tiempos de ejemplo, se cambian en Configuración.
export const CATALOGO_INICIAL: Omit<Tratamiento, 'id'>[] = [
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

const vacia = (): DB => ({ v: 1, clientas: [], tratamientos: [], citas: [], gastos: [], portafolio: [], ajustes: { ...AJUSTES_INICIALES } })

function leer<T>(clave: string): T | null {
  try {
    const raw = localStorage.getItem(clave)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function escribir(clave: string, v: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(v))
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

/** Avisos para la barra inferior (toast) de la app. */
export function avisarApp(texto: string) {
  window.dispatchEvent(new CustomEvent('brava-aviso', { detail: texto }))
}

const esRed = (e: unknown) => {
  const m = String((e as { message?: string })?.message ?? e)
  return e instanceof TypeError || /fetch|network|Load failed|conexi/i.test(m)
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

export type Carga = 'cargando' | 'listo' | 'sin_conexion'

function crearAcciones(get: () => DB, set: (db: DB) => void, enviar: (pasos: Paso[]) => void) {
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
      let clienta: Clienta | null = null
      const nombre = d.clienta.nombre.trim()
      const telefono = d.clienta.telefono.trim()
      const existente = d.clienta.id ? db.clientas.find((c) => c.id === d.clienta.id) : undefined
      if (existente) {
        const nueva = { ...existente, nombre, telefono: telefono || existente.telefono }
        if (nueva.nombre !== existente.nombre || nueva.telefono !== existente.telefono) clienta = nueva
        clientas = clientas.map((c) => (c.id === existente.id ? nueva : c))
      } else {
        clienta = { id: uid(), nombre, telefono, notas: '', creadoEn: new Date().toISOString() }
        clientas = [...clientas, clienta]
      }
      const clientaId = existente?.id ?? clienta!.id

      const previa = d.id ? db.citas.find((c) => c.id === d.id) : undefined
      const cambioHora = !previa || previa.inicio !== d.inicio.toISOString()
      const cita: Cita = {
        id: d.id ?? uid(),
        clientaId,
        tipo: d.tipo,
        inicio: d.inicio.toISOString(),
        fin: fin.toISOString(),
        estado: previa?.estado === 'atendida' ? 'atendida' : 'agendada',
        items: d.items.map((t) => ({ tratamientoId: t.id, tipo: t.tipo, nombre: t.nombre, duracionMin: t.duracionMin, precio: t.precio })),
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
      enviar(pasosCita(cita, clienta, cambioHora))
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
      enviar([{ t: 'update', tabla: 'citas', valores: { estado }, donde: { id } }])
      return { ok: true, id }
    },

    borrarCita(id: string) {
      actualizar((db) => ({ ...db, citas: db.citas.filter((c) => c.id !== id) }))
      enviar([{ t: 'delete', tabla: 'citas', donde: { id } }])
    },

    marcarAviso(id: string, min: MinutosAviso) {
      const cita = get().citas.find((c) => c.id === id)
      if (!cita) return
      const nueva = { ...cita, avisos: { ...cita.avisos, [min]: new Date().toISOString() } }
      actualizar((db) => ({ ...db, citas: db.citas.map((c) => (c.id === id ? nueva : c)) }))
      enviar([pasoAviso(nueva, min)])
    },

    guardarClienta(c: Clienta) {
      actualizar((db) => ({ ...db, clientas: db.clientas.map((x) => (x.id === c.id ? c : x)) }))
      enviar([{ t: 'upsert', tabla: 'clientas', filas: [filaClienta(c)] }])
    },

    guardarTratamiento(t: Tratamiento) {
      actualizar((db) => {
        const existe = db.tratamientos.some((x) => x.id === t.id)
        return { ...db, tratamientos: existe ? db.tratamientos.map((x) => (x.id === t.id ? t : x)) : [...db.tratamientos, t] }
      })
      enviar([{ t: 'upsert', tabla: 'tratamientos', filas: [filaTratamiento(t)] }])
    },

    /** Si alguna cita ya lo usa, se oculta en vez de borrarse (las citas guardan su copia). */
    borrarTratamiento(id: string) {
      const usado = get().citas.some((c) => c.items.some((i) => i.tratamientoId === id))
      if (usado) {
        actualizar((db) => ({ ...db, tratamientos: db.tratamientos.map((t) => (t.id === id ? { ...t, activo: false } : t)) }))
        enviar([{ t: 'update', tabla: 'tratamientos', valores: { activo: false }, donde: { id } }])
        avisarApp('Ya hay citas con este tratamiento: quedó oculto en vez de borrado.')
      } else {
        actualizar((db) => ({ ...db, tratamientos: db.tratamientos.filter((t) => t.id !== id) }))
        enviar([{ t: 'delete', tabla: 'tratamientos', donde: { id } }])
      }
    },

    guardarGasto(g: Omit<Gasto, 'id' | 'creadoEn'>) {
      const gasto: Gasto = { ...g, id: uid(), creadoEn: new Date().toISOString() }
      actualizar((db) => ({ ...db, gastos: [...db.gastos, gasto] }))
      enviar([{ t: 'upsert', tabla: 'gastos', filas: [filaGasto(gasto)] }])
    },

    borrarGasto(id: string) {
      actualizar((db) => ({ ...db, gastos: db.gastos.filter((g) => g.id !== id) }))
      enviar([{ t: 'delete', tabla: 'gastos', donde: { id } }])
    },

    /** Sube el archivo directo (necesita señal) y luego guarda la ficha. */
    async agregarObra(datos: Omit<Obra, 'id' | 'creadoEn' | 'ruta'>, archivo: Blob) {
      const id = uid()
      const obra: Obra = { ...datos, id, ruta: rutaPara(id, archivo, datos.medio), creadoEn: new Date().toISOString() }
      await subirArchivo(obra.ruta, archivo)
      await ejecutar({ t: 'upsert', tabla: 'portafolio', filas: [filaObra(obra)] })
      actualizar((db) => ({ ...db, portafolio: [obra, ...db.portafolio] }))
    },

    borrarObra(id: string) {
      const obra = get().portafolio.find((o) => o.id === id)
      if (!obra) return
      actualizar((db) => ({ ...db, portafolio: db.portafolio.filter((o) => o.id !== id) }))
      enviar([{ t: 'delete', tabla: 'portafolio', donde: { id } }, { t: 'storage-delete', rutas: [obra.ruta] }])
    },

    guardarAjustes(cambios: Partial<Ajustes>) {
      actualizar((db) => ({ ...db, ajustes: { ...db.ajustes, ...cambios } }))
      enviar([{ t: 'update', tabla: 'ajustes', valores: filaAjustes(cambios), donde: { id: true } }])
    },
  }
}

type Acciones = ReturnType<typeof crearAcciones>
interface Valor {
  db: DB
  acc: Acciones
  carga: Carga
  pendientes: number
  /** Datos guardados solo en este teléfono por la versión anterior, si los hay. */
  datosLocales: DB | null
  recargar: () => Promise<void>
  olvidarDatosLocales: () => void
}
const Ctx = createContext<Valor | null>(null)

function leerLocalViejo(): DB | null {
  const v = leer<DB>(CLAVE_LOCAL_VIEJA)
  if (!v || !Array.isArray(v.citas)) return null
  const hay = v.citas.length + v.clientas.length + v.gastos.length + (v.portafolio?.length ?? 0)
  return hay > 0 ? v : null
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() => leer<DB>(CACHE) ?? vacia())
  const [carga, setCarga] = useState<Carga>('cargando')
  const [datosLocales, setDatosLocales] = useState<DB | null>(leerLocalViejo)
  const ref = useRef(db)
  const cola = useRef<Envio[]>(leer<Envio[]>(COLA) ?? [])
  const [pendientes, setPendientes] = useState(cola.current.length)
  const enviando = useRef(false)
  const reintento = useRef<number | undefined>(undefined)
  const ultimaCarga = useRef(0)

  const set = useCallback((next: DB) => {
    ref.current = next
    setDb(next)
    escribir(CACHE, next)
  }, [])

  const guardarCola = () => {
    escribir(COLA, cola.current)
    setPendientes(cola.current.length)
  }

  const recargar = useCallback(async () => {
    if (cola.current.length) return // primero se envía lo pendiente
    try {
      const r = await cargarTodo()
      if (cola.current.length) return // hubo cambios mientras cargaba
      ultimaCarga.current = Date.now()
      const next: DB = { v: 1, ...r, ajustes: r.ajustes ?? { ...AJUSTES_INICIALES } }
      set(next)
      setCarga('listo')
      if (next.tratamientos.length === 0 && !leerLocalViejo()) {
        // Base nueva y nada que subir: se siembra el catálogo de ejemplo.
        const catalogo = CATALOGO_INICIAL.map((t) => ({ ...t, id: uid() }))
        set({ ...next, tratamientos: catalogo })
        cola.current.push({ id: uid(), pasos: [{ t: 'upsert', tabla: 'tratamientos', filas: catalogo.map(filaTratamiento) }] })
        guardarCola()
        void procesar()
      }
    } catch (e) {
      setCarga(esRed(e) ? 'sin_conexion' : 'listo')
      if (!esRed(e)) avisarApp('No se pudieron cargar los datos: ' + ((e as Error).message ?? ''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set])

  const procesar = useCallback(async () => {
    if (enviando.current) return
    enviando.current = true
    let recargarAlFinal = false
    try {
      while (cola.current.length) {
        const envio = cola.current[0]
        try {
          for (const p of envio.pasos) await ejecutar(p)
        } catch (e) {
          if (esRed(e)) {
            window.clearTimeout(reintento.current)
            reintento.current = window.setTimeout(() => void procesar(), 15000)
            return
          }
          avisarApp(mensajeError(e))
          recargarAlFinal = true
        }
        cola.current.shift()
        guardarCola()
      }
    } finally {
      enviando.current = false
    }
    if (recargarAlFinal) await recargar()
  }, [recargar])

  const enviar = useCallback((pasos: Paso[]) => {
    cola.current.push({ id: uid(), pasos })
    guardarCola()
    void procesar()
  }, [procesar])

  // Al abrir: enviar lo pendiente y traer lo último de la nube.
  useEffect(() => {
    void (async () => {
      await procesar()
      await recargar()
    })()
    const volver = () => {
      if (document.visibilityState !== 'visible') return
      void procesar().then(() => { if (Date.now() - ultimaCarga.current > 30000) void recargar() })
    }
    const enLinea = () => void procesar().then(() => recargar())
    document.addEventListener('visibilitychange', volver)
    window.addEventListener('online', enLinea)
    return () => {
      document.removeEventListener('visibilitychange', volver)
      window.removeEventListener('online', enLinea)
    }
  }, [procesar, recargar])

  const olvidarDatosLocales = useCallback(() => {
    try {
      const raw = localStorage.getItem(CLAVE_LOCAL_VIEJA)
      if (raw) localStorage.setItem(CLAVE_LOCAL_VIEJA + '-archivado', raw)
      localStorage.removeItem(CLAVE_LOCAL_VIEJA)
    } catch {
      /* nada */
    }
    setDatosLocales(null)
  }, [])

  const acc = useMemo(() => crearAcciones(() => ref.current, set, enviar), [set, enviar])
  const valor = useMemo(
    () => ({ db, acc, carga, pendientes, datosLocales, recargar, olvidarDatosLocales }),
    [db, acc, carga, pendientes, datosLocales, recargar, olvidarDatosLocales],
  )
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore fuera de StoreProvider')
  return v
}

/** Borra la copia local al cerrar sesión, para que otra cuenta no la vea. */
export function limpiarCopiaLocal() {
  try {
    localStorage.removeItem(CACHE)
    localStorage.removeItem(COLA)
  } catch {
    /* nada */
  }
}

/**
 * En la app instalada en iPhone las descargas no funcionan: se usa la hoja de
 * compartir del sistema ("Guardar en Archivos", WhatsApp, correo…).
 */
export async function exportarRespaldo(db: DB): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const nombre = `brava-respaldo-${new Date().toISOString().slice(0, 10)}.json`
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
  const archivo = new File([blob], nombre, { type: 'application/json' })
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Respaldo Brava e\' Bella' })
      return 'compartido'
    } catch {
      return 'cancelado'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'descargado'
}
