import type { Championship, Driver, PotentialTier, ScoutReport, WatchEntry } from '../core/types'

/** Scouting is a persistent engine. The player pays weeks of
 *  investment via the "fund scouting" action. Each week of funding
 *  increases every report's confidence (capped at 1.0). The
 *  confidence determines the width of the visible band. The true
 *  `hidden.potential` is never shown numerically — only a tier
 *  label.
 *
 *  Scouting is fully gender-neutral: the tier and confidence
 *  derivation does NOT inspect `driver.gender`. The tier mapping
 *  is bucketed from `hidden.potential` only. Tested by tests/. */

const BASE_BAND_WIDTH = 8
const MIN_BAND_WIDTH = 1
const CONFIDENCE_PER_WEEK = 0.04
const BAND_PER_CONFIDENCE = 6 // band width = BASE_BAND_WIDTH - BAND_PER_CONFIDENCE * confidence

/** Tier mapping is hard-bucketed from the (already private) hidden
 *  potential. The mapping is identical for every gender. */
export function potentialTierFor(potential: number): PotentialTier {
  if (potential < 60) return 'Limited'
  if (potential < 70) return 'Developing'
  if (potential < 80) return 'Good Prospect'
  if (potential < 88) return 'High Potential'
  if (potential < 94) return 'Elite Prospect'
  return 'Generational Talent'
}

export function emptyScoutingState() {
  return { reports: {} as Record<string, ScoutReport>, watchlist: [] as WatchEntry[], weeksFunded: 0 }
}

export function ensureScouting(champ: Championship) {
  if (!champ.scouting) champ.scouting = emptyScoutingState()
}

export function fundScoutingForOneWeek(champ: Championship): string {
  ensureScouting(champ)
  champ.scouting!.weeksFunded++
  for (const r of Object.values(champ.scouting!.reports)) {
    r.confidence = Math.min(1, r.confidence + CONFIDENCE_PER_WEEK)
    r.accuracy = Math.min(1, r.accuracy + CONFIDENCE_PER_WEEK * 0.9)
    r.scoutedAt = Date.now()
    r.visible.pace = narrowBand(r.driverId, champ, 'pace', r.confidence, r)
    r.visible.qualifying = narrowBand(r.driverId, champ, 'qualifying', r.confidence, r)
    r.visible.racecraft = narrowBand(r.driverId, champ, 'racecraft', r.confidence, r)
    r.visible.wetSkill = narrowBand(r.driverId, champ, 'wetSkill', r.confidence, r)
    r.visible.potentialTier = tierForReport(r.driverId, champ)
  }
  return `Scouting department expanded its network (+1 week).`
}

function narrowBand(driverId: string, champ: Championship, key: 'pace' | 'qualifying' | 'racecraft' | 'wetSkill', confidence: number, _r: ScoutReport): [number, number] {
  const d = champ.drivers[driverId]
  if (!d) return [0, 0]
  const v = d.visible[key]
  const w = Math.max(MIN_BAND_WIDTH, Math.round(BASE_BAND_WIDTH - BAND_PER_CONFIDENCE * confidence))
  const lo = Math.max(0, Math.round(v - w / 2))
  const hi = Math.min(100, Math.round(v + w / 2))
  return [lo, hi]
}

function tierForReport(driverId: string, champ: Championship): PotentialTier {
  const d = champ.drivers[driverId]
  if (!d) return 'Limited'
  return potentialTierFor(d.hidden.potential)
}

export function addToWatchlist(champ: Championship, driverId: string): { added: boolean; reason?: string } {
  ensureScouting(champ)
  if (champ.scouting!.watchlist.find((w) => w.driverId === driverId)) return { added: false, reason: 'Already on watchlist' }
  champ.scouting!.watchlist.push({ driverId, addedAt: Date.now(), lastNotified: 0 })
  return { added: true }
}

export function removeFromWatchlist(champ: Championship, driverId: string): boolean {
  if (!champ.scouting) return false
  const before = champ.scouting.watchlist.length
  champ.scouting.watchlist = champ.scouting.watchlist.filter((w) => w.driverId !== driverId)
  return champ.scouting.watchlist.length < before
}

