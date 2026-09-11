import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type Tip = { text: string; x: number; y: number; placement: 'top' | 'right' }

export default function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    let active: HTMLElement | null = null
    let timer = 0
    const hide = () => { window.clearTimeout(timer); setTip(null); if (active?.dataset.tooltipText) { active.title = active.dataset.tooltipText; delete active.dataset.tooltipText }; active = null }
    const show = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[title]')
      if (!target || !target.title) return
      if (active === target) return
      hide(); active = target; const text = target.title; target.dataset.tooltipText = text; target.removeAttribute('title')
      timer = window.setTimeout(() => {
        if (!active) return
        const rect = active.getBoundingClientRect()
        const placement = active.closest('.server-rail') ? 'right' : 'top'
        setTip({ text, placement, x: placement === 'right' ? rect.right + 10 : rect.left + rect.width / 2, y: placement === 'right' ? rect.top + rect.height / 2 : rect.top - 9 })
      }, 280)
    }
    const leave = (event: PointerEvent) => { if (!active || !(event.relatedTarget instanceof Node) || !active.contains(event.relatedTarget)) hide() }
    document.addEventListener('pointerover', show); document.addEventListener('pointerout', leave); document.addEventListener('pointerdown', hide)
    return () => { document.removeEventListener('pointerover', show); document.removeEventListener('pointerout', leave); document.removeEventListener('pointerdown', hide); hide() }
  }, [])

  return tip ? createPortal(<div className={'app-tooltip tooltip-' + tip.placement} style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.text}</div>, document.body) : null
}
