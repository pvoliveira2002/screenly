import type { Track } from 'livekit-client'

export type Member = { id: string; name: string; local: boolean; role: 'owner' | 'member' }
export type ChatMessage = { id: string; sender: string; senderId: string; text: string; time: number; local?: boolean }
export type Credentials = { server_url: string; participant_token: string; identity: string; role: 'owner' | 'member'; session_token: string; control_token?: string; room?: string }
export type Presentation = { id: string; name: string; track: Track; local: boolean }
export type QualityPreset = 'economy' | 'balanced' | 'motion'
