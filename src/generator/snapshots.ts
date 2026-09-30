// Vite-side loader for the generator's inputs: the asset catalogs and the AGGREGATE analytics snapshots.
// (The validation snapshot is deliberately not reachable from here.)
import catalogJson from '../../data/catalog.json'
import heroesJson from '../../data/heroes.json'
import type { CatalogItem, Hero, HeroAnalytics } from './types'

export const catalog = (catalogJson as unknown as { items: CatalogItem[] }).items
export const heroes = (heroesJson as unknown as { heroes: Hero[] }).heroes

const loaders = {
  all: import.meta.glob('../../data/analytics/item-stats/*.json', { import: 'default' }),
  high: import.meta.glob('../../data/analytics/item-stats-high/*.json', { import: 'default' }),
  orders: import.meta.glob('../../data/analytics/ability-order/*.json', { import: 'default' }),
  pairs: import.meta.glob('../../data/analytics/permutations/*.json', { import: 'default' }),
}

export async function loadAnalytics(heroId: number): Promise<HeroAnalytics> {
  const get = async (g: Record<string, () => Promise<unknown>>, dir: string) => {
    const key = `../../data/analytics/${dir}/${heroId}.json`
    if (!g[key]) throw new Error(`missing snapshot ${key} — run npm run fetch-data`)
    return g[key]()
  }
  const [all, high, orders, pairs] = await Promise.all([
    get(loaders.all, 'item-stats'), get(loaders.high, 'item-stats-high'),
    get(loaders.orders, 'ability-order'), get(loaders.pairs, 'permutations'),
  ])
  return { all, high, orders, pairs } as HeroAnalytics
}
