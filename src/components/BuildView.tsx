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
            <ul className="tiles">
              {items.map((bi) => <ItemRow key={bi.id} bi={bi} item={catalog.get(bi.id)!} validation={validation} onOpen={onOpenItem} n={build.items.indexOf(bi) + 1} />)}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

const ROMAN = ['', 'I', 'II', 'III', 'IV']

function ItemRow({ bi, item, validation, onOpen, n }: { bi: BuildItem; item: CatalogItem; validation?: BuildValidation; onOpen: (id: number) => void; n: number }) {
  const v = validation?.badges.get(bi.id)
  return (
    <li>
      <button className={`tile slot-${bi.slot}${v?.badge === 'not-core' ? ' off-core' : ''}`} data-item-id={bi.id} onClick={() => onOpen(bi.id)}
        aria-label={`${n}. ${bi.name}, ${souls(bi.cost)} souls${v ? (v.badge === 'core' ? ', Zergggy core item' : ', not in Zergggy core set') : ''}. Open details`}>
        <span className="tile-art">
          <img src={img(item.image)} alt="" width={64} height={64} />
          <span className="tile-tier" aria-hidden="true">{ROMAN[bi.tier] ?? bi.tier}</span>
          {bi.upgradesFrom !== null && <span className="tile-up" aria-hidden="true">▲</span>}
          {v?.badge === 'core' && <span className="tile-core" aria-hidden="true">★</span>}
        </span>
        <span className="tile-name">{bi.name}</span>
        <span className="tile-cost">{souls(bi.cost)}</span>
      </button>
    </li>
  )
}
