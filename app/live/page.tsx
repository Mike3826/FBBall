import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import PageHeader from "@/components/PageHeader";
import PlayerLink from "@/components/PlayerLink";
import { formatShortDate, getCurrentPeriod, leagueInfo } from "@/lib/data";
import {
  LINEUP_SLOTS,
  SLOTS,
  SLOT_LABEL,
  buildLiveMatchups,
  buildTeamLineups,
  type LineupPlayer,
  type TeamLineup,
} from "@/lib/lineups";
import { LIVE_TTL_MS } from "@/lib/nba";
import { getStats, updatedLabel } from "@/lib/stats";

export const metadata = { title: "Live" };
export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toFixed(1);

function LiveDot({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-raptor-soft align-middle ${className}`} title="In progress" />;
}

function TeamName({ t, className = "" }: { t: TeamLineup; className?: string }) {
  return (
    <Link href={`/teams/${t.team.id}`} className={`truncate hover:text-gold ${className}`}>
      {t.team.name}
    </Link>
  );
}

export default async function LivePage() {
  const stats = await getStats();
  const period = getCurrentPeriod() ?? leagueInfo.scoringPeriods[0];
  const lineups = buildTeamLineups(stats, period).sort((a, b) => b.score - a.score || b.rosterTotal - a.rosterTotal);
  const rankById = new Map(lineups.map((l, i) => [l.team.id, i + 1]));
  const matchups = buildLiveMatchups(lineups, period);
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

      {/* Matchups */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Matchups · Week {period.number}</h2>
          <span className="text-xs text-slate-500">Scores count the top {LINEUP_SLOTS.G} G · {LINEUP_SLOTS.F} F · {LINEUP_SLOTS.C} C on each roster</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {matchups.map((m, i) => {
            const a = m.away;
            const h = m.home;
            if (!a || !h) {
              return (
                <div key={i} className="card flex items-center justify-between p-4 text-sm">
                  <span className="truncate font-semibold text-white">{a?.team.name ?? h?.team.name ?? "—"}</span>
                  <span className="pill bg-white/5 text-slate-400">{m.label ?? "TBD"}</span>
                </div>
              );
            }
            const total = a.score + h.score || 1;
            const aLead = a.score > h.score;
            const hLead = h.score > a.score;
            const liveHere = a.liveCount + h.liveCount > 0;
            return (
              <div key={i} className={`card p-4 ${liveHere ? "border-raptor" : ""}`}>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Matchup {i + 1}</span>
                  {liveHere ? (
                    <span className="inline-flex items-center gap-1.5 text-raptor-soft">
                      <LiveDot /> {a.liveCount + h.liveCount} playing
                    </span>
                  ) : (
                    <span>{a.playedTodayCount + h.playedTodayCount} played today</span>
                  )}
                </div>
                {[a, h].map((t, side) => {
                  const lead = side === 0 ? aLead : hLead;
                  return (
                    <div key={t.team.id} className={`mt-3 flex items-center justify-between gap-3 ${side === 0 ? "" : "mt-2"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 shrink-0 text-xs tabular-nums text-slate-500">#{rankById.get(t.team.id)}</span>
                          <TeamName t={t} className={`text-sm font-bold ${lead ? "text-white" : "text-slate-300"}`} />
                          {t.liveCount > 0 && <LiveDot />}
                        </div>
                        <div className="mt-1.5 ml-7 h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div className={`h-full rounded-full ${lead ? "bg-raptor" : "bg-silver/60"}`} style={{ width: `${(t.score / total) * 100}%` }} />
                        </div>
                      </div>
                      <span className={`shrink-0 text-xl font-extrabold tabular-nums ${lead ? "text-gold" : "text-slate-300"}`}>{fmt(t.score)}</span>
                    </div>
                  );
                })}
                <div className="mt-3 flex justify-between text-[11px] text-slate-500">
                  <span>{a.countingGames} counting games</span>
                  <span>{h.countingGames} counting games</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Live rankings */}
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
                    <td className="text-right tabular-nums">
                      {t.liveCount > 0 ? <span className="text-raptor-soft">{t.liveCount}</span> : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Today's games */}
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

      {/* Lineups */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Counting Lineups</h2>
          <span className="text-xs text-slate-500">
            Top {LINEUP_SLOTS.G} guards, {LINEUP_SLOTS.F} forwards, and {LINEUP_SLOTS.C} centers by week-to-date fantasy points
          </span>
        </div>
        {lineups.map((t, i) => (
          <LineupCard key={t.team.id} t={t} rank={i + 1} />
        ))}
      </section>
    </div>
  );
}

