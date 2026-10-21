import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PlayerLink from "@/components/PlayerLink";
import {
  allPlayers,
  draftResults,
  formatDate,
  formatPlayerName,
  getRoster,
  getTeamName,
  leagueInfo,
  playerMap,
  teams,
} from "@/lib/data";

export const metadata = { title: "Analytics" };

function Bar({ value, max, className = "bg-raptor" }: { value: number; max: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

export default function AnalyticsPage() {
  // Roster construction per team
  const rosterComp = teams.map((t) => {
    const roster = getRoster(t.id);
    const counts = { G: 0, F: 0, C: 0 } as Record<string, number>;
    const multi = roster.filter((p) => p.eligiblePos.includes(",")).length;
    const nbaTeams = new Set(roster.map((p) => p.nbaTeam));
    for (const p of roster) counts[p.rosterPosition] = (counts[p.rosterPosition] ?? 0) + 1;
    return { team: t, size: roster.length, counts, multi, nbaTeams: nbaTeams.size };
  });

  // NBA team exposure across all rosters
  const exposure = new Map<string, number>();
  for (const t of teams) for (const p of getRoster(t.id)) exposure.set(p.nbaTeam, (exposure.get(p.nbaTeam) ?? 0) + 1);
  const exposureRows = [...exposure.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const exposureMax = exposureRows[0]?.[1] ?? 1;

  // Player pool status
  const pool = { T: 0, FA: 0, WW: 0 } as Record<string, number>;
  for (const p of allPlayers) pool[p.status] = (pool[p.status] ?? 0) + 1;

  // Draft: positional + NBA-team breakdown
  const draftByPos = { G: 0, F: 0, C: 0 } as Record<string, number>;
  const draftByNba = new Map<string, number>();
  for (const pick of draftResults.draftPicks) {
    const p = playerMap[pick.playerId];
    if (!p) continue;
    for (const pos of p.eligiblePos.split(",")) if (pos) draftByPos[pos] = (draftByPos[pos] ?? 0) + 1;
    draftByNba.set(p.nbaTeam, (draftByNba.get(p.nbaTeam) ?? 0) + 1);
  }
  const rounds = [...new Set(draftResults.draftPicks.map((p) => p.round))].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="Roster construction, exposure, and draft trends" />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Rostered", value: pool.T, hint: `${((pool.T / allPlayers.length) * 100).toFixed(0)}% of pool` },
          { label: "Free Agents", value: pool.FA, hint: "available now" },
          { label: "On Waivers", value: pool.WW, hint: "claim pending" },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className="card-title">{s.label}</div>
            <div className="mt-1 text-3xl font-black tabular-nums text-white">{s.value}</div>
            <div className="text-xs text-slate-500">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Roster Construction</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Team</th>
                  <th className="text-right">Size</th>
                  <th className="text-right">G</th>
                  <th className="text-right">F</th>
                  <th className="text-right">C</th>
                  <th className="text-right">Multi-pos</th>
                  <th className="text-right">NBA teams</th>
                  <th className="w-40">Mix</th>
                </tr>
              </thead>
              <tbody>
                {rosterComp.map((r) => (
                  <tr key={r.team.id}>
                    <td>
                      <Link href={`/teams/${r.team.id}`} className="font-medium text-white hover:text-gold">
                        {r.team.name}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{r.size}</td>
                    <td className="text-right tabular-nums text-raptor-soft">{r.counts.G}</td>
                    <td className="text-right tabular-nums text-emerald-300">{r.counts.F}</td>
                    <td className="text-right tabular-nums text-slate-200">{r.counts.C}</td>
                    <td className="text-right tabular-nums text-slate-400">{r.multi}</td>
                    <td className="text-right tabular-nums text-slate-400">{r.nbaTeams}</td>
                    <td>
                      <div className="flex h-2 w-full overflow-hidden rounded-full">
                        <div className="bg-raptor" style={{ width: `${(r.counts.G / r.size) * 100}%` }} />
                        <div className="bg-emerald-400" style={{ width: `${(r.counts.F / r.size) * 100}%` }} />
                        <div className="bg-silver" style={{ width: `${(r.counts.C / r.size) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Most-Rostered NBA Teams</h2>
          </div>
          <ul className="space-y-3 p-5 text-sm">
            {exposureRows.map(([nba, n]) => (
              <li key={nba}>
                <div className="flex justify-between">
                  <span className="font-medium text-white">{nba}</span>
                  <span className="tabular-nums text-slate-400">{n}</span>
                </div>
                <div className="mt-1">
                  <Bar value={n} max={exposureMax} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-white/15 px-5 py-3">
          <h2 className="card-title">
            {draftResults.draftType} rookie draft · {formatDate(draftResults.draftDate)} · {draftResults.draftPicks.length} picks
          </h2>
          <div className="flex gap-3 text-xs text-slate-400">
            <span>
              G <span className="text-raptor-soft">{draftByPos.G}</span>
            </span>
            <span>
              F <span className="text-emerald-300">{draftByPos.F}</span>
            </span>
            <span>
              C <span className="text-slate-200">{draftByPos.C}</span>
            </span>
          </div>
        </div>
        <div className="grid gap-px bg-white/5 md:grid-cols-2 xl:grid-cols-4">
          {rounds.map((round) => (
            <div key={round} className="bg-court-2 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Round {round}</div>
              <ol className="space-y-1.5 text-sm">
                {draftResults.draftPicks
                  .filter((p) => p.round === round)
                  .map((pick) => {
                    const p = playerMap[pick.playerId];
                    return (
                      <li key={pick.pick} className="flex items-baseline gap-2">
                        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-500">{pick.pickInRound}</span>
                        <span className="min-w-0 flex-1">
                          <PlayerLink id={p?.id} className="font-medium text-white">
                            {p ? formatPlayerName(p.name) : pick.playerId}
                          </PlayerLink>
                          <span className="ml-1.5 text-xs text-slate-500">{p?.nbaTeam}</span>
                          <div className="truncate text-xs text-slate-400">{getTeamName(pick.teamId)}</div>
                        </span>
                      </li>
                    );
                  })}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5 text-sm text-slate-400">
        <h2 className="card-title mb-2">League Settings</h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Format</dt>
            <dd className="text-white">{leagueInfo.scoringType?.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Roster size</dt>
            <dd className="text-white">{leagueInfo.rosterInfo.maxTotalPlayers} players</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Regular season</dt>
            <dd className="text-white">{leagueInfo.playoffs.lastRegularSeasonPeriod} weeks</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Playoffs</dt>
            <dd className="text-white">
              {leagueInfo.playoffs.numPlayoffTeams} teams · weeks {leagueInfo.playoffs.firstPlayoffPeriod}–
              {leagueInfo.scoringPeriods.length}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
