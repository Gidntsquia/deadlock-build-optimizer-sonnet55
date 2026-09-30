import type { Build, BuildItem, CatalogItem, Phase } from '../generator/types'
import type { BuildValidation } from '../validation/zergggy'
import { SLOT_LABEL, img, souls } from '../format'

const PHASES: { key: Phase; title: string; hint: string }[] = [
  { key: 'early', title: 'Early game', hint: 'laning phase' },
  { key: 'mid', title: 'Mid game', hint: 'first objectives, rotations' },
  { key: 'late', title: 'Late game', hint: 'team fights, closing out' },
]

interface Props {
  build: Build
  catalog: Map<number, CatalogItem>
  validation?: BuildValidation
  onOpenItem: (id: number) => void
}

export default function BuildView({ build, catalog, validation, onOpenItem }: Props) {
  return (
    <div className="buy-list">
      {PHASES.map((ph) => {
        const items = build.items.filter((i) => i.phase === ph.key)
        if (!items.length) return null
        const phaseCost = items.reduce((a, i) => a + i.netCost, 0)
        return (
          <section key={ph.key} className="phase" aria-label={ph.title}>
            <h3 className="phase-head">
              <span>{ph.title}</span>
              <small>{ph.hint} · {souls(phaseCost)} souls</small>
            </h3>
            <ul>
              {items.map((bi) => <ItemRow key={bi.id} bi={bi} item={catalog.get(bi.id)!} validation={validation} onOpen={onOpenItem} n={build.items.indexOf(bi) + 1} />)}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function ItemRow({ bi, item, validation, onOpen, n }: { bi: BuildItem; item: CatalogItem; validation?: BuildValidation; onOpen: (id: number) => void; n: number }) {
  const v = validation?.badges.get(bi.id)
  return (
    <li>
      <button className="item-row" data-item-id={bi.id} onClick={() => onOpen(bi.id)} aria-label={`${bi.name}, ${souls(bi.cost)} souls. Open details`}>
        <span className="item-n">{n}</span>
        <img className={`item-img slot-${bi.slot}`} src={img(item.image)} alt={bi.name} width={48} height={48} />
        <span className="item-main">
          <span className="item-name">{bi.name}</span>
          <span className="item-sub">T{bi.tier} · {SLOT_LABEL[bi.slot]}{bi.upgradesFrom !== null ? ' · upgrade' : ''}</span>
          {v && <span className={`badge ${v.badge}`}>{v.badge === 'core' ? 'Zergggy core' : 'Not core'}</span>}
        </span>
        <span className="item-cost">
          <b>{souls(bi.cost)}</b>
          <small>Σ {souls(bi.runningTotal)}</small>
        </span>
      </button>
    </li>
  )
}
