// Adds format metadata + named draft picks to the existing history snapshot
// without re-fetching authenticated playoff trees. Uses the logged-in draft
// recap so retired players still get names.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FANTRAX = "https://www.fantrax.com/fxea/general";
const OUT = path.resolve(process.cwd(), "data/history/league.json");

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

async function fxpa(leagueId, cookie, ua, method) {
  const res = await fetch(`https://www.fantrax.com/fxpa/req?leagueId=${leagueId}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Accept: "application/json",
      Cookie: cookie,
      Referer: `https://www.fantrax.com/fantasy/league/${leagueId}/draft-results`,
      "User-Agent": ua,
    },
    body: JSON.stringify({ msgs: [{ method, data: { leagueId } }] }),
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

async function main() {
  await loadDotEnv(path.resolve(process.cwd(), ".env.local"));
  const cookie = process.env.FANTRAX_COOKIE;
  const ua =
    process.env.FANTRAX_USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
  if (!cookie) throw new Error("FANTRAX_COOKIE is required to name retired draft picks.");

  const league = JSON.parse(await readFile(OUT, "utf8"));
  const allPlayers = await getJson(`${FANTRAX}/getPlayerIds?sport=NBA`);

  for (const season of league.seasons) {
    const [info, draft, loggedDraft] = await Promise.all([
      getJson(`${FANTRAX}/getLeagueInfo?leagueId=${season.leagueId}`),
      getJson(`${FANTRAX}/getDraftResults?leagueId=${season.leagueId}`),
      fxpa(season.leagueId, cookie, ua, "getDraftResults"),
    ]);
    const named = scorerLookup(loggedDraft.scorers ?? []);
    const teamsById = {
      ...Object.fromEntries((season.standings ?? []).map((t) => [t.teamId, t.teamName])),
      ...Object.fromEntries(Object.entries(season.rosters ?? {}).map(([id, r]) => [id, r.teamName])),
    };
    Object.assign(season, leagueFormat(season.seasonYear, info));
    season.draft = {
      type: season.seasonYear === 2022 ? "startup" : "rookie",
      date: draft.draftDate ?? null,
      picks: (draft.draftPicks ?? []).map((p) => {
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
    for (const roster of Object.values(season.rosters ?? {})) {
      for (const p of roster.players ?? []) {
        if (p.name && p.name !== "Unknown") continue;
        const player = allPlayers[p.id];
        const scorer = named[p.id];
        if (player || scorer) {
          p.name = player?.name ?? scorer.name;
          p.nbaTeam = player?.team ?? scorer.nbaTeam ?? p.nbaTeam;
          p.position = player?.position ?? scorer.position ?? p.position;
        }
      }
    }
    const unknown = season.draft.picks.filter((p) => p.name === "Unknown").length;
    console.log(
      `${season.season} S${season.seasonNumber} ${season.formatLabel} · ${season.draft.type} draft · ${season.draft.picks.length} picks · unknown ${unknown}`,
    );
  }

  league.fetchedAt = new Date().toISOString();
  await writeFile(OUT, JSON.stringify(league, null, 2) + "\n");
  console.log(`\nUpdated ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
