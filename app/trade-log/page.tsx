import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PlayerLink from "@/components/PlayerLink";
import {
  ACTION_STYLE,
  actionLabel,
  playerLabel,
  teamLabel,
  transactionTime as when,
  transactionsFile as file,
  type Move,
} from "@/lib/transactions";

export const metadata = { title: "Trade Log" };

function MovePlayer({ m }: { m: Move }) {
  return <PlayerLink id={m.playerId}>{playerLabel(m)}</PlayerLink>;
}

export default function TradeLogPage() {
  const all = file.transactions;
  const trades = all.filter((t) => t.type === "TRADE");
  const others = all.filter((t) => t.type !== "TRADE");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Trade Log"
        subtitle={
          file.fetchedAt
            ? `${trades.length} trade${trades.length === 1 ? "" : "s"} · ${others.length} other transaction${others.length === 1 ? "" : "s"} · updated ${new Date(file.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
            : "Transaction history not synced yet"
        }
      />

      {!file.fetchedAt && (
        <section className="card px-5 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-2xl">🤝</div>
          <p className="mt-4 text-sm font-medium text-white">Connect your Fantrax session to load trades</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">
            Fantrax only exposes transaction history to logged-in league members. Copy your browser&apos;s Fantrax cookie
            into <code className="rounded bg-white/5 px-1 py-0.5 text-xs">.env.local</code> as{" "}
            <code className="rounded bg-white/5 px-1 py-0.5 text-xs">FANTRAX_COOKIE</code>, then run{" "}
            <code className="rounded bg-white/5 px-1 py-0.5 text-xs">npm run fetch-transactions</code>. See{" "}
            <code className="rounded bg-white/5 px-1 py-0.5 text-xs">.env.example</code> for details.
          </p>
        </section>
      )}

      {file.fetchedAt && (
        <section className="space-y-4">
          <h2 className="card-title">Trades</h2>
          {trades.length === 0 ? (
            <div className="card px-5 py-10 text-center text-sm text-slate-500">No trades have been completed this season.</div>
          ) : (
            <ul className="space-y-4">
              {trades.map((t) => {
                const byTeam = new Map<string, Move[]>();
                for (const m of t.moves) {
                  const key = m.teamId ?? m.teamName ?? "?";
                  if (!byTeam.has(key)) byTeam.set(key, []);
                  byTeam.get(key)!.push(m);
                }
                return (
                  <li key={t.id} className="card p-5">
                    <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {when(t)}
                        {t.week != null && <span className="ml-2 text-slate-600">· Week {t.week}</span>}
                      </span>
                      <span>{byTeam.size}-team trade</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[...byTeam.entries()].map(([key, moves]) => (
                        <div key={key} className="rounded-lg border-2 border-white/15 bg-court p-4">
                          {moves[0].teamId ? (
                            <Link href={`/teams/${moves[0].teamId}`} className="text-sm font-semibold text-white hover:text-gold">
                              {teamLabel(moves[0])}
                            </Link>
                          ) : (
                            <span className="text-sm font-semibold text-white">{teamLabel(moves[0])}</span>
                          )}
                          <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">Receives</div>
                          <ul className="mt-1 space-y-1 text-sm text-slate-300">
                            {moves.map((m, i) => (
                              <li key={i}>
                                <MovePlayer m={m} />
                                {m.pos && <span className="ml-1.5 text-xs text-slate-500">{m.pos}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {file.fetchedAt && (
        <section className="space-y-4">
          <h2 className="card-title">Waiver &amp; Free-Agent Moves</h2>
          {others.length === 0 ? (
            <div className="card px-5 py-10 text-center text-sm text-slate-500">No adds, drops, or claims yet.</div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Team</th>
                    <th>Move</th>
                    <th>Player</th>
                  </tr>
                </thead>
                <tbody>
                  {others.flatMap((t) =>
                    t.moves.map((m, i) => (
                      <tr key={`${t.id}-${i}`}>
                        <td className="whitespace-nowrap text-slate-400">{i === 0 ? when(t) : ""}</td>
                        <td>
                          {m.teamId ? (
                            <Link href={`/teams/${m.teamId}`} className="hover:text-gold">
                              {teamLabel(m)}
                            </Link>
                          ) : (
                            teamLabel(m)
                          )}
                        </td>
                        <td>
                          <span className={`pill ${ACTION_STYLE[m.action] ?? "bg-white/5 text-slate-300"}`}>
                            {actionLabel(m)}
                          </span>
                          {m.bid && <span className="ml-1.5 text-xs text-slate-500">${m.bid}</span>}
                        </td>
                        <td className="font-medium text-white">
                          <MovePlayer m={m} />
                          {m.pos && <span className="ml-1.5 text-xs font-normal text-slate-500">{m.pos}</span>}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
