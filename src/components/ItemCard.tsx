import { useEffect, useRef } from 'react'
import type { BuildItem, CatalogItem } from '../generator/types'
import type { ItemValidation } from '../validation/zergggy'
import { SLOT_LABEL, TIER_LABEL, img, itemSections, pct, rich, souls } from '../format'

interface Props {
  item: CatalogItem
  buildItem?: BuildItem
  validation?: ItemValidation
  catalogByClass: Map<string, CatalogItem>
  onClose: () => void
}

const SECTION_TITLE: Record<string, string> = { innate: 'Stats', passive: 'Passive', active: 'Active' }

export default function ItemCard({ item, buildItem, validation, catalogByClass, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [onClose])

  const sections = itemSections(item)
  const comps = item.components.map((c) => catalogByClass.get(c)).filter((c): c is CatalogItem => !!c)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`${item.name} details`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <button ref={closeRef} className="icon-btn sheet-close" onClick={onClose} aria-label="Close item details">✕</button>
        <header className="item-head">
          <img className={`item-img big slot-${item.slot}`} src={img(item.image)} alt={item.name} width={88} height={88} />
          <div className="item-head-text">
            <h2>{item.name}</h2>
            <div className="chips">
              <span className="chip cost">{souls(item.cost)} souls</span>
              <span className="chip">{TIER_LABEL(item.tier)}</span>
              <span className={`chip slot-${item.slot}`}>{SLOT_LABEL[item.slot]}</span>
              {item.is_active && <span className="chip">Active</span>}
            </div>
          </div>
        </header>

        {validation && (
          <p className={`zerg-line ${validation.badge}`}>
            <b>{validation.badge === 'core' ? 'Zergggy core item' : 'Not in Zergggy’s core set'}</b> — {validation.note}
          </p>
        )}

        {sections.map((s, i) => (
          <section key={i} className="card-section">
            <h3>{SECTION_TITLE[s.type] ?? s.type}</h3>
            {s.text && <p className="rich">{rich(s.text)}</p>}
            {s.stats.length > 0 && (
              <ul className="stat-list">
                {s.stats.map((l) => <li key={l.key} className={l.highlight ? 'hl' : ''}>{l.text}</li>)}
              </ul>
            )}
          </section>
        ))}
        {sections.length === 0 && <p className="dim">No stat text for this item in the assets data.</p>}

        {comps.length > 0 && (
          <section className="card-section">
            <h3>Upgrades from</h3>
            <p>{comps.map((c) => `${c.name} (${souls(c.cost)})`).join(', ')}</p>
          </section>
        )}

        {buildItem && (
          <section className="card-section">
            <h3>In this build</h3>
            <ul className="stat-list">
              <li>{buildItem.phase[0].toUpperCase() + buildItem.phase.slice(1)} game · buy at {souls(buildItem.runningTotal)} souls total
                {buildItem.upgradesFrom !== null && ` · pays ${souls(buildItem.netCost)} after its component`}</li>
              <li>Win rate {pct(buildItem.winRate, 1)} · pick rate {pct(buildItem.usage)} · usually bought ~{buildItem.avgBuyMin} min</li>
              <li>{buildItem.reason}</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
