import { Maximize2, Pin, PinOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Presentation } from '../types'

type Props = {
  presentation: Presentation
  focused: boolean
  onFocus: () => void
}

export default function ScreenTile({ presentation, focused, onFocus }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const tile = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = video.current
    if (!element) return
    presentation.track.attach(element)
    element.muted = true
    element.play().catch(() => {})
    return () => { presentation.track.detach(element) }
  }, [presentation.track])

  const fullscreen = () => tile.current?.requestFullscreen()

  return <div className={`screen-tile ${focused ? 'focused' : ''}`} ref={tile} onDoubleClick={fullscreen}>
    <video ref={video} autoPlay muted playsInline/>
    <div className="viewer-label"><span className="live-dot"/>{presentation.local ? 'Sua tela' : presentation.name}</div>
    <div className="screen-actions"><button title={focused ? 'Voltar para a grade' : 'Destacar tela'} onClick={onFocus}>{focused ? <PinOff/> : <Pin/>}</button><button title="Tela cheia" onClick={fullscreen}><Maximize2/></button></div>
    <span className="fullscreen-tip">Dois cliques para ampliar</span>
  </div>
}
