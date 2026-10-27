import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PlayerLink from "@/components/PlayerLink";
import { formatDate, formatPlayerName } from "@/lib/data";
import { formatFp } from "@/lib/scoring";
import {
  historyPlayerName,
  leagueHistorySeason,
  leagueHistorySeasons,
  resolvePlayer,
  type HistoryLeagueSeason,
  type HistoryMatchup,
  type HistoryRosterPlayer,
} from "@/lib/history";

export const metadata = { title: "History" };

type Search = Promise<{ season?: string }>;

const LINEUP_SLOTS = ["PG", "SG", "G", "SF", "PF", "F", "C", "Flx"] as const;
const BENCH_GROUPS = [
  { status: "RESERVE", label: "Bench" },
  { status: "INJURED_RESERVE", label: "IR" },
  { status: "MINORS", label: "Minors" },
] as const;

function fmtScore(n: number | null): string {
  if (n == null) return "—";
  return formatFp(n);
}

function winner(m: HistoryMatchup): "home" | "away" | "bye" | null {
  if (m.bye) return "bye";
  if (m.homeScore == null || m.awayScore == null) return null;
  if (m.homeScore > m.awayScore) return "home";
  if (m.awayScore > m.homeScore) return "away";
  return null;
}

function TeamLine({
  name,
  score,
  won,
  muted,
}: {
  name: string | null;
  score: number | null;
  won: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${won ? "text-white" : "text-slate-400"}`}>
      <span className={`truncate font-medium ${won ? "text-gold" : muted ? "text-slate-500" : ""}`}>
        {name ?? "Bye"}
      </span>
      <span className={`shrink-0 tabular-nums ${won ? "font-semibold text-gold" : ""}`}>{muted ? "" : fmtScore(score)}</span>
    </div>
  );
}

function NamedPlayer({ id, name, className = "" }: { id: string; name: string; className?: string }) {
  const label = formatPlayerName(historyPlayerName(id, name));
  if (resolvePlayer(id)) {
    return (
      <PlayerLink id={id} className={className}>
        {label}
      </PlayerLink>
    );
  }
  return <span className={className}>{label}</span>;
}

function posPill(pos: string) {
  const key = pos || "Flx";
  const cls =
    key === "C"
      ? "pill-C"
      : key === "Flx"
        ? "pill-Flx"
        : key === "SF" || key === "PF" || key === "F"
          ? "pill-F"
          : "pill-G";
  return <span className={`pill ${cls}`}>{key}</span>;
}

function formatHint(season: HistoryLeagueSeason) {
  return season.format === "categories" ? "9-cat" : "Points";
}

function draftLabel(season: HistoryLeagueSeason) {
  return season.draft.type === "startup" ? "Startup Draft" : "Rookie Draft";
}

function categoryLineup(players: HistoryRosterPlayer[]) {
  const groups = Object.fromEntries(LINEUP_SLOTS.map((slot) => [slot, [] as HistoryRosterPlayer[]])) as Record<
    (typeof LINEUP_SLOTS)[number],
    HistoryRosterPlayer[]
  >;
  for (const p of players) {
    if (p.status !== "ACTIVE") continue;
    const slot = LINEUP_SLOTS.includes(p.rosterPosition as (typeof LINEUP_SLOTS)[number])
      ? (p.rosterPosition as (typeof LINEUP_SLOTS)[number])
      : "Flx";
    groups[slot].push(p);
  }
  for (const list of Object.values(groups)) list.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

function benchGroups(players: HistoryRosterPlayer[]) {
  return BENCH_GROUPS.map((g) => ({
    ...g,
    players: players.filter((p) => p.status === g.status).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.players.length > 0);
}

export default async function HistoryPage({ searchParams }: { searchParams: Search }) {
  const { season: requested } = await searchParams;
  const seasons = leagueHistorySeasons();
  const selected = leagueHistorySeason(requested);
  const champion = selected.champion;
  const isCategories = selected.format === "categories";
  const standingsById = new Map(selected.standings.map((s) => [s.teamId, s]));
  const rosterTeams = Object.entries(selected.rosters)
    .map(([teamId, roster]) => ({
      teamId,
      ...roster,
      players: roster.players.map((p) => ({ ...p, name: historyPlayerName(p.id, p.name) })),
      standing: standingsById.get(teamId),
    }))
    .sort((a, b) => (a.standing?.rank ?? 99) - (b.standing?.rank ?? 99) || a.teamName.localeCompare(b.teamName));
  const picks = [...selected.draft.picks].sort((a, b) => a.pick - b.pick);
  const rounds = [...new Set(picks.map((p) => p.round))].sort((a, b) => a - b);
  const draftByTeam = rosterTeams
    .map((team) => ({
      teamId: team.teamId,
      teamName: team.teamName,
      standing: team.standing,
      picks: picks.filter((p) => p.teamId === team.teamId),
    }))
    .filter((team) => team.picks.length > 0);

  return (
    <div className="space-y-8">
      <PageHeader title="History" subtitle={`${selected.leagueName} · ${seasons.length} completed seasons`}>
        <a
          href={`https://www.fantrax.com/fantasy/league/${selected.leagueId}/home`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-slate-400 hover:text-gold"
        >
          Fantrax {selected.season} ↗
        </a>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {seasons.map((s) => {
          const active = s.season === selected.season;
          return (
            <Link
              key={s.season}
              href={`/history?season=${s.season}`}
              className={`rounded-md border px-3 py-1.5 ${
                active
                  ? "border-raptor/50 bg-raptor/15 text-gold"
                  : "border-white/10 text-slate-300 hover:border-white/30 hover:text-white"
              }`}
            >
              <span className="block text-xs font-medium tabular-nums">{s.season}</span>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                S{s.seasonNumber} · {formatHint(s)}
              </span>
            </Link>
          );
        })}
      </div>

      <nav className="flex flex-wrap gap-4 text-xs uppercase tracking-wider text-slate-500">
        <a href="#playoffs" className="hover:text-gold">
          Playoffs
        </a>
        <a href="#draft" className="hover:text-gold">
          Draft
        </a>
        <a href="#rosters" className="hover:text-gold">
          Rosters
        </a>
      </nav>

      {champion && (
        <section className="card border-gold/40 bg-gold/5 px-6 py-6 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gold">
            Champion · Season {selected.seasonNumber} · {selected.season}
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">{champion.teamName}</h2>
          <p className="mt-2 text-sm text-slate-400">
            {formatDate(selected.startDate)} – {formatDate(selected.endDate)}
            {selected.playoffs?.numPlayoffTeams ? ` · ${selected.playoffs.numPlayoffTeams}-team playoffs` : ""}
          </p>
          <p className="mt-3 text-sm text-slate-300">
            {isCategories ? (
              <>
                9-category H2H · {selected.slots.map((s) => `${s.maxActive} ${s.slot}`).join(" / ")}
                <span className="mt-1 block text-xs text-slate-500">{selected.categories.join(" · ")}</span>
              </>
            ) : (
              <>Points H2H · flex-only roster ({selected.slots[0]?.maxActive ?? 31} Flx)</>
            )}
          </p>
        </section>
      )}

      <div id="playoffs" className="grid gap-6 xl:grid-cols-3">
        <section className="space-y-4 xl:col-span-2">
          <h2 className="card-title">Playoff Bracket</h2>
          {selected.rounds.length === 0 ? (
            <p className="card px-5 py-10 text-center text-sm text-slate-500">No playoff bracket stored for this season.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {selected.rounds.map((round) => (
                <div key={round.caption} className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{round.caption}</h3>
                    {round.subCaption && <p className="text-xs text-slate-500">{round.subCaption}</p>}
                  </div>
                  {round.matchups.map((m, i) => {
                    const w = winner(m);
                    return (
                      <div key={`${round.caption}-${i}`} className="card space-y-2 p-4">
                        <TeamLine name={m.homeName} score={m.homeScore} won={w === "home" || w === "bye"} muted={m.bye && !m.homeName} />
                        <div className="border-t border-white/10" />
                        {m.bye ? (
                          <p className="text-xs uppercase tracking-wider text-slate-600">Bye</p>
                        ) : (
                          <TeamLine name={m.awayName} score={m.awayScore} won={w === "away"} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Regular Season</h2>
            {isCategories && <p className="mt-1 text-[11px] text-slate-500">Category wins across 9 stats</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="table-base table-dense whitespace-nowrap">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Team</th>
                  <th className="text-right">{isCategories ? "Cat W-L-T" : "W-L-T"}</th>
                  <th className="text-right">{isCategories ? "Win%" : "FPts"}</th>
                </tr>
              </thead>
              <tbody>
                {selected.standings.map((row) => {
                  const isChamp = row.teamId === champion?.teamId;
                  return (
                    <tr key={row.teamId}>
                      <td className="tabular-nums text-slate-500">{row.rank}</td>
                      <td className={isChamp ? "font-semibold text-gold" : "text-white"}>
                        {row.teamName}
                        {isChamp && <span className="ml-1.5 text-[10px] uppercase text-gold">champ</span>}
                      </td>
                      <td className="text-right tabular-nums text-slate-300">{row.record}</td>
                      <td className="text-right tabular-nums text-slate-300">
                        {isCategories
                          ? row.winPercentage.toLocaleString("en-US", { style: "percent", minimumFractionDigits: 1 })
                          : row.pointsFor != null
                            ? formatFp(row.pointsFor)
                            : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section id="draft" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="card-title">{draftLabel(selected)}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {selected.draft.date ? `${formatDate(selected.draft.date)} · ` : ""}
              {picks.length} picks · {rounds.length} rounds
              {isCategories ? " · positional startup · 3rd-round reversal" : " · flex rookie draft"}
            </p>
          </div>
        </div>

        {picks.length === 0 ? (
          <p className="card px-5 py-10 text-center text-sm text-slate-500">No draft results stored for this season.</p>
        ) : isCategories ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {draftByTeam.map((team) => {
              const isChamp = team.teamId === champion?.teamId;
              return (
                <article key={team.teamId} className={`card ${isChamp ? "border-gold/40" : ""}`}>
                  <div className="flex items-start justify-between gap-3 border-b-2 border-white/15 px-5 py-3">
                    <div>
                      <h3 className={`font-semibold ${isChamp ? "text-gold" : "text-white"}`}>{team.teamName}</h3>
                      <p className="text-xs text-slate-500">
                        {team.standing ? `#${team.standing.rank} · ${team.standing.record}` : "Draft haul"}
                        {` · ${team.picks.length} picks`}
                      </p>
                    </div>
                  </div>
                  <ol className="grid gap-x-4 gap-y-1.5 p-5 sm:grid-cols-2">
                    {team.picks.map((pick) => (
                      <li key={pick.pick} className="flex items-start gap-2 text-sm">
                        <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
                          {pick.pick}
                          <span className="ml-1 text-slate-600">R{pick.round}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <NamedPlayer id={pick.playerId} name={pick.name} className="font-medium text-white" />
                          <span className="ml-1.5 align-middle">{posPill(pick.position)}</span>
                          <span className="ml-1.5 text-[11px] tabular-nums text-slate-500">{pick.nbaTeam}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className={`grid gap-px bg-white/5 ${rounds.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
              {rounds.map((round) => (
                <div key={round} className="bg-court-2 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Round {round}</div>
                  <ol className="space-y-2 text-sm">
                    {picks
                      .filter((p) => p.round === round)
                      .map((pick) => (
                        <li key={pick.pick} className="flex items-start gap-2">
                          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-500">{pick.pick}</span>
                          <span className="min-w-0 flex-1">
                            <NamedPlayer id={pick.playerId} name={pick.name} className="font-medium text-white" />
                            <span className="ml-1.5 text-xs text-slate-500">{pick.nbaTeam}</span>
                            <div className="truncate text-xs text-slate-400">{pick.teamName}</div>
                          </span>
                        </li>
                      ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section id="rosters" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="card-title">Final Rosters</h2>
          <p className="text-xs text-slate-500">
            {isCategories ? "Finals week · grouped by Fantrax slot" : "End-of-season flex rosters"}
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {rosterTeams.map((team) => {
            const isChamp = team.teamId === champion?.teamId;
            if (isCategories) {
              const lineup = categoryLineup(team.players);
              const bench = benchGroups(team.players);
              return (
                <article key={team.teamId} className={`card ${isChamp ? "border-gold/40" : ""}`}>
                  <div className="flex items-start justify-between gap-3 border-b-2 border-white/15 px-5 py-3">
                    <div>
                      <h3 className={`font-semibold ${isChamp ? "text-gold" : "text-white"}`}>{team.teamName}</h3>
                      <p className="text-xs text-slate-500">
                        {team.standing ? `#${team.standing.rank} · ${team.standing.record}` : "Final roster"}
                        {isChamp ? " · Champion" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {LINEUP_SLOTS.map((slot) => (
                        <span key={slot} className={`pill ${slot === "C" ? "pill-C" : slot === "Flx" ? "pill-Flx" : slot === "SF" || slot === "PF" || slot === "F" ? "pill-F" : "pill-G"}`}>
                          {slot} · {lineup[slot].length}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                    {LINEUP_SLOTS.map((slot) => (
                      <ul key={slot} className="space-y-1.5">
                        <li className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          {slot}
                          <span className="ml-1 font-normal text-slate-600">
                            {selected.slots.find((s) => s.slot === slot)?.maxActive ?? ""}
                          </span>
                        </li>
                        {lineup[slot].length === 0 ? (
                          <li className="text-xs text-slate-600">—</li>
                        ) : (
                          lineup[slot].map((p) => (
                            <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                              <NamedPlayer id={p.id} name={p.name} className="min-w-0 truncate text-slate-200" />
                              <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{p.nbaTeam}</span>
                            </li>
                          ))
                        )}
                      </ul>
                    ))}
                  </div>
                  {bench.length > 0 && (
                    <div className="grid gap-4 border-t border-white/10 p-5 sm:grid-cols-3">
                      {bench.map((group) => (
                        <ul key={group.status} className="space-y-1.5">
                          <li className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            {group.label} · {group.players.length}
                          </li>
                          {group.players.map((p) => (
                            <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate text-slate-300">
                                <NamedPlayer id={p.id} name={p.name} />
                                <span className="ml-1.5 text-[11px] text-slate-600">{p.rosterPosition}</span>
                              </span>
                              <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{p.nbaTeam}</span>
                            </li>
                          ))}
                        </ul>
                      ))}
                    </div>
                  )}
                </article>
              );
            }

            const flex = [...team.players].sort((a, b) => a.name.localeCompare(b.name));
            return (
              <article key={team.teamId} className={`card ${isChamp ? "border-gold/40" : ""}`}>
                <div className="flex items-start justify-between gap-3 border-b-2 border-white/15 px-5 py-3">
                  <div>
                    <h3 className={`font-semibold ${isChamp ? "text-gold" : "text-white"}`}>{team.teamName}</h3>
                    <p className="text-xs text-slate-500">
                      {team.standing ? `#${team.standing.rank} · ${team.standing.record}` : "Final roster"}
                      {isChamp ? " · Champion" : ""}
                    </p>
                  </div>
                  <span className="pill pill-Flx">Flx · {flex.length}</span>
                </div>
                <ul className="grid gap-x-4 gap-y-1.5 p-5 sm:grid-cols-2">
                  {flex.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                      <NamedPlayer id={p.id} name={p.name} className="min-w-0 truncate text-slate-200" />
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{p.nbaTeam}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
