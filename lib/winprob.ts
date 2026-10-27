import { LINEUP_SLOTS, SLOTS, type LiveMatchup, type TeamLineup } from "@/lib/lineups";

const SIMS = 8_000;
/**
 * Per remaining-game slice. 0 and 2μ are the hard bounds; σ is the SD of a
 * uniform on that interval (μ/√3 ≈ 0.577μ) so boom/bust and DNPs are common
 * instead of 3σ tails.
 */
const SIGMA_FRAC = 1 / Math.sqrt(3);

function hashSeed(parts: number[]): number {
  let h = 2166136261;
  for (const n of parts) {
    h ^= Math.round(n * 100) + 0x9e3779b9 + (h << 6) + (h >> 2);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleRemain(mean: number, rand: () => number): number {
  if (mean <= 0) return 0;
  let u = 0;
  let v = 0;
  let s = 0;
  do {
    u = rand() * 2 - 1;
    v = rand() * 2 - 1;
    s = u * u + v * v;
  } while (s === 0 || s >= 1);
  const z = u * Math.sqrt((-2 * Math.log(s)) / s);
  const x = mean + mean * SIGMA_FRAC * z;
  return Math.max(0, Math.min(2 * mean, x));
}

function hasRemain(team: TeamLineup): boolean {
  return SLOTS.some((slot) => team.groups[slot].some((p) => p.remainSlices.some((m) => m > 0)));
}

function simulateScore(team: TeamLineup, rand: () => number): number {
  let total = 0;
  for (const slot of SLOTS) {
    const scores = team.groups[slot].map((p) => {
      let extra = 0;
      for (const mean of p.remainSlices) extra += sampleRemain(mean, rand);
      return p.fp + extra;
    });
    scores.sort((a, b) => b - a);
    total += scores.slice(0, LINEUP_SLOTS[slot]).reduce((s, n) => s + n, 0);
  }
  return total;
}

function matchupSeed(a: TeamLineup, b: TeamLineup): number {
  const parts: number[] = [a.score, b.score, a.projScore, b.projScore];
  for (const t of [a, b]) {
    for (const slot of SLOTS) {
      for (const p of t.groups[slot]) {
        parts.push(p.fp, ...p.remainSlices);
      }
    }
  }
  return hashSeed(parts);
}

/** Monte Carlo H2H win% from locked actuals + Gaussian remaining slices. Ties count as half. */
export function matchupWinPcts(a: TeamLineup, b: TeamLineup): { a: number; b: number } {
  if (!hasRemain(a) && !hasRemain(b)) {
    if (a.score === b.score) return { a: 50, b: 50 };
    return a.score > b.score ? { a: 100, b: 0 } : { a: 0, b: 100 };
  }

  let aWins = 0;
  const rand = mulberry32(matchupSeed(a, b));
  for (let i = 0; i < SIMS; i++) {
    const as = simulateScore(a, rand);
    const bs = simulateScore(b, rand);
    if (as > bs) aWins++;
    else if (as === bs) aWins += 0.5;
  }
  const aPct = Math.round((aWins / SIMS) * 1000) / 10;
  return { a: aPct, b: Math.round((100 - aPct) * 10) / 10 };
}

export function attachWinProbabilities(matchups: LiveMatchup[]): LiveMatchup[] {
  for (const game of matchups) {
    if (!game.away || !game.home) {
      if (game.away) game.away.winPct = null;
      if (game.home) game.home.winPct = null;
      continue;
    }
    const { a, b } = matchupWinPcts(game.away, game.home);
    game.away.winPct = a;
    game.home.winPct = b;
  }
  return matchups;
}
