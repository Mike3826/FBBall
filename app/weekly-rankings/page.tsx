import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import PageHeader from "@/components/PageHeader";
import StatLeaderboard from "@/components/StatLeaderboard";
import {
  formatShortDate,
  getCurrentPeriod,
  getMatchupsForPeriod,
  isTeamSide,
  leagueInfo,
  standingsRows,
} from "@/lib/data";
import { LIVE_TTL_MS } from "@/lib/nba";
import { formatFp } from "@/lib/scoring";
import { getFantasyTeamTotals, getStats, updatedLabel } from "@/lib/stats";

export const metadata = { title: "Weekly Rankings" };
export const dynamic = "force-dynamic";

export default async function WeeklyRankingsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const [{ period: requested }, stats] = await Promise.all([searchParams, getStats()]);
  const current = getCurrentPeriod();
  const period =
    leagueInfo.scoringPeriods.find((p) => String(p.number) === requested) ?? current ?? leagueInfo.scoringPeriods[0];
  const isCurrent = period.number === current?.number;

  const logs = stats.logsInPeriod(period);
  const leaders = stats.periodLeaders(period);
  const computed = getFantasyTeamTotals(logs);
  const records = new Map(standingsRows.map((s) => [s.teamId, s.points]));
  const max = Math.max(computed[0]?.fp ?? 0, 1);
  const avg = computed.reduce((s, r) => s + r.fp, 0) / (computed.length || 1);
  const anyLive = logs.some((l) => l.live);

  const matchups = getMatchupsForPeriod(period.number);
  const computedById = new Map(computed.map((c) => [c.teamId, c.fp]));

  // Prev/next navigation among regular-season + playoff periods.
  const idx = leagueInfo.scoringPeriods.findIndex((p) => p.number === period.number);
  const prev = leagueInfo.scoringPeriods[idx - 1];
  const next = leagueInfo.scoringPeriods[idx + 1];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Rankings"
        subtitle={`Week ${period.number} · ${formatShortDate(period.startDate)} – ${formatShortDate(period.endDate)}${
          period.number >= leagueInfo.playoffs.firstPlayoffPeriod ? " · Playoffs" : ""
        }`}
      >
        <div className="flex items-center gap-3 text-sm">
          <AutoRefresh intervalMs={LIVE_TTL_MS} label="Live" />
          {prev ? (
            <Link href={`/weekly-rankings?period=${prev.number}`} className="rounded-md border-2 border-white/15 px-3 py-1.5 text-slate-300 hover:text-white">
              ← Wk {prev.number}
            </Link>
          ) : (
            <span className="rounded-md border-2 border-white/10 px-3 py-1.5 text-slate-600">← Wk</span>
          )}
          {!isCurrent && current && (
            <Link href="/weekly-rankings" className="rounded-md border border-raptor/40 px-3 py-1.5 text-gold hover:bg-raptor/10">
              Current
            </Link>
          )}
          {next ? (
            <Link href={`/weekly-rankings?period=${next.number}`} className="rounded-md border-2 border-white/15 px-3 py-1.5 text-slate-300 hover:text-white">
              Wk {next.number} →
            </Link>
          ) : (
            <span className="rounded-md border-2 border-white/10 px-3 py-1.5 text-slate-600">Wk →</span>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Team Points · Week {period.number}</h2>
            <span className="text-xs text-slate-500">
              Avg {formatFp(avg)}
              {anyLive && <span className="ml-2 inline-flex items-center gap-1 text-rose-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />live</span>}
            </span>
          </div>
          {logs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No game logs for this week yet.</p>
          ) : (
            <ol className="divide-y divide-white/5">
              {computed.map((t, i) => (
                  <li key={t.teamId} className="px-5 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-3">
                        <span className="w-5 text-right tabular-nums text-slate-500">{i + 1}</span>
                        <Link href={`/teams/${t.teamId}`} className="font-medium text-white hover:text-gold">
                          {t.teamName}
                        </Link>
                        {records.get(t.teamId) && (
                          <span className="text-xs tabular-nums text-slate-500">{records.get(t.teamId)}</span>
                        )}
                      </span>
                      <span className="tabular-nums font-semibold">{formatFp(t.fp)}</span>
                    </div>
                    <div className="ml-8 mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-raptor" style={{ width: `${(t.fp / max) * 100}%` }} />
                    </div>
                  </li>
              ))}
            </ol>
          )}
        </section>

        <div className="space-y-6">
          <section className="card">
            <div className="border-b-2 border-white/15 px-5 py-3">
              <h2 className="card-title">Matchups</h2>
            </div>
            <ul className="divide-y divide-white/5 text-sm">
              {matchups.map((m, i) => {
                if (!isTeamSide(m.away) || !isTeamSide(m.home)) {
                  return (
                    <li key={i} className="px-5 py-3 text-xs text-slate-500">
                      Playoff matchup — seeds TBD
                    </li>
                  );
                }
                const a = computedById.get(m.away.id) ?? 0;
                const h = computedById.get(m.home.id) ?? 0;
                return (
                  <li key={i} className="px-5 py-3">
                    <div className="flex justify-between gap-3">
                      <Link href={`/teams/${m.away.id}`} className={`truncate hover:text-gold ${a >= h ? "text-white" : "text-slate-400"}`}>{m.away.name}</Link>
                      <span className="tabular-nums">{formatFp(a)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <Link href={`/teams/${m.home.id}`} className={`truncate hover:text-gold ${h > a ? "text-white" : "text-slate-400"}`}>{m.home.name}</Link>
                      <span className="tabular-nums">{formatFp(h)}</span>
                    </div>
                    {(a || h) > 0 && (
                      <div className="mt-1 text-xs text-slate-500">
                        {(a >= h ? m.away : m.home).shortName} by {formatFp(Math.abs(a - h))}
                      </div>
                    )}
                  </li>
                );
              })}
              {matchups.length === 0 && <li className="px-5 py-3 text-xs text-slate-500">No matchups scheduled.</li>}
            </ul>
          </section>

          <section className="card">
            <div className="border-b-2 border-white/15 px-5 py-3">
              <h2 className="card-title">Season Schedule</h2>
            </div>
            <ul className="max-h-72 divide-y divide-white/5 overflow-y-auto text-sm">
              {leagueInfo.scoringPeriods.map((p) => {
                const isPlayoff = p.number >= leagueInfo.playoffs.firstPlayoffPeriod;
                const selected = p.number === period.number;
                return (
                  <li key={p.number}>
                    <Link
                      href={`/weekly-rankings?period=${p.number}`}
                      className={`flex items-center justify-between px-5 py-2 hover:bg-white/[0.03] ${selected ? "bg-raptor/10" : ""}`}
                    >
                      <span className={selected ? "font-semibold text-gold" : "text-slate-300"}>
                        Week {p.number}
                        {isPlayoff && <span className="ml-2 text-xs text-slate-500">Playoffs</span>}
                        {p.number === current?.number && <span className="ml-2 text-xs text-slate-500">Current</span>}
                      </span>
                      <span className="text-xs tabular-nums text-slate-500">
                        {formatShortDate(p.startDate)} – {formatShortDate(p.endDate)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      <section className="card">
        <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
          <h2 className="card-title">Player Leaders · Week {period.number}</h2>
          <span className="text-xs text-slate-500">
            {leaders.length} players · top 50
            {` · ${updatedLabel(stats.meta)}`}
          </span>
        </div>
        {leaders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No player stats for this week yet.</p>
        ) : (
          <StatLeaderboard mode="weekly" rows={leaders} limit={50} />
        )}
      </section>
    </div>
  );
}
