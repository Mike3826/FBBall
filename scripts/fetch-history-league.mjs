// Pulls champions, playoff brackets, final standings, and end-of-season rosters
// for prior The League II seasons. Playoff trees come from Fantrax's logged-in
// standings API (needs FANTRAX_COOKIE). Standings/rosters use the public API.
//
// Run with: npm run fetch-history-league
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(process.cwd(), "data/history/league.json");
const FANTRAX = "https://www.fantrax.com/fxea/general";

const HISTORY_LEAGUES = [
  { seasonYear: 2025, leagueId: "gxsj9v2rmasp79bn" },
  { seasonYear: 2024, leagueId: "mp1mk7uvm1wpjzzy" },
  { seasonYear: 2023, leagueId: "pjk1j1yvlmshtwjz" },
  { seasonYear: 2022, leagueId: "j39mgjepl772iy46" },
];

function nbaSeason(year) {
  return `${year}-${String(year + 1).slice(-2)}`;
}

async function loadDotEnv(file) {
  try {
    const text = await readFile(file, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // no file
  }
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fxpa(leagueId, cookie, ua, method, data = {}) {
  const res = await fetch(`https://www.fantrax.com/fxpa/req?leagueId=${leagueId}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Accept: "application/json",
      Cookie: cookie,
      Referer: `https://www.fantrax.com/fantasy/league/${leagueId}/standings`,
      "User-Agent": ua,
    },
    body: JSON.stringify({ msgs: [{ method, data: { leagueId, ...data } }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${method} -> HTTP ${res.status}`);
  const json = await res.json();
  const code = json.pageError?.code ?? json.responses?.[0]?.pageError?.code;
  if (code === "WARNING_NOT_LOGGED_IN") {
    throw new Error("Fantrax says we're not logged in. Refresh FANTRAX_COOKIE in .env.local.");
  }
  if (code) throw new Error(`Fantrax ${code}: ${json.pageError?.text ?? json.responses?.[0]?.pageError?.text ?? ""}`);
  return json.responses?.[0]?.data ?? json;
}

function parseScore(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

function leagueFormat(seasonYear, info) {
  const constraints = info.rosterInfo?.positionConstraints ?? {};
  if (seasonYear === 2022) {
    return {
      seasonNumber: 1,
      format: "categories",
      formatLabel: "9-category",
      scoringType: info.scoringSystem?.type ?? "HEAD_TO_HEAD_ROTI_MULTI_WIN",
      slots: [
        { slot: "PG", maxActive: constraints.PG?.maxActive ?? 2 },
        { slot: "SG", maxActive: constraints.SG?.maxActive ?? 2 },
        { slot: "G", maxActive: constraints.G?.maxActive ?? 1 },
        { slot: "SF", maxActive: constraints.SF?.maxActive ?? 2 },
        { slot: "PF", maxActive: constraints.PF?.maxActive ?? 2 },
        { slot: "F", maxActive: constraints.F?.maxActive ?? 1 },
        { slot: "C", maxActive: constraints.C?.maxActive ?? 2 },
        { slot: "Flx", maxActive: constraints.Flx?.maxActive ?? 3 },
      ],
      categories: ["PTS", "REB", "AST", "ST", "BLK", "3PTM", "TO", "FG%", "FT%"],
    };
  }
  return {
    seasonNumber: seasonYear - 2021,
    format: "points",
    formatLabel: "Points",
    scoringType: info.scoringSystem?.type ?? "HEAD_TO_HEAD_POINTS_BASED",
    slots: [{ slot: "Flx", maxActive: constraints.Flx?.maxActive ?? 31 }],
    categories: [],
  };
}

function scorerLookup(scorers = []) {
  return Object.fromEntries(
    scorers.filter((p) => p?.scorerId).map((p) => [
      p.scorerId,
      {
        name: p.name,
        nbaTeam: p.teamShortName ?? "",
        position: String(p.posShortNames ?? "").split(",")[0] ?? "",
      },
    ]),
  );
}

function parseDraft(draft, allPlayers, teamsById, seasonYear, scorers = []) {
  const named = scorerLookup(scorers);
  return {
    type: seasonYear === 2022 ? "startup" : "rookie",
    date: draft?.draftDate ?? null,
    picks: (draft?.draftPicks ?? []).map((p) => {
      const player = allPlayers[p.playerId];
      const scorer = named[p.playerId];
      return {
        playerId: p.playerId,
        name: player?.name ?? scorer?.name ?? "Unknown",
        nbaTeam: player?.team ?? scorer?.nbaTeam ?? "",
        position: player?.position ?? scorer?.position ?? "",
        teamId: p.teamId,
        teamName: teamsById[p.teamId] ?? p.teamId,
        round: p.round,
        pick: p.pick,
        pickInRound: p.pickInRound,
      };
    }),
  };
}

function parseRound(round) {
  return {
    caption: round.caption ?? "Round",
    subCaption: round.subCaption ?? "",
    matchups: (round.playoffList ?? []).map((m) => ({
      homeId: m.homeId && m.homeId !== "-1" ? m.homeId : null,
      homeName: m.homeTeamName && m.homeTeamName !== "None/Bye" ? m.homeTeamName : null,
      homeScore: parseScore(m.homeScore),
      awayId: m.awayId && m.awayId !== "-1" ? m.awayId : null,
      awayName: m.awayTeamName && m.awayTeamName !== "None/Bye" ? m.awayTeamName : null,
      awayScore: parseScore(m.awayScore),
      bye: m.awayId === "-1" || m.awayTeamName === "None/Bye",
    })),
  };
}

async function main() {
  await loadDotEnv(path.resolve(process.cwd(), ".env.local"));
  const cookie = process.env.FANTRAX_COOKIE;
  const ua =
    process.env.FANTRAX_USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
  if (!cookie) throw new Error("FANTRAX_COOKIE is required to fetch playoff brackets.");

  const allPlayers = await getJson(`${FANTRAX}/getPlayerIds?sport=NBA`);
  const seasons = [];

  for (const { seasonYear, leagueId } of HISTORY_LEAGUES) {
    const season = nbaSeason(seasonYear);
    console.log(`\n=== ${season} ===`);
    const [info, standings, draft, loggedIn, loggedDraft] = await Promise.all([
      getJson(`${FANTRAX}/getLeagueInfo?leagueId=${leagueId}`),
      getJson(`${FANTRAX}/getStandings?leagueId=${leagueId}`),
      getJson(`${FANTRAX}/getDraftResults?leagueId=${leagueId}`),
      fxpa(leagueId, cookie, ua, "getStandings"),
      fxpa(leagueId, cookie, ua, "getDraftResults"),
    ]);
    const lastPeriod = Math.max(0, ...(info.scoringPeriods ?? []).map((p) => p.number));
    const rosters = await getJson(
      `${FANTRAX}/getTeamRosters?leagueId=${leagueId}${lastPeriod ? `&period=${lastPeriod}` : ""}`,
    );

    const tree = loggedIn.playoffTree ?? {};
    const rounds = (tree.rounds ?? []).map(parseRound);
    const teamsById = Object.fromEntries(
      Object.values(info.teamInfo ?? {}).map((t) => [t.id, t.name]),
    );

    const named = scorerLookup(loggedDraft.scorers ?? []);
    const rosterOut = {};
    for (const [teamId, roster] of Object.entries(rosters.rosters ?? {})) {
      rosterOut[teamId] = {
        teamName: roster.teamName ?? teamsById[teamId] ?? teamId,
        players: (roster.rosterItems ?? []).map((item) => {
          const p = allPlayers[item.id];
          const scorer = named[item.id];
          return {
            id: item.id,
            name: p?.name ?? scorer?.name ?? "Unknown",
            nbaTeam: p?.team ?? scorer?.nbaTeam ?? "",
            position: p?.position ?? scorer?.position ?? "",
            eligiblePos: p?.position ?? scorer?.position ?? "",
            rosterPosition: item.position,
            status: item.status,
          };
        }),
      };
    }

    const format = leagueFormat(seasonYear, info);
    const payload = {
      season,
      seasonYear,
      leagueId,
      leagueName: info.leagueName,
      startDate: info.startDate,
      endDate: info.endDate,
      ...format,
      playoffs: info.playoffs ?? null,
      rosterPeriod: rosters.period ?? null,
      champion: tree.championId
        ? { teamId: tree.championId, teamName: tree.champion ?? teamsById[tree.championId] ?? tree.championId }
        : null,
      standings: (Array.isArray(standings) ? standings : []).map((row) => ({
        rank: row.rank,
        teamId: row.teamId,
        teamName: row.teamName,
        record: row.points,
        winPercentage: row.winPercentage,
        pointsFor: row.totalPointsFor,
        gamesBack: row.gamesBack,
      })),
      rounds,
      draft: parseDraft(draft, allPlayers, teamsById, seasonYear, loggedDraft.scorers ?? []),
      rosters: rosterOut,
    };
    console.log(
      `champion ${payload.champion?.teamName ?? "—"} · ${payload.formatLabel} · ${payload.draft.picks.length} draft picks · ${payload.standings.length} standings · ${rounds.length} playoff rounds · ${Object.keys(rosterOut).length} rosters (period ${payload.rosterPeriod})`,
    );
    seasons.push(payload);
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), seasons }, null, 2) + "\n");
  console.log(`\nWrote ${seasons.length} seasons to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
