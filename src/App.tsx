import { FormEvent, useEffect, useRef, useState } from 'react'
import { Check, Copy, Expand, Link2, Lock, LogOut, MessageSquare, Mic, MicOff, MonitorOff, MonitorUp, PanelRightClose, PanelRightOpen, Radio, Send, ShieldCheck, Signal, Unlock, UserMinus, Users, Volume2 } from 'lucide-react'
import { Room, RoomEvent, Track, VideoPreset } from 'livekit-client'

type Member = { id: string; name: string; local: boolean; role: 'owner' | 'member' }
type ChatMessage = { id: string; sender: string; senderId: string; text: string; time: number; local?: boolean }
type Presentation = { id: string; name: string; track: Track; local: boolean }
type Credentials = { server_url: string; participant_token: string; identity: string; role: 'owner' | 'member'; session_token: string; control_token?: string; room?: string }
type QualityPreset = 'economy' | 'balanced' | 'motion'

const savedName = () => localStorage.getItem('screenly-name') || ''
const loadRecent = (): string[] => { try { return JSON.parse(localStorage.getItem('screenly-recent') || '[]') } catch { return [] } }
const qualitySettings = {
  economy: { label: 'Econômica · 540p 20 FPS', resolution: { width: 960, height: 540, frameRate: 20 }, maxBitrate: 700_000, contentHint: 'detail' as const },
  balanced: { label: 'Equilibrada · 720p 30 FPS', resolution: { width: 1280, height: 720, frameRate: 30 }, maxBitrate: 1_600_000, contentHint: 'detail' as const },
  motion: { label: 'Movimento · 720p 60 FPS', resolution: { width: 1280, height: 720, frameRate: 60 }, maxBitrate: 3_000_000, contentHint: 'motion' as const },
}

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
  const [connecting, setConnecting] = useState(false)
  const [sharingBusy, setSharingBusy] = useState(false)
  const [sending, setSending] = useState(false)

  const room = useRef<Room | null>(null)
  const controlToken = useRef('')
  const sharingRef = useRef(false)
  const audioTracks = useRef(new Map<string, Track>())
  const audioElements = useRef(new Map<string, HTMLMediaElement>())
  const audioRoot = useRef<HTMLDivElement>(null)
  const chatEnd = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLElement>(null)

  useEffect(() => () => { room.current?.disconnect() }, [])
  useEffect(() => { audioElements.current.forEach(element => { element.volume = volume / 100 }) }, [volume])
  useEffect(() => {
    if (!joinedRoom || !audioRoot.current) return
    audioTracks.current.forEach((track, id) => attachAudio(track, id))
  }, [joinedRoom])
  useEffect(() => {
    if (panelTab === 'chat') chatEnd.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [chat, panelTab])

  function showVideo(id: string, name: string, track: Track, local = false) {
    setPresentations(current => [...current.filter(item => item.id !== id), { id, name, track, local }])
  }

  function attachAudio(track: Track, id: string) {
    if (audioElements.current.has(id) || !audioRoot.current) return
    audioTracks.current.set(id, track)
    const element = track.attach()
    element.autoplay = true; element.volume = volume / 100
    audioRoot.current.appendChild(element); audioElements.current.set(id, element)
    element.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true))
  }

  function removeAudio(id: string) {
    const track = audioTracks.current.get(id), element = audioElements.current.get(id)
    if (track && element) track.detach(element)
    element?.remove(); audioTracks.current.delete(id); audioElements.current.delete(id)
  }

  function enableAudio() {
    Promise.all([...audioElements.current.values()].map(element => element.play())).then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true))
  }

  function clearPresentation(identity: string) {
    setPresentations(current => current.filter(item => item.id !== identity))
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
      if (publication.source === Track.Source.Microphone || publication.source === Track.Source.ScreenShareAudio) return attachAudio(track, publication.trackSid)
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
    try { const metadata = JSON.parse(nextRoom.metadata || '{}'); setLocked(Boolean(metadata.locked)) } catch { /* sala nova */ }
    localStorage.setItem('screenly-name', cleanName)
    const recent = [code, ...loadRecent().filter(item => item !== code)].slice(0, 5)
    localStorage.setItem('screenly-recent', JSON.stringify(recent)); setRecentRooms(recent)
    setJoinedRoom(code); updateMembers(); setStatus('Conectado. A sala está pronta.')
    history.replaceState(null, '', `?sala=${code}`)
  }

  async function startSharing() {
    if (!room.current || sharingRef.current || sharingBusy) return
    setSharingBusy(true)
    try {
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
    try { await room.current.localParticipant.setMicrophoneEnabled(!micEnabled); setMicEnabled(value => !value) }
    catch { setStatus('Não foi possível acessar o microfone') }
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
    room.current = null
    audioElements.current.forEach(element => element.remove()); audioElements.current.clear(); audioTracks.current.clear()
    sharingRef.current = false; controlToken.current = ''
    setInviteRoom(''); setJoinedRoom(''); setMembers([]); setSharing(false); setPresentations([]); setMicEnabled(false); setChat([]); setRole('member'); setReconnecting(false); setStatus(message)
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

  if (!joinedRoom) return <main className="landing"><nav className="topbar"><Logo/><span><ShieldCheck/> Voz, chat e tela em uma sala privada</span></nav><section className="intro"><div className="eyebrow"><Radio/> COMUNICAÇÃO EM TEMPO REAL</div><h1>Sua call.<br/><em>Do seu jeito.</em></h1><p>Crie uma sala privada para conversar, compartilhar sua tela e colaborar sem instalar nada.</p><div className="identity"><input autoComplete="name" enterKeyHint="next" disabled={connecting} maxLength={32} placeholder="SEU NOME" value={name} onChange={e=>setName(e.target.value)}/></div><div className="actions"><button className="main-button" disabled={connecting} onClick={createRoom}><MonitorUp/> {connecting?'Aguarde…':'Criar uma sala'}</button><div className="join"><input autoCapitalize="characters" enterKeyHint="go" disabled={connecting} maxLength={25} placeholder="CÓDIGO" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&!connecting&&connect(roomCode)}/><button disabled={connecting} onClick={()=>connect(roomCode)}>Entrar</button></div></div><small aria-live="polite">{status}</small>{recentRooms.length>0&&<div className="recent"><span>Salas recentes</span>{recentRooms.map(code=><button disabled={connecting} key={code} onClick={()=>{setRoomCode(code);connect(code)}}>{code}</button>)}</div>}</section><div className="features"><span><b>01</b> Voz e chat</span><span><b>02</b> Convites verificados</span><span><b>03</b> Tela com áudio</span></div></main>

  const presentingIds = new Set(presentations.map(item => item.id))
  const qualityLabel = reconnecting ? 'Reconectando' : connectionQuality === 'excellent' ? 'Excelente' : connectionQuality === 'good' ? 'Boa' : connectionQuality === 'poor' ? 'Instável' : connectionQuality === 'lost' ? 'Sem conexão' : 'Conectando'
  return <main className={`room ${panelOpen?'':'panel-closed'}`}>
    <header className="room-header"><Logo/><div className="room-title"><span>{locked?'Sala bloqueada':'Sala privada'}</span><strong>{joinedRoom}</strong></div><div className="room-header-actions"><div className={`quality quality-${connectionQuality}`}><Signal/><span>{qualityLabel}</span></div>{role==='owner'&&<button className="header-button" onClick={toggleLock}>{locked?<Unlock/>:<Lock/>}{locked?'Desbloquear':'Bloquear'}</button>}<button className="header-button" onClick={copyLink}><Link2/>{copied?'Link copiado':'Convidar'}</button><button className="header-button panel-toggle" onClick={()=>setPanelOpen(v=>!v)}>{panelOpen?<PanelRightClose/>:<PanelRightOpen/>}</button></div></header>
    {reconnecting&&<div className="reconnect-banner"><span className="reconnect-spinner"/> Reconectando automaticamente…</div>}
    <div className="room-body"><section className={`stage ${presentations.length?'multi-stage':''}`} ref={stage} onClick={()=>audioBlocked&&enableAudio()}><div ref={audioRoot} className="audio-root"/>{presentations.length===0&&<div className="empty-stage"><div className="empty-visual"><MonitorUp/></div><span>SALA PRONTA</span><h2>Compartilhe quando quiser</h2><p>Todos podem compartilhar telas ao mesmo tempo.</p><button className="main-button" disabled={sharingBusy} onClick={startSharing}><MonitorUp/> {sharingBusy?'Abrindo seletor…':'Compartilhar minha tela'}</button><label className="quality-select">Qualidade<select disabled={sharingBusy} value={qualityPreset} onChange={e=>setQualityPreset(e.target.value as QualityPreset)}>{Object.entries(qualitySettings).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label></div>}{presentations.map(item=><ScreenTile key={item.id} presentation={item}/>)}{audioBlocked&&<button className="audio-overlay" onClick={enableAudio}><Volume2/> Clique para ativar o áudio</button>}</section>
      <aside className="participants-panel"><div className="panel-tabs"><button className={panelTab==='people'?'active':''} onClick={()=>setPanelTab('people')}><Users/> Pessoas <span>{members.length}</span></button><button className={panelTab==='chat'?'active':''} onClick={()=>setPanelTab('chat')}><MessageSquare/> Chat {chat.length>0&&<span>{chat.length}</span>}</button></div>{panelTab==='people'?<div className="members-list">{members.map(member=><div className={`member ${speakers.includes(member.id)?'speaking':''}`} key={member.id}><div className="avatar">{member.name.trim().charAt(0).toUpperCase()}</div><div><strong>{member.name}{member.role==='owner'&&<small className="owner-label"> Dono</small>}</strong><small>{member.local?'Você':speakers.includes(member.id)?'Falando…':'Conectado'}</small></div>{presentingIds.has(member.id)?<span className="presenting"><Radio/> Ao vivo</span>:<span className="online-dot"/>}{role==='owner'&&!member.local&&<div className="member-actions">{presentingIds.has(member.id)&&<button title="Parar apresentação" onClick={()=>moderate('stop-presenter',member.id)}><MonitorOff/></button>}<button title="Remover da sala" onClick={()=>moderate('kick',member.id)}><UserMinus/></button></div>}</div>)}</div>:<div className="chat-panel"><div className="chat-messages">{chat.length===0&&<div className="chat-empty"><MessageSquare/><span>A conversa começa aqui.</span></div>}{chat.map(message=><div className={`chat-message ${message.local?'mine':''}`} key={message.id}><strong>{message.local?'Você':message.sender}<time>{new Date(message.time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></strong><p>{message.text}</p></div>)}<div ref={chatEnd}/></div><form className="chat-form" onSubmit={sendChat}><input enterKeyHint="send" disabled={sending} maxLength={1000} placeholder="Mensagem para a sala" value={chatText} onChange={e=>setChatText(e.target.value)}/><button aria-label="Enviar" disabled={sending||!chatText.trim()}><Send/></button></form></div>}<div className="panel-note"><ShieldCheck/><span>{locked?'Entrada de novos membros bloqueada':'Sala protegida por convite'}</span></div></aside></div>
    <footer className="room-footer"><div className="room-status"><span className={presentations.length?'status active':'status'}/><span>{status}</span></div><div className="control-dock"><label className="volume-control"><Volume2/><input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label><button className={micEnabled?'enabled-control':''} onClick={toggleMic}>{micEnabled?<Mic/>:<MicOff/>}<span>{micEnabled?'Microfone':'Sem áudio'}</span></button><button onClick={copyLink}>{copied?<Check/>:<Copy/>}<span>{copied?'Copiado':'Convite'}</span></button>{!sharing&&<button className="primary-control" disabled={sharingBusy} onClick={startSharing}><MonitorUp/><span>{sharingBusy?'Aguarde':'Compartilhar'}</span></button>}{sharing&&<button className="danger-control" disabled={sharingBusy} onClick={stopSharing}><MonitorOff/><span>{sharingBusy?'Parando':'Parar'}</span></button>}<button onClick={toggleFullscreen}><Expand/><span>Tela cheia</span></button><button className="mobile-panel-control" onClick={()=>setPanelOpen(v=>!v)}><Users/><span>Pessoas</span></button><button className="leave-control" onClick={leaveRoom}><LogOut/><span>{role==='owner'?'Encerrar':'Sair'}</span></button></div><div className="footer-count"><Users/><span>{members.length} {members.length===1?'pessoa':'pessoas'}</span></div></footer>
  </main>
}

function ScreenTile({ presentation }: { presentation: Presentation }) {
  const video = useRef<HTMLVideoElement>(null)
  const tile = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = video.current
    if (!element) return
    presentation.track.attach(element); element.muted = true; element.play().catch(() => {})
    return () => { presentation.track.detach(element) }
  }, [presentation.track])
  return <div className="screen-tile" ref={tile} onDoubleClick={()=>tile.current?.requestFullscreen()}>
    <video ref={video} autoPlay muted playsInline/>
    <div className="viewer-label"><span className="live-dot"/>{presentation.local?'Sua tela':presentation.name}</div>
    <span className="fullscreen-tip">Dois cliques para ampliar</span>
  </div>
}

function Logo(){return <div className="logo"><span>S</span><strong>Screenly</strong></div>}
