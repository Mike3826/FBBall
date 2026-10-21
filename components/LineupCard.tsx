import Link from "next/link";
import PlayerLink from "@/components/PlayerLink";
import { LINEUP_SLOTS, SLOTS, SLOT_LABEL, type LineupPlayer, type TeamLineup } from "@/lib/lineups";
import { formatFp } from "@/lib/scoring";

export const fmt = formatFp;

export function LiveDot({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-raptor-soft align-middle ${className}`} title="In progress" />;
}

export function LineupCard({ t, rank, id }: { t: TeamLineup; rank: number; id?: string }) {
  return (
    <section className="card" id={id ?? `team-${t.team.id}`}>
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
                    <span className="hidden group-open:inline">Hide {bench.length} not in bestball</span>
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

function fpClass(n: number | null, pinkAbove: number) {
  if (n == null || n <= 0) return "text-slate-600";
  if (n > pinkAbove) return "font-bold text-parse-pink";
  return "font-bold text-gold";
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
      <span className={`w-12 shrink-0 text-right tabular-nums ${fpClass(p.lastGameFp, 50)}`} title="Last game">
        {p.lastGameFp == null ? "—" : fmt(p.lastGameFp)}
      </span>
      <span className={`w-16 shrink-0 text-right tabular-nums ${fpClass(p.fp, 200)}`} title="Week">
        {p.fp > 0 ? fmt(p.fp) : "—"}
      </span>
    </li>
  );
}
