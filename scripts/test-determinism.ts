// Runs the generator twice for every hero and checks the output is identical and well-formed.
import { generateBuilds } from '../src/generator/generate'
import { loadAnalytics, loadCatalog, loadHeroes } from './node-loader'

const catalog = loadCatalog()
let failures = 0
const fail = (msg: string) => { failures++; console.error('FAIL', msg) }

for (const hero of loadHeroes()) {
  const an = loadAnalytics(hero.id)
  for (const median of [null, 33.17]) {
    const a = JSON.stringify(generateBuilds(hero, catalog, an, { medianMatchMin: median }))
    const b = JSON.stringify(generateBuilds(hero, catalog, loadAnalytics(hero.id), { medianMatchMin: median }))
    if (a !== b) fail(`${hero.name}: reruns differ (median ${median})`)
  }
  const out = generateBuilds(hero, catalog, an, { medianMatchMin: null })
  if (out.builds.length < 2) fail(`${hero.name}: ${out.builds.length} builds`)
  for (const build of out.builds) {
    if (build.items.length < 12) fail(`${hero.name}/${build.name}: ${build.items.length} items`)
    if (build.abilityOrder.length !== 16) fail(`${hero.name}/${build.name}: ${build.abilityOrder.length} ability steps`)
    if (new Set(build.items.map((i) => i.id)).size !== build.items.length) fail(`${hero.name}/${build.name}: duplicate items`)
    if (!build.items.every((i) => catalog.find((c) => c.id === i.id)?.shopable)) fail(`${hero.name}/${build.name}: non-shopable item`)
    let prev = 0
    for (const i of build.items) { if (i.runningTotal < prev) fail(`${hero.name}/${build.name}: running total decreases`); prev = i.runningTotal }
  }
  console.log('ok', hero.name, out.builds.map((b) => `${b.items.length}i/${b.totalCost}`).join(' '))
}
if (failures) { console.error(`${failures} failure(s)`); process.exit(1) }
console.log('All heroes: deterministic, ≥2 builds, ≥12 items, 16 ability steps.')
