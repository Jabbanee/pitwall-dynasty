/**
 * Deterministic PRNG utilities. NEVER use Math.random inside authoritative
 * simulation code paths — always thread an explicit Rng instance.
 *
 * mulberry32: fast, small-state, good enough for game simulation and fully
 * reproducible from a 32-bit seed.
 */
export interface Rng {
  next(): number // [0,1)
  int(minInclusive: number, maxExclusive: number): number
  range(min: number, max: number): number // float in [min,max)
  chance(p: number): boolean
  pick<T>(arr: readonly T[]): T
  shuffle<T>(arr: T[]): T[]
  gauss(mean?: number, stddev?: number): number // Box-Muller, stateful but deterministic
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0
  let spare: number | null = null

  function next(): number {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng: Rng = {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min))
    },
    range(min, max) {
      return min + next() * (max - min)
    },
    chance(p) {
      return next() < p
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)]
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    },
    gauss(mean = 0, stddev = 1) {
      if (spare !== null) {
        const v = spare
        spare = null
        return mean + v * stddev
      }
      let u = 0
      let v = 0
      while (u === 0) u = next()
      while (v === 0) v = next()
      const r = Math.sqrt(-2 * Math.log(u))
      const theta = 2 * Math.PI * v
      spare = r * Math.sin(theta)
      return mean + r * Math.cos(theta) * stddev
    },
  }
  return rng
}

/** FNV-1a hash producing a stable hex-ish string for hashes/IDs. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function stableStringify(value: unknown): string {
  // JSON.stringify with sorted object keys — deterministic hashing of state.
  return JSON.stringify(sortKeysDeep(value as never))
}

function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((v as Record<string, unknown>)[k])
    }
    return out
  }
  return v
}
