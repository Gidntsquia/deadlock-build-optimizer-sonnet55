// Deterministic build generator.
//
// Inputs (all aggregate data, never per-player match data for validation):
//   - item catalog + hero data (assets API snapshots)
//   - per-hero item-stats (all ranks and high-badge), ability-order-stats, pair (permutation) stats
//   - optional personalization: the player's median match length
// Output: one named build, each with an ordered buy list (early/mid/late, running soul total)
// and an ability level-up order. No randomness, no clock, no I/O: same inputs => same output.

import {
  ARCHETYPES, BUDGET_SLACK, DEFAULT_MATCH_MIN, FLEX_ITEMS, HIGH_SKILL_MIN_MATCHES, MAX_ACTIVES, MAX_TIER5,
  MIN_CANDIDATE_MATCHES, MIN_CANDIDATE_USAGE, MIN_ITEMS, MIN_ITEM_COST, PAIR_MIN_MATCHES, PHASE_SPLIT,
  SOULS_PER_MIN, STAT_POINTS, TIER_CAPS, WEIGHTS, WR_LIFT_SCALE_PP, WR_PRIOR, tierGroup,
  type Archetype,
} from './config'
import type {
  AbilityOrderStat, AbilityStep, Build, BuildItem, CatalogItem, GeneratedBuilds, GeneratorOptions, Hero,
  HeroAnalytics, ItemStat, PairStat, Phase, ScoreParts, Slot,
} from './types'

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d

// ------------------------------------------------------------------ hero kit analysis

export interface Kit {
  dot: boolean // has a damage-over-time ability (burn, trail, bleed)
  weaponHit: boolean // an ability is fed by weapon hits
  rapid: boolean // rapid-fire weapon (fire rate scaling)
  abilityDamageShare: number // share of the 4 abilities that deal damage
  techPerLevel: number
  mult: Record<string, number> // per-stat multiplier derived from the kit
  notes: string[]
}

const DOT_KEYS = /^(DPS|BurnDuration|DotDuration|GroundFlameDuration|DotHealthPercent|BleedDPS)/
const DAMAGE_KEYS = /^(DPS|Damage|ExplosionDamage|BurstDamage|SpiritDamage|ImpactDamage|TechDamage)/
const WEAPON_HIT_KEYS = /BuildUp|PerHit|PerBullet|OnHit/i

export function analyseKit(hero: Hero): Kit {
  let dot = false, weaponHit = false, damaging = 0
  for (const a of hero.abilities) {
    const keys = [...Object.keys(a.props), ...a.upgrades.flat().map((u) => u.name)]
    if (keys.some((k) => DOT_KEYS.test(k)) || /over time/i.test(a.description)) dot = true
    if (keys.some((k) => WEAPON_HIT_KEYS.test(k)) || /weapon hits?/i.test(a.description)) weaponHit = true
    if (keys.some((k) => DAMAGE_KEYS.test(k))) damaging++
  }
  const rapid = /rapid/i.test(hero.gun_tag || '')
  const abilityDamageShare = hero.abilities.length ? damaging / hero.abilities.length : 0.5
  const techPerLevel = hero.level_up?.MODIFIER_VALUE_TECH_POWER ?? 0
  const mult: Record<string, number> = {}
  const notes: string[] = []
  if (rapid) {
    mult.BonusFireRate = 1.35; mult.BonusClipSizePercent = 1.25; mult.ReloadSpeedMultipler = 1.2
    notes.push(`${hero.gun_tag} weapon: fire rate and ammo stats weighted up (x1.35 / x1.25)`)
  }
  if (weaponHit) {
    mult.BaseAttackDamagePercent = 1.1
    notes.push('An ability is fed by weapon hits: weapon damage weighted up (x1.1)')
  }
  if (dot) {
    mult.BonusAbilityDurationPercent = 1.6; mult.DPS = 1.3
    notes.push('Damage-over-time ability: ability duration weighted up (x1.6), item DPS (x1.3)')
  }
  const spiritMult = round(0.8 + 0.6 * abilityDamageShare, 2)
  mult.TechPower = spiritMult; mult.SpiritPower = spiritMult; mult.BonusSpirit = spiritMult
  notes.push(`${Math.round(abilityDamageShare * 100)}% of abilities deal damage: spirit power weighted x${spiritMult}` +
    (techPerLevel ? ` (+${techPerLevel} spirit power per level)` : ''))
  return { dot, weaponHit, rapid, abilityDamageShare, techPerLevel, mult, notes }
}

