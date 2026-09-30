// Light personalization from the user's own match history (account 267836488, standard mode).
// "Standard mode" = normal game mode (not street brawl) in unranked or ranked matchmaking.
import userData from '../data/user/match-history.json'

interface UMatch { hero_id: number; game_mode: number; match_mode: number; duration_s: number; won: boolean; start_time: number }
const all = (userData as { matches: UMatch[] }).matches
const standard = all.filter((m) => m.game_mode === 1 && (m.match_mode === 1 || m.match_mode === 4) && m.duration_s > 300)

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  if (!s.length) return null
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface Personal {
  standardMatches: number
  medianMatchMin: number | null
  heroMatches: number
  heroWinRate: number | null
  heroMedianMin: number | null
}

export function personalFor(heroId: number): Personal {
  const med = median(standard.map((m) => m.duration_s))
  const hero = standard.filter((m) => m.hero_id === heroId)
  const hmed = median(hero.map((m) => m.duration_s))
  return {
    standardMatches: standard.length,
    medianMatchMin: med === null ? null : Math.round((med / 60) * 10) / 10,
    heroMatches: hero.length,
    heroWinRate: hero.length >= 5 ? hero.filter((m) => m.won).length / hero.length : null,
    heroMedianMin: hmed === null ? null : Math.round((hmed / 60) * 10) / 10,
  }
}