function LineupCard({ t, rank }: { t: TeamLineup; rank: number }) {
  return (
    <section className="card" id={`team-${t.team.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-white/15 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded border-2 border-white/15 text-xs font-bold tabular-nums text-slate-300">{rank}</span>
          <Link href={`/teams/${t.team.id}`} className="text-base font-extrabold text-white hover:text-gold">
            {t.team.name}
          </Link>
          {t.liveCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-raptor-soft">
              <LiveDot /> {t.liveCount} live
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>
            Roster <span className="tabular-nums text-slate-300">{fmt(t.rosterTotal)}</span>
          </span>
          <span>
            Score <span className="text-lg font-extrabold tabular-nums text-gold">{fmt(t.score)}</span>
          </span>
        </div>
      </div>
      <div className="grid divide-y-2 divide-white/10 md:grid-cols-3 md:divide-x-2 md:divide-y-0">
        {SLOTS.map((slot) => {
          const players = t.groups[slot];
          const counting = players.filter((p) => p.counting);
          const bench = players.filter((p) => !p.counting);
          const slotTotal = counting.reduce((s, p) => s + p.fp, 0);
          return (
            <div key={slot} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className={`pill pill-${slot}`}>{slot}</span>
                  {SLOT_LABEL[slot]} · top {LINEUP_SLOTS[slot]}
                </span>
                <span className="text-xs font-bold tabular-nums text-gold">{fmt(slotTotal)}</span>
              </div>
              <ul className="space-y-1">
                {counting.map((p) => (
                  <PlayerRow key={p.id} p={p} />
                ))}
                {counting.length < LINEUP_SLOTS[slot] &&
                  Array.from({ length: LINEUP_SLOTS[slot] - counting.length }).map((_, i) => (
                    <li key={`empty-${i}`} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-slate-600">
                      <span className="w-4 text-right tabular-nums">{counting.length + i + 1}</span>
                      <span>Empty slot</span>
                    </li>
                  ))}
              </ul>
              {bench.length > 0 && (
                <details className="mt-2 group">
                  <summary className="cursor-pointer select-none text-xs text-slate-500 hover:text-slate-300">
                    <span className="group-open:hidden">Show {bench.length} more</span>
                    <span className="hidden group-open:inline">Hide {bench.length} not counting</span>
                  </summary>
                  <ul className="mt-1 space-y-1 opacity-60">
                    {bench.map((p) => (
                      <PlayerRow key={p.id} p={p} />
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PlayerRow({ p }: { p: LineupPlayer }) {
  return (
    <li className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${p.counting ? "bg-white/[0.03]" : ""}`}>
      <span className="w-4 shrink-0 text-right text-xs tabular-nums text-slate-500">{p.rank}</span>
      <span className="min-w-0 flex-1 truncate">
        <PlayerLink id={p.id} className={p.counting ? "font-semibold text-white" : "text-slate-300"}>
          {p.name}
        </PlayerLink>
        <span className="ml-1.5 text-xs text-slate-500">{p.nbaTeam}</span>
        {p.live && <LiveDot className="ml-1.5" />}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-slate-500">{p.games > 0 ? `${p.games} gp` : ""}</span>
      <span className={`w-14 shrink-0 text-right tabular-nums ${p.fp > 0 ? "font-bold text-gold" : "text-slate-600"}`}>
        {p.fp > 0 ? fmt(p.fp) : "—"}
      </span>
    </li>
  );
}