// ------------------------------------------------------------------ item statistics

interface Row {
  item: CatalogItem
  wins: number
  matches: number
  avgBuyS: number
  usage: number // matches / hero's most-bought item (same source)
  baseWr: number // tier baseline win rate (same source)
  wr: number // shrunk win rate
  lift: number // tier-normalised win-rate lift, in score units
}

/** Match-weighted mean win rate per tier within one stats source. */
function tierBaselines(rows: { tier: number; wins: number; matches: number }[]): Map<number, number> {
  const acc = new Map<number, [number, number]>()
  for (const r of rows) {
    const g = tierGroup(r.tier)
    const a = acc.get(g) ?? [0, 0]
    a[0] += r.wins; a[1] += r.matches
    acc.set(g, a)
  }
  return new Map([...acc].map(([g, [w, m]]) => [g, m ? w / m : 0.5]))
}

function buildRows(catalog: Map<number, CatalogItem>, an: HeroAnalytics): Row[] {
  const mk = (stats: ItemStat[]) => {
    const tiered = stats.flatMap((s) => { const it = catalog.get(s.item_id); return it && it.shopable ? [{ s, it }] : [] })
    const base = tierBaselines(tiered.map(({ s, it }) => ({ tier: it.tier, wins: s.wins, matches: s.matches })))
    const maxM = Math.max(1, ...tiered.map(({ s }) => s.matches))
    return new Map(tiered.map(({ s, it }) => [s.item_id, { s, it, base: base.get(tierGroup(it.tier)) ?? 0.5, maxM }]))
  }
  const all = mk(an.all), high = mk(an.high)
  const rows: Row[] = []
  for (const id of [...all.keys()].sort((a, b) => a - b)) {
    const h = high.get(id)
    const src = h && h.s.matches >= HIGH_SKILL_MIN_MATCHES ? h : all.get(id)!
    const { s, it, base, maxM } = src
    const wr = (s.wins + WR_PRIOR * base) / (s.matches + WR_PRIOR)
    rows.push({
      item: it, wins: s.wins, matches: s.matches, avgBuyS: s.avg_buy_time_s, usage: s.matches / maxM,
      baseWr: base, wr, lift: clamp(((wr - base) * 100) / WR_LIFT_SCALE_PP, -2, 2),
    })
  }
  return rows
}

function parseNum(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : NaN
}

/** Stat points of an item under an archetype and a hero kit. */
function statPoints(item: CatalogItem, arch: Archetype | null, kit: Kit | null): { total: number; base: number } {
  let total = 0, base = 0
  for (const [key, prop] of Object.entries(item.props)) {
    const entry = STAT_POINTS[key]
    if (!entry) continue
    const v = parseNum(prop.value)
    if (Number.isNaN(v)) continue
    const [pts, cat] = entry
    const raw = pts * v
    base += raw * (arch ? arch.mult[cat] : 1)
    total += raw * (arch ? arch.mult[cat] : 1) * (kit?.mult[key] ?? 1)
  }
  return { total, base }
}

const meanStd = (xs: number[]): [number, number] => {
  if (!xs.length) return [0, 1]
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length
  return [m, Math.sqrt(v) || 1]
}

// ------------------------------------------------------------------ build assembly

interface Scored {
  row: Row
  parts: Omit<ScoreParts, 'syn'>
  baseScore: number
}

