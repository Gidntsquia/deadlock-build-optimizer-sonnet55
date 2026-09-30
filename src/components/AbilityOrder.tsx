import type { Build, Hero } from '../generator/types'
import { img, pct } from '../format'

export default function AbilityOrder({ hero, build }: { hero: Hero; build: Build }) {
  const steps = build.abilityOrder
  if (!steps.length) return <p className="dim">No ability-order data for this hero.</p>
  const rows = hero.abilities.map((a) => ({ a, steps: steps.filter((s) => s.abilityId === a.id) })).filter((r) => r.steps.length)
  const cols = steps.length
  return (
    <div className="ability-order">
      <p className="dim small">
        From the most successful real ability orders ({build.abilityOrderMatches.toLocaleString('en-US')} matches, {pct(build.abilityOrderWinRate, 1)} shrunk win rate).
      </p>
      <div className="ap-panel" role="table" aria-label="Ability point order">
        <div className="ap-scroll">
          {rows.map(({ a, steps: ss }, r) => (
            <div key={a.id} className={`ap-row${r % 2 ? ' alt' : ''}`} role="row" aria-label={`${a.name}: ${ss.map((s) => (s.kind === 'unlock' ? `unlock at point ${s.step}` : `tier ${s.tier} at point ${s.step}`)).join(', ')}`}>
              <img className="ap-icon" src={img(a.image)} alt="" width={34} height={34} title={a.name} />
              <div className="ap-track" style={{ gridTemplateColumns: `repeat(${cols}, minmax(var(--pip), 1fr))` }}>
                {ss.map((s) => (
                  <span key={s.step} className={`pip ${s.kind}`} style={{ gridColumn: s.step }} title={`${a.name}: ${s.kind === 'unlock' ? 'unlock' : 'tier ' + s.tier} (point ${s.step})`}>
                    {s.kind === 'unlock' ? '⚡' : <><i aria-hidden="true">◆</i>{s.tier}</>}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="ap-row axis" aria-hidden="true">
            <span className="ap-icon" />
            <div className="ap-track" style={{ gridTemplateColumns: `repeat(${cols}, minmax(var(--pip), 1fr))` }}>
              {steps.map((s) => <span key={s.step} className="axis-n">{s.step}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
