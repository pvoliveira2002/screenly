import { Headphones, LogOut, Mic, MicOff, Settings, ShieldCheck, Signal, VolumeX } from 'lucide-react'

type Props = {
  name: string
  quality: string
  members: number
  micEnabled: boolean
  deafened: boolean
  settingsOpen: boolean
  inputs: MediaDeviceInfo[]
  outputs: MediaDeviceInfo[]
  inputDevice: string
  outputDevice: string
  volume: number
  micLevel: number
  micTesting: boolean
  pushToTalk: boolean
  onLeave: () => void
  onToggleMic: () => void
  onToggleDeafen: () => void
  onToggleSettings: () => void
  onCloseSettings: () => void
  onDevice: (kind: 'audioinput' | 'audiooutput', id: string) => void
  onVolume: (volume: number) => void
  onMicTest: () => void
  onPushToTalk: () => void
}

export default function VoicePanel(props: Props) {
  return <div className="voice-area">
    <div className="voice-connection"><div><span className="voice-signal"><Signal/> Voz conectada</span><small>{props.quality} · {props.members} na chamada</small></div><button title="Sair da chamada" onClick={props.onLeave}><LogOut/></button></div>
    <div className="voice-user"><div className="voice-avatar">{props.name.trim().charAt(0).toUpperCase()}</div><div className="voice-identity"><strong>{props.name}</strong><small>{props.pushToTalk ? 'Pressione espaço para falar' : props.micEnabled ? 'Microfone ativo' : props.deafened ? 'Áudio desativado' : 'Microfone fechado'}</small></div><button className={props.micEnabled ? 'voice-control active' : 'voice-control muted'} aria-pressed={props.micEnabled} title={props.micEnabled ? 'Desativar microfone (M)' : 'Ativar microfone (M)'} onClick={props.onToggleMic}>{props.micEnabled ? <Mic/> : <MicOff/>}</button><button className={props.deafened ? 'voice-control muted' : 'voice-control'} aria-pressed={props.deafened} title={props.deafened ? 'Ativar áudio (D)' : 'Desativar áudio (D)'} onClick={props.onToggleDeafen}>{props.deafened ? <VolumeX/> : <Headphones/>}</button><button className={props.settingsOpen ? 'voice-control active' : 'voice-control'} title="Configurações de voz" onClick={props.onToggleSettings}><Settings/></button></div>
    {props.settingsOpen && <div className="audio-settings" role="dialog" aria-label="Configurações de voz"><header><div><strong>Configurações de voz</strong><small>Entrada, saída e volume</small></div><button aria-label="Fechar" onClick={props.onCloseSettings}>×</button></header>
      <label>Dispositivo de entrada<select value={props.inputDevice} onChange={event => props.onDevice('audioinput', event.target.value)}><option value="default">Padrão do sistema</option>{props.inputs.filter(device => device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}</select></label>
      <label>Dispositivo de saída<select value={props.outputDevice} disabled={props.outputs.length === 0} onChange={event => props.onDevice('audiooutput', event.target.value)}><option value="default">Padrão do sistema</option>{props.outputs.filter(device => device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Saída ${index + 1}`}</option>)}</select></label>
      <label className="settings-volume"><span>Volume de saída <b>{props.volume}%</b></span><input type="range" min="0" max="100" value={props.volume} onChange={event => props.onVolume(Number(event.target.value))}/></label>
      <div className="mic-test"><div><span>Teste de microfone</span><div className="mic-meter"><i style={{ width: `${props.micLevel}%` }}/></div></div><button className={props.micTesting ? 'testing' : ''} onClick={props.onMicTest}>{props.micTesting ? 'Parar' : 'Testar'}</button></div>
      <label className="setting-switch"><span><strong>Push-to-talk</strong><small>Segure espaço para falar</small></span><input type="checkbox" checked={props.pushToTalk} onChange={props.onPushToTalk}/></label>
      <div className="shortcut-list"><span><kbd>M</kbd> Microfone</span><span><kbd>D</kbd> Áudio</span><span><kbd>S</kbd> Tela</span><span><kbd>C</kbd> Chat</span><span><kbd>F</kbd> Tela cheia</span></div>
      <div className="voice-hint"><ShieldCheck/> As preferências ficam salvas neste navegador.</div>
    </div>}
  </div>
}