function pairLiftMap(pairs: PairStat[], allStats: ItemStat[]) {
  const wr = new Map(allStats.map((s) => [s.item_id, s.matches ? s.wins / s.matches : 0.5]))
  const out = new Map<string, number>()
  for (const p of pairs) {
    if (p.matches < PAIR_MIN_MATCHES) continue
    const [a, b] = p.item_ids
    const wa = wr.get(a), wb = wr.get(b)
    if (wa === undefined || wb === undefined) continue
    const lift = clamp((((p.wins / p.matches) - (wa + wb) / 2) * 100) / WR_LIFT_SCALE_PP, -1, 1)
    out.set(a < b ? `${a}:${b}` : `${b}:${a}`, lift)
  }
  return out
}

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

function hasPassive(it: CatalogItem) {
  return !!it.description_passive || it.tooltip_sections.some((s) => s.type === 'passive')
}

function buildOne(
  arch: Archetype, kit: Kit, rows: Row[], catalog: Map<number, CatalogItem>,
  pairLift: Map<string, number>, budget: number, ability: { steps: AbilityStep[]; matches: number; wr: number },
): Build {
  // ---- static per-item score components
  const eligible = rows.filter((r) => r.matches >= MIN_CANDIDATE_MATCHES && r.usage >= MIN_CANDIDATE_USAGE && r.item.cost >= MIN_ITEM_COST)
  const pts = eligible.map((r) => ({ r, ...statPoints(r.item, arch, kit) }))
  // value per 1000 souls, z-scored inside the tier so cheap and expensive items compare fairly
  const vps = new Map<number, number>()
  const kitFit = new Map<number, number>()
  for (const g of [1, 2, 3, 4]) {
    const grp = pts.filter((p) => tierGroup(p.r.item.tier) === g)
    const vals = grp.map((p) => (p.total / p.r.item.cost) * 1000)
    const [m, sd] = meanStd(vals)
    grp.forEach((p, i) => {
      vps.set(p.r.item.id, clamp((vals[i] - m) / sd, -2, 2))
      const denom = Math.max(1, Math.abs(p.base))
      kitFit.set(p.r.item.id, clamp((p.total - p.base) / denom, 0, 1) * 2)
    })
  }
  const scored: Scored[] = eligible.map((r) => {
    const act = (r.item.is_active && r.item.tier >= 3 ? 0.5 : 0) + (hasPassive(r.item) && r.item.tier >= 3 ? 0.25 : 0)
    const parts = {
      wr: r.lift,
      use: clamp(Math.sqrt(r.usage), 0, 1) * 2,
      val: vps.get(r.item.id) ?? 0,
      kit: kitFit.get(r.item.id) ?? 0,
      act,
    }
    const baseScore = WEIGHTS.wr * parts.wr + WEIGHTS.use * parts.use + WEIGHTS.val * parts.val + WEIGHTS.kit * parts.kit + WEIGHTS.act * parts.act
    return { row: r, parts, baseScore }
  })

  // ---- greedy selection with slot quotas, tier caps and a soul budget
  const chosen: Scored[] = []
  const slotCount: Record<Slot, number> = { weapon: 0, vitality: 0, spirit: 0 }
  const tierCount: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  let tier5 = 0, actives = 0, flexLeft = FLEX_ITEMS, spent = 0
  const maxItems = MIN_ITEMS + FLEX_ITEMS
  const nameById = new Map([...catalog.values()].map((i) => [i.class_name, i.id]))
  const netCostOf = (it: CatalogItem, have: Set<number>) => {
    const comp = it.components.map((c) => nameById.get(c)).find((id) => id !== undefined && have.has(id))
    return comp ? it.cost - (catalog.get(comp)?.cost ?? 0) : it.cost
  }

  const synOf = (id: number) => {
    if (!chosen.length) return 0
    let sum = 0, n = 0
    for (const c of chosen) {
      const l = pairLift.get(pairKey(id, c.row.item.id))
      if (l !== undefined) { sum += l; n++ }
    }
    return n ? sum / n : 0
  }

  const cheapestFill = (need: number, tc: Record<number, number>) => {
    // cheapest way to fill `need` more items while respecting remaining tier caps
    let cost = 0
    for (const g of [1, 2, 3, 4]) {
      const room = Math.max(0, (TIER_CAPS[g] ?? 0) - (tc[g] ?? 0))
      const take = Math.min(need, room)
      cost += take * (g === 1 ? 800 : g === 2 ? 1600 : g === 3 ? 3200 : 6400)
      need -= take
    }
    return need > 0 ? Infinity : cost
  }

  while (chosen.length < maxItems) {
    const have = new Set(chosen.map((c) => c.row.item.id))
    let best: { s: Scored; total: number; net: number; usedFlex: boolean } | null = null
    // Pass 1 honours slot quotas. If that leaves the build under MIN_ITEMS, pass 2 lifts the quota so
    // the build can still reach the minimum (happens for heroes whose candidate pool is thin in one slot).
    for (const relaxed of [false, true]) {
    if (relaxed && (best || chosen.length >= MIN_ITEMS)) break
    for (const s of scored) {
      const it = s.row.item
      if (have.has(it.id)) continue
      const g = tierGroup(it.tier)
      if ((tierCount[g] ?? 0) >= (TIER_CAPS[g] ?? 0)) continue
      if (it.tier >= 5 && tier5 >= MAX_TIER5) continue
      if (it.is_active && actives >= MAX_ACTIVES) continue
      const inQuota = slotCount[it.slot] < arch.quota[it.slot]
      if (!inQuota && !relaxed && (flexLeft <= 0 || chosen.length < MIN_ITEMS)) continue
      const net = netCostOf(it, have)
      const tc = { ...tierCount, [g]: (tierCount[g] ?? 0) + 1 }
      const remaining = Math.max(0, MIN_ITEMS - chosen.length - 1)
      if (spent + net + cheapestFill(remaining, tc) > budget * BUDGET_SLACK && chosen.length < MIN_ITEMS) continue
      if (chosen.length >= MIN_ITEMS && spent + net > budget * BUDGET_SLACK) continue
      const total = s.baseScore + WEIGHTS.syn * synOf(it.id)
      if (!best || total > best.total + 1e-12 || (Math.abs(total - best.total) <= 1e-12 && it.id < best.s.row.item.id)) {
        best = { s, total, net, usedFlex: !inQuota }
      }
    }
    }
    if (!best) break
    if (chosen.length >= MIN_ITEMS && best.total < 0.5) break // extra flex items must earn their slot
    const it = best.s.row.item
    chosen.push(best.s)
    slotCount[it.slot]++
    const g = tierGroup(it.tier)
    tierCount[g] = (tierCount[g] ?? 0) + 1
    if (it.tier >= 5) tier5++
    if (it.is_active) actives++
    if (best.usedFlex) flexLeft--
    spent += best.net
  }

  // ---- buy order: expected purchase time from aggregate data, blended with the tier's typical time
  const tierTimes = new Map<number, number[]>()
  for (const r of rows) {
    const g = tierGroup(r.item.tier)
    if (!tierTimes.has(g)) tierTimes.set(g, [])
    tierTimes.get(g)!.push(r.avgBuyS)
  }
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0 }
  const tierTime = (g: number) => median(tierTimes.get(g) ?? [])
  const expected = new Map<number, number>()
  for (const c of chosen) {
    expected.set(c.row.item.id, 0.65 * c.row.avgBuyS + 0.35 * tierTime(tierGroup(c.row.item.tier)))
  }
  // a component must come before the item that consumes it
  for (const c of chosen) {
    for (const comp of c.row.item.components) {
      const id = nameById.get(comp)
      if (id !== undefined && expected.has(id)) expected.set(c.row.item.id, Math.max(expected.get(c.row.item.id)!, expected.get(id)! + 1))
    }
  }
  const ordered = [...chosen].sort((a, b) =>
    expected.get(a.row.item.id)! - expected.get(b.row.item.id)! || a.row.item.tier - b.row.item.tier || a.row.item.id - b.row.item.id)

  const items: BuildItem[] = []
  const owned = new Set<number>()
  let running = 0
  for (const c of ordered) {
    const it = c.row.item
    const net = netCostOf(it, owned)
    running += net
    owned.add(it.id)
    const phase: Phase = running <= budget * PHASE_SPLIT.early ? 'early' : running <= budget * PHASE_SPLIT.mid ? 'mid' : 'late'
    const syn = synOf(it.id)
    const total = c.baseScore + WEIGHTS.syn * syn
    const comp = it.components.map((n) => nameById.get(n)).find((id) => id !== undefined && owned.has(id) && id !== it.id)
    items.push({
      id: it.id, name: it.name, slot: it.slot, tier: it.tier, cost: it.cost, netCost: net, phase, runningTotal: running,
      upgradesFrom: comp !== undefined && net !== it.cost ? comp : null,
      score: round(total), parts: { ...roundParts(c.parts), syn: round(syn) },
      winRate: round(c.row.wr, 4), usage: round(c.row.usage, 4), avgBuyMin: round(c.row.avgBuyS / 60, 1),
      reason: explain(c),
    })
  }
  // Ensure every phase is non-empty when there are enough items (early/mid/late grouping).
  ensurePhases(items)

  return {
    key: arch.key, name: arch.name(kit.dot), blurb: arch.blurb, items, totalCost: running, budget: Math.round(budget),
    abilityOrder: ability.steps, abilityOrderMatches: ability.matches, abilityOrderWinRate: round(ability.wr, 4),
  }
}

