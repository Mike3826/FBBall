/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import PosPill from "@/components/PosPill";
import {
  formatDate,
  formatPlayerName,
  formatShortDate,
  getDraftPick,
  getTeamName,
  leagueInfo,
  playerMap,
  playerTeamMap,
} from "@/lib/data";
import { LIVE_TTL_MS } from "@/lib/nba";
import { getRotowireProfile } from "@/lib/rotowire";
import { getStats } from "@/lib/stats";
import AutoRefresh from "@/components/AutoRefresh";
import {
  ACTION_STYLE,
  actionLabel,
  getPlayerTransactions,
  teamLabel,
  transactionTime,
  transactionsFile,
} from "@/lib/transactions";

type Params = Promise<{ playerId: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }) {
  const { playerId } = await params;
  const p = playerMap[playerId];
  return { title: p ? formatPlayerName(p.name) : "Player" };
}

const num = "text-right tabular-nums";

function avg(total: number, games: number): string {
  return games ? (total / games).toFixed(1) : "—";
}

export default async function PlayerPage({ params }: { params: Params }) {
  const { playerId } = await params;
  const player = playerMap[playerId];
  if (!player) notFound();

  const name = formatPlayerName(player.name);
  const fantasyTeamId = playerTeamMap[player.id] ?? null;
  const [stats, roto] = await Promise.all([
    getStats(),
    player.rotowireId ? getRotowireProfile(player.rotowireId) : Promise.resolve(null),
  ]);
  const logs = stats.playerLogs(player.id);
  const history = getPlayerTransactions(player.id);
  const draftPick = getDraftPick(player.id);

  const finished = logs.filter((l) => !l.live);
  const gp = logs.length;
  const totals = logs.reduce(
    (acc, l) => {
      acc.fp += l.fp;
      acc.min += l.min;
      acc.pts += l.pts;
      acc.reb += l.reb;
      acc.ast += l.ast;
      acc.stl += l.stl;
      acc.blk += l.blk;
      acc.tov += l.tov;
      acc.fg3m += l.fg3m;
      acc.dd += l.dd ? 1 : 0;
      acc.td += l.td ? 1 : 0;
      return acc;
    },
    { fp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fg3m: 0, dd: 0, td: 0 },
  );
  const best = logs.reduce<(typeof logs)[number] | null>((b, l) => (!b || l.fp > b.fp ? l : b), null);

  const summary = [
    { label: "GP", value: String(gp) },
    { label: "FPts", value: totals.fp.toFixed(1) },
    { label: "FP/G", value: avg(totals.fp, gp) },
    { label: "MIN", value: avg(totals.min, gp) },
    { label: "PTS", value: avg(totals.pts, gp) },
    { label: "REB", value: avg(totals.reb, gp) },
    { label: "AST", value: avg(totals.ast, gp) },
    { label: "STL", value: avg(totals.stl, gp) },
    { label: "BLK", value: avg(totals.blk, gp) },
    { label: "3PM", value: avg(totals.fg3m, gp) },
    { label: "TO", value: avg(totals.tov, gp) },
    { label: "DD / TD", value: `${totals.dd} / ${totals.td}` },
  ];

  const bio = roto
    ? [
        roto.age && `Age ${roto.age}`,
        roto.height && roto.weight && `${roto.height}, ${roto.weight} lbs`,
        roto.from && `From ${roto.from}`,
        roto.draft && `NBA Draft ${roto.draft}`,
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      <nav className="text-xs text-slate-500">
        <Link href="/players" className="hover:text-gold">
          Players
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-300">{name}</span>
      </nav>

      {/* Hero */}
      <section className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-white/15 bg-court">
          {roto ? (
            <img src={roto.headshot} alt="" className="h-full w-full object-cover object-top" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-slate-600">
              {name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{name}</h1>
            <PosPill pos={player.eligiblePos} />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {player.position} · {roto?.team ?? player.nbaTeam}
            {bio.length > 0 && <span className="text-slate-500"> · {bio.join(" · ")}</span>}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {fantasyTeamId ? (
              <Link
                href={`/teams/${fantasyTeamId}`}
                className="rounded-md border-2 border-white/15 bg-court px-2.5 py-1 font-medium text-white hover:border-raptor/50"
              >
                {getTeamName(fantasyTeamId)}
              </Link>
            ) : player.status === "WW" ? (
              <span className="pill bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300">On Waivers</span>
            ) : (
              <span className="pill bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300">Free Agent</span>
            )}
            {draftPick && (
              <span className="text-xs text-slate-500">
                Drafted {draftPick.round}.{String(draftPick.pickInRound).padStart(2, "0")} by{" "}
                <Link href={`/teams/${draftPick.teamId}`} className="text-slate-300 hover:text-gold">
                  {getTeamName(draftPick.teamId)}
                </Link>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1 text-xs">
          <a
            href={`https://www.fantrax.com/fantasy/league/${leagueInfo.leagueId}/players;view=STATS;searchName=${encodeURIComponent(name)}`}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-gold"
          >
            Fantrax ↗
          </a>
          {roto && (
            <a href={roto.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-gold">
              Rotowire ↗
            </a>
          )}
        </div>
      </section>

      {/* Season summary */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="card-title">{stats.meta.season} Season</h2>
          <span className="flex items-center gap-3">
            <AutoRefresh intervalMs={LIVE_TTL_MS} label={logs.some((l) => l.live) ? "Live" : undefined} />
            {best && (
              <span className="text-xs text-slate-500">
                Best game: <span className="font-semibold text-gold">{best.fp.toFixed(1)}</span> on{" "}
                <Link href={`/daily-rankings?date=${best.date}`} className="text-slate-300 hover:text-gold">
                  {formatShortDate(best.date)}
                </Link>
              </span>
            )}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-4 gap-x-4 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
          {summary.map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</dt>
              <dd className={`mt-0.5 text-lg font-bold tabular-nums ${s.label === "FPts" || s.label === "FP/G" ? "text-gold" : "text-white"}`}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
        {gp > 0 && finished.length < gp && <p className="mt-3 text-xs text-slate-500">Includes a game in progress.</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Game log */}
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
            <h2 className="card-title">Fantasy Game Log</h2>
            <span className="text-xs text-slate-500">{gp} game{gp === 1 ? "" : "s"}</span>
          </div>
          {gp === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No games logged yet this season.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base table-dense whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opp</th>
                    <th className={num}>MIN</th>
                    <th className={num}>PTS</th>
                    <th className={num}>REB</th>
                    <th className={num}>AST</th>
                    <th className={num}>STL</th>
                    <th className={num}>BLK</th>
                    <th className={num}>3PM</th>
                    <th className={num}>TO</th>
                    <th className={num}>FPts</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.gameId}>
                      <td>
                        <Link href={`/daily-rankings?date=${l.date}`} className="text-slate-300 hover:text-gold">
                          {formatShortDate(l.date)}
                        </Link>
                        {l.live && (
                          <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400 align-middle" title="In progress" />
                        )}
                      </td>
                      <td className="text-slate-400">{l.opponent}</td>
                      <td className={`${num} text-slate-400`}>{l.min.toFixed(0)}</td>
                      <td className={num}>{l.pts}</td>
                      <td className={num}>{l.reb}</td>
                      <td className={num}>{l.ast}</td>
                      <td className={num}>{l.stl}</td>
                      <td className={num}>{l.blk}</td>
                      <td className={num}>{l.fg3m}</td>
                      <td className={`${num} text-slate-400`}>{l.tov}</td>
                      <td className={`${num} font-bold text-gold`}>
                        {l.fp.toFixed(2)}
                        {l.td ? (
                          <span className="pill ml-1.5 bg-raptor/20 text-gold">TD</span>
                        ) : l.dd ? (
                          <span className="pill ml-1.5 bg-white/10 text-slate-200">DD</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-6">
          {/* News */}
          <section className="card">
            <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
              <h2 className="card-title">Latest News</h2>
              <span className="text-xs text-slate-500">via Rotowire</span>
            </div>
            {!player.rotowireId ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No Rotowire profile linked for this player.</p>
            ) : !roto ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Couldn&apos;t reach Rotowire right now.</p>
            ) : roto.news.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No recent news.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {roto.news.slice(0, 8).map((n, i) => (
                  <li key={i} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{n.headline}</p>
                      {n.injury && <span className="pill shrink-0 bg-rose-500/15 text-rose-300">{n.injury}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{n.date}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{n.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* League transactions */}
          <section className="card">
            <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
              <h2 className="card-title">League History</h2>
              <Link href="/trade-log" className="text-xs text-gold hover:underline">
                Trade log
              </Link>
            </div>
            {history.length === 0 && !draftPick ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                {transactionsFile.fetchedAt ? "No transactions involving this player." : "Transaction history not synced yet."}
              </p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {history.map(({ transaction: t, move: m }, i) => {
                  const isTrade = t.type === "TRADE";
                  const style = ACTION_STYLE[isTrade ? "TRADE" : m.action] ?? "bg-white/5 text-slate-300";
                  return (
                    <li key={`${t.id}-${i}`} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`pill ${style}`}>{isTrade ? "Trade" : actionLabel(m)}</span>
                        <span className="text-xs text-slate-500">{transactionTime(t)}</span>
                      </div>
                      <p className="mt-1.5 text-slate-300">
                        {isTrade ? (
                          <>
                            {m.fromTeamId || m.fromTeamName ? (
                              <>
                                <TeamRef id={m.fromTeamId} name={m.fromTeamName} />
                                <span className="mx-1.5 text-slate-500">→</span>
                              </>
                            ) : null}
                            <TeamRef id={m.teamId} name={teamLabel(m)} />
                          </>
                        ) : (
                          <>
                            <TeamRef id={m.teamId} name={teamLabel(m)} />
                            {m.bid && <span className="ml-1.5 text-xs text-slate-500">${m.bid} bid</span>}
                          </>
                        )}
                      </p>
                    </li>
                  );
                })}
                {draftPick && (
                  <li className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="pill bg-raptor/15 text-raptor-soft">Drafted</span>
                      <span className="text-xs text-slate-500">{formatDate(new Date(draftPick.time).toISOString())}</span>
                    </div>
                    <p className="mt-1.5 text-slate-300">
                      Round {draftPick.round}, Pick {draftPick.pickInRound} (#{draftPick.pick} overall) by{" "}
                      <TeamRef id={draftPick.teamId} name={getTeamName(draftPick.teamId)} />
                    </p>
                  </li>
                )}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TeamRef({ id, name }: { id: string | null | undefined; name: string | null | undefined }) {
  const label = (id && getTeamName(id)) || name || "Unknown";
  return id ? (
    <Link href={`/teams/${id}`} className="font-medium text-white hover:text-gold">
      {label}
    </Link>
  ) : (
    <span className="font-medium text-white">{label}</span>
  );
}
