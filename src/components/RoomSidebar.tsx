import type { FormEvent } from 'react'
import { useEffect, useRef } from 'react'
import { MessageSquare, MonitorOff, Radio, Send, ShieldCheck, UserMinus, Users } from 'lucide-react'
import type { ChatMessage, Member } from '../types'
import MemberAudioControl from './MemberAudioControl'

type Props = {
  tab: 'people' | 'chat'
  onTabChange: (tab: 'people' | 'chat') => void
  members: Member[]
  speakers: string[]
  presentingIds: Set<string>
  role: 'owner' | 'member'
  memberVolumes: Record<string, number>
  onMemberVolume: (identity: string, volume: number) => void
  onToggleMemberAudio: (identity: string) => void
  onModerate: (action: 'kick' | 'stop-presenter', identity: string) => void
  chat: ChatMessage[]
  chatText: string
  onChatText: (text: string) => void
  sending: boolean
  onSend: (event: FormEvent) => void
  locked: boolean
}

export default function RoomSidebar(props: Props) {
  const chatEnd = useRef<HTMLDivElement>(null)
  useEffect(() => { if (props.tab === 'chat') chatEnd.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [props.chat, props.tab])

  return <aside className="participants-panel">
    <div className="panel-tabs"><button className={props.tab === 'people' ? 'active' : ''} onClick={() => props.onTabChange('people')}><Users/> Pessoas <span>{props.members.length}</span></button><button className={props.tab === 'chat' ? 'active' : ''} onClick={() => props.onTabChange('chat')}><MessageSquare/> Chat {props.chat.length > 0 && <span>{props.chat.length}</span>}</button></div>
    {props.tab === 'people' ? <div className="members-list">{props.members.map(member => <div className={`member ${props.speakers.includes(member.id) ? 'speaking' : ''}`} key={member.id}>
      <div className="avatar">{member.name.trim().charAt(0).toUpperCase()}</div>
      <div><strong>{member.name}{member.role === 'owner' && <small className="owner-label"> Dono</small>}</strong><small>{member.local ? 'Você' : props.speakers.includes(member.id) ? 'Falando…' : 'Conectado'}</small></div>
      {!member.local && <MemberAudioControl volume={props.memberVolumes[member.id] ?? 100} onChange={volume => props.onMemberVolume(member.id, volume)} onToggle={() => props.onToggleMemberAudio(member.id)}/>} 
      {props.presentingIds.has(member.id) ? <span className="presenting"><Radio/> Ao vivo</span> : <span className="online-dot"/>}
      {props.role === 'owner' && !member.local && <div className="member-actions">{props.presentingIds.has(member.id) && <button title="Parar apresentação" onClick={() => props.onModerate('stop-presenter', member.id)}><MonitorOff/></button>}<button title="Remover da sala" onClick={() => props.onModerate('kick', member.id)}><UserMinus/></button></div>}
    </div>)}</div> : <div className="chat-panel"><div className="chat-messages">{props.chat.length === 0 && <div className="chat-empty"><MessageSquare/><span>A conversa começa aqui.</span></div>}{props.chat.map(message => <div className={`chat-message ${message.local ? 'mine' : ''}`} key={message.id}><strong>{message.local ? 'Você' : message.sender}<time>{new Date(message.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></strong><p>{message.text}</p></div>)}<div ref={chatEnd}/></div><form className="chat-form" onSubmit={props.onSend}><input enterKeyHint="send" disabled={props.sending} maxLength={1000} placeholder="Mensagem para a sala" value={props.chatText} onChange={event => props.onChatText(event.target.value)}/><button aria-label="Enviar" disabled={props.sending || !props.chatText.trim()}><Send/></button></form></div>}
    <div className="panel-note"><ShieldCheck/><span>{props.locked ? 'Entrada de novos membros bloqueada' : 'Sala protegida por convite'}</span></div>
  </aside>
}
