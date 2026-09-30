// Downloads every snapshot the app needs into ./data and ./public/img.
// After this runs once, the app works fully offline.
//
//   node scripts/fetch-data.mjs            # full fetch
//   node scripts/fetch-data.mjs --skip-images
//
// NOTE: the spec names assets.deadlock-api.com, but that hostname no longer
// resolves (NXDOMAIN, verified 2026-09-30). The same catalog now lives under
// api.deadlock-api.com/v1/assets/*, which is what is used here.
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data')
const IMG = join(ROOT, 'public', 'img')
const API = 'https://api.deadlock-api.com'
const ZERGGGY = 35187362
const USER = 267836488
const TARGET_HERO = 1 // Infernus
const ZERG_MATCHES = 30
const HIGH_BADGE = 70 // "high-skill" aggregate cut (generic, not tuned to any player)
const SKIP_IMAGES = process.argv.includes('--skip-images')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let lastCall = 0
const MIN_GAP_MS = 400 // ~150 req/min, under the 200/min limit

async function getJson(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const wait = lastCall + MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastCall = Date.now()
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000) })
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after')) || 10
        console.warn(`  429, sleeping ${ra}s`)
        await sleep(ra * 1000 + 500)
        continue
      }
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url}: ${e.message}`)
      await sleep(1500 * (i + 1))
    }
  }
}

async function save(rel, obj) {
  const p = join(DATA, rel)
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(obj))
}

const exists = (p) => access(p).then(() => true, () => false)

async function downloadImage(url, rel) {
  if (!url) return null
  const p = join(IMG, rel)
  if (await exists(p)) return `img/${rel}`
  if (SKIP_IMAGES) return `img/${rel}`
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await mkdir(dirname(p), { recursive: true })
      await writeFile(p, Buffer.from(await res.arrayBuffer()))
      return `img/${rel}`
    } catch (e) {
      if (i === 3) { console.warn(`  image failed ${url}: ${e.message}`); return null }
      await sleep(800 * (i + 1))
    }
  }
}

async function pool(items, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k) }
  }))
}

const stripHtml = (s) => (s || '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, '$1').replace(/<(?!\/?span|\/?b|\/?br)[^>]+>/g, '')

// ---------------------------------------------------------------- catalog
console.log('Fetching item + hero catalogs…')
const allAssets = await getJson(`${API}/v1/assets/items`)
const heroesRaw = await getJson(`${API}/v1/assets/heroes`)
if (!allAssets || !heroesRaw) throw new Error('asset catalog unavailable')

const upgrades = allAssets.filter((x) => x.type === 'upgrade')
const items = upgrades.map((x) => {
  const props = {}
  for (const [k, v] of Object.entries(x.properties || {})) {
    if (!v || !v.label) continue
    const val = String(v.value)
    if (val === '0' || val === '-1' || val === '-1.0' || val === '-2' || val === '') continue
    props[k] = { value: val, label: v.label, postfix: v.postfix ?? '', prefix: v.prefix ?? '', conditional: v.conditional ?? '', css: v.css_class ?? '' }
  }
  return {
    id: x.id, class_name: x.class_name, name: x.name,
    slot: x.item_slot_type, tier: x.item_tier, cost: x.cost ?? 0,
    shopable: !!x.shopable && !x.disabled, disabled: !!x.disabled,
    activation: x.activation, is_active: !!x.is_active_item,
    description: x.description?.desc ? stripHtml(x.description.desc) : '',
    description_passive: x.description?.passive ? stripHtml(x.description.passive) : '',
    description_active: x.description?.active ? stripHtml(x.description.active) : '',
    components: x.component_items || [],
    tooltip_sections: (x.tooltip_sections || []).map((s) => ({
      type: s.section_type,
      attrs: (s.section_attributes || []).map((a) => ({
        text: a.loc_string ? stripHtml(a.loc_string) : '',
        properties: a.properties || [], important: a.important_properties || [], elevated: a.elevated_properties || [],
      })),
    })),
    props,
    upgrade_bonus: (x.upgrades?.[0]?.property_upgrades || []).map((p) => ({ name: p.name, bonus: String(p.bonus) })),
    image_src: x.shop_image_webp || x.image_webp,
  }
})
const shopableCount = items.filter((i) => i.shopable).length
console.log(`  ${items.length} upgrade items (${shopableCount} currently shopable)`)

// images for items
console.log('Downloading item images…')
await pool(items, 8, async (it) => {
  it.image = await downloadImage(it.image_src, `items/${it.id}.webp`)
  delete it.image_src
})
await save('catalog.json', { fetched_at: new Date().toISOString(), items })

// ---------------------------------------------------------------- heroes
const active = heroesRaw.filter((h) => h.player_selectable && !h.disabled && !h.in_development)
const abilityById = new Map(allAssets.filter((x) => x.type === 'ability').map((a) => [a.class_name, a]))
const heroes = []
for (const h of active) {
  const abilities = []
  for (const slot of ['signature1', 'signature2', 'signature3', 'signature4']) {
    const a = abilityById.get(h.items?.[slot])
    if (!a) continue
    abilities.push({
      slot, id: a.id, class_name: a.class_name, name: a.name,
      description: stripHtml(a.description?.desc || ''),
      upgrades: (a.upgrades || []).map((u) => (u.property_upgrades || []).map((p) => ({ name: p.name, bonus: String(p.bonus) }))),
      props: Object.fromEntries(Object.entries(a.properties || {}).filter(([, v]) => v && v.label && String(v.value) !== '0').map(([k, v]) => [k, { value: String(v.value), label: v.label, postfix: v.postfix ?? '' }])),
      image: await downloadImage(a.image_webp, `abilities/${a.id}.webp`),
    })
  }
  const card = await downloadImage(h.images?.icon_hero_card_webp, `heroes/${h.id}.webp`)
  const small = await downloadImage(h.images?.icon_image_small_webp, `heroes/${h.id}_sm.webp`)
  heroes.push({
    id: h.id, name: h.name, class_name: h.class_name, hero_type: h.hero_type, gun_tag: h.gun_tag, tags: h.tags,
    role: h.description?.role || '', playstyle: h.description?.playstyle || '',
    image: card, image_small: small,
    starting_stats: Object.fromEntries(Object.entries(h.starting_stats || {}).map(([k, v]) => [k, v.value])),
    level_up: h.standard_level_up_upgrades || {},
    abilities,
  })
}
console.log(`  ${heroes.length} active heroes`)
await save('heroes.json', { fetched_at: new Date().toISOString(), heroes })

// ---------------------------------------------------------------- aggregate analytics
console.log('Fetching per-hero analytics…')
const rel = ['wins', 'losses', 'matches']
for (const h of heroes) {
  process.stdout.write(`  ${h.name} (${h.id})… `)
  const base = `hero_id=${h.id}`
  const [all, high, order, perm] = await Promise.all([
    getJson(`${API}/v1/analytics/item-stats?${base}&min_matches=30`),
    getJson(`${API}/v1/analytics/item-stats?${base}&min_matches=30&min_average_badge=${HIGH_BADGE}`),
    getJson(`${API}/v1/analytics/ability-order-stats?${base}&min_matches=50`),
    getJson(`${API}/v1/analytics/item-permutation-stats?${base}&comb_size=2&min_matches=100`),
  ])
  await save(`analytics/item-stats/${h.id}.json`, all || [])
  await save(`analytics/item-stats-high/${h.id}.json`, high || [])
  await save(`analytics/ability-order/${h.id}.json`, (order || []).map(({ abilities, wins, losses, matches }) => ({ abilities, wins, losses, matches })))
  const shop = new Set(items.filter((i) => i.shopable).map((i) => i.id))
  const pairs = (perm || []).filter((p) => p.item_ids.every((id) => shop.has(id))).sort((a, b) => b.matches - a.matches).slice(0, 1500)
  await save(`analytics/permutations/${h.id}.json`, pairs)
  console.log(`${(all || []).length} items, ${(order || []).length} ability orders, ${(perm || []).length} pairs`)
}

// ---------------------------------------------------------------- Zergggy (validation only)
console.log('Fetching Zergggy Infernus matches (validation only)…')
const isMatchmaking = (m) => m.game_mode === 1 && (m.match_mode === 1 || m.match_mode === 4) // normal + unranked/ranked
const zHist = (await getJson(`${API}/v1/players/${ZERGGGY}/match-history`)) || []
const zInf = zHist.filter((m) => m.hero_id === TARGET_HERO).sort((a, b) => b.start_time - a.start_time)
const zReal = zInf.filter(isMatchmaking)
console.log(`  history ${zHist.length}, Infernus ${zInf.length}, real matchmaking Infernus ${zReal.length}`)
await save('zergggy/infernus-matches.json', { account_id: ZERGGGY, fetched_at: new Date().toISOString(), total_history: zHist.length, infernus: zInf })

const purchases = []
for (const m of zReal) {
  if (purchases.length >= ZERG_MATCHES) break
  const meta = await getJson(`${API}/v1/matches/${m.match_id}/metadata`)
  const me = meta?.match_info?.players?.find((p) => p.account_id === ZERGGGY)
  if (!me) { console.warn(`  match ${m.match_id}: no metadata, skipped`); continue }
  purchases.push({
    match_id: m.match_id, start_time: m.start_time, duration_s: m.match_duration_s,
    won: m.match_result === m.player_team, match_mode: m.match_mode,
    net_worth: me.net_worth, level: me.level,
    items: (me.items || []).map((i) => ({ item_id: i.item_id, t: i.game_time_s, sold: i.sold_time_s, upgrade_id: i.upgrade_id })),
  })
  process.stdout.write('.')
}
console.log(`\n  ${purchases.length} matches with purchase data`)
await save('zergggy/infernus-purchases.json', { account_id: ZERGGGY, fetched_at: new Date().toISOString(), matches: purchases })

// ---------------------------------------------------------------- user (personalization)
console.log('Fetching user match history…')
const uHist = (await getJson(`${API}/v1/players/${USER}/match-history`)) || []
await save('user/match-history.json', {
  account_id: USER, fetched_at: new Date().toISOString(),
  matches: uHist.map((m) => ({ match_id: m.match_id, hero_id: m.hero_id, start_time: m.start_time, game_mode: m.game_mode, match_mode: m.match_mode, duration_s: m.match_duration_s, won: m.match_result === m.player_team, kills: m.player_kills, deaths: m.player_deaths, assists: m.player_assists, net_worth: m.net_worth })),
})

await save('meta.json', { fetched_at: new Date().toISOString(), hero_count: heroes.length, item_count: items.length, shopable_count: shopableCount, zergggy_matches: purchases.length, target_hero: TARGET_HERO, high_badge: HIGH_BADGE })
console.log('Done.')
