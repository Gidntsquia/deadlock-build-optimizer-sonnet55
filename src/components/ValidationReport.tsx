import type { Build, CatalogItem } from '../generator/types'
import type { BuildValidation, CoreSet } from '../validation/zergggy'
import { pct } from '../format'

interface Props {
  build: Build
  validation: BuildValidation
  core: CoreSet
  catalog: Map<number, CatalogItem>
  onOpenItem: (id: number) => void
}

export default function ValidationReport({ build, validation, core, catalog, onOpenItem }: Props) {
  const ids = new Set(build.items.map((i) => i.id))
  return (
    <div className="validation">
      <p className="dim small">
        Held-out check: how well the generator did against top player Zergggy. His data was never used to build this list.
      </p>
      <div className="agree-row">
        <div className="agree-big" aria-label={`Agreement ${validation.agreement.toFixed(0)} percent`}>{validation.agreement.toFixed(0)}%</div>
        <div className="agree-meta">
          <div>Item overlap: <b>{validation.shared}</b> of {core.coreIds.length} core items in this build ({pct(validation.dice)} Dice)</div>
          <div>Buy-order agreement: <b>{validation.orderAgreement === null ? 'n/a' : pct(validation.orderAgreement)}</b> of shared pairs in his order</div>
        </div>
      </div>
      <h4>His core set ({core.coreIds.length} items, in ≥{Math.round(core.threshold * 100)}% of {core.matchCount} matches)</h4>
      <div className="chips wrap">
        {core.coreIds.map((id) => {
          const it = catalog.get(id)
          if (!it) return null
          const inBuild = ids.has(id)
          return (
            <button key={id} className={`chip btn ${inBuild ? 'ok' : 'miss'}`} onClick={() => onOpenItem(id)}>
              {inBuild ? '✓' : '✗'} {it.name}
            </button>
          )
        })}
      </div>
      <p className="dim small">✓ in this build · ✗ missing. Items below {Math.round(core.threshold * 100)}% are his experiments and are excluded.</p>
    </div>
  )
}
