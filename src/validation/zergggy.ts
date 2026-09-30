// Held-out validation against top player Zergggy (account 35187362).
//
// This is the ONLY module that reads the Zergggy snapshot. It runs after builds are generated and
// only scores them; nothing here feeds back into the generator.
//
// Core-set rule: an Infernus item is "core" when it is held (bought and not sold within 60s) in at
// least 30% of his sampled real-matchmaking matches, counting wins at full weight and losses at 0.5.
// Anything below that is an "experiment" and is excluded from the core set.
import zergData from '../../data/zergggy/infernus-purchases.json'
import catalogJson from '../../data/catalog.json'
import type { Build } from '../generator/types'

export const CORE_THRESHOLD = 0.3
export const LOSS_WEIGHT = 0.5
export const MIN_HOLD_S = 60
export const OVERLAP_SHARE = 0.7 // agreement = 70% item overlap (Dice) + 30% buy-order agreement
export const ORDER_SHARE = 0.3

interface ZMatch { match_id: number; won: boolean; items: { item_id: number; t: number; sold: number }[] }
const matches = (zergData as { matches: ZMatch[] }).matches
const shopable = new Set((catalogJson as { items: { id: number; shopable: boolean }[] }).items.filter((i) => i.shopable).map((i) => i.id))

export interface CoreItemInfo { id: number; weightedFreq: number; rawFreq: number; medianBuyS: number; core: boolean }
export interface CoreSet {
  matchCount: number
  wins: number
  threshold: number
  items: Map<number, CoreItemInfo>
  coreIds: number[]
}

export function computeCoreSet(): CoreSet {
  let totalW = 0, wins = 0
  const weighted = new Map<number, number>()
  const raw = new Map<number, number>()
  const times = new Map<number, number[]>()
  for (const m of matches) {
    const w = m.won ? 1 : LOSS_WEIGHT
    totalW += w
    if (m.won) wins++
    const first = new Map<number, number>()
    for (const i of m.items) {
      if (!shopable.has(i.item_id)) continue
      if (i.sold && i.sold - i.t < MIN_HOLD_S) continue
      if (!first.has(i.item_id)) first.set(i.item_id, i.t)
    }
    for (const [id, t] of first) {
      weighted.set(id, (weighted.get(id) ?? 0) + w)
      raw.set(id, (raw.get(id) ?? 0) + 1)
      if (!times.has(id)) times.set(id, [])
      times.get(id)!.push(t)
    }
  }
  const items = new Map<number, CoreItemInfo>()
  for (const [id, wf] of weighted) {
    const ts = [...times.get(id)!].sort((a, b) => a - b)
    items.set(id, {
      id, weightedFreq: wf / totalW, rawFreq: raw.get(id)! / matches.length,
      medianBuyS: ts[Math.floor(ts.length / 2)], core: wf / totalW >= CORE_THRESHOLD,
    })
  }
  const coreIds = [...items.values()].filter((i) => i.core).map((i) => i.id).sort((a, b) => a - b)
  return { matchCount: matches.length, wins, threshold: CORE_THRESHOLD, items, coreIds }
}

export type Badge = 'core' | 'not-core'
export interface ItemValidation { id: number; badge: Badge; weightedFreq: number; note: string }
export interface BuildValidation {
  buildKey: string
  badges: Map<number, ItemValidation>
  shared: number
  dice: number
  orderAgreement: number | null
  /** 0-100 */
  agreement: number
  missingCore: number[]
}

export function validateBuild(build: Build, core: CoreSet): BuildValidation {
  const ids = build.items.map((i) => i.id)
  const coreSet = new Set(core.coreIds)
  const badges = new Map<number, ItemValidation>()
  for (const id of ids) {
    const info = core.items.get(id)
    const isCore = coreSet.has(id)
    badges.set(id, {
      id, badge: isCore ? 'core' : 'not-core', weightedFreq: info?.weightedFreq ?? 0,
      note: isCore ? `in ${Math.round(info!.weightedFreq * 100)}% of his matches`
        : info ? `an experiment for him (${Math.round(info.weightedFreq * 100)}% of matches)` : 'he did not buy this',
    })
  }
  const sharedIds = ids.filter((id) => coreSet.has(id))
  const dice = ids.length + core.coreIds.length ? (2 * sharedIds.length) / (ids.length + core.coreIds.length) : 0

  // buy-order agreement: pairs of shared items that appear in the same relative order as his median buy time
  let concordant = 0, pairs = 0
  for (let a = 0; a < sharedIds.length; a++) {
    for (let b = a + 1; b < sharedIds.length; b++) {
      const ta = core.items.get(sharedIds[a])!.medianBuyS, tb = core.items.get(sharedIds[b])!.medianBuyS
      if (ta === tb) continue
      pairs++
      if (ta < tb) concordant++ // sharedIds are in build order, so a precedes b in the build
    }
  }
  const orderAgreement = pairs ? concordant / pairs : null
  const agreement = 100 * (OVERLAP_SHARE * dice + ORDER_SHARE * (orderAgreement ?? 0))
  return {
    buildKey: build.key, badges, shared: sharedIds.length, dice, orderAgreement, agreement,
    missingCore: core.coreIds.filter((id) => !ids.includes(id)),
  }
}
