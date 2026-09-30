import type { ReactNode } from 'react'
import type { CatalogItem, ItemProp, Slot } from './generator/types'

export const img = (path: string | null | undefined) => (path ? `${import.meta.env.BASE_URL}${path}` : undefined)
export const souls = (n: number) => n.toLocaleString('en-US')
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`
export const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', vitality: 'Vitality', spirit: 'Spirit' }
export const TIER_LABEL = (t: number) => `Tier ${t}`

/** Properties that describe mechanics rather than stats; hidden unless an item section lists them. */
const NOISE = new Set([
  'AbilityCastDelay', 'AbilityUnitTargetLimit', 'AbilityCooldownBetweenCharge', 'ChannelMoveSpeed', 'AbilityCharges',
  'AbilityChargeUpTime', 'AbilityPostCastDuration', 'ModelScaleGrowthTooltip',
])

export function formatProp(p: ItemProp): string | null {
  const raw = p.value
  if (raw === 'undefined' || raw === '' || raw === 'null') return null
  const n = parseFloat(raw)
  const hasSign = p.prefix.includes('sign')
  let v = raw
  if (p.postfix && v.endsWith(p.postfix)) v = v.slice(0, -p.postfix.length)
  let sign = ''
  if ((hasSign || p.prefix === '+') && Number.isFinite(n) && n > 0) sign = '+'
  const base = `${sign}${v}${p.postfix}`
  return `${base} ${p.label}${p.conditional ? ` (${p.conditional})` : ''}`
}

export interface StatLine { key: string; text: string; highlight: boolean }
export interface ItemSection { type: 'innate' | 'passive' | 'active' | string; text: string; stats: StatLine[] }

/** Builds the stat / passive / active sections of the detail card straight from the assets data. */
export function itemSections(it: CatalogItem): ItemSection[] {
  const used = new Set<string>()
  const line = (key: string, highlight: boolean): StatLine | null => {
    const p = it.props[key]
    if (!p || used.has(key)) return null
    const text = formatProp(p)
    if (!text) return null
    used.add(key)
    return { key, text, highlight }
  }
  const out: ItemSection[] = []
  for (const s of it.tooltip_sections) {
    const stats: StatLine[] = []
    const texts: string[] = []
    for (const a of s.attrs) {
      if (a.text) texts.push(a.text)
      for (const k of a.elevated) { const l = line(k, true); if (l) stats.push(l) }
      for (const k of a.important) { const l = line(k, true); if (l) stats.push(l) }
      for (const k of a.properties) { const l = line(k, false); if (l) stats.push(l) }
    }
    const text = texts.join('\n') || (s.type === 'passive' ? it.description_passive : s.type === 'active' ? it.description_active : '')
    if (stats.length || text) out.push({ type: s.type, text, stats })
  }
  // any remaining labelled stats that no section listed
  const rest: StatLine[] = []
  for (const k of Object.keys(it.props)) { if (NOISE.has(k)) continue; const l = line(k, false); if (l) rest.push(l) }
  if (rest.length) {
    const innate = out.find((s) => s.type === 'innate')
    if (innate) innate.stats.push(...rest)
    else out.unshift({ type: 'innate', text: '', stats: rest })
  }
  // fall back to the flat description when no section carries text
  const hasText = out.some((s) => s.text)
  if (!hasText && it.description) {
    const target = out.find((s) => s.type === (it.is_active ? 'active' : 'passive'))
    if (target) target.text = it.description
    else out.push({ type: it.is_active ? 'active' : 'passive', text: it.description, stats: [] })
  }
  return out
}

/** Renders the API's small HTML subset (spans, <br>) as React nodes without dangerouslySetInnerHTML. */
export function rich(text: string): ReactNode {
  if (!text) return null
  const parts = text.split(/(<\/?span[^>]*>|<\/?b>|<br\s*\/?>)/g)
  const stack: string[] = []
  const nodes: ReactNode[] = []
  parts.forEach((part, i) => {
    if (!part) return
    if (/^<br/.test(part)) { nodes.push(<br key={i} />); return }
    if (/^<span/.test(part)) { stack.push(/class="([^"]*)"/.exec(part)?.[1] ?? ''); return }
    if (/^<b>/.test(part)) { stack.push('highlight'); return }
    if (/^<\/(span|b)>/.test(part)) { stack.pop(); return }
    const cls = stack.join(' ')
    const t = part.replace(/\s*\n\s*/g, ' ')
    if (cls.includes('highlight')) nodes.push(<strong key={i}>{t}</strong>)
    else if (cls.includes('diminish')) nodes.push(<span key={i} className="dim">{t}</span>)
    else nodes.push(t)
  })
  return nodes
}
