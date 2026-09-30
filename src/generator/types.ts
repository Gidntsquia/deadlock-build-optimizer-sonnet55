// Shapes of the snapshot files written by scripts/fetch-data.mjs plus the generator's output.

export type Slot = 'weapon' | 'vitality' | 'spirit'

export interface ItemProp { value: string; label: string; postfix: string; prefix: string; conditional: string; css: string }
export interface TooltipAttr { text: string; properties: string[]; important: string[]; elevated: string[] }
export interface TooltipSection { type: string; attrs: TooltipAttr[] }

export interface CatalogItem {
  id: number
  class_name: string
  name: string
  slot: Slot
  tier: number
  cost: number
  shopable: boolean
  disabled: boolean
  activation: string
  is_active: boolean
  description: string
  description_passive: string
  description_active: string
  components: string[] // class_names of component items
  tooltip_sections: TooltipSection[]
  props: Record<string, ItemProp>
  image: string | null
}

export interface HeroAbility {
  slot: string
  id: number
  class_name: string
  name: string
  description: string
  upgrades: { name: string; bonus: string }[][]
  props: Record<string, { value: string; label: string; postfix: string }>
  image: string | null
}

export interface Hero {
  id: number
  name: string
  class_name: string
  hero_type: string
  gun_tag: string
  tags: string[]
  role: string
  playstyle: string
  image: string | null
  image_small: string | null
  starting_stats: Record<string, number>
  level_up: Record<string, number>
  abilities: HeroAbility[]
}

export interface ItemStat {
  item_id: number
  wins: number
  losses: number
  matches: number
  avg_buy_time_s: number
  avg_sell_time_s: number
}
export interface AbilityOrderStat { abilities: number[]; wins: number; losses: number; matches: number }
export interface PairStat { item_ids: [number, number]; wins: number; losses: number; matches: number }

/** Aggregate analytics for one hero — the generator's only match-data input. */
export interface HeroAnalytics {
  all: ItemStat[]
  high: ItemStat[]
  orders: AbilityOrderStat[]
  pairs: PairStat[]
}

export interface GeneratorOptions {
  /** Player's median match length in minutes (personalization). Defaults to DEFAULT_MATCH_MIN. */
  medianMatchMin?: number | null
}

export type Phase = 'early' | 'mid' | 'late'

export interface ScoreParts { wr: number; use: number; val: number; kit: number; syn: number; act: number }

export interface BuildItem {
  id: number
  name: string
  slot: Slot
  tier: number
  cost: number
  /** Souls actually paid (cost minus a consumed component). */
  netCost: number
  phase: Phase
  runningTotal: number
  upgradesFrom: number | null
  score: number
  parts: ScoreParts
  winRate: number
  usage: number
  avgBuyMin: number
  reason: string
}

export interface AbilityStep {
  step: number
  abilityId: number
  abilityName: string
  kind: 'unlock' | 'upgrade'
  /** 0 for the unlock, 1-3 for upgrade tiers. */
  tier: number
}

export interface Build {
  key: string
  name: string
  blurb: string
  items: BuildItem[]
  totalCost: number
  budget: number
  abilityOrder: AbilityStep[]
  abilityOrderMatches: number
  abilityOrderWinRate: number
}

export interface GeneratedBuilds {
  heroId: number
  heroName: string
  kitNotes: string[]
  medianMatchMin: number
  budget: number
  builds: Build[]
}
