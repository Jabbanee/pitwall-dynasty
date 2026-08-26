/** Tiny helpers for building UI without a framework. */

type Child = Node | string | number | null | undefined | false | Child[]

export type ElAttrs = Record<string, string | number | boolean | EventListener | null | undefined>

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: ElAttrs,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v === undefined || v === null) continue
      if (k === 'class') node.className = String(v)
      else if (k === 'html') node.innerHTML = String(v)
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
      } else if (typeof v !== 'function') {
        node.setAttribute(k, String(v))
      }
    }
  }
  appendChildren(node, children)
  return node
}

function appendChildren(node: HTMLElement, children: Child[]) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    if (Array.isArray(child)) {
      appendChildren(node, child)
    } else if (typeof child === 'string' || typeof child === 'number') {
      node.append(document.createTextNode(String(child)))
    } else {
      node.append(child)
    }
  }
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function fmtRaceClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const t = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return h > 0 ? `${h}:${t}` : t
}

export function fmtLapTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export function money(thousands: number): string {
  if (Math.abs(thousands) >= 1000) return `$${(thousands / 1000).toFixed(1)}M`
  return `$${Math.round(thousands)}K`
}

export function ratingColor(v: number): string {
  if (v >= 85) return '#3fa34d'
  if (v >= 70) return '#8fd44a'
  if (v >= 55) return '#f2c744'
  if (v >= 40) return '#f28744'
  return '#e8443a'
}

let toastContainer: HTMLElement | null = null

export function toast(message: string, isError = false) {
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'toasts'
    document.body.appendChild(toastContainer)
  }
  const t = document.createElement('div')
  t.className = `toast${isError ? ' error' : ''}`
  t.textContent = message
  toastContainer.appendChild(t)
  setTimeout(() => t.remove(), 4200)
}
