// Datos de ejemplo opcionales, relativos a hoy, para probar la app.
import { claveDia, sumarDias, uid } from './format'
import type { Cita, Clienta, Gasto, TipoCita, Tratamiento } from './types'

const NOMBRES = [
  ['Karla R.', '8888 1201'], ['Sofía M.', '8888 1202'], ['María Fernanda L.', '8888 1203'],
  ['Daniela P.', '8888 1204'], ['Lucía G.', '8888 1205'], ['Paola S.', '8888 1206'],
  ['Andrea V.', '8888 1207'], ['Gabriela T.', '8888 1208'], ['Valeria C.', '8888 1209'],
  ['Camila N.', '8888 1210'],
]

// [días desde hoy, hora, minuto, clienta, tipo, nombres de tratamientos]
const AGENDA: [number, number, number, number, TipoCita, string[]][] = [
  [0, 9, 0, 0, 'pedicura', ['Pedicura spa', 'Exfoliación y masaje']],
  [0, 11, 0, 1, 'ambas', ['Esmaltado en gel', 'Pedicura spa', 'Limpieza y cutícula']],
  [0, 14, 0, 2, 'manicura', ['Limpieza y cutícula', 'Esmaltado en gel', 'Diseño / nail art']],
  [0, 16, 30, 3, 'pedicura', ['Pedicura spa', 'Retiro de gel']],
  [1, 9, 0, 4, 'manicura', ['Uñas acrílicas']],
  [1, 11, 0, 5, 'pedicura', ['Pedicura spa']],
  [1, 14, 30, 6, 'ambas', ['Esmaltado en gel', 'Pedicura spa']],
  [2, 10, 0, 7, 'manicura', ['Esmaltado en gel', 'Diseño / nail art']],
  [3, 15, 0, 8, 'pedicura', ['Pedicura spa', 'Esmaltado en gel']],
  [-1, 10, 0, 9, 'manicura', ['Uñas acrílicas', 'Diseño / nail art']],
  [-1, 14, 0, 4, 'pedicura', ['Pedicura spa']],
  [-2, 9, 30, 5, 'ambas', ['Esmaltado en gel', 'Pedicura spa']],
  [-3, 11, 0, 6, 'manicura', ['Limpieza y cutícula', 'Esmaltado en gel']],
  [-4, 15, 0, 7, 'pedicura', ['Pedicura spa', 'Exfoliación y masaje']],
  [-6, 10, 0, 8, 'manicura', ['Uñas acrílicas']],
  [-8, 13, 0, 9, 'ambas', ['Esmaltado en gel', 'Pedicura spa', 'Diseño / nail art']],
]

const RELLENO: [TipoCita, string[]][] = [
  ['manicura', ['Limpieza y cutícula', 'Esmaltado en gel']],
  ['pedicura', ['Pedicura spa', 'Esmaltado en gel']],
  ['ambas', ['Esmaltado en gel', 'Pedicura spa']],
  ['manicura', ['Uñas acrílicas', 'Diseño / nail art']],
]

export function datosDeEjemplo(catalogo: Tratamiento[]) {
  const hoy = new Date()
  // Historial del mes: dos citas por día hábil antes de lo que ya trae AGENDA.
  const agenda = [...AGENDA]
  for (let dias = -9; hoy.getDate() + dias >= 1; dias--) {
    if (sumarDias(hoy, dias).getDay() === 0) continue
    const k = -dias
    agenda.push([dias, 10, 0, k % 10, ...RELLENO[k % 4]])
    agenda.push([dias, 15, 0, (k + 3) % 10, ...RELLENO[(k + 1) % 4]])
  }
  const ahora = Date.now()
  const clientas: Clienta[] = NOMBRES.map(([nombre, telefono]) => ({
    id: uid(), nombre, telefono, notas: '', creadoEn: new Date().toISOString(),
  }))

  const citas: Cita[] = []
  for (const [dias, h, m, ci, tipo, nombres] of agenda) {
    const tipos = tipo === 'ambas' ? ['manicura', 'pedicura'] : [tipo]
    const items = nombres
      .map((n) => catalogo.find((t) => t.nombre === n && tipos.includes(t.tipo)) ?? catalogo.find((t) => t.nombre === n))
      .filter((t): t is Tratamiento => !!t)
    if (!items.length) continue
    const inicio = sumarDias(hoy, dias)
    inicio.setHours(h, m, 0, 0)
    const dur = items.reduce((s, t) => s + t.duracionMin, 0)
    const fin = new Date(inicio.getTime() + dur * 60000)
    citas.push({
      id: uid(),
      clientaId: clientas[ci].id,
      tipo,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      estado: fin.getTime() < ahora ? 'atendida' : 'agendada',
      items: items.map((t) => ({ tratamientoId: t.id, nombre: t.nombre, duracionMin: t.duracionMin, precio: t.precio })),
      total: items.reduce((s, t) => s + t.precio, 0),
      notas: '',
      avisos: {},
      creadoEn: new Date().toISOString(),
    })
  }

  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const gastos: Gasto[] = [
    [1, 'gasto', 'Alquiler del local', 'Mensual', 4500],
    [2, 'costo', 'Materiales', 'Geles y top coat', 2800],
    [5, 'gasto', 'Luz, agua e internet', 'Mensual', 1650],
    [9, 'costo', 'Materiales', 'Acrílico y limas', 2600],
    [12, 'costo', 'Herramientas', 'Brocas para torno', 1200],
  ]
    .filter(([d]) => (d as number) <= hoy.getDate())
    .map(([d, clase, categoria, descripcion, monto]) => ({
      id: uid(),
      fecha: claveDia(sumarDias(primero, (d as number) - 1)),
      clase: clase as Gasto['clase'],
      categoria: categoria as string,
      descripcion: descripcion as string,
      monto: monto as number,
      creadoEn: new Date().toISOString(),
    }))

  return { clientas, citas, gastos }
}
