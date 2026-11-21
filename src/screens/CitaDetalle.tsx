import { ConfirmButton } from '../components/ConfirmButton'
import { EnlaceMensaje, Icon, Sheet, useUI } from '../components/ui'
import { enlaceMensaje, textoConfirmacion, textoRecordatorio } from '../lib/enlaces'
import { dinero, duracion, ETIQUETA_ESTADO, ETIQUETA_TIPO, fechaLarga, hora, mayus } from '../lib/format'
import { useStore } from '../lib/store'
import type { EstadoCita, MinutosAviso } from '../lib/types'

export function CitaDetalle({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, acc } = useStore()
  const ui = useUI()
  const cita = db.citas.find((c) => c.id === id)
  const clienta = cita ? db.clientas.find((c) => c.id === cita.clientaId) : undefined
  if (!cita || !clienta) return null

  const aj = db.ajustes
  const ini = new Date(cita.inicio)
  const fin = new Date(cita.fin)
  const dur = (fin.getTime() - ini.getTime()) / 60000
  const canal = aj.canal === 'whatsapp' ? 'WhatsApp' : 'SMS'
  const activa = cita.estado === 'agendada'
  const avisos: MinutosAviso[] = [...(aj.aviso60 ? [60 as const] : []), ...(aj.aviso30 ? [30 as const] : [])]

  const url = (texto: string) => enlaceMensaje(clienta.telefono, texto, aj)
  const sinNumero = () => ui.avisar('Esta clienta no tiene número guardado.')

  const estado = (e: EstadoCita) => {
    const r = acc.cambiarEstado(cita.id, e)
    ui.avisar(r.ok ? `Cita marcada: ${ETIQUETA_ESTADO[e].toLowerCase()}` : r.error)
  }

  return (
    <Sheet title={clienta.nombre} onClose={onClose}>
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{hora(ini)} – {hora(fin)}</span>
          <span className="label">{ETIQUETA_ESTADO[cita.estado]}</span>
        </div>
        <span className="sub">{mayus(fechaLarga(ini))} · {duracion(dur)}</span>
        <span className="sub">{ETIQUETA_TIPO[cita.tipo]}{clienta.telefono ? ` · ${clienta.telefono}` : ''}</span>
        {cita.notas && <span style={{ fontSize: 14, marginTop: 4 }}>{cita.notas}</span>}
      </div>

      <div className="card list">
        {cita.items.map((i) => (
          <div key={i.tratamientoId} className="row" style={{ minHeight: 44 }}>
            <span className="row-main"><span className="row-title">{i.nombre}</span><span className="row-sub">{duracion(i.duracionMin)}</span></span>
            <span className="row-end">{dinero(i.precio, aj.moneda)}</span>
          </div>
        ))}
        <div className="row" style={{ minHeight: 44 }}>
          <span className="row-main"><span className="row-title" style={{ fontWeight: 600 }}>Total</span></span>
          <span className="row-end">{dinero(cita.total, aj.moneda)}</span>
        </div>
      </div>

      {activa && (
        <div>
          <EnlaceMensaje url={url(textoConfirmacion(cita, clienta, aj))} className="btn btn-block" ariaLabel={`Enviar confirmación por ${canal}`} sinNumero={sinNumero}>
            <Icon name="chat" size={17} /> Confirmar cita
          </EnlaceMensaje>
        </div>
      )}

      {activa && avisos.length > 0 && (
        <div className="card list">
          {avisos.map((m) => (
            <div key={m} className="row" style={{ minHeight: 50 }}>
              <span className="row-main">
                <span className="row-title">Aviso de {m === 60 ? '1 hora' : '30 minutos'}</span>
                <span className="row-sub">
                  {cita.avisos[m] ? `Enviado a las ${hora(new Date(cita.avisos[m]!))}` : `Toca enviarlo a las ${hora(new Date(ini.getTime() - m * 60000))}`}
                </span>
              </span>
              <EnlaceMensaje url={url(textoRecordatorio(cita, clienta, aj, m))} className="btn btn-ghost"
                onEnviado={() => acc.marcarAviso(cita.id, m)} sinNumero={sinNumero}>
                {cita.avisos[m] ? 'Reenviar' : 'Enviar'}
              </EnlaceMensaje>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2">
        {cita.estado !== 'atendida' && cita.estado !== 'cancelada' && (
          <button type="button" className="btn btn-dark" onClick={() => estado('atendida')}><Icon name="check" size={17} /> Atendida</button>
        )}
        {activa && (
          <button type="button" className="btn" onClick={() => { onClose(); ui.nuevaCita({ citaId: cita.id }) }}>
            <Icon name="edit" size={17} /> Cambiar cita
          </button>
        )}
        {activa && <button type="button" className="btn" onClick={() => estado('no_asistio')}>No llegó</button>}
        {activa && <button type="button" className="btn" onClick={() => estado('cancelada')}>Cancelar cita</button>}
        {!activa && <button type="button" className="btn" onClick={() => estado('agendada')}>Volver a agendada</button>}
        <ConfirmButton onConfirm={() => { acc.borrarCita(cita.id); onClose(); ui.avisar('Cita borrada') }}>
          <Icon name="trash" size={17} /> Borrar
        </ConfirmButton>
      </div>
    </Sheet>
  )
}
