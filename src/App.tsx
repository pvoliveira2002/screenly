import { FormEvent, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Check, Copy, Expand, Headphones, Link2, Lock, LogOut, Mic, MicOff, MonitorOff, MonitorUp, PanelRightClose, PanelRightOpen, Radio, Settings, ShieldCheck, Signal, Unlock, Users, Volume2, VolumeX } from 'lucide-react'
import type { Room, Track } from 'livekit-client'
import { loadRecent, qualitySettings, savedName } from './constants'
import type { ChatMessage, Credentials, Member, Presentation, QualityPreset } from './types'
import InstallAppButton from './components/InstallAppButton'

const ScreenTile = lazy(() => import('./components/ScreenTile'))
const RoomSidebar = lazy(() => import('./components/RoomSidebar'))
const VoicePanel = lazy(() => import('./components/VoicePanel'))

export default function App() {
  const initialRoom = new URLSearchParams(location.search).get('sala')?.toUpperCase() || ''
  const [inviteRoom, setInviteRoom] = useState(initialRoom)
  const [roomCode, setRoomCode] = useState(initialRoom)
  const [name, setName] = useState(savedName)
  const [joinedRoom, setJoinedRoom] = useState('')
  const [status, setStatus] = useState('Pronto para conectar')
  const [members, setMembers] = useState<Member[]>([])
  const [sharing, setSharing] = useState(false)
  const [presentations, setPresentations] = useState<Presentation[]>([])
  const [micEnabled, setMicEnabled] = useState(false)
  const [speakers, setSpeakers] = useState<string[]>([])
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [copied, setCopied] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelTab, setPanelTab] = useState<'people' | 'chat'>('people')
  const [volume, setVolume] = useState(100)
  const [connectionQuality, setConnectionQuality] = useState('unknown')
  const [reconnecting, setReconnecting] = useState(false)
  const [locked, setLocked] = useState(false)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [chatText, setChatText] = useState('')
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('balanced')
  const [recentRooms, setRecentRooms] = useState(loadRecent)
  const [role, setRole] = useState<'owner' | 'member'>('member')
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])
  const [inputDevice, setInputDevice] = useState(localStorage.getItem('screenly-input-device') || 'default')
  const [outputDevice, setOutputDevice] = useState(localStorage.getItem('screenly-output-device') || 'default')
  const [connecting, setConnecting] = useState(false)
  const [sharingBusy, setSharingBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [focusedScreen, setFocusedScreen] = useState('')
  const [memberVolumes, setMemberVolumes] = useState<Record<string, number>>({})
  const [micLevel, setMicLevel] = useState(0)
  const [micTesting, setMicTesting] = useState(false)
  const [pushToTalk, setPushToTalk] = useState(localStorage.getItem('screenly-push-to-talk') === 'true')

  const room = useRef<Room | null>(null)
  const livekit = useRef<typeof import('livekit-client') | null>(null)
  const controlToken = useRef('')
  const sharingRef = useRef(false)
  const audioTracks = useRef(new Map<string, Track>())
  const audioElements = useRef(new Map<string, HTMLMediaElement>())
  const audioOwners = useRef(new Map<string, string>())
  const audioRoot = useRef<HTMLDivElement>(null)
  const previousVolume = useRef(100)
  const volumeRef = useRef(100)
  const memberVolumesRef = useRef<Record<string, number>>({})
  const previousMemberVolumes = useRef<Record<string, number>>({})
  const micTestStream = useRef<MediaStream | null>(null)
  const micTestContext = useRef<AudioContext | null>(null)
  const micTestFrame = useRef(0)
  const stage = useRef<HTMLElement>(null)

  useEffect(() => () => { room.current?.disconnect() }, [])
  useEffect(() => {
    volumeRef.current = volume
    audioElements.current.forEach((element, trackId) => {
      const owner = audioOwners.current.get(trackId) || ''
      element.volume = (volume / 100) * ((memberVolumesRef.current[owner] ?? 100) / 100)
    })
  }, [volume])
  useEffect(() => {
    memberVolumesRef.current = memberVolumes
    audioElements.current.forEach((element, trackId) => {
      const owner = audioOwners.current.get(trackId) || ''
      element.volume = (volumeRef.current / 100) * ((memberVolumes[owner] ?? 100) / 100)
    })
  }, [memberVolumes])
  useEffect(() => {
    if (!joinedRoom) return
    const refresh = () => loadAudioDevices()
    navigator.mediaDevices?.addEventListener('devicechange', refresh)
    loadAudioDevices()
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh)
  }, [joinedRoom])
  useEffect(() => {
    if (!joinedRoom || !micEnabled || micTesting) { if (!micTesting) setMicLevel(0); return }
    const timer = window.setInterval(() => setMicLevel(Math.min(100, Math.round((room.current?.localParticipant.audioLevel || 0) * 180))), 120)
    return () => window.clearInterval(timer)
  }, [joinedRoom, micEnabled, micTesting])
  useEffect(() => () => stopMicTest(), [])
  useEffect(() => {
    if (!joinedRoom) return
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,button,[contenteditable="true"]'))
    const keyDown = (event: KeyboardEvent) => {
      if (editable(event.target)) return
      const key = event.key.toLowerCase()
      if (pushToTalk && event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat && room.current) room.current.localParticipant.setMicrophoneEnabled(true).then(() => setMicEnabled(true)).catch(() => {})
      } else if (!event.repeat && key === 'm') toggleMic()
      else if (!event.repeat && key === 'd') toggleDeafen()
      else if (!event.repeat && key === 's') sharing ? stopSharing() : startSharing()
      else if (!event.repeat && key === 'c') { setPanelOpen(true); setPanelTab('chat') }
      else if (!event.repeat && key === 'f') toggleFullscreen()
    }
    const releasePushToTalk = () => {
      if (pushToTalk && room.current) room.current.localParticipant.setMicrophoneEnabled(false).then(() => setMicEnabled(false)).catch(() => {})
    }
    const keyUp = (event: KeyboardEvent) => {
      if (pushToTalk && event.code === 'Space' && room.current) {
        event.preventDefault(); releasePushToTalk()
      }
    }
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', releasePushToTalk)
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', releasePushToTalk) }
  }, [joinedRoom, pushToTalk, sharing, micEnabled, deafened])
  useEffect(() => {
    if (!joinedRoom || !audioRoot.current) return
    audioTracks.current.forEach((track, id) => attachAudio(track, id, audioOwners.current.get(id) || ''))
  }, [joinedRoom])

  function showVideo(id: string, name: string, track: Track, local = false) {
    setPresentations(current => [...current.filter(item => item.id !== id), { id, name, track, local }])
  }

  function attachAudio(track: Track, id: string, owner = '') {
    if (audioElements.current.has(id)) return
    audioTracks.current.set(id, track); audioOwners.current.set(id, owner)
    if (!audioRoot.current) return
    const element = track.attach()
    element.autoplay = true; element.volume = (volumeRef.current / 100) * ((memberVolumesRef.current[owner] ?? 100) / 100)
    audioRoot.current.appendChild(element); audioElements.current.set(id, element)
    element.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true))
  }

  function removeAudio(id: string) {
    const track = audioTracks.current.get(id), element = audioElements.current.get(id)
    if (track && element) track.detach(element)
    element?.remove(); audioTracks.current.delete(id); audioElements.current.delete(id); audioOwners.current.delete(id)
  }

  function enableAudio() {
    Promise.all([...audioElements.current.values()].map(element => element.play())).then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true))
  }

  function clearPresentation(identity: string) {
    setPresentations(current => current.filter(item => item.id !== identity))
    setFocusedScreen(current => current === identity ? '' : current)
    if (identity === room.current?.localParticipant.identity) {
      setSharing(false); sharingRef.current = false
    }
  }

  async function api(path: string, body: object) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    let response: Response
    try {
      response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error('O servidor demorou para responder. Tente novamente.')
      throw new Error('Não foi possível comunicar com o servidor')
    } finally {
      window.clearTimeout(timeout)
    }
    const data = await response.json().catch(() => ({ error: 'Resposta inválida do servidor' }))
    if (!response.ok) throw new Error(data.error || 'A operação falhou')
    return data
  }

  async function createRoom() {
    if (connecting) return
    const cleanName = name.trim().slice(0, 32)
    if (!cleanName) return setStatus('Informe seu nome')
    setConnecting(true)
    setStatus('Criando sua sala…')
    try {
      const credentials: Credentials = await api('/api/room', { name: cleanName })
      await enterRoom(credentials.room!, cleanName, credentials)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível criar a sala') }
    finally { setConnecting(false) }
  }

  async function connect(targetRoom: string) {
    if (connecting) return
    const cleanRoom = targetRoom.trim().replace(/[^a-z0-9_-]/gi, '').slice(0, 32).toUpperCase()
    const cleanName = name.trim().slice(0, 32)
    if (!cleanRoom) return setStatus('Informe o código da sala')
    if (!cleanName) return setStatus('Informe seu nome')
    setConnecting(true)
    setStatus('Validando convite…')
    try { await enterRoom(cleanRoom, cleanName, await api('/api/token', { room: cleanRoom, name: cleanName })) }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível entrar') }
    finally { setConnecting(false) }
  }

  async function enterRoom(code: string, cleanName: string, credentials: Credentials) {
    const livekitModule = livekit.current || await import('livekit-client')
    livekit.current = livekitModule
    const { Room, RoomEvent, Track } = livekitModule
    const nextRoom = new Room({ adaptiveStream: true, dynacast: true })
    room.current = nextRoom; controlToken.current = credentials.control_token || ''
    setRole(credentials.role)
    const parseRole = (metadata?: string): 'owner' | 'member' => { try { return JSON.parse(metadata || '{}').role === 'owner' ? 'owner' : 'member' } catch { return 'member' } }
    const updateMembers = () => setMembers([
      { id: nextRoom.localParticipant.identity, name: nextRoom.localParticipant.name || cleanName, local: true, role: credentials.role },
      ...Array.from(nextRoom.remoteParticipants.values()).map(p => ({ id: p.identity, name: p.name || p.identity, local: false, role: parseRole(p.metadata) })),
    ])
    nextRoom.on(RoomEvent.ParticipantConnected, updateMembers)
    nextRoom.on(RoomEvent.ParticipantDisconnected, participant => { updateMembers(); clearPresentation(participant.identity) })
    nextRoom.on(RoomEvent.ParticipantMetadataChanged, updateMembers)
    nextRoom.on(RoomEvent.ActiveSpeakersChanged, active => setSpeakers(active.map(p => p.identity)))
    nextRoom.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => { if (participant.identity === nextRoom.localParticipant.identity) setConnectionQuality(quality) })
    nextRoom.on(RoomEvent.Reconnecting, () => { setReconnecting(true); setStatus('Reconectando à sala…') })
    nextRoom.on(RoomEvent.Reconnected, () => { setReconnecting(false); setStatus('Conexão restaurada') })
    nextRoom.on(RoomEvent.RoomMetadataChanged, metadata => {
      try { const state = JSON.parse(metadata || '{}'); setLocked(Boolean(state.locked)) } catch { /* metadado inválido */ }
    })
    nextRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (publication.source === Track.Source.Microphone || publication.source === Track.Source.ScreenShareAudio) return attachAudio(track, publication.trackSid, participant.identity)
      if (publication.source !== Track.Source.ScreenShare) return
      showVideo(participant.identity, participant.name || participant.identity, track)
      setStatus(`${participant.name || participant.identity} começou a compartilhar`)
    })
    nextRoom.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      if (publication.source === Track.Source.Microphone || publication.source === Track.Source.ScreenShareAudio) return removeAudio(publication.trackSid)
      if (publication.source === Track.Source.ScreenShare) clearPresentation(participant.identity)
    })
    nextRoom.on(RoomEvent.LocalTrackUnpublished, publication => {
      if (publication.source !== Track.Source.ScreenShare || !sharingRef.current) return
      clearPresentation(nextRoom.localParticipant.identity)
    })
    nextRoom.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (topic !== 'chat' || !participant) return
      try { const message = JSON.parse(new TextDecoder().decode(payload)); setChat(current => [...current.slice(-99), { ...message, sender: participant.name || participant.identity, senderId: participant.identity }]) } catch { /* ignora pacote inválido */ }
    })
    nextRoom.on(RoomEvent.Disconnected, () => {
      if (room.current === nextRoom) resetRoom('A sala foi encerrada')
    })
    await nextRoom.connect(credentials.server_url, credentials.participant_token)
    if (inputDevice !== 'default') await nextRoom.switchActiveDevice('audioinput', inputDevice).catch(() => false)
    if (outputDevice !== 'default') await nextRoom.switchActiveDevice('audiooutput', outputDevice).catch(() => false)
    try { const metadata = JSON.parse(nextRoom.metadata || '{}'); setLocked(Boolean(metadata.locked)) } catch { /* sala nova */ }
    localStorage.setItem('screenly-name', cleanName)
    const recent = [code, ...loadRecent().filter(item => item !== code)].slice(0, 5)
    localStorage.setItem('screenly-recent', JSON.stringify(recent)); setRecentRooms(recent)
    setJoinedRoom(code); updateMembers(); setStatus('Conectado. A sala está pronta.')
    history.replaceState(null, '', `?sala=${code}`)
  }

  async function startSharing() {
    if (!room.current || !livekit.current || sharingRef.current || sharingBusy) return
    setSharingBusy(true)
    try {
      const { Track, VideoPreset } = livekit.current
      const preset = qualitySettings[qualityPreset]
      await room.current.localParticipant.setScreenShareEnabled(
        true,
        { audio: true, resolution: preset.resolution, contentHint: preset.contentHint, systemAudio: 'include', surfaceSwitching: 'include' },
        {
          videoCodec: 'vp8',
          simulcast: true,
          degradationPreference: 'maintain-framerate',
          screenShareEncoding: { maxBitrate: preset.maxBitrate, maxFramerate: preset.resolution.frameRate },
          screenShareSimulcastLayers: [new VideoPreset(640, 360, 400_000, 15)],
        },
      )
      const publication = room.current.localParticipant.getTrackPublication(Track.Source.ScreenShare)
      if (publication?.track) showVideo(room.current.localParticipant.identity, name || 'Você', publication.track, true)
      sharingRef.current = true; setSharing(true)
      const hasAudio = Boolean(room.current.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio))
      setStatus(hasAudio ? 'Você está compartilhando tela e áudio' : 'Tela compartilhada sem áudio da aba')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Compartilhamento cancelado') }
    finally { setSharingBusy(false) }
  }

  async function stopSharing() {
    if (sharingBusy) return
    setSharingBusy(true)
    sharingRef.current = false
    try {
      await room.current?.localParticipant.setScreenShareEnabled(false)
      if (room.current) clearPresentation(room.current.localParticipant.identity)
    } finally { setSharingBusy(false) }
  }

  async function toggleMic() {
    if (!room.current) return
    try {
      if (!micEnabled && deafened) { setDeafened(false); setVolume(previousVolume.current || 100) }
      await room.current.localParticipant.setMicrophoneEnabled(!micEnabled); setMicEnabled(value => !value)
      await loadAudioDevices()
    }
    catch { setStatus('Não foi possível acessar o microfone') }
  }

  function stopMicTest() {
    if (micTestFrame.current) cancelAnimationFrame(micTestFrame.current)
    micTestStream.current?.getTracks().forEach(track => track.stop())
    micTestContext.current?.close().catch(() => {})
    micTestFrame.current = 0; micTestStream.current = null; micTestContext.current = null
    setMicTesting(false); setMicLevel(0)
  }

  async function toggleMicTest() {
    if (micTesting) return stopMicTest()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: inputDevice === 'default' ? true : { deviceId: { exact: inputDevice } } })
      const context = new AudioContext()
      const analyser = context.createAnalyser(); analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.frequencyBinCount)
      micTestStream.current = stream; micTestContext.current = context; setMicTesting(true)
      const measure = () => {
        analyser.getByteFrequencyData(samples)
        const average = samples.reduce((sum, value) => sum + value, 0) / samples.length
        setMicLevel(Math.min(100, Math.round(average * 1.4)))
        micTestFrame.current = requestAnimationFrame(measure)
      }
      measure(); await loadAudioDevices()
    } catch { setStatus('Não foi possível testar o microfone') }
  }

  async function togglePushToTalk() {
    const next = !pushToTalk
    setPushToTalk(next); localStorage.setItem('screenly-push-to-talk', String(next))
    if (next && micEnabled && room.current) {
      await room.current.localParticipant.setMicrophoneEnabled(false).catch(() => {})
      setMicEnabled(false)
    }
  }

  function toggleAudioSettings() {
    if (audioSettingsOpen) { setAudioSettingsOpen(false); stopMicTest() }
    else { setAudioSettingsOpen(true); loadAudioDevices() }
  }

  async function loadAudioDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setAudioInputs(devices.filter(device => device.kind === 'audioinput'))
      setAudioOutputs(devices.filter(device => device.kind === 'audiooutput'))
    } catch { /* navegador sem enumeração de dispositivos */ }
  }

  async function changeAudioDevice(kind: 'audioinput' | 'audiooutput', deviceId: string) {
    if (!room.current) return
    try {
      const changed = await room.current.switchActiveDevice(kind, deviceId)
      if (!changed) throw new Error()
      if (kind === 'audioinput') { setInputDevice(deviceId); localStorage.setItem('screenly-input-device', deviceId) }
      else { setOutputDevice(deviceId); localStorage.setItem('screenly-output-device', deviceId) }
      setStatus(kind === 'audioinput' ? 'Microfone alterado' : 'Saída de áudio alterada')
    } catch { setStatus('Este navegador não conseguiu trocar o dispositivo') }
  }

  async function toggleDeafen() {
    if (!deafened) {
      previousVolume.current = volume || 100
      setVolume(0); setDeafened(true)
      if (micEnabled && room.current) {
        await room.current.localParticipant.setMicrophoneEnabled(false).catch(() => {})
        setMicEnabled(false)
      }
    } else {
      setVolume(previousVolume.current || 100); setDeafened(false)
    }
  }

  function changeVolume(nextVolume: number) {
    setVolume(nextVolume)
    if (nextVolume > 0) { previousVolume.current = nextVolume; setDeafened(false) }
    else setDeafened(true)
  }

  function changeMemberVolume(identity: string, nextVolume: number) {
    if (nextVolume > 0) previousMemberVolumes.current[identity] = nextVolume
    setMemberVolumes(current => ({ ...current, [identity]: nextVolume }))
  }

  function toggleMemberAudio(identity: string) {
    const currentVolume = memberVolumesRef.current[identity] ?? 100
    if (currentVolume > 0) {
      previousMemberVolumes.current[identity] = currentVolume
      changeMemberVolume(identity, 0)
    } else changeMemberVolume(identity, previousMemberVolumes.current[identity] || 100)
  }

  async function sendChat(event: FormEvent) {
    event.preventDefault(); const text = chatText.trim().slice(0, 1000)
    if (!text || !room.current || sending) return
    setSending(true)
    const message: ChatMessage = { id: crypto.randomUUID(), sender: name, senderId: room.current.localParticipant.identity, text, time: Date.now(), local: true }
    try {
      await room.current.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true, topic: 'chat' })
      setChat(current => [...current.slice(-99), message]); setChatText('')
    } catch { setStatus('Não foi possível enviar a mensagem') }
    finally { setSending(false) }
  }

  async function moderate(action: 'kick' | 'stop-presenter', identity: string) {
    try { await api('/api/moderate', { action, identity, control_token: controlToken.current }) }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Falha na moderação') }
  }
  async function toggleLock() {
    try { await api('/api/moderate', { action: 'lock', locked: !locked, control_token: controlToken.current }); setLocked(value => !value) }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Falha ao bloquear a sala') }
  }

  function resetRoom(message: string) {
    stopMicTest()
    room.current = null
    audioElements.current.forEach(element => element.remove()); audioElements.current.clear(); audioTracks.current.clear(); audioOwners.current.clear()
    sharingRef.current = false; controlToken.current = ''
    setInviteRoom(''); setJoinedRoom(''); setMembers([]); setSharing(false); setPresentations([]); setFocusedScreen(''); setMemberVolumes({}); setMicEnabled(false); setChat([]); setRole('member'); setReconnecting(false); setAudioSettingsOpen(false); setDeafened(false); setStatus(message)
    history.replaceState(null, '', location.pathname)
  }

  async function leaveRoom() {
    const activeRoom = room.current
    if (role === 'owner' && controlToken.current) {
      try { await api('/api/moderate', { action: 'close', control_token: controlToken.current }) }
      catch { /* o LiveKit encerrará a sala vazia automaticamente */ }
    }
    activeRoom?.disconnect()
    resetRoom(role === 'owner' ? 'Sala encerrada' : 'Você saiu da sala')
  }

  async function copyLink() { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?sala=${joinedRoom}`); setCopied(true); setTimeout(() => setCopied(false), 1600) }
  async function toggleFullscreen() { if (!stage.current) return; document.fullscreenElement ? await document.exitFullscreen() : await stage.current.requestFullscreen() }

  if (!joinedRoom && inviteRoom) return <main className="invite-page"><nav className="topbar"><Logo/><span><ShieldCheck/> Convite privado e verificado</span></nav><section className="invite-card"><div className="invite-icon"><MonitorUp/></div><div className="eyebrow"><Radio/> VOCÊ FOI CONVIDADO</div><h1>Entrar na sala</h1><p>Informe seu nome para entrar na chamada, conversar e compartilhar sua tela.</p><div className="invite-code"><span>CÓDIGO DA SALA</span><strong>{inviteRoom}</strong></div><label className="invite-name">Seu nome<input autoFocus autoComplete="name" enterKeyHint="go" disabled={connecting} maxLength={32} placeholder="Como devemos chamar você?" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!connecting&&connect(inviteRoom)}/></label><button className="main-button invite-submit" disabled={connecting} onClick={()=>connect(inviteRoom)}>{connecting?'Entrando…':'Entrar na sala'}</button><small aria-live="polite">{status}</small></section><footer className="invite-footer"><ShieldCheck/> Convite validado pelo servidor</footer></main>

  if (!joinedRoom) return <main className="landing"><nav className="topbar"><Logo/><span><ShieldCheck/> Voz, chat e tela em uma sala privada</span></nav><section className="intro"><div className="eyebrow"><Radio/> COMUNICAÇÃO EM TEMPO REAL</div><h1>Sua call.<br/><em>Do seu jeito.</em></h1><p>Crie uma sala privada para conversar, compartilhar sua tela e colaborar sem instalar nada.</p><div className="identity"><input autoComplete="name" enterKeyHint="next" disabled={connecting} maxLength={32} placeholder="SEU NOME" value={name} onChange={e=>setName(e.target.value)}/></div><div className="actions"><button className="main-button" disabled={connecting} onClick={createRoom}><MonitorUp/> {connecting?'Aguarde…':'Criar uma sala'}</button><div className="join"><input autoCapitalize="characters" enterKeyHint="go" disabled={connecting} maxLength={25} placeholder="CÓDIGO" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&!connecting&&connect(roomCode)}/><button disabled={connecting} onClick={()=>connect(roomCode)}>Entrar</button></div></div><small aria-live="polite">{status}</small><InstallAppButton/>{recentRooms.length>0&&<div className="recent"><span>Salas recentes</span>{recentRooms.map(code=><button disabled={connecting} key={code} onClick={()=>{setRoomCode(code);connect(code)}}>{code}</button>)}</div>}</section><div className="features"><span><b>01</b> Voz e chat</span><span><b>02</b> Convites verificados</span><span><b>03</b> Tela com áudio</span></div></main>

  const presentingIds = new Set(presentations.map(item => item.id))
  const qualityLabel = reconnecting ? 'Reconectando' : connectionQuality === 'excellent' ? 'Excelente' : connectionQuality === 'good' ? 'Boa' : connectionQuality === 'poor' ? 'Instável' : connectionQuality === 'lost' ? 'Sem conexão' : 'Conectando'
  const voicePanel = <VoicePanel name={name} quality={qualityLabel} members={members.length} micEnabled={micEnabled} deafened={deafened} settingsOpen={audioSettingsOpen} inputs={audioInputs} outputs={audioOutputs} inputDevice={inputDevice} outputDevice={outputDevice} volume={volume} micLevel={micLevel} micTesting={micTesting} pushToTalk={pushToTalk} onLeave={leaveRoom} onToggleMic={toggleMic} onToggleDeafen={toggleDeafen} onToggleSettings={toggleAudioSettings} onCloseSettings={toggleAudioSettings} onDevice={changeAudioDevice} onVolume={changeVolume} onMicTest={toggleMicTest} onPushToTalk={togglePushToTalk}/>
  return <Suspense fallback={<main className="room room-loading">Preparando a sala…</main>}><main className={`room ${panelOpen?'':'panel-closed'}`}>
    <header className="room-header"><Logo/><div className="room-title"><span>{locked?'Sala bloqueada':'Sala privada'}</span><strong>{joinedRoom}</strong></div><div className="room-header-actions"><div className={`quality quality-${connectionQuality}`}><Signal/><span>{qualityLabel}</span></div>{role==='owner'&&<button className="header-button" onClick={toggleLock}>{locked?<Unlock/>:<Lock/>}{locked?'Desbloquear':'Bloquear'}</button>}<button className="header-button" onClick={copyLink}><Link2/>{copied?'Link copiado':'Convidar'}</button><button className="header-button panel-toggle" onClick={()=>setPanelOpen(v=>!v)}>{panelOpen?<PanelRightClose/>:<PanelRightOpen/>}</button></div></header>
    {reconnecting&&<div className="reconnect-banner"><span className="reconnect-spinner"/> Reconectando automaticamente…</div>}
    <div className="room-body"><section className={`stage ${presentations.length?'multi-stage':''} ${focusedScreen?'focus-mode':''}`} ref={stage} onClick={()=>audioBlocked&&enableAudio()}><div ref={audioRoot} className="audio-root"/>{presentations.length===0&&<div className="empty-stage"><div className="empty-visual"><MonitorUp/></div><span>SALA PRONTA</span><h2>Compartilhe quando quiser</h2><p>Todos podem compartilhar telas ao mesmo tempo.</p><button className="main-button" disabled={sharingBusy} onClick={startSharing}><MonitorUp/> {sharingBusy?'Abrindo seletor…':'Compartilhar minha tela'}</button><label className="quality-select">Qualidade<select disabled={sharingBusy} value={qualityPreset} onChange={e=>setQualityPreset(e.target.value as QualityPreset)}>{Object.entries(qualitySettings).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label></div>}{presentations.map(item=><ScreenTile key={item.id} presentation={item} focused={focusedScreen===item.id} onFocus={()=>setFocusedScreen(current=>current===item.id?'':item.id)}/>)}{audioBlocked&&<button className="audio-overlay" onClick={enableAudio}><Volume2/> Clique para ativar o áudio</button>}</section>
      <RoomSidebar tab={panelTab} onTabChange={setPanelTab} members={members} speakers={speakers} presentingIds={presentingIds} role={role} memberVolumes={memberVolumes} onMemberVolume={changeMemberVolume} onToggleMemberAudio={toggleMemberAudio} onModerate={moderate} chat={chat} chatText={chatText} onChatText={setChatText} sending={sending} onSend={sendChat} locked={locked}/></div>
    <footer className="room-footer">{voicePanel}<div className="control-dock"><button className={`mobile-voice-control ${micEnabled?'enabled-control':''}`} onClick={toggleMic}>{micEnabled?<Mic/>:<MicOff/>}<span>{micEnabled?'Microfone':'Mudo'}</span></button><button className={`mobile-voice-control ${deafened?'danger-control':''}`} onClick={toggleDeafen}>{deafened?<VolumeX/>:<Headphones/>}<span>{deafened?'Sem som':'Áudio'}</span></button><button onClick={copyLink}>{copied?<Check/>:<Copy/>}<span>{copied?'Copiado':'Convite'}</span></button>{!sharing&&<button className="primary-control" disabled={sharingBusy} onClick={startSharing}><MonitorUp/><span>{sharingBusy?'Aguarde':'Compartilhar'}</span></button>}{sharing&&<button className="danger-control" disabled={sharingBusy} onClick={stopSharing}><MonitorOff/><span>{sharingBusy?'Parando':'Parar'}</span></button>}<button onClick={toggleFullscreen}><Expand/><span>Tela cheia</span></button><button className="mobile-panel-control" onClick={()=>setPanelOpen(v=>!v)}><Users/><span>Pessoas</span></button><button className="mobile-settings-control" onClick={toggleAudioSettings}><Settings/><span>Voz</span></button><button className="leave-control" onClick={leaveRoom}><LogOut/><span>{role==='owner'?'Encerrar':'Sair'}</span></button></div><div className="footer-count"><span className={presentations.length?'status active':'status'}/><span>{status}</span></div></footer>
  </main></Suspense>
}

function Logo(){return <div className="logo"><span>S</span><strong>Screenly</strong></div>}
