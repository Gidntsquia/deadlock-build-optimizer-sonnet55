import { generateBuilds } from '../src/generator/generate'
import { loadAnalytics, loadCatalog, loadHeroes } from './node-loader'
const id = Number(process.argv[2] ?? 1)
const hero = loadHeroes().find((h) => h.id === id)!
const out = generateBuilds(hero, loadCatalog(), loadAnalytics(id), { medianMatchMin: Number(process.argv[3]) || null })
console.log(out.heroName, out.kitNotes, 'budget', out.budget)
for (const b of out.builds) {
  console.log(`\n== ${b.name} total ${b.totalCost} (${b.items.length} items)`)
  for (const i of b.items) console.log(i.phase.padEnd(5), `T${i.tier}`, i.slot.slice(0, 3), String(i.cost).padStart(4), String(i.runningTotal).padStart(6), i.name.padEnd(24), i.score.toFixed(2), JSON.stringify(i.parts))
  console.log(b.abilityOrder.map((s) => `${s.abilityName.slice(0, 4)}${s.tier}`).join(' '), b.abilityOrderMatches, b.abilityOrderWinRate)
}
