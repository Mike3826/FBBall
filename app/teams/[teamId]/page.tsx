import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import PlayerLink from "@/components/PlayerLink";
import PosPill from "@/components/PosPill";
import {
  draftResults,
  formatPlayerName,
  formatShortDate,
  getRoster,
  getTeam,
  isTeamSide,
  leagueInfo,
  playerMap,
  standingsRows,
  teams,
} from "@/lib/data";

export function generateStaticParams() {
  return teams.map((t) => ({ teamId: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return { title: getTeam(teamId)?.name ?? "Team" };
}

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = getTeam(teamId);
  if (!team) notFound();

  const standing = standingsRows.find((s) => s.teamId === teamId);
  const roster = getRoster(teamId);
  const picks = draftResults.draftPicks.filter((p) => p.teamId === teamId);

  const schedule = leagueInfo.matchups
    .filter((mp) => mp.period <= leagueInfo.playoffs.lastRegularSeasonPeriod)
    .map((mp) => {
      const m = mp.matchupList.find(
        (x) => (isTeamSide(x.away) && x.away.id === teamId) || (isTeamSide(x.home) && x.home.id === teamId),
      );
      if (!m) return null;
      const isHome = isTeamSide(m.home) && m.home.id === teamId;
      const opp = isHome ? m.away : m.home;
      const sp = leagueInfo.scoringPeriods.find((p) => p.number === mp.period);
      return { period: mp.period, isHome, opp: isTeamSide(opp) ? opp : null, start: sp?.startDate };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="space-y-6">
      <PageHeader title={team.name} subtitle={standing ? `#${standing.rank} · ${standing.points} · ${standing.totalPointsFor.toFixed(2)} PF` : undefined}>
        <Link href="/teams" className="text-sm text-gold hover:underline">
          ← All teams
        </Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Roster ({roster.length})</h2>
            <span className="text-xs text-slate-500">Max {leagueInfo.rosterInfo.maxTotalPlayers}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Player</th>
                  <th>NBA</th>
                  <th>Pos</th>
                  <th>Eligible</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className={`pill pill-${p.rosterPosition}`}>{p.rosterPosition}</span>
                    </td>
                    <td className="font-medium text-white">
                      <PlayerLink id={p.id}>{formatPlayerName(p.name)}</PlayerLink>
                    </td>
                    <td className="text-slate-400">{p.nbaTeam}</td>
                    <td className="text-slate-400">{p.position}</td>
                    <td>
                      <PosPill pos={p.eligiblePos} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <section className="card">
            <div className="border-b-2 border-white/15 px-5 py-3">
              <h2 className="card-title">Schedule</h2>
            </div>
            <ul className="divide-y divide-white/5 text-sm">
              {schedule.map((g) => (
                <li key={g.period} className="flex items-center justify-between px-5 py-2">
                  <span className="w-28 shrink-0 whitespace-nowrap text-slate-500">
                    Wk {g.period}
                    {g.start && <span className="ml-1 text-xs">· {formatShortDate(g.start)}</span>}
                  </span>
                  <span className="flex-1 truncate text-right">
                    <span className="mr-1 text-xs text-slate-500">{g.isHome ? "vs" : "@"}</span>
                    {g.opp ? (
                      <Link href={`/teams/${g.opp.id}`} className="hover:text-gold">
                        {g.opp.name}
                      </Link>
                    ) : (
                      "TBD"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="border-b-2 border-white/15 px-5 py-3">
              <h2 className="card-title">Rookie Draft Picks</h2>
            </div>
            {picks.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">No picks recorded.</p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {picks.map((pick) => {
                  const p = playerMap[pick.playerId];
                  return (
                    <li key={pick.pick} className="flex items-center justify-between px-5 py-2">
                      <span className="tabular-nums text-slate-500">
                        {pick.round}.{String(pick.pickInRound).padStart(2, "0")}
                      </span>
                      <span className="flex-1 px-3 font-medium text-white">
                        <PlayerLink id={p?.id}>{p ? formatPlayerName(p.name) : pick.playerId}</PlayerLink>
                      </span>
                      <span className="text-slate-400">{p?.nbaTeam}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