function roundParts(p: Omit<ScoreParts, 'syn'>) {
  return { wr: round(p.wr), use: round(p.use), val: round(p.val), kit: round(p.kit), act: round(p.act) }
}

function ensurePhases(items: BuildItem[]) {
  if (items.length < 6) return
  const n = items.length
  const count = (p: Phase) => items.filter((i) => i.phase === p).length
  // move the boundary item if a phase is empty (only possible with very small budgets)
  if (count('early') === 0) items[0].phase = 'early'
  if (count('late') === 0) items[n - 1].phase = 'late'
  if (count('mid') === 0) items[Math.floor(n / 2)].phase = 'mid'
  // keep phases monotonic in buy order
  const rank = { early: 0, mid: 1, late: 2 } as const
  for (let i = 1; i < n; i++) if (rank[items[i].phase] < rank[items[i - 1].phase]) items[i].phase = items[i - 1].phase
}

function explain(c: Scored): string {
  const bits: string[] = []
  const pp = ((c.row.wr - c.row.baseWr) * 100)
  bits.push(`${pp >= 0 ? '+' : ''}${pp.toFixed(1)}pp win rate vs tier average`)
  bits.push(`${Math.round(c.row.usage * 100)}% pick rate`)
  if (c.parts.val > 0.5) bits.push('strong stats per soul')
  if (c.parts.kit > 0.3) bits.push('fits the hero kit')
  if (c.parts.act > 0) bits.push(c.row.item.is_active ? 'active effect' : 'passive effect')
  return bits.join(' · ')
}

