// Every tunable number in the generator lives here and is documented in the README.
// These were fixed from game-design reasoning and aggregate-data sanity checks BEFORE
// any comparison against the held-out validation data; they are not tuned to it.

import type { Slot } from './types'

export const WEIGHTS = {
  wr: 1.0, // tier-normalised win-rate lift
  use: 5.0, // usage (pick) rate
  val: 0.7, // stat value per soul, tier-normalised
  kit: 0.6, // fit with the hero's kit (stat multipliers from assets data)
  syn: 0.5, // pair synergy with items already chosen (permutation stats)
  act: 0.3, // active / passive effect bonus
} as const

export const DEFAULT_MATCH_MIN = 32 // used when no personal match history is supplied
export const SOULS_PER_MIN = 1150 // total-souls-by-minute estimate used to size the budget
export const BUDGET_SLACK = 1.08 // final build may exceed the budget by 8%
export const PHASE_SPLIT = { early: 0.14, mid: 0.46 } as const // share of total budget
export const WR_PRIOR = 300 // matches of shrinkage toward the tier baseline
export const WR_LIFT_SCALE_PP = 2.0 // 2 percentage points of lift = 1.0 score unit
export const HIGH_SKILL_MIN_MATCHES = 400 // use the high-badge row for an item when it has this many matches
export const MIN_CANDIDATE_MATCHES = 300
export const MIN_CANDIDATE_USAGE = 0.01 // at least 1% of the hero's most-bought item
export const PAIR_MIN_MATCHES = 300
export const MIN_ITEMS = 12
export const FLEX_ITEMS = 2 // extra items above the 12 base slots if budget allows
export const MIN_ITEM_COST = 800

/** Max items per tier group (T4 and T5 share a cap). */
export const TIER_CAPS: Record<number, number> = { 1: 3, 2: 4, 3: 4, 4: 3 }
export const tierGroup = (tier: number) => (tier >= 4 ? 4 : tier)
/** T5 ("legendary") items are capped at one per build. */
export const MAX_TIER5 = 1
export const MAX_ACTIVES = 2

export interface Archetype {
  key: string
  name: (dot: boolean) => string
  blurb: string
  quota: Record<Slot, number>
  /** Multiplier on stat points by category. */
  mult: Record<'weapon' | 'spirit' | 'vitality', number>
  abilityFocus: 'weapon' | 'spirit' | 'balanced'
}

export const ARCHETYPES: Archetype[] = [
  {
    key: 'gun', name: () => 'Gun Damage',
    blurb: 'Weapon damage, fire rate and ammo first; vitality to survive; light spirit.',
    quota: { weapon: 5, vitality: 4, spirit: 3 },
    mult: { weapon: 1.35, spirit: 0.6, vitality: 0.9 }, abilityFocus: 'weapon',
  },
  {
    key: 'spirit', name: (dot) => (dot ? 'Spirit Burn' : 'Spirit Power'),
    blurb: 'Spirit power, cooldowns and ability duration first; vitality to survive; light weapon.',
    quota: { weapon: 2, vitality: 4, spirit: 6 },
    mult: { weapon: 0.65, spirit: 1.35, vitality: 0.9 }, abilityFocus: 'spirit',
  },
  {
    key: 'hybrid', name: () => 'Bruiser Hybrid',
    blurb: 'Even split with extra vitality: fight longer, sustain through damage over time.',
    quota: { weapon: 4, vitality: 5, spirit: 3 },
    mult: { weapon: 1.0, spirit: 1.0, vitality: 1.3 }, abilityFocus: 'balanced',
  },
]

/** Points per stat unit, and which category the stat belongs to. Negative points mean a negative value is good. */
export const STAT_POINTS: Record<string, [number, 'weapon' | 'spirit' | 'vitality']> = {
  // weapon
  BaseAttackDamagePercent: [1.0, 'weapon'], BaseAttackDamagePercentBonus: [1.0, 'weapon'],
  BonusFireRate: [0.9, 'weapon'], ActiveBonusFireRate: [0.35, 'weapon'], ActivatedFireRate: [0.3, 'weapon'],
  FireRateBonus: [0.6, 'weapon'], BonusClipSizePercent: [0.12, 'weapon'], BonusClipSize: [0.5, 'weapon'],
  HeadShotBonusDamage: [0.12, 'weapon'], BonusAttackRangePercent: [0.15, 'weapon'],
  BulletLifestealPercent: [0.5, 'weapon'], LongRangeBonusWeaponPower: [0.5, 'weapon'],
  CloseRangeBonusWeaponPower: [0.5, 'weapon'], ReloadSpeedMultipler: [-0.3, 'weapon'],
  BonusMeleeDamagePercent: [0.1, 'weapon'], ProcBaseAttackDamagePercent: [0.3, 'weapon'],
  CritDamagePercent: [0.1, 'weapon'], BulletsBonusMagicDamage: [0.5, 'weapon'],
  BaseAttackDamagePercentAtMaxDuration: [0.6, 'weapon'], BulletResistReduction: [-0.25, 'weapon'],
  // spirit
  TechPower: [0.9, 'spirit'], SpiritPower: [0.9, 'spirit'], BonusSpirit: [0.9, 'spirit'], SpiritPowerInnate: [0.9, 'spirit'],
  TechPowerPercent: [1.0, 'spirit'], CooldownReduction: [0.9, 'spirit'], BonusAbilityDurationPercent: [0.35, 'spirit'],
  TechRangeMultiplier: [0.12, 'spirit'], TechRadiusMultiplier: [0.12, 'spirit'],
  AbilityLifestealPercentHero: [0.4, 'spirit'], AbilityLifestealPercentHeroPassive: [0.4, 'spirit'], BonusSpiritLifesteal: [0.4, 'spirit'],
  BonusAbilityCharges: [6, 'spirit'], BonusSpiritForChargedAbilities: [0.5, 'spirit'],
  CooldownReductionOnChargedAbilities: [0.4, 'spirit'], UltimateCooldownReduction: [0.3, 'spirit'],
  DPS: [0.6, 'spirit'], MagicIncreasePerStack: [1.0, 'spirit'], TechArmorDamageReduction: [-0.6, 'spirit'],
  MagicResistReduction: [-0.5, 'spirit'], ImbuedTechPower: [0.3, 'spirit'], CooldownBetweenChargeReduction: [0.15, 'spirit'],
  // vitality
  BonusHealth: [0.045, 'vitality'], BonusBaseHealth: [0.3, 'vitality'], OutOfCombatHealthRegen: [0.8, 'vitality'],
  BonusHealthRegen: [1.0, 'vitality'], BulletResist: [0.45, 'vitality'], TechResist: [0.45, 'vitality'],
  BonusMoveSpeed: [1.5, 'vitality'], BonusSprintSpeed: [0.8, 'vitality'], StatusResistancePercent: [0.12, 'vitality'],
  SlowResistancePercent: [0.1, 'vitality'], CombatBarrier: [0.012, 'vitality'], Stamina: [1.0, 'vitality'],
  StaminaCooldownReduction: [0.1, 'vitality'], HealAmpCastPercent: [0.1, 'vitality'], Regeneration: [0.3, 'vitality'],
  MeleeResistPercent: [0.1, 'vitality'],
}
