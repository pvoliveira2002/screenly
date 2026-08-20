import { Volume2, VolumeX } from 'lucide-react'

type Props = {
  volume: number
  onChange: (value: number) => void
  onToggle: () => void
}

export default function MemberAudioControl({ volume, onChange, onToggle }: Props) {
  return <div className="member-volume" title={`Volume individual: ${volume}%`}>
    <button aria-label={volume ? 'Silenciar participante para mim' : 'Ouvir participante'} onClick={onToggle}>{volume ? <Volume2/> : <VolumeX/>}</button>
    <input aria-label="Volume individual" type="range" min="0" max="100" value={volume} onChange={event => onChange(Number(event.target.value))}/>
  </div>
}
