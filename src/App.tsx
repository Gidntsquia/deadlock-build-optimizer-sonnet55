import { useEffect, useMemo, useState } from 'react'
import { catalog, heroes, loadAnalytics } from './generator/snapshots'
import { generateBuilds } from './generator/generate'
import type { CatalogItem, GeneratedBuilds } from './generator/types'
import { computeCoreSet, validateBuild } from './validation/zergggy'
import { personalFor } from './personalization'
import HeroPicker from './components/HeroPicker'
import BuildView from './components/BuildView'
import AbilityOrder from './components/AbilityOrder'
import ValidationReport from './components/ValidationReport'
import ItemCard from './components/ItemCard'
import { img, pct, souls } from './format'

const DEFAULT_HERO = 1 // Infernus: the tuned and validated hero
const VALIDATED_HERO = 1
const catalogById = new Map<number, CatalogItem>(catalog.map((i) => [i.id, i]))
const catalogByClass = new Map<string, CatalogItem>(catalog.map((i) => [i.class_name, i]))
const core = computeCoreSet()

export default function App() {
  const [heroId, setHeroId] = useState(DEFAULT_HERO)
  const [buildKey, setBuildKey] = useState('gun')
  const [picker, setPicker] = useState(false)
  const [openItem, setOpenItem] = useState<number | null>(null)
  const [result, setResult] = useState<GeneratedBuilds | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hero = useMemo(() => heroes.find((h) => h.id === heroId)!, [heroId])
  const personal = useMemo(() => personalFor(heroId), [heroId])

  useEffect(() => {
    let live = true
    setResult(null); setError(null)
    loadAnalytics(heroId)
      .then((an) => {
        if (!live) return
        setResult(generateBuilds(hero, catalog, an, { medianMatchMin: personal.medianMatchMin }))
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => { live = false }
  }, [heroId, hero, personal.medianMatchMin])

  const build = result?.builds.find((b) => b.key === buildKey) ?? result?.builds[0]
  const validations = useMemo(
    () => (result && heroId === VALIDATED_HERO ? new Map(result.builds.map((b) => [b.key, validateBuild(b, core)])) : null),
    [result, heroId],
  )
  const validation = build && validations ? validations.get(build.key) : undefined
  const openBuildItem = build?.items.find((i) => i.id === openItem)

  return (
    <div className="app">
      <header className="top">
        <h1>Deadlock Build Optimizer</h1>
        <button className="hero-btn" onClick={() => setPicker(true)} aria-label={`Hero: ${hero.name}. Change hero`} data-testid="hero-button">
          <img src={img(hero.image_small ?? hero.image)} alt="" width={40} height={40} />
          <span className="hero-btn-name">{hero.name}</span>
          <span className="hero-btn-sub">{hero.role || hero.gun_tag}</span>
          <span aria-hidden="true" className="chev">▾</span>
        </button>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {!result && !error && <p className="dim pad">Generating builds…</p>}

      {result && build && (
        <main>
          <div className="tabs" role="tablist" aria-label="Builds">
            {result.builds.map((b) => {
              const v = validations?.get(b.key)
              return (
                <button key={b.key} role="tab" aria-selected={b.key === build.key} className={`tab${b.key === build.key ? ' on' : ''}`} onClick={() => setBuildKey(b.key)} data-build={b.key}>
                  <span>{b.name}</span>
                  {v && <small>{v.agreement.toFixed(0)}% match</small>}
                </button>
              )
            })}
          </div>

          <section className="card summary">
            <h2>{build.name}</h2>
            <p>{build.blurb}</p>
            <div className="stats-row">
              <div><b>{build.items.length}</b><span>items</span></div>
              <div><b>{souls(build.totalCost)}</b><span>souls total</span></div>
              <div><b>{validation ? `${validation.agreement.toFixed(0)}%` : '—'}</b><span>Zergggy match</span></div>
            </div>
          </section>

          <section className="card">
            <h3>Buy order</h3>
            <BuildView build={build} catalog={catalogById} validation={validation} onOpenItem={setOpenItem} />
          </section>

          <section className="card">
            <h3>Ability level-up order</h3>
            <AbilityOrder hero={hero} build={build} />
          </section>

          <section className="card">
            <h3>Validation report</h3>
            {validation ? (
              <ValidationReport build={build} validation={validation} core={core} catalog={catalogById} onOpenItem={setOpenItem} />
            ) : (
              <p className="dim">Validation against Zergggy covers Infernus only. Pick Infernus to see the report.</p>
            )}
          </section>

          <section className="card">
            <h3>How this was scored</h3>
            <ul className="stat-list">{result.kitNotes.map((n) => <li key={n}>{n}</li>)}</ul>
          </section>
        </main>
      )}

      {picker && <HeroPicker heroes={heroes} selected={heroId} onSelect={(id) => { setHeroId(id); setPicker(false) }} onClose={() => setPicker(false)} />}
      {openItem !== null && catalogById.get(openItem) && (
        <ItemCard
          item={catalogById.get(openItem)!} buildItem={openBuildItem} catalogByClass={catalogByClass}
          validation={openBuildItem ? validation?.badges.get(openItem) : undefined} onClose={() => setOpenItem(null)}
        />
      )}
    </div>
  )
}