// ------------------------------------------------------------------ ability order

const wilsonFree = (wins: number, matches: number, p0: number, k = 200) => (wins + k * p0) / (matches + k)

function abilityFocusId(hero: Hero, focus: 'weapon' | 'spirit' | 'balanced'): number | null {
  if (focus === 'balanced') return null
  let best: { id: number; score: number } | null = null
  for (const a of hero.abilities) {
    const keys = [...Object.keys(a.props), ...a.upgrades.flat().map((u) => u.name)]
    const dmg = keys.filter((k) => DAMAGE_KEYS.test(k)).length
    const weap = keys.filter((k) => WEAPON_HIT_KEYS.test(k)).length + (/weapon/i.test(a.description) ? 2 : 0)
    const score = focus === 'spirit' ? dmg - 0.5 * weap : weap * 2 - 0.3 * dmg
    if (!best || score > best.score || (score === best.score && a.id < best.id)) best = { id: a.id, score }
  }
  return best && best.score > 0 ? best.id : null
}

function pickAbilityOrder(hero: Hero, orders: AbilityOrderStat[], focus: 'weapon' | 'spirit' | 'balanced', used: Set<string>) {
  const ids = new Set(hero.abilities.map((a) => a.id))
  const valid = orders.filter((o) => o.abilities.length >= 14 && o.abilities.every((x) => ids.has(x)) && o.matches >= 40)
  const totalW = orders.reduce((a, o) => a + o.wins, 0), totalM = orders.reduce((a, o) => a + o.matches, 0)
  const p0 = totalM ? totalW / totalM : 0.5
  const focusId = abilityFocusId(hero, focus)
  const ranked = valid.map((o) => {
    const wr = wilsonFree(o.wins, o.matches, p0)
    // share of the first 8 points spent on the focus ability
    const align = focusId === null ? 0 : o.abilities.slice(0, 8).filter((x) => x === focusId).length / 8
    const complete = o.abilities.length >= 16 ? 0.004 : 0 // prefer orders that finish all 16 points
    return { o, score: (wr - p0) * 100 / 2 + (focusId === null ? 0 : 0.6 * align) + complete * 100, wr }
  }).sort((a, b) => b.score - a.score || b.o.matches - a.o.matches || a.o.abilities.join().localeCompare(b.o.abilities.join()))
  const pick = ranked.find((r) => !used.has(r.o.abilities.join(','))) ?? ranked[0]
  return pick ? { order: pick.o, wr: pick.wr } : null
}

