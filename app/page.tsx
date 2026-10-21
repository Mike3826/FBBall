import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import PlayerLink from "@/components/PlayerLink";
import { SECTION_ITEMS } from "@/lib/nav";
import { LIVE_TTL_MS } from "@/lib/nba";
import {
  draftResults,
  formatDate,
  formatPlayerName,
  formatShortDate,
  getCurrentPeriod,
  getMatchupsForPeriod,
  getTeamName,
  isTeamSide,
  leagueInfo,
  playerMap,
  standingsRows,
} from "@/lib/data";
import { getStats } from "@/lib/stats";

const SECTION_BLURBS: Record<string, string> = {
  "/live": "This week's matchups, live scores, and every team's counting lineup.",
  "/teams": "Rosters, records, and points for all 10 franchises.",
  "/players": "Search the full player pool — rostered, free agents, and waivers.",
  "/daily-rankings": "Who produced the most fantasy points last night.",
  "/weekly-rankings": "Top performers for the current scoring period.",
  "/analytics": "Draft breakdowns, roster construction, and league trends.",
  "/trade-log": "Every deal in league history.",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const stats = await getStats();
  const period = getCurrentPeriod();
  const matchups = period ? getMatchupsForPeriod(period.number) : [];
  const standingsById = new Map(standingsRows.map((s) => [s.teamId, s]));
  const recentPicks = [...draftResults.draftPicks].sort((a, b) => b.pick - a.pick).slice(0, 8);
  const latestDate = stats.gameDates.at(-1);
  const topScorers = latestDate ? stats.dailyLeaders(latestDate).slice(0, 8) : [];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="card relative overflow-hidden border-raptor px-6 py-8 sm:px-10 sm:py-10">
        <p className="card-title">Fantrax · {leagueInfo.scoringType?.replaceAll("_", " ").toLowerCase()}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">
          {leagueInfo.leagueName}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
          {leagueInfo.teams.length}-team dynasty league · {leagueInfo.seasonYear}–
          {String(leagueInfo.seasonYear + 1).slice(-2)} season · {formatDate(leagueInfo.startDate)} to{" "}
          {formatDate(leagueInfo.endDate)} · {leagueInfo.playoffs.numPlayoffTeams} playoff spots
        </p>
        {period && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-raptor/30 bg-raptor/10 px-3 py-1 text-xs font-semibold text-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-raptor" />
            Week {period.number} · {formatShortDate(period.startDate)} – {formatShortDate(period.endDate)}
          </p>
        )}
      </section>

      {/* Section cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTION_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card group flex flex-col gap-1 p-5 transition-colors hover:border-raptor"
          >
            <span className="text-base font-semibold text-white group-hover:text-gold">
              {item.label} <span aria-hidden>→</span>
            </span>
            <span className="text-sm text-slate-400">{SECTION_BLURBS[item.href]}</span>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Standings */}
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Standings</h2>
            <Link href="/teams" className="text-xs text-gold hover:underline">
              All teams
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Team</th>
                  <th className="text-right">W-L-T</th>
                  <th className="text-right">Win %</th>
                  <th className="text-right">PF</th>
                  <th className="text-right">GB</th>
                </tr>
              </thead>
              <tbody>
                {standingsRows.map((s) => (
                  <tr key={s.teamId}>
                    <td className="text-slate-500">{s.rank}</td>
                    <td>
                      <Link href={`/teams/${s.teamId}`} className="font-medium text-white hover:text-gold">
                        {s.teamName}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{s.points}</td>
                    <td className="text-right tabular-nums text-slate-400">{s.winPercentage.toFixed(3)}</td>
                    <td className="text-right tabular-nums font-semibold">{s.totalPointsFor.toFixed(2)}</td>
                    <td className="text-right tabular-nums text-slate-400">{s.gamesBack}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Matchups */}
        <section className="card">
          <div className="border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Week {period?.number} Matchups</h2>
          </div>
          <ul className="divide-y divide-white/5">
            {matchups.map((m, i) => {
              const away = isTeamSide(m.away) ? m.away : null;
              const home = isTeamSide(m.home) ? m.home : null;
              if (!away || !home) return null;
              const a = standingsById.get(away.id);
              const h = standingsById.get(home.id);
              return (
                <li key={i} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <Link href={`/teams/${away.id}`} className="truncate hover:text-gold">
                      {away.name}
                    </Link>
                    <span className="ml-3 tabular-nums text-slate-300">{a?.totalPointsFor.toFixed(1)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <Link href={`/teams/${home.id}`} className="truncate hover:text-gold">
                      {home.name}
                    </Link>
                    <span className="ml-3 tabular-nums text-slate-300">{h?.totalPointsFor.toFixed(1)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Scoring */}
        <section className="card">
          <div className="border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Scoring</h2>
          </div>
          <ul className="grid grid-cols-3 gap-px bg-white/5 text-sm sm:grid-cols-3">
            {leagueInfo.scoring.map((rule) => (
              <li key={rule.code} className="bg-court-2 px-4 py-3">
                <div className="text-xs text-slate-400">{rule.shortName}</div>
                <div
                  className={`text-lg font-bold tabular-nums ${rule.points < 0 ? "text-rose-400" : "text-white"}`}
                >
                  {rule.points > 0 ? "+" : ""}
                  {rule.points}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Top scorers */}
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">
              Top Scorers{latestDate ? ` · ${new Date(`${latestDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : ""}
            </h2>
            <span className="flex items-center gap-3">
              <AutoRefresh intervalMs={LIVE_TTL_MS} label="Live" />
              <Link href="/daily-rankings" className="text-xs text-gold hover:underline">
                Daily rankings
              </Link>
            </span>
          </div>
          {topScorers.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No games have been played yet this season.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Player</th>
                    <th>Line</th>
                    <th className="text-right">FPts</th>
                    <th>Fantasy Team</th>
                  </tr>
                </thead>
                <tbody>
                  {topScorers.map((r, i) => (
                    <tr key={`${r.gameId}-${r.nbaId}`}>
                      <td className="text-slate-500">{i + 1}</td>
                      <td className="font-medium text-white">
                        <PlayerLink id={r.fantraxId}>{r.displayName}</PlayerLink>{" "}
                        <span className="text-xs font-normal text-slate-500">{r.team}</span>
                        {r.live && <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400 align-middle" />}
                      </td>
                      <td className="whitespace-nowrap text-slate-400">
                        {r.pts} pts · {r.reb} reb · {r.ast} ast{r.stl ? ` · ${r.stl} stl` : ""}{r.blk ? ` · ${r.blk} blk` : ""}
                      </td>
                      <td className="text-right tabular-nums font-bold text-gold">{r.fp.toFixed(1)}</td>
                      <td>
                        {r.fantasyTeamId ? (
                          <Link href={`/teams/${r.fantasyTeamId}`} className="hover:text-gold">{r.fantasyTeamName}</Link>
                        ) : (
                          <span className="pill bg-emerald-500/15 text-emerald-300">FA</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent draft picks */}
        <section className="card lg:col-span-3">
          <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Rookie Draft · {formatDate(draftResults.draftDate)}</h2>
            <Link href="/analytics" className="text-xs text-gold hover:underline">
              Draft analytics
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Pick</th>
                  <th>Player</th>
                  <th>NBA</th>
                  <th>Team</th>
                </tr>
              </thead>
              <tbody>
                {recentPicks.map((pick) => {
                  const p = playerMap[pick.playerId];
                  return (
                    <tr key={pick.pick}>
                      <td className="tabular-nums text-slate-400">
                        {pick.round}.{String(pick.pickInRound).padStart(2, "0")}
                      </td>
                      <td className="font-medium text-white">
                        <PlayerLink id={p?.id}>{p ? formatPlayerName(p.name) : pick.playerId}</PlayerLink>
                      </td>
                      <td className="text-slate-400">{p?.nbaTeam}</td>
                      <td>
                        <Link href={`/teams/${pick.teamId}`} className="hover:text-gold">
                          {getTeamName(pick.teamId)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
