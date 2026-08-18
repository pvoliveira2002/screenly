import { FormEvent, useEffect, useRef, useState } from 'react'
import { Check, Copy, Expand, Link2, Lock, LogOut, MessageSquare, Mic, MicOff, MonitorOff, MonitorUp, PanelRightClose, PanelRightOpen, Radio, Send, ShieldCheck, Signal, Unlock, UserMinus, Users, Volume2 } from 'lucide-react'
import { Room, RoomEvent, Track, VideoPreset } from 'livekit-client'

type Member = { id: string; name: string; local: boolean; role: 'owner' | 'member' }
type ChatMessage = { id: string; sender: string; senderId: string; text: string; time: number; local?: boolean }
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
  const [presenter, setPresenter] = useState('')
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

  const room = useRef<Room | null>(null)
  const sessionToken = useRef('')
  const controlToken = useRef('')
  const presenterRef = useRef('')
  const sharingRef = useRef(false)
  const activeVideoTrack = useRef<Track | null>(null)
  const audioTracks = useRef(new Map<string, Track>())
  const audioElements = useRef(new Map<string, HTMLMediaElement>())
  const video = useRef<HTMLVideoElement>(null)
  const audioRoot = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLElement>(null)

  useEffect(() => () => { room.current?.disconnect() }, [])
  useEffect(() => { audioElements.current.forEach(element => { element.volume = volume / 100 }) }, [volume])
  useEffect(() => {
    const element = video.current, track = activeVideoTrack.current
    if (!element || !track || !joinedRoom) return
    track.attach(element); element.muted = true; element.play().catch(() => {})
    return () => { track.detach(element) }
  }, [joinedRoom, presenter])
  useEffect(() => {
    if (!joinedRoom || !audioRoot.current) return
    audioTracks.current.forEach((track, id) => attachAudio(track, id))
  }, [joinedRoom])

  function showVideo(track: Track) {
    activeVideoTrack.current = track
    if (video.current) { track.attach(video.current); video.current.muted = true; video.current.play().catch(() => {}) }
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

  function clearPresentation() {
    if (video.current) activeVideoTrack.current?.detach(video.current)
    activeVideoTrack.current = null
    if (video.current) video.current.srcObject = null
    presenterRef.current = ''; setPresenter(''); setSharing(false); sharingRef.current = false
    setStatus('Ninguém está compartilhando agora')
  }

  async function api(path: string, body: object) {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({ error: 'Resposta inválida do servidor' }))
    if (!response.ok) throw new Error(data.error || 'A operação falhou')
    return data
  }

  async function createRoom() {
    const cleanName = name.trim().slice(0, 32)
    if (!cleanName) return setStatus('Informe seu nome')
    setStatus('Criando sua sala…')
    try {
      const credentials: Credentials = await api('/api/room', { name: cleanName })
      await enterRoom(credentials.room!, cleanName, credentials)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível criar a sala') }
  }

  async function connect(targetRoom: string) {
    const cleanRoom = targetRoom.trim().replace(/[^a-z0-9_-]/gi, '').slice(0, 32).toUpperCase()
    const cleanName = name.trim().slice(0, 32)
    if (!cleanRoom) return setStatus('Informe o código da sala')
    if (!cleanName) return setStatus('Informe seu nome')
    setStatus('Validando convite…')
    try { await enterRoom(cleanRoom, cleanName, await api('/api/token', { room: cleanRoom, name: cleanName })) }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível entrar') }
  }

  async function enterRoom(code: string, cleanName: string, credentials: Credentials) {
    const nextRoom = new Room({ adaptiveStream: true, dynacast: true })
    room.current = nextRoom; sessionToken.current = credentials.session_token; controlToken.current = credentials.control_token || ''
    setRole(credentials.role)
    const parseRole = (metadata?: string): 'owner' | 'member' => { try { return JSON.parse(metadata || '{}').role === 'owner' ? 'owner' : 'member' } catch { return 'member' } }
    const updateMembers = () => setMembers([
      { id: nextRoom.localParticipant.identity, name: nextRoom.localParticipant.name || cleanName, local: true, role: credentials.role },
      ...Array.from(nextRoom.remoteParticipants.values()).map(p => ({ id: p.identity, name: p.name || p.identity, local: false, role: parseRole(p.metadata) })),
    ])
    nextRoom.on(RoomEvent.ParticipantConnected, updateMembers)
    nextRoom.on(RoomEvent.ParticipantDisconnected, participant => { updateMembers(); if (participant.identity === presenterRef.current) clearPresentation() })
    nextRoom.on(RoomEvent.ParticipantMetadataChanged, updateMembers)
    nextRoom.on(RoomEvent.ActiveSpeakersChanged, active => setSpeakers(active.map(p => p.identity)))
    nextRoom.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => { if (participant.identity === nextRoom.localParticipant.identity) setConnectionQuality(quality) })
    nextRoom.on(RoomEvent.Reconnecting, () => { setReconnecting(true); setStatus('Reconectando à sala…') })
    nextRoom.on(RoomEvent.Reconnected, () => { setReconnecting(false); setStatus('Conexão restaurada') })
    nextRoom.on(RoomEvent.RoomMetadataChanged, metadata => {
      try { const state = JSON.parse(metadata || '{}'); setLocked(Boolean(state.locked)); if (!state.presenter && presenterRef.current) clearPresentation() } catch { /* metadado inválido */ }
    })
    nextRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (publication.source === Track.Source.Microphone || publication.source === Track.Source.ScreenShareAudio) return attachAudio(track, publication.trackSid)
      if (publication.source !== Track.Source.ScreenShare) return
      presenterRef.current = participant.identity; showVideo(track); setPresenter(participant.identity); setStatus(`${participant.name || participant.identity} está compartilhando`)
    })
    nextRoom.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      if (publication.source === Track.Source.Microphone || publication.source === Track.Source.ScreenShareAudio) return removeAudio(publication.trackSid)
      if (publication.source === Track.Source.ScreenShare && participant.identity === presenterRef.current) clearPresentation()
    })
    nextRoom.on(RoomEvent.LocalTrackUnpublished, publication => {
      if (publication.source !== Track.Source.ScreenShare || !sharingRef.current) return
      releasePresenter(); clearPresentation()
    })
    nextRoom.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (topic !== 'chat' || !participant) return
      try { const message = JSON.parse(new TextDecoder().decode(payload)); setChat(current => [...current.slice(-99), { ...message, sender: participant.name || participant.identity, senderId: participant.identity }]) } catch { /* ignora pacote inválido */ }
    })
    nextRoom.on(RoomEvent.Disconnected, () => { setReconnecting(false); setStatus('Desconectado') })
    await nextRoom.connect(credentials.server_url, credentials.participant_token)
    try { const metadata = JSON.parse(nextRoom.metadata || '{}'); setLocked(Boolean(metadata.locked)) } catch { /* sala nova */ }
    localStorage.setItem('screenly-name', cleanName)
    const recent = [code, ...loadRecent().filter(item => item !== code)].slice(0, 5)
    localStorage.setItem('screenly-recent', JSON.stringify(recent)); setRecentRooms(recent)
    setJoinedRoom(code); updateMembers(); setStatus('Conectado. A sala está pronta.')
    history.replaceState(null, '', `?sala=${code}`)
  }

  async function acquirePresenter() {
    await api('/api/presenter', { action: 'acquire', session_token: sessionToken.current })
  }
  async function releasePresenter() {
    try { await api('/api/presenter', { action: 'release', session_token: sessionToken.current }) } catch { /* liberação eventual */ }
  }

  async function startSharing() {
    if (!room.current || presenterRef.current) return
    try {
      await acquirePresenter()
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
      if (publication?.track) showVideo(publication.track)
      presenterRef.current = room.current.localParticipant.identity; sharingRef.current = true
      setSharing(true); setPresenter(room.current.localParticipant.identity)
      const hasAudio = Boolean(room.current.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio))
      setStatus(hasAudio ? 'Você está compartilhando tela e áudio' : 'Tela compartilhada sem áudio da aba')
    } catch (error) { await releasePresenter(); setStatus(error instanceof Error ? error.message : 'Compartilhamento cancelado') }
  }

  async function stopSharing() {
    sharingRef.current = false
    await room.current?.localParticipant.setScreenShareEnabled(false)
    await releasePresenter(); clearPresentation()
  }

  async function toggleMic() {
    if (!room.current) return
    try { await room.current.localParticipant.setMicrophoneEnabled(!micEnabled); setMicEnabled(value => !value) }
    catch { setStatus('Não foi possível acessar o microfone') }
  }

  async function sendChat(event: FormEvent) {
    event.preventDefault(); const text = chatText.trim().slice(0, 1000)
    if (!text || !room.current) return
    const message: ChatMessage = { id: crypto.randomUUID(), sender: name, senderId: room.current.localParticipant.identity, text, time: Date.now(), local: true }
    await room.current.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true, topic: 'chat' })
    setChat(current => [...current.slice(-99), message]); setChatText('')
  }

  async function moderate(action: 'kick' | 'stop-presenter', identity: string) {
    try { await api('/api/moderate', { action, identity, control_token: controlToken.current }) }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Falha na moderação') }
  }
  async function toggleLock() {
    try { await api('/api/moderate', { action: 'lock', locked: !locked, control_token: controlToken.current }); setLocked(value => !value) }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Falha ao bloquear a sala') }
  }

  function leaveRoom() {
    room.current?.disconnect(); room.current = null
    audioElements.current.forEach(element => element.remove()); audioElements.current.clear(); audioTracks.current.clear()
    activeVideoTrack.current = null; presenterRef.current = ''; sharingRef.current = false; sessionToken.current = ''; controlToken.current = ''
    setInviteRoom(''); setJoinedRoom(''); setMembers([]); setSharing(false); setPresenter(''); setMicEnabled(false); setChat([]); setRole('member'); setStatus('Sala encerrada')
    history.replaceState(null, '', location.pathname)
  }

  async function copyLink() { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?sala=${joinedRoom}`); setCopied(true); setTimeout(() => setCopied(false), 1600) }
  async function toggleFullscreen() { if (!stage.current) return; document.fullscreenElement ? await document.exitFullscreen() : await stage.current.requestFullscreen() }

  if (!joinedRoom && inviteRoom) return <main className="invite-page"><nav className="topbar"><Logo/><span><ShieldCheck/> Convite privado e verificado</span></nav><section className="invite-card"><div className="invite-icon"><MonitorUp/></div><div className="eyebrow"><Radio/> VOCÊ FOI CONVIDADO</div><h1>Entrar na sala</h1><p>Informe seu nome para entrar na chamada, conversar e compartilhar sua tela.</p><div className="invite-code"><span>CÓDIGO DA SALA</span><strong>{inviteRoom}</strong></div><label className="invite-name">Seu nome<input autoFocus maxLength={32} placeholder="Como devemos chamar você?" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&connect(inviteRoom)}/></label><button className="main-button invite-submit" onClick={()=>connect(inviteRoom)}>Entrar na sala</button><small>{status}</small></section><footer className="invite-footer"><ShieldCheck/> Convite validado pelo servidor</footer></main>

  if (!joinedRoom) return <main className="landing"><nav className="topbar"><Logo/><span><ShieldCheck/> Voz, chat e tela em uma sala privada</span></nav><section className="intro"><div className="eyebrow"><Radio/> COMUNICAÇÃO EM TEMPO REAL</div><h1>Sua call.<br/><em>Do seu jeito.</em></h1><p>Crie uma sala privada para conversar, compartilhar sua tela e colaborar sem instalar nada.</p><div className="identity"><input maxLength={32} placeholder="SEU NOME" value={name} onChange={e=>setName(e.target.value)}/></div><div className="actions"><button className="main-button" onClick={createRoom}><MonitorUp/> Criar uma sala</button><div className="join"><input maxLength={32} placeholder="CÓDIGO" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&connect(roomCode)}/><button onClick={()=>connect(roomCode)}>Entrar</button></div></div><small>{status}</small>{recentRooms.length>0&&<div className="recent"><span>Salas recentes</span>{recentRooms.map(code=><button key={code} onClick={()=>{setRoomCode(code);connect(code)}}>{code}</button>)}</div>}</section><div className="features"><span><b>01</b> Voz e chat</span><span><b>02</b> Convites verificados</span><span><b>03</b> Tela com áudio</span></div></main>

  const isMyScreen = sharing && presenter === room.current?.localParticipant.identity
  const presenterName = members.find(member => member.id === presenter)?.name || presenter
  const qualityLabel = reconnecting ? 'Reconectando' : connectionQuality === 'excellent' ? 'Excelente' : connectionQuality === 'good' ? 'Boa' : connectionQuality === 'poor' ? 'Instável' : connectionQuality === 'lost' ? 'Sem conexão' : 'Conectando'
  return <main className={`room ${panelOpen?'':'panel-closed'}`}>
    <header className="room-header"><Logo/><div className="room-title"><span>{locked?'Sala bloqueada':'Sala privada'}</span><strong>{joinedRoom}</strong></div><div className="room-header-actions"><div className={`quality quality-${connectionQuality}`}><Signal/><span>{qualityLabel}</span></div>{role==='owner'&&<button className="header-button" onClick={toggleLock}>{locked?<Unlock/>:<Lock/>}{locked?'Desbloquear':'Bloquear'}</button>}<button className="header-button" onClick={copyLink}><Link2/>{copied?'Link copiado':'Convidar'}</button><button className="header-button panel-toggle" onClick={()=>setPanelOpen(v=>!v)}>{panelOpen?<PanelRightClose/>:<PanelRightOpen/>}</button></div></header>
    {reconnecting&&<div className="reconnect-banner"><span className="reconnect-spinner"/> Reconectando automaticamente…</div>}
    <div className="room-body"><section className="stage" ref={stage} onClick={()=>audioBlocked&&enableAudio()}><video ref={video} autoPlay playsInline/><div ref={audioRoot} className="audio-root"/>{!presenter&&<div className="empty-stage"><div className="empty-visual"><MonitorUp/></div><span>SALA PRONTA</span><h2>Compartilhe quando quiser</h2><p>Converse por voz ou mostre uma tela para todos.</p><button className="main-button" onClick={startSharing}><MonitorUp/> Compartilhar minha tela</button><label className="quality-select">Qualidade<select value={qualityPreset} onChange={e=>setQualityPreset(e.target.value as QualityPreset)}>{Object.entries(qualitySettings).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label></div>}{presenter&&<div className="viewer-label"><span className="live-dot"/>{isMyScreen?'Você está apresentando':`${presenterName} está apresentando`}</div>}{audioBlocked&&<button className="audio-overlay" onClick={enableAudio}><Volume2/> Clique para ativar o áudio</button>}</section>
      <aside className="participants-panel"><div className="panel-tabs"><button className={panelTab==='people'?'active':''} onClick={()=>setPanelTab('people')}><Users/> Pessoas <span>{members.length}</span></button><button className={panelTab==='chat'?'active':''} onClick={()=>setPanelTab('chat')}><MessageSquare/> Chat {chat.length>0&&<span>{chat.length}</span>}</button></div>{panelTab==='people'?<div className="members-list">{members.map(member=><div className={`member ${speakers.includes(member.id)?'speaking':''}`} key={member.id}><div className="avatar">{member.name.trim().charAt(0).toUpperCase()}</div><div><strong>{member.name}{member.role==='owner'&&<small className="owner-label"> Dono</small>}</strong><small>{member.local?'Você':speakers.includes(member.id)?'Falando…':'Conectado'}</small></div>{presenter===member.id?<span className="presenting"><Radio/> Ao vivo</span>:<span className="online-dot"/>}{role==='owner'&&!member.local&&<div className="member-actions">{presenter===member.id&&<button title="Parar apresentação" onClick={()=>moderate('stop-presenter',member.id)}><MonitorOff/></button>}<button title="Remover da sala" onClick={()=>moderate('kick',member.id)}><UserMinus/></button></div>}</div>)}</div>:<div className="chat-panel"><div className="chat-messages">{chat.length===0&&<div className="chat-empty"><MessageSquare/><span>A conversa começa aqui.</span></div>}{chat.map(message=><div className={`chat-message ${message.local?'mine':''}`} key={message.id}><strong>{message.local?'Você':message.sender}<time>{new Date(message.time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></strong><p>{message.text}</p></div>)}</div><form className="chat-form" onSubmit={sendChat}><input maxLength={1000} placeholder="Mensagem para a sala" value={chatText} onChange={e=>setChatText(e.target.value)}/><button aria-label="Enviar"><Send/></button></form></div>}<div className="panel-note"><ShieldCheck/><span>{locked?'Entrada de novos membros bloqueada':'Sala protegida por convite'}</span></div></aside></div>
    <footer className="room-footer"><div className="room-status"><span className={presenter?'status active':'status'}/><span>{status}</span></div><div className="control-dock"><label className="volume-control"><Volume2/><input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label><button className={micEnabled?'enabled-control':''} onClick={toggleMic}>{micEnabled?<Mic/>:<MicOff/>}<span>{micEnabled?'Microfone':'Sem áudio'}</span></button><button onClick={copyLink}>{copied?<Check/>:<Copy/>}<span>{copied?'Copiado':'Convite'}</span></button>{!presenter&&<button className="primary-control" onClick={startSharing}><MonitorUp/><span>Compartilhar</span></button>}{isMyScreen&&<button className="danger-control" onClick={stopSharing}><MonitorOff/><span>Parar</span></button>}<button onClick={toggleFullscreen}><Expand/><span>Tela cheia</span></button><button className="mobile-panel-control" onClick={()=>setPanelOpen(v=>!v)}><Users/><span>Pessoas</span></button><button className="leave-control" onClick={leaveRoom}><LogOut/><span>Sair</span></button></div><div className="footer-count"><Users/><span>{members.length} {members.length===1?'pessoa':'pessoas'}</span></div></footer>
  </main>
}

function Logo(){return <div className="logo"><span>S</span><strong>Screenly</strong></div>}
