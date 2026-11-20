import { dinero, ETIQUETA_TIPO, fechaLarga, hora, mayus } from './format'
import type { Ajustes, Cita, Clienta, MinutosAviso } from './types'

/** Deja solo dígitos y agrega el código de país si el número es local. */
export function numeroInternacional(telefono: string, codigoPais: string) {
  const digitos = telefono.replace(/\D/g, '')
  if (!digitos) return ''
  if (telefono.trim().startsWith('+')) return digitos
  if (digitos.length <= 8) return codigoPais + digitos
  return digitos
}

// Nombre de pila sin la inicial del apellido ("María Fernanda L." → "María Fernanda")
function nombreSaludo(n: string) {
  const partes = n.trim().split(/\s+/).filter((p) => !/^[A-ZÁÉÍÓÚÑ]\.$/.test(p))
  return partes.slice(0, 2).join(' ') || n.trim()
}

// Reloj que marca la hora de la cita: 🕑 para las 2:00, 🕝 para las 2:30
const RELOJES = ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚']
const RELOJES_MEDIA = ['🕧', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦']
const reloj = (d: Date) => (d.getMinutes() >= 30 ? RELOJES_MEDIA : RELOJES)[d.getHours() % 12]

const ICONO_TIPO = { manicura: '💅', pedicura: '🦶', ambas: '💅🦶' } as const

/** En WhatsApp, *texto* sale en negrita; por SMS se manda sin asteriscos. */
function formato(lineas: (string | false)[], aj: Ajustes) {
  const texto = lineas.filter((l) => l !== false).join('\n')
  return aj.canal === 'whatsapp' ? texto : texto.replace(/\*/g, '')
}

function listaTratamientos(cita: Cita) {
  return cita.items.map((i) => `   • ${i.nombre}`)
}

export function textoConfirmacion(cita: Cita, clienta: Clienta, aj: Ajustes) {
  const ini = new Date(cita.inicio)
  const fin = new Date(cita.fin)
  return formato([
    `¡Hola, ${nombreSaludo(clienta.nombre)}! ✨`,
    '',
    '*Tu cita quedó agendada* 💖',
    '',
    `📅 ${mayus(fechaLarga(ini))}`,
    `${reloj(ini)} ${hora(ini)} a ${hora(fin)}`,
    `${ICONO_TIPO[cita.tipo]} ${ETIQUETA_TIPO[cita.tipo]}`,
    ...listaTratamientos(cita),
    `💰 Total: *${dinero(cita.total, aj.moneda)}*`,
    '',
    `📍 ${aj.nombreEstudio}`,
    '',
    'Si necesitas cambiar la hora, respóndenos por aquí 🙏',
    '¡Te esperamos! 🌸',
  ], aj)
}

export function textoRecordatorio(cita: Cita, clienta: Clienta, aj: Ajustes, min: MinutosAviso) {
  const ini = new Date(cita.inicio)
  return formato([
    `¡Hola, ${nombreSaludo(clienta.nombre)}! 🌸`,
    '',
    min === 60 ? '⏰ *Te recordamos tu cita de hoy*' : '⏳ *Tu cita es en 30 minutos*',
    '',
    `${reloj(ini)} ${hora(ini)}`,
    `${ICONO_TIPO[cita.tipo]} ${ETIQUETA_TIPO[cita.tipo]}: ${cita.items.map((i) => i.nombre).join(', ')}`,
    `📍 ${aj.nombreEstudio}`,
    '',
    min === 60 ? '¡Te esperamos! 💖' : 'Ya casi está todo listo para ti 💅',
  ], aj)
}

function abreAppsDirecto() {
  const enMarco = (() => { try { return window.self !== window.top } catch { return true } })()
  const movil = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  return movil && !enMarco
}

export function enlaceMensaje(telefono: string, texto: string, aj: Ajustes) {
  const num = numeroInternacional(telefono, aj.codigoPais)
  if (!num) return ''
  if (aj.canal === 'whatsapp') {
    // Instalada en el teléfono: whatsapp:// abre la app directo en el chat.
    // Dentro de una vista previa o en computadora: wa.me, que pasa por la web.
    return abreAppsDirecto()
      ? `whatsapp://send?phone=${num}&text=${encodeURIComponent(texto)}`
      : `https://wa.me/${num}?text=${encodeURIComponent(texto)}`
  }
  return `sms:+${num}?&body=${encodeURIComponent(texto)}`
}

// ---------- Calendario del teléfono ----------

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function tituloEvento(cita: Cita, clienta: Clienta) {
  return `${clienta.nombre} · ${ETIQUETA_TIPO[cita.tipo]}`
}

function detalleEvento(cita: Cita, clienta: Clienta, aj: Ajustes) {
  const lineas = cita.items.map((i) => `• ${i.nombre}`)
  lineas.push(`Total: ${dinero(cita.total, aj.moneda)}`)
  if (clienta.telefono) lineas.push(`Tel: ${clienta.telefono}`)
  if (cita.notas) lineas.push(cita.notas)
  return lineas.join('\n')
}

export function enlaceGoogle(cita: Cita, clienta: Clienta, aj: Ajustes) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: tituloEvento(cita, clienta),
    dates: `${utc(new Date(cita.inicio))}/${utc(new Date(cita.fin))}`,
    details: detalleEvento(cita, clienta, aj),
    location: aj.nombreEstudio,
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

const escapeIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m)

/** Archivo .ics con alarmas de 1 h y 30 min para el calendario del iPhone. */
export function archivoIcs(cita: Cita, clienta: Clienta, aj: Ajustes) {
  const alarmas: string[] = []
  if (aj.aviso60) alarmas.push('BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:Cita en 1 hora', 'END:VALARM')
  if (aj.aviso30) alarmas.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Cita en 30 minutos', 'END:VALARM')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Brava e Bella//Citas//ES',
    'BEGIN:VEVENT',
    `UID:${cita.id}@brava-e-bella`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(new Date(cita.inicio))}`,
    `DTEND:${utc(new Date(cita.fin))}`,
    `SUMMARY:${escapeIcs(tituloEvento(cita, clienta))}`,
    `DESCRIPTION:${escapeIcs(detalleEvento(cita, clienta, aj))}`,
    `LOCATION:${escapeIcs(aj.nombreEstudio)}`,
    ...alarmas,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

/** En iPhone, Safari abre el .ics con la hoja "Agregar al calendario". */
export function descargarIcs(cita: Cita, clienta: Clienta, aj: Ajustes) {
  const blob = new Blob([archivoIcs(cita, clienta, aj)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cita-${new Date(cita.inicio).toISOString().slice(0, 10)}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