export function scoutDriver(champ: Championship, driverId: string): ScoutReport | null {
  ensureScouting(champ)
  const d = champ.drivers[driverId]
  if (!d) return null
  const initialConfidence = 0.18
  const report: ScoutReport = {
    driverId,
    confidence: initialConfidence,
    visible: {
      pace: [Math.max(0, d.visible.pace - 6), Math.min(100, d.visible.pace + 6)],
      qualifying: [Math.max(0, d.visible.qualifying - 6), Math.min(100, d.visible.qualifying + 6)],
      racecraft: [Math.max(0, d.visible.racecraft - 6), Math.min(100, d.visible.racecraft + 6)],
      wetSkill: [Math.max(0, d.visible.wetSkill - 6), Math.min(100, d.visible.wetSkill + 6)],
      potentialTier: potentialTierFor(d.hidden.potential),
    },
    scoutedAt: Date.now(),
    accuracy: initialConfidence,
  }
  champ.scouting!.reports[driverId] = report
  return report
}

export function getReport(champ: Championship, driverId: string): ScoutReport | undefined {
  ensureScouting(champ)
  return champ.scouting!.reports[driverId]
}

export function getWatchlist(champ: Championship): WatchEntry[] {
  ensureScouting(champ)
  return [...champ.scouting!.watchlist].sort((a, b) => b.addedAt - a.addedAt)
}

export function getTopProspects(champ: Championship, limit = 5): Array<{ driver: Driver; tier: PotentialTier; confidence: number; series: string }> {
  ensureScouting(champ)
  const out: Array<{ driver: Driver; tier: PotentialTier; confidence: number; series: string }> = []
  for (const id of Object.keys(champ.scouting!.reports)) {
    const r = champ.scouting!.reports[id]
    const d = champ.drivers[id]
    if (!d) continue
    out.push({ driver: d, tier: r.visible.potentialTier, confidence: r.confidence, series: getDriverSeriesLabel(champ, d) })
  }
  out.sort((a, b) => tierWeight(b.tier) - tierWeight(a.tier) || b.confidence - a.confidence)
  return out.slice(0, limit)
}

function tierWeight(t: PotentialTier): number {
  switch (t) {
    case 'Limited': return 0
    case 'Developing': return 1
    case 'Good Prospect': return 2
    case 'High Potential': return 3
    case 'Elite Prospect': return 4
    case 'Generational Talent': return 5
  }
}

function getDriverSeriesLabel(champ: Championship, d: Driver): string {
  if (d.academyContract?.teamId === champ.playerTeamId) return 'Your Academy'
  if (d.reserveContract?.teamId === champ.playerTeamId) return 'Your Reserve'
  if (d.contract?.teamId === champ.playerTeamId) return 'Your Race'
  for (const [sid, st] of Object.entries(champ.feeder ?? {})) {
    for (const team of st.teams) {
      if (team.driverIds.includes(d.id)) {
        return FEEDER_LABEL[sid] ?? sid
      }
    }
  }
  return 'Free agent'
}

const FEEDER_LABEL: Record<string, string> = {
  'base.junior.regional': 'Regional',
  'base.junior.continental': 'Continental',
  'base.junior.aurora': 'Aurora',
}

/** All driver-gender-agnostic — this generator does not look at
 *  `gender` when ranking prospects. Tested by tests/. */
export function isWatchlisted(champ: Championship, driverId: string): boolean {
  ensureScouting(champ)
  return !!champ.scouting!.watchlist.find((w) => w.driverId === driverId)
}

export function tierBadgeColor(t: PotentialTier): string {
  switch (t) {
    case 'Limited': return 'var(--text-3)'
    case 'Developing': return 'var(--text-1)'
    case 'Good Prospect': return 'var(--accent-2)'
    case 'High Potential': return 'var(--accent-3)'
    case 'Elite Prospect': return 'var(--accent-3)'
    case 'Generational Talent': return 'var(--accent)'
  }
}
