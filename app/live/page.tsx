import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import { LineupCard, LiveDot, fmt } from "@/components/LineupCard";
import LiveMatchups from "@/components/LiveMatchups";
import PageHeader from "@/components/PageHeader";
import { formatShortDate, getCurrentPeriod, leagueInfo } from "@/lib/data";
import { LINEUP_SLOTS, buildLiveMatchups, buildTeamLineups, type TeamLineup } from "@/lib/lineups";
import { LIVE_TTL_MS } from "@/lib/nba";
import { getStats, updatedLabel } from "@/lib/stats";

export const metadata = { title: "Live" };
export const dynamic = "force-dynamic";

type Search = Promise<{ m?: string }>;

function TeamName({ t, className = "" }: { t: TeamLineup; className?: string }) {
  return (
    <Link href={`/teams/${t.team.id}`} className={`truncate hover:text-gold ${className}`}>
      {t.team.name}
    </Link>
  );
}

export default async function LivePage({ searchParams }: { searchParams: Search }) {
  const stats = await getStats();
  const period = getCurrentPeriod() ?? leagueInfo.scoringPeriods[0];
  const lineups = buildTeamLineups(stats, period).sort((a, b) => b.score - a.score || b.rosterTotal - a.rosterTotal);
  const ranks = Object.fromEntries(lineups.map((l, i) => [l.team.id, i + 1])) as Record<string, number>;
  const matchups = buildLiveMatchups(lineups, period);
  const { m } = await searchParams;
  const selectedIndex = m && Number.isInteger(Number(m)) ? Number(m) : null;
  const todaysGames = stats.games.filter((g) => g.date === stats.meta.today);
  const liveGames = todaysGames.filter((g) => g.status === 2).length;
  const anyLive = lineups.some((l) => l.liveCount > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Live"
        subtitle={`Week ${period.number} · ${formatShortDate(period.startDate)} – ${formatShortDate(period.endDate)} · ${updatedLabel(stats.meta)}`}
      >
        <AutoRefresh intervalMs={LIVE_TTL_MS} label={anyLive ? "Live" : "Auto-refresh"} />
      </PageHeader>

      <LiveMatchups periodNumber={period.number} matchups={matchups} ranks={ranks} selectedIndex={selectedIndex} />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Live Rankings · Week {period.number}</h2>
            <Link href="/weekly-rankings" className="text-xs text-gold hover:underline">
              Weekly rankings
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base whitespace-nowrap">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Team</th>
                  <th className="text-right">Score</th>
                  <th className="text-right">Roster Total</th>
                  <th className="text-right">Bench</th>
                  <th className="text-right">GP</th>
                  <th className="text-right" title="Games remaining this week for the counting lineup">
                    GR
                  </th>
                  <th className="text-right">Live</th>
                </tr>
              </thead>
              <tbody>
                {lineups.map((t, i) => (
                  <tr key={t.team.id}>
                    <td className="text-slate-500">{i + 1}</td>
                    <td className="font-semibold text-white">
                      <TeamName t={t} />
                      {t.liveCount > 0 && <LiveDot className="ml-1.5" />}
                    </td>
                    <td className="text-right text-base font-extrabold tabular-nums text-gold">{fmt(t.score)}</td>
                    <td className="text-right tabular-nums text-slate-300">{fmt(t.rosterTotal)}</td>
                    <td className="text-right tabular-nums text-slate-500">{fmt(t.rosterTotal - t.score)}</td>
                    <td className="text-right tabular-nums text-slate-400">{t.countingGames}</td>
                    <td className="text-right tabular-nums text-slate-400">{t.gamesRemaining}</td>
                    <td className="text-right tabular-nums">
                      {t.liveCount > 0 ? <span className="text-raptor-soft">{t.liveCount}</span> : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Today&apos;s NBA Games</h2>
            <span className="text-xs text-slate-500">
              {liveGames > 0 ? `${liveGames} live` : `${todaysGames.length} game${todaysGames.length === 1 ? "" : "s"}`}
            </span>
          </div>
          {todaysGames.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No NBA games today.</p>
          ) : (
            <ul className="divide-y divide-white/10 text-sm">
              {todaysGames.map((g) => (
                <li key={g.gameId} className="flex items-center justify-between px-5 py-2.5">
                  <span className="tabular-nums">
                    <span className={g.awayScore > g.homeScore ? "font-semibold text-white" : "text-slate-400"}>
                      {g.away} {g.status > 1 ? g.awayScore : ""}
                    </span>
                    <span className="mx-2 text-slate-600">@</span>
                    <span className={g.homeScore > g.awayScore ? "font-semibold text-white" : "text-slate-400"}>
                      {g.home} {g.status > 1 ? g.homeScore : ""}
                    </span>
                  </span>
                  <span className={`text-xs ${g.status === 2 ? "font-semibold text-raptor-soft" : "text-slate-500"}`}>{g.statusText.trim()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Bestball Lineups</h2>
          <span className="text-xs text-slate-500">
            Top {LINEUP_SLOTS.G} guards, {LINEUP_SLOTS.F} forwards, and {LINEUP_SLOTS.C} centers by week-to-date fantasy points
          </span>
        </div>
        {lineups.map((t) => (
          <LineupCard key={t.team.id} t={t} rank={ranks[t.team.id] ?? 0} />
        ))}
      </section>
    </div>
  );
}
