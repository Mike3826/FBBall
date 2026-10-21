import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import PageHeader from "@/components/PageHeader";
import StatLeaderboard from "@/components/StatLeaderboard";
import { formatShortDate, leagueInfo, standingsRows } from "@/lib/data";
import { currentSeasonKey } from "@/lib/history";
import { LIVE_TTL_MS } from "@/lib/nba";
import { formatFp } from "@/lib/scoring";
import { getFantasyTeamTotals, getStats, updatedLabel } from "@/lib/stats";

export const metadata = { title: "Season" };
export const dynamic = "force-dynamic";

export default async function SeasonPage() {
  const stats = await getStats();
  const season = currentSeasonKey();
  const first = leagueInfo.scoringPeriods[0];
  const last = leagueInfo.scoringPeriods[leagueInfo.scoringPeriods.length - 1];
  const leaders = stats.seasonLeaders();
  const computed = getFantasyTeamTotals(stats.logs);
  const records = new Map(standingsRows.map((s) => [s.teamId, s.points]));
  const max = Math.max(computed[0]?.fp ?? 0, 1);
  const avg = computed.reduce((s, r) => s + r.fp, 0) / (computed.length || 1);
  const anyLive = stats.logs.some((l) => l.live);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Season"
        subtitle={`${season} · ${first ? formatShortDate(first.startDate) : ""} – ${last ? formatShortDate(last.endDate) : ""}`}
      >
        <AutoRefresh intervalMs={LIVE_TTL_MS} label="Live" />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Team Points · {season}</h2>
            <span className="text-xs text-slate-500">
              Avg {formatFp(avg)}
              {anyLive && (
                <span className="ml-2 inline-flex items-center gap-1 text-rose-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                  live
                </span>
              )}
            </span>
          </div>
          {stats.logs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No game logs for this season yet.</p>
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

        <section className="card">
          <div className="border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Standings</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base table-dense whitespace-nowrap">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Team</th>
                  <th className="text-right">W-L-T</th>
                  <th className="text-right">FPts</th>
                </tr>
              </thead>
              <tbody>
                {standingsRows.map((row) => (
                  <tr key={row.teamId}>
                    <td className="tabular-nums text-slate-500">{row.rank}</td>
                    <td>
                      <Link href={`/teams/${row.teamId}`} className="text-white hover:text-gold">
                        {row.teamName}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums text-slate-300">{row.points}</td>
                    <td className="text-right tabular-nums text-slate-300">
                      {formatFp(row.totalPointsFor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
          <h2 className="card-title">Player Leaders · {season}</h2>
          <span className="text-xs text-slate-500">
            {leaders.length} players · top 50
            {` · ${updatedLabel(stats.meta)}`}
          </span>
        </div>
        {leaders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No player stats for this season yet.</p>
        ) : (
          <StatLeaderboard mode="weekly" rows={leaders} limit={50} />
        )}
      </section>
    </div>
  );
}
