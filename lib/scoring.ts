/**
 * League scoring formula. Works on both the server (rankings) and client
 * (calculator). Rules come from data/league.json (Fantrax scoring settings).
 */
export type ScoringRule = { code: string; name: string; shortName: string; points: number };

export type StatLine = {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fg3m: number;
};

export type ScoreBreakdownRow = { label: string; value: number; perUnit: number; total: number };

/** Fantrax shortName -> StatLine key. */
const STAT_KEYS: Record<string, keyof StatLine> = {
  PTS: "pts",
  REB: "reb",
  AST: "ast",
  ST: "stl",
  BLK: "blk",
  TO: "tov",
  "3PTM": "fg3m",
};

const DISPLAY_LABEL: Record<string, string> = {
  PTS: "PTS",
  REB: "REB",
  AST: "AST",
  ST: "STL",
  BLK: "BLK",
  TO: "TO",
  "3PTM": "3PM",
  "2D": "DD",
  "3D": "TD",
};

/** Number of the five counting categories at 10+. */
export function doubleDigitCategories(s: StatLine): number {
  return [s.pts, s.reb, s.ast, s.stl, s.blk].filter((v) => v >= 10).length;
}

export function isDoubleDouble(s: StatLine): boolean {
  return doubleDigitCategories(s) >= 2;
}

export function isTripleDouble(s: StatLine): boolean {
  return doubleDigitCategories(s) >= 3;
}

export function scoreBreakdown(s: StatLine, rules: ScoringRule[]): { rows: ScoreBreakdownRow[]; total: number } {
  const rows: ScoreBreakdownRow[] = [];
  const dd = isDoubleDouble(s);
  const td = isTripleDouble(s);

  for (const rule of rules) {
    const key = STAT_KEYS[rule.shortName];
    let value: number;
    if (key) value = s[key];
    // Fantrax "2D" = double-doubles plus triple-doubles, so a TD earns both bonuses.
    else if (rule.shortName === "2D") value = dd ? 1 : 0;
    else if (rule.shortName === "3D") value = td ? 1 : 0;
    else continue;
    rows.push({ label: DISPLAY_LABEL[rule.shortName] ?? rule.shortName, value, perUnit: rule.points, total: value * rule.points });
  }

  // Keep a stable, readable order regardless of how Fantrax orders the rules.
  const order = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "TO", "DD", "TD"];
  rows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));

  const total = rows.reduce((sum, r) => sum + r.total, 0);
  return { rows, total: Math.round(total * 100) / 100 };
}

export function fantasyPoints(s: StatLine, rules: ScoringRule[]): number {
  return scoreBreakdown(s, rules).total;
}
