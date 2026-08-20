import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export default function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  useEffect(() => {
    const receive = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt) }
    window.addEventListener('beforeinstallprompt', receive)
    return () => window.removeEventListener('beforeinstallprompt', receive)
  }, [])
  if (!prompt) return null
  return <button className="install-button" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null) }}><Download/> Instalar Screenly</button>
}
