import { useRef, useState } from 'react'
import { ConfirmButton } from '../components/ConfirmButton'
import { Header, Icon, Segmented, Sheet, useUI } from '../components/ui'
import { fechaLarga, mayus } from '../lib/format'
import { leerArchivo, prepararFoto, useArchivo } from '../lib/media'
import { useStore } from '../lib/store'
import type { Obra, TipoTratamiento } from '../lib/types'

type Filtro = 'todo' | 'manicura' | 'pedicura' | 'video'

export function Portafolio() {
  const { db } = useStore()
  const [filtro, setFiltro] = useState<Filtro>('todo')
  const [subiendo, setSubiendo] = useState<File[] | null>(null)
  const [viendo, setViendo] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const cuenta = (f: Filtro) => db.portafolio.filter((o) => f === 'todo' || (f === 'video' ? o.medio === 'video' : o.tipo === f)).length
  const obras = db.portafolio.filter((o) => filtro === 'todo' || (filtro === 'video' ? o.medio === 'video' : o.tipo === filtro))
  const filtros: { id: Filtro; label: string }[] = [
    { id: 'todo', label: 'Todo' }, { id: 'manicura', label: 'Manicura' }, { id: 'pedicura', label: 'Pedicura' }, { id: 'video', label: 'Videos' },
  ]

  return (
    <main className="screen">
      <Header title="Portafolio" sub={`${db.portafolio.length} ${db.portafolio.length === 1 ? 'trabajo' : 'trabajos'}`}>
        <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
          <Icon name="plus" size={16} stroke={2.2} /> Subir
        </button>
      </Header>
      <input ref={input} className="hidden-input" type="file" accept="image/*,video/*" multiple tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) setSubiendo(f); e.target.value = '' }} />

      <div className="chips" role="group" aria-label="Filtrar">
        {filtros.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.label} {cuenta(f.id)}
          </button>
        ))}
      </div>

      {obras.length > 0 ? (
        <div className="gallery">
          {obras.map((o) => <Mosaico key={o.id} obra={o} onClick={() => setViendo(o.id)} />)}
        </div>
      ) : (
        <div className="card empty">
          <span>{db.portafolio.length ? 'No hay trabajos con este filtro.' : 'Sube fotos y videos de tus trabajos para mostrarlos a tus clientas.'}</span>
          {!db.portafolio.length && <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>Subir el primero</button>}
        </div>
      )}

      {subiendo && <Subir archivos={subiendo} onClose={() => setSubiendo(null)} />}
      {viendo && <Visor id={viendo} onClose={() => setViendo(null)} />}
    </main>
  )
}

function Mosaico({ obra, onClick }: { obra: Obra; onClick: () => void }) {
  const url = useArchivo(obra.id)
  return (
    <button type="button" className="tile" onClick={onClick} aria-label={`${obra.titulo || 'Trabajo'}, ${obra.medio}`}>
      {url && (obra.medio === 'video'
        ? <video src={url + '#t=0.1'} muted playsInline preload="metadata" />
        : <img src={url} alt="" loading="lazy" />)}
      {obra.medio === 'video' && <span className="badge">Video</span>}
    </button>
  )
}

function Subir({ archivos, onClose }: { archivos: File[]; onClose: () => void }) {
  const { acc } = useStore()
  const ui = useUI()
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TipoTratamiento>('manicura')
  const [guardando, setGuardando] = useState(false)
  const fotos = archivos.filter((f) => f.type.startsWith('image/')).length
  const videos = archivos.filter((f) => f.type.startsWith('video/')).length

  const guardar = async () => {
    setGuardando(true)
    try {
      for (const f of archivos) {
        const medio = f.type.startsWith('video/') ? 'video' : 'foto'
        const blob = medio === 'foto' ? await prepararFoto(f) : f
        await acc.agregarObra({ titulo: titulo.trim(), tipo, medio }, blob)
      }
      ui.avisar(archivos.length === 1 ? 'Trabajo agregado' : `${archivos.length} trabajos agregados`)
      onClose()
    } catch {
      ui.avisar('No se pudo guardar. Puede que el teléfono no tenga espacio.')
      setGuardando(false)
    }
  }

  return (
    <Sheet title="Agregar al portafolio" onClose={onClose}
      footer={<button type="button" className="btn btn-primary btn-block" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>}>
      <p className="sub">
        {[fotos ? `${fotos} ${fotos === 1 ? 'foto' : 'fotos'}` : '', videos ? `${videos} ${videos === 1 ? 'video' : 'videos'}` : ''].filter(Boolean).join(' y ')}
      </p>
      <div className="field">
        <label className="label" htmlFor="p-titulo">Nombre del trabajo</label>
        <input id="p-titulo" className="input" placeholder="Francesa clásica, nail art floral…" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>
      <Segmented label="Tipo" value={tipo} onChange={setTipo}
        options={[{ value: 'manicura', label: 'Manicura' }, { value: 'pedicura', label: 'Pedicura' }]} />
    </Sheet>
  )
}

function Visor({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, acc } = useStore()
  const ui = useUI()
  const obra = db.portafolio.find((o) => o.id === id)
  const url = useArchivo(obra ? id : null)
  if (!obra) return null

  const compartir = async () => {
    try {
      const blob = await leerArchivo(id)
      if (!blob) return
      const ext = obra.medio === 'video' ? (blob.type.split('/')[1] || 'mp4') : 'jpg'
      const file = new File([blob], `${obra.titulo || 'trabajo'}.${ext}`, { type: blob.type })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: obra.titulo || db.ajustes.nombreEstudio })
      } else {
        ui.avisar('Este navegador no permite compartir archivos.')
      }
    } catch {
      /* compartir cancelado */
    }
  }

  return (
    <Sheet title={obra.titulo || 'Trabajo'} onClose={onClose}>
      {url && (obra.medio === 'video'
        ? <video className="viewer-media" src={url} controls playsInline />
        : <img className="viewer-media" src={url} alt={obra.titulo || 'Trabajo del portafolio'} />)}
      <p className="sub">{obra.tipo === 'manicura' ? 'Manicura' : 'Pedicura'} · {mayus(fechaLarga(new Date(obra.creadoEn)))}</p>
      <div className="grid-2">
        <button type="button" className="btn" onClick={compartir}><Icon name="share" size={17} /> Compartir</button>
        <ConfirmButton onConfirm={async () => { await acc.borrarObra(id); onClose(); ui.avisar('Trabajo borrado') }}>
          <Icon name="trash" size={17} /> Borrar
        </ConfirmButton>
      </div>
    </Sheet>
  )
}
