// Calendario de citas para suscribir en el teléfono (webcal).
// Se autentica con el enlace privado (?t=…) guardado en brava.ajustes.calendario_token,
// por eso se publica sin JWT: el calendario del iPhone no puede enviar uno.

import { createClient } from 'npm:@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  db: { schema: 'brava' },
  auth: { persistSession: false },
})

interface CitaCal {
  id: string
  tipo: 'manicura' | 'pedicura' | 'ambas'
  inicio: string
  fin: string
  estado: string
  total: number
  notas: string
  clienta: string
  telefono: string
  items: string[]
}

const TIPO = { manicura: '💅 Manicura', pedicura: '🦶 Pedicura', ambas: '💅🦶 Mani y pedi' }

const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m)

/** Las líneas de un .ics no deben pasar de 75 bytes: se parten con un espacio al inicio. */
function doblar(linea: string): string {
  const bytes = new TextEncoder()
  const partes: string[] = []
  let actual = ''
  for (const ch of linea) {
    if (bytes.encode(actual + ch).length > (partes.length ? 74 : 75)) {
      partes.push(actual)
      actual = ch
    } else actual += ch
  }
  partes.push(actual)
  return partes.join('\r\n ')
}

const dinero = (n: number, moneda: string) => `${moneda} ${Number(n).toLocaleString('es-NI', { maximumFractionDigits: 2 })}`

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') ?? ''
  const { data, error } = await sb.rpc('calendario_citas', { p_token: token })
  if (error) return new Response('Error', { status: 500 })
  if (!data) return new Response('Enlace no válido', { status: 404 })

  const ahora = utc(new Date().toISOString())
  const lineas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Brava e Bella//Citas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(data.nombre)}`,
    'X-WR-TIMEZONE:America/Managua',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ]
  for (const c of data.citas as CitaCal[]) {
    const detalle = [
      ...c.items.map((i) => `• ${i}`),
      `Total: ${dinero(c.total, data.moneda)}`,
      ...(c.telefono ? [`Tel: ${c.telefono}`] : []),
      ...(c.notas ? [c.notas] : []),
    ].join('\n')
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${c.id}@brava-e-bella`,
      `DTSTAMP:${ahora}`,
      `DTSTART:${utc(c.inicio)}`,
      `DTEND:${utc(c.fin)}`,
      `SUMMARY:${esc(`${c.clienta} · ${TIPO[c.tipo]}${c.estado === 'atendida' ? ' ✓' : ''}`)}`,
      `DESCRIPTION:${esc(detalle)}`,
      `LOCATION:${esc(data.nombre)}`,
      'STATUS:CONFIRMED',
    )
    if (c.estado === 'agendada') {
      if (data.aviso60) lineas.push('BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Cita con ${c.clienta} en 1 hora`)}`, 'END:VALARM')
      if (data.aviso30) lineas.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Cita con ${c.clienta} en 30 minutos`)}`, 'END:VALARM')
    }
    lineas.push('END:VEVENT')
  }
  lineas.push('END:VCALENDAR')

  return new Response(lineas.map(doblar).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="brava-citas.ics"',
      'Cache-Control': 'no-store',
    },
  })
})
