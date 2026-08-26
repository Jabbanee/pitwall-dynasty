import type { RaceEvent, Driver } from '../core/types'
import type { CommentaryLine } from './commentary'
import { generateCommentary } from './commentary'

/**
 * Commentary feed for the live 3D broadcast. Caches the rolling window of
 * revealed events and surfaces them as headline/analyst lines. This is a
 * display-side helper so the broadcast view never has to recompute.
 */

export interface CommentaryDisplay {
  /** Lines seen since the last reset. */
  lines: CommentaryLine[]
  /** Push a new reveal window. Returns the fresh lines, if any. */
  push(revealedEvents: RaceEvent[], drivers: Record<string, Driver>, ctx: { totalLaps: number }): CommentaryLine[]
  reset(): void
}

export function createCommentaryDisplay(): CommentaryDisplay {
  const lines: CommentaryLine[] = []
  const seenKeys = new Set<string>()
  return {
    lines,
    push(revealedEvents, drivers, ctx) {
      // Build a key per event for dedupe (same event may be revealed twice
      // if the server re-sends a snapshot during a vote rewind).
      const fresh: RaceEvent[] = []
      for (const e of revealedEvents) {
        const key = `${e.t}|${e.type}|${e.driverId ?? ''}|${e.detail}`
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        fresh.push(e)
      }
      if (fresh.length === 0) return []
      const newLines = generateCommentary(fresh, drivers, ctx)
      lines.push(...newLines)
      // Cap memory so very long races don't bloat the DOM feed
      if (lines.length > 60) lines.splice(0, lines.length - 60)
      return newLines
    },
    reset() {
      lines.length = 0
      seenKeys.clear()
    },
  }
}