function toSteps(hero: Hero, order: number[]): AbilityStep[] {
  const names = new Map(hero.abilities.map((a) => [a.id, a.name]))
  const seen = new Map<number, number>()
  return order.map((id, i) => {
    const n = seen.get(id) ?? 0
    seen.set(id, n + 1)
    return { step: i + 1, abilityId: id, abilityName: names.get(id) ?? String(id), kind: n === 0 ? 'unlock' : 'upgrade', tier: n }
  })
}

// ------------------------------------------------------------------ entry point

export function generateBuilds(
  hero: Hero, catalogItems: CatalogItem[], analytics: HeroAnalytics, options: GeneratorOptions = {},
): GeneratedBuilds {
  const catalog = new Map(catalogItems.map((i) => [i.id, i]))
  const kit = analyseKit(hero)
  const rows = buildRows(catalog, analytics)
  const pairLift = pairLiftMap(analytics.pairs, analytics.all)
  const medianMin = options.medianMatchMin && options.medianMatchMin > 5 ? options.medianMatchMin : DEFAULT_MATCH_MIN
  const budget = SOULS_PER_MIN * medianMin

  // Every archetype is built, then the one whose items score best on aggregate data (mean item score)
  // is kept. Ties go to the earlier archetype. Nothing here looks at any single player's matches.
  const candidates: Build[] = []
  for (const arch of ARCHETYPES) {
    const pick = pickAbilityOrder(hero, analytics.orders, arch.abilityFocus, new Set())
    const ability = pick
      ? { steps: toSteps(hero, pick.order.abilities), matches: pick.order.matches, wr: pick.wr }
      : { steps: [], matches: 0, wr: 0 }
    candidates.push(buildOne(arch, kit, rows, catalog, pairLift, budget, ability))
  }
  const mean = (b: Build) => b.items.reduce((a, i) => a + i.score, 0) / Math.max(1, b.items.length)
  const best = candidates.reduce((a, b) => (mean(b) > mean(a) + 1e-12 ? b : a))
  const builds = [best]
  return { heroId: hero.id, heroName: hero.name, kitNotes: kit.notes, medianMatchMin: medianMin, budget, builds }
}
