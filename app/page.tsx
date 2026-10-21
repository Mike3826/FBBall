import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import PlayerLink from "@/components/PlayerLink";
import { SECTION_ITEMS } from "@/lib/nav";
import { LIVE_TTL_MS } from "@/lib/nba";
import {
  formatDate,
  formatShortDate,
  getCurrentPeriod,
  getMatchupsForPeriod,
  isTeamSide,
  leagueInfo,
  standingsRows,
} from "@/lib/data";
import { formatFp } from "@/lib/scoring";
import { getStats } from "@/lib/stats";

const SECTION_BLURBS: Record<string, string> = {
  "/live": "This week's matchups, live scores, and every team's bestball lineup.",
  "/teams": "Rosters, records, and points for all 10 franchises.",
  "/players": "Search the full player pool — rostered, free agents, and waivers.",
  "/daily-rankings": "Who produced the most fantasy points last night.",
  "/weekly-rankings": "Top performers for the current scoring period.",
  "/season": "Season-long team points and player leaders.",
  "/analytics": "To be implemented soon.",
  "/transactions": "Every deal in league history.",
  "/history": "Champions, playoff brackets, and final rosters from past seasons.",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const stats = await getStats();
  const period = getCurrentPeriod();
  const matchups = period ? getMatchupsForPeriod(period.number) : [];
  const standingsById = new Map(standingsRows.map((s) => [s.teamId, s]));
  const latestDate = stats.gameDates.at(-1);
  const topScorers = latestDate ? stats.dailyLeaders(latestDate).slice(0, 10) : [];

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
                    <td className="text-right tabular-nums font-semibold">{formatFp(s.totalPointsFor)}</td>
                    <td className="text-right tabular-nums text-slate-400">{s.gamesBack}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Matchups */}
        <section className="card flex h-full flex-col">
          <div className="border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Week {period?.number} Matchups</h2>
          </div>
          <ul className="flex flex-1 flex-col divide-y divide-white/5">
            {matchups.map((m, i) => {
              const away = isTeamSide(m.away) ? m.away : null;
              const home = isTeamSide(m.home) ? m.home : null;
              if (!away || !home) return null;
              const a = standingsById.get(away.id);
              const h = standingsById.get(home.id);
              return (
                <li key={i} className="flex flex-1 flex-col justify-center px-5 text-sm">
                  <div className="flex items-center justify-between">
                    <Link href={`/teams/${away.id}`} className="truncate hover:text-gold">
                      {away.name}
                    </Link>
                    <span className="ml-3 tabular-nums text-slate-300">{a ? formatFp(a.totalPointsFor) : ""}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <Link href={`/teams/${home.id}`} className="truncate hover:text-gold">
                      {home.name}
                    </Link>
                    <span className="ml-3 tabular-nums text-slate-300">{h ? formatFp(h.totalPointsFor) : ""}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
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
                      <td className={`text-right tabular-nums font-bold ${r.fp > 50 ? "text-parse-pink" : "text-gold"}`}>{formatFp(r.fp)}</td>
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

        {/* Scoring */}
        <section className="card flex h-full flex-col">
          <div className="border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Scoring</h2>
          </div>
          <ul className="flex flex-1 flex-col divide-y divide-white/5">
            {leagueInfo.scoring.map((rule) => (
              <li key={rule.code} className="flex flex-1 items-center justify-between px-5">
                <span className="text-sm text-slate-400">{rule.name}</span>
                <span className={`text-sm font-bold tabular-nums ${rule.points < 0 ? "text-rose-400" : "text-white"}`}>
                  {rule.points > 0 ? "+" : ""}
                  {rule.points}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
