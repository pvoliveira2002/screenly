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
