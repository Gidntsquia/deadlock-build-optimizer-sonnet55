import type { AbilityStep, Build, Hero } from '../generator/types'
import { img, pct } from '../format'

export default function AbilityOrder({ hero, build }: { hero: Hero; build: Build }) {
  const steps = build.abilityOrder
  if (!steps.length) return <p className="dim">No ability-order data for this hero.</p>
  const idx = new Map(hero.abilities.map((a, i) => [a.id, i]))
  const unlocks = steps.filter((s) => s.kind === 'unlock')
  const byAbility = hero.abilities.map((a) => ({ a, steps: steps.filter((s) => s.abilityId === a.id) }))
  const label = (s: AbilityStep) => (s.kind === 'unlock' ? 'Unlock' : `Tier ${s.tier}`)
  return (
    <div className="ability-order">
      <p className="dim small">
        From the most successful real ability orders ({build.abilityOrderMatches.toLocaleString('en-US')} matches, {pct(build.abilityOrderWinRate, 1)} shrunk win rate).
      </p>
      <h4>Unlock order</h4>
      <ol className="unlock-list">
        {unlocks.map((s) => {
          const a = hero.abilities[idx.get(s.abilityId) ?? 0]
          return (
            <li key={s.step} className={`ab-c${idx.get(s.abilityId)}`}>
              <img src={img(a?.image)} alt="" width={32} height={32} />
              <span>{s.abilityName}</span>
              <small>point {s.step}</small>
            </li>
          )
        })}
      </ol>
      <h4>Level-up sequence</h4>
      <ol className="step-grid" aria-label="Ability level-up sequence">
        {steps.map((s) => (
          <li key={s.step} className={`step ab-c${idx.get(s.abilityId)} ${s.kind}`}>
            <span className="step-n">{s.step}</span>
            <span className="step-name">{s.abilityName}</span>
            <span className="step-kind">{label(s)}</span>
          </li>
        ))}
      </ol>
      <h4>Upgrade tiers per ability</h4>
      <ul className="tier-table">
        {byAbility.map(({ a, steps: ss }) => (
          <li key={a.id} className={`ab-c${idx.get(a.id)}`}>
            <img src={img(a.image)} alt="" width={28} height={28} />
            <b>{a.name}</b>
            <span>
              {ss.map((s) => `${s.kind === 'unlock' ? 'Unlock' : 'T' + s.tier} #${s.step}`).join(' · ') || 'not leveled'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
