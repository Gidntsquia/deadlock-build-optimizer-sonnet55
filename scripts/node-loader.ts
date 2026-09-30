// Node-side snapshot loader used by the test scripts (the app itself uses Vite's import.meta.glob).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CatalogItem, Hero, HeroAnalytics } from '../src/generator/types'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const read = (rel: string) => JSON.parse(readFileSync(join(DATA, rel), 'utf8'))

export const loadCatalog = (): CatalogItem[] => read('catalog.json').items
export const loadHeroes = (): Hero[] => read('heroes.json').heroes
export const loadAnalytics = (id: number): HeroAnalytics => ({
  all: read(`analytics/item-stats/${id}.json`), high: read(`analytics/item-stats-high/${id}.json`),
  orders: read(`analytics/ability-order/${id}.json`), pairs: read(`analytics/permutations/${id}.json`),
})
