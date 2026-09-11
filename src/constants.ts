import type { CommunityServer } from './types'

export const qualitySettings = {
  economy: { label: 'Econômica · 540p 20 FPS', resolution: { width: 960, height: 540, frameRate: 20 }, maxBitrate: 700_000, contentHint: 'detail' as const },
  balanced: { label: 'Equilibrada · 720p 30 FPS', resolution: { width: 1280, height: 720, frameRate: 30 }, maxBitrate: 1_600_000, contentHint: 'detail' as const },
  motion: { label: 'Movimento · 720p 60 FPS', resolution: { width: 1280, height: 720, frameRate: 60 }, maxBitrate: 3_000_000, contentHint: 'motion' as const },
}

export const savedName = () => localStorage.getItem('screenly-name') || ''
export const loadRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem('screenly-recent') || '[]') }
  catch { return [] }
}

export const MAX_SIMULTANEOUS_SCREENS = 3

const starterServer: CommunityServer = {
  id: 'screenly-community',
  name: 'Minha comunidade',
  description: 'Seu espaço para conversar e compartilhar.',
  categories: [{ id: 'general', name: 'GERAL', channels: [{ id: 'chat-geral', name: 'geral', type: 'text' }, { id: 'voice-geral', name: 'Sala geral', type: 'voice' }] }],
}

export const loadCommunityServers = (): CommunityServer[] => {
  let saved: CommunityServer[] = [starterServer]
  try {
    const value = JSON.parse(localStorage.getItem('screenly-servers') || '[]')
    saved = Array.isArray(value) && value.length ? value : [starterServer]
  } catch { /* usa o servidor inicial */ }
  try {
    const invite = new URLSearchParams(location.search).get('comunidade')
    if (!invite) return saved
    const server = JSON.parse(invite) as CommunityServer
    if (!server?.id || typeof server.name !== 'string' || !Array.isArray(server.categories)) return saved
    if (saved.some(item => item.id === server.id)) return saved
    const imported = [...saved, server]
    localStorage.setItem('screenly-servers', JSON.stringify(imported))
    return imported
  } catch { return saved }
}

export const saveCommunityServers = (servers: CommunityServer[]) => localStorage.setItem('screenly-servers', JSON.stringify(servers))
