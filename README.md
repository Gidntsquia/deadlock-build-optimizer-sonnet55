# Deadlock Build Optimizer

Mobile-first React 18 + Vite + TypeScript app. It generates item builds (buy order by phase, plus ability level-up order) for any active Deadlock hero from public deadlock-api.com data. Infernus is the default, and the hero used for tuning and validation. No backend, database, auth or paid services.

```
npm install
npm run fetch-data   # one-time snapshot into ./data and ./public/img (needs network)
npm run dev          # or: npm run build && npm run preview
npm test             # determinism + shape check over all 38 heroes
```

After `fetch-data`, the app and `npm run build` work fully offline. Snapshots are committed-style files, so a fresh clone with `data/` and `public/img/` present needs no network at all.

## What you see

- Hero picker (bottom sheet grid). Opens on Infernus.
- 3 named builds per hero: **Gun Damage**, **Spirit Burn** (named **Spirit Power** if the hero has no damage-over-time ability), **Bruiser Hybrid**.
- Each build: 12–14 items grouped Early / Mid / Late, with per-item cost, running soul total, and the shop image.
- Ability order: unlock order, a 16-step level-up sequence, and upgrade tiers per ability, with real ability names and icons.
- Tap an item for a detail card: image, cost, tier, slot type, stats, passive/active text, components, and why the generator picked it.
- Infernus only: a core / not-core badge on every item and an agreement % per build ("how well the generator did" against Zergggy).
- A personal insight card from your match history.

## Judgment calls

1. **Assets host moved.** The spec names `assets.deadlock-api.com`. That hostname no longer resolves (NXDOMAIN, checked 2026-09-30). The same catalog is served at `https://api.deadlock-api.com/v1/assets/items` and `/heroes`; `fetch-data` uses that.
2. **Shopable item count is 173, not ≥200.** The live catalog has 250 upgrade items, of which 173 are currently shopable (the rest are disabled, removed, or upgrade-only variants). This cannot be raised without faking data. All 250 are in `data/catalog.json` with a `shopable` flag; the generator only picks shopable ones.
3. **Item-stats win rate is biased.** Expensive items are only bought by players who are already winning, so raw win rate favors T4/T5. Each item's win rate is shrunk toward its tier's baseline and scored as lift over that baseline.
4. **Builds are sized by a soul budget** (see below), not by a fixed item count. Cost uses the net price: an item that upgrades a component you already hold costs `cost − component cost`.
5. **Buy order** uses expected buy time = 0.65 × the item's average buy time + 0.35 × its tier's median buy time. A component is always placed before the item that consumes it. Phases split by running soul total.
6. **Non-catalog entries** in Zergggy's data (ability upgrades and 4 item ids missing from the catalog) are ignored by validation.
7. **Slot quotas can be lifted** when a hero's candidate pool is too thin to reach 12 items (found by the all-hero test on Mo & Krill, which had only 10). This is a constraint fix, not a weight change.
8. Ability-order "Spirit Power" vs "Spirit Burn" naming is decided from the hero's abilities (damage-over-time present or not).

## How items are scored

`score = 1.0·wr + 0.8·use + 0.7·val + 0.6·kit + 0.5·syn + 0.3·act`

| Term | Weight | Input |
|---|---|---|
| `wr` | 1.0 | Win rate from `/v1/analytics/item-stats`, shrunk toward the tier baseline with a prior of 300 matches; 2 percentage points of lift = 1.0. Uses the high-badge (avg badge ≥ 70) row when the item has ≥400 high-badge matches. |
| `use` | 0.8 | Pick rate, square-root scaled. |
| `val` | 0.7 | Stat points per 1,000 souls (table in `src/generator/config.ts`), z-scored within the item's tier. |
| `kit` | 0.6 | Fit with the hero: stat multipliers derived from the hero's abilities and starting stats (for example, a hero whose abilities all deal damage weights spirit power up). |
| `syn` | 0.5 | Average pair lift with items already chosen, from `/v1/analytics/item-permutation-stats` (pairs with ≥300 matches). |
| `act` | 0.3 | Small bonus for passive/active effects on tier ≥3 items (stats alone undervalue them). |

Candidates need ≥300 matches and ≥1% of the hero's most-bought item. Archetypes multiply stat points by category (weapon / spirit / vitality) and set slot quotas (Gun 5/4/3, Spirit 2/4/6, Bruiser 4/5/3 weapon/vitality/spirit).

Selection is greedy under these limits: tier caps T1:3, T2:4, T3:4, T4+:3; at most one T5; at most 2 active items; minimum 12 items plus up to 2 flex items that must score ≥0.5.

**Budget** = 1,150 souls/min × median match minutes × 1.08. Median match minutes default to 32, or come from your history (below). Phases by running total: early ≤14% of budget, mid ≤46%, late the rest.

**Ability order**: from `/v1/analytics/ability-order-stats`. The first appearance of an ability is its unlock; later appearances are upgrade tiers 1–3. Orders are scored by shrunk win rate plus a bonus for matching the archetype's focus, preferring orders that spend all 16 points and differing across a hero's three builds.

Weights and thresholds are all in `src/generator/config.ts`. They were fixed from game-design reasoning and aggregate-data checks **before** any comparison with the validation data, and were not adjusted afterward to raise agreement.

## Determinism

The generator is a pure function of (hero, catalog, analytics, options): no randomness, no clocks, and every tie is broken by item id. Rerunning gives identical output. `npm test` runs every hero twice (with and without a personal median) and compares the JSON byte for byte, and checks ≥2 builds, ≥12 items, 16 ability steps, no duplicate or non-shopable items.

## Validation against Zergggy (held-out)

- Data: 30 of his recent real matchmaking Infernus matches with purchase data (20 wins), snapshotted to `data/zergggy/infernus-purchases.json`.
- **Only `src/validation/zergggy.ts` reads that file.** The generator, its loaders (`src/generator/snapshots.ts`, `scripts/node-loader.ts`) and the personalization module cannot reach it. `grep -ri zergggy src/generator` finds nothing.
- **Held item** = bought and not sold within 60 s.
- **Core set** = items held in **≥30%** of his sampled matches, where a win counts 1.0 and a loss counts 0.5. Everything below 30% is an "experiment" and is excluded: it gets a "Not core" badge and never counts toward agreement.
- **Agreement %** = 0.7 × Dice overlap(build items, core set) + 0.3 × buy-order concordance. Concordance is the share of item pairs in both the build and his core set whose order matches his median buy time.
- The app shows this as "how well the generator did". It is a report card, not an input; agreement is not 100% and is not meant to be.

Current Infernus results (33.17 min median): Gun Damage 53%, Spirit Burn 48%, Bruiser Hybrid 53%.

## Personalization

From `data/user/match-history.json` (account 267836488). Standard mode = `game_mode 1`, `match_mode` 1 or 4, longer than 5 minutes (556 matches). Your median length (33.2 min) sets the soul budget, so late-game purchases scale to how long your games actually run. The card also shows your win rate on the selected hero when you have games on it.

## Layout

- `scripts/fetch-data.mjs` downloads data and images (throttled to ~150 req/min under the 200/min limit; retries on 429).
- `src/generator/` pure build generator. `src/validation/` Zergggy check. `src/personalization.ts`, `src/components/`, `src/App.tsx` UI.
- `data/` snapshots; `public/img/` downloaded item, hero and ability images.

## Verification notes

Checked at 390×844 in headless Chromium against a production build: no horizontal scroll, all buttons ≥40 px, no console errors, no failed requests, item images load, also with the network namespace disabled. Item-card cost, tier and image match the assets snapshot for all 14 Infernus items.
