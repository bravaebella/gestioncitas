// Fotos y videos del portafolio: se ven desde el bucket privado `brava-portafolio`.
// IndexedDB queda solo para leer lo que guardó la versión anterior y subirlo.

import { useEffect, useState } from 'react'
import { urlFirmada } from './remoto'

const DB_NOMBRE = 'brava-media'
const ALMACEN = 'archivos'

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(ALMACEN)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    const t = db.transaction(ALMACEN, modo)
    const req = fn(t.objectStore(ALMACEN))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.oncomplete = () => db.close()
  })
}

export const guardarArchivo = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id))
export const leerArchivo = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id))
export const borrarArchivo = (id: string) => tx('readwrite', (s) => s.delete(id))

/** Reduce fotos grandes a 1600 px para no llenar el teléfono. */
export async function prepararFoto(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    if (escala === 1 && file.size < 1_500_000) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * escala)
    canvas.height = Math.round(bmp.height * escala)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85))
  } catch {
    return file
  }
}

/** Enlace para mostrar un archivo del portafolio (vale una hora). */
export function useArchivo(ruta: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!ruta) return
    let vivo = true
    urlFirmada(ruta).then((u) => { if (vivo) setUrl(u) }).catch(() => {})
    return () => { vivo = false }
  }, [ruta])
  return url
}
