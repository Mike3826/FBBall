// Freezes first-seen Rotowire/Sleeper per-game projections into
// data/history/projections.json (kept with the rest of league history).
// Existing player-date keys are never overwritten. Run with the other
// stats jobs: npm run fetch-stats / npm run fetch-all
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const OUT = path.join(DATA_DIR, "history", "projections.json");
const LEGACY = path.join(DATA_DIR, "week-baselines.json");

function normalizeName(name) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/-/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function flipName(name) {
  const [last, first] = name.split(",").map((s) => s.trim());
  return first ? `${first} ${last}` : name;
}

const TRICODE_ALIASES = { GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", PHO: "PHX", WSH: "WAS", UTAH: "UTA", UT: "UTA" };
const nbaTricode = (code) => TRICODE_ALIASES[code] ?? code;

function buildPlayerMatcher(players) {
  const byName = new Map();
  const byLastAndTeam = new Map();
  const push = (map, key, p) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  };
  for (const p of Object.values(players)) {
    push(byName, normalizeName(flipName(p.name)), p);
    push(byLastAndTeam, `${normalizeName(p.name.split(",")[0])}|${nbaTricode(p.nbaTeam)}`, p);
  }
  return (fullName, team) => {
    const full = normalizeName(fullName);
    const t = nbaTricode(team);
    const candidates = byName.get(full);
    if (candidates?.length === 1) return candidates[0].id;
    if (candidates?.length > 1) return (candidates.find((c) => nbaTricode(c.nbaTeam) === t) ?? candidates[0]).id;
    const last = full.split(" ").pop() ?? "";
    const fallback = byLastAndTeam.get(`${last}|${t}`);
    if (fallback?.length === 1) return fallback[0].id;
    const sameInitial = fallback?.filter((c) => normalizeName(flipName(c.name))[0] === full[0]);
    return sameInitial?.length === 1 ? sameInitial[0].id : null;
  };
}

function n(v) {
  return Number.isFinite(v) ? Number(v) : 0;
}

function projectedFp(stats, rules) {
  const line = {
    PTS: n(stats.pts),
    REB: n(stats.reb),
    AST: n(stats.ast),
    ST: n(stats.stl),
    BLK: n(stats.blk),
    TO: n(stats.to),
    "3PTM": n(stats.tpm),
    "2D": n(stats.dd),
    "3D": n(stats.td),
  };
  let total = 0;
  for (const rule of rules) {
    if (line[rule.shortName] == null) continue;
    total += line[rule.shortName] * rule.points;
  }
  return Math.round(total * 100) / 100;
}

function ymd(iso) {
  return String(iso).slice(0, 10);
}

function seasonKey(year) {
  return `${year}-${String(year + 1).slice(-2)}`;
}

function periodsToFreeze(league) {
  const now = new Date();
  const current = league.scoringPeriods.find((p) => new Date(p.startDate) <= now && now <= new Date(p.endDate));
  const upcoming = league.scoringPeriods.find((p) => new Date(p.startDate) > now);
  return [current, upcoming].filter(Boolean);
}

function normalizeFile(raw, year) {
  if (raw?.seasons) return raw;
  const key = raw?.season || seasonKey(year);
  return {
    fetchedAt: raw?.fetchedAt ?? null,
    seasons: {
      [key]: {
        seasonYear: year,
        periods: raw?.periods ?? {},
      },
    },
  };
}

function eachDate(startIso, endIso) {
  const dates = [];
  let cur = ymd(startIso);
  const end = ymd(endIso);
  while (cur <= end) {
    dates.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    cur = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  return dates;
}

function sleeperWeekForDate(seasonStart, ymdDate) {
  const a = Date.parse(`${ymd(seasonStart)}T00:00:00Z`);
  const b = Date.parse(`${ymdDate}T00:00:00Z`);
  const days = Math.round((b - a) / 86_400_000);
  if (days <= 5) return 1;
  return 2 + Math.floor((days - 6) / 7);
}

async function fetchSleeperWeek(seasonYear, week) {
  const res = await fetch(`https://api.sleeper.com/projections/nba/${seasonYear}/${week}?season_type=regular`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`sleeper week ${week} -> HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

async function readExisting(year) {
  for (const file of [OUT, LEGACY]) {
    try {
      return normalizeFile(JSON.parse(await readFile(file, "utf8")), year);
    } catch {
      /* try next */
    }
  }
  return { fetchedAt: null, seasons: {} };
}

async function main() {
  const league = JSON.parse(await readFile(path.join(DATA_DIR, "league.json"), "utf8"));
  const players = JSON.parse(await readFile(path.join(DATA_DIR, "players.json"), "utf8"));
  const key = seasonKey(league.seasonYear);
  const file = await readExisting(league.seasonYear);
  file.seasons[key] ??= { seasonYear: league.seasonYear, periods: {} };
  const season = file.seasons[key];

  const periods = periodsToFreeze(league);
  const allDates = new Set(periods.flatMap((p) => eachDate(p.startDate, p.endDate)));
  const weeks = new Set();
  for (const date of allDates) {
    const w = Math.max(1, sleeperWeekForDate(league.startDate, date));
    weeks.add(w);
    weeks.add(w + 1);
  }
  const match = buildPlayerMatcher(players);
  console.log(`Freezing ${key} weeks ${periods.map((p) => p.number).join(", ")} from Sleeper ${[...weeks].join(", ")}`);

  const rows = [];
  for (const week of [...weeks].sort((a, b) => a - b)) {
    const batch = await fetchSleeperWeek(league.seasonYear, week);
    rows.push(...batch);
    console.log(`  sleeper week ${week}: ${batch.length} rows`);
  }

  let added = 0;
  for (const period of periods) {
    const dates = new Set(eachDate(period.startDate, period.endDate));
    const slot = season.periods[String(period.number)] ?? { capturedAt: new Date().toISOString(), players: {} };
    for (const row of rows) {
      if (!row.date || !dates.has(row.date)) continue;
      const name = `${row.player?.first_name ?? ""} ${row.player?.last_name ?? ""}`.trim();
      const id = match(name, row.team || row.player?.team || "");
      if (!id) continue;
      const out = /^(OUT|O|IR|SUS|SUSPENDED)$/i.test(row.player?.injury_status ?? "") || n(row.stats?.gp) === 0;
      const fp = out ? 0 : projectedFp(row.stats ?? {}, league.scoring);
      slot.players[id] ??= {};
      if (slot.players[id][row.date] == null) {
        slot.players[id][row.date] = fp;
        added++;
      }
    }
    season.periods[String(period.number)] = slot;
    console.log(`  period ${period.number}: ${Object.keys(slot.players).length} players`);
  }

  file.fetchedAt = new Date().toISOString();
  await writeFile(OUT, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`Wrote ${added} new player-dates to data/history/projections.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
