import type { Track } from 'livekit-client'

export type Member = { id: string; name: string; local: boolean; role: 'owner' | 'member' }
export type ChatMessage = { id: string; sender: string; senderId: string; text: string; time: number; local?: boolean }
export type Credentials = { server_url: string; participant_token: string; identity: string; role: 'owner' | 'member'; session_token: string; control_token?: string; room?: string }
export type Presentation = { id: string; name: string; track: Track; local: boolean }
export type QualityPreset = 'economy' | 'balanced' | 'motion'
export type CommunityChannel = { id: string; name: string; type: 'text' | 'voice'; roomCode?: string; topic?: string; muted?: boolean; private?: boolean }
export type CommunityCategory = { id: string; name: string; channels: CommunityChannel[] }
export type CommunityRole = { id: string; name: string; color: string; permissions: string[] }
export type CommunityServerMember = { id: string; displayName: string; avatar?: string; role: 'owner' | 'member'; online: boolean }
export type CommunityServer = { id: string; name: string; description: string; categories: CommunityCategory[]; icon?: string; roles?: CommunityRole[]; ownerId?: string; currentRole?: 'owner' | 'member'; members?: CommunityServerMember[] }
export type CommunityAttachment = { id:string; name:string; type:string; size:number; url:string }
export type CommunityMessage = { id: string; channelId: string; authorId?: string; author: string; avatar?: string; text: string; time: number; edited?: boolean; replyTo?: string; reactions?: Record<string, number>; pinned?: boolean; attachments?:CommunityAttachment[] }
export type CommunityProfile = { displayName: string; status: 'online' | 'idle' | 'busy' | 'offline'; about: string; avatar?: string }
