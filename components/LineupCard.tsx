import Link from "next/link";
import BenchToggle from "@/components/BenchToggle";
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-white/15 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded border-2 border-white/15 text-xs font-bold tabular-nums text-slate-300">{rank}</span>
          <Link href={`/teams/${t.team.id}`} className="text-base font-extrabold text-white hover:text-gold">
            {t.team.name}
          </Link>
          {t.record && <span className="text-xs tabular-nums text-slate-500">{t.record}</span>}
          {t.liveCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-raptor-soft">
              <LiveDot /> {t.liveCount} live
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-5 text-xs text-slate-400">
          <span className="flex items-baseline gap-2">
            Roster
            <span className="text-lg font-extrabold tabular-nums text-slate-300">{fmt(t.rosterTotal)}</span>
          </span>
          <span className="flex items-baseline gap-2">
            Score
            <span className="text-lg font-extrabold tabular-nums text-gold">{fmt(t.score)}</span>
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
            <div key={slot} className="px-1.5 py-3">
              <div className={`${ROW} mb-2`}>
                <span className="col-span-4 flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className={`pill pill-${slot}`}>{slot}</span>
                  <span className="truncate">
                    {SLOT_LABEL[slot]} · top {LINEUP_SLOTS[slot]}
                  </span>
                </span>
                <span className="text-right text-lg font-extrabold tabular-nums text-gold">{fmt(slotTotal)}</span>
              </div>
              <ul className="space-y-1">
                {counting.map((p) => (
                  <PlayerRow key={p.id} p={p} />
                ))}
                {counting.length < LINEUP_SLOTS[slot] &&
                  Array.from({ length: LINEUP_SLOTS[slot] - counting.length }).map((_, i) => (
                    <li key={`empty-${i}`} className={`${ROW} text-xs text-slate-600`}>
                      <span className="text-right tabular-nums">{counting.length + i + 1}</span>
                      <span className="col-span-4">Empty slot</span>
                    </li>
                  ))}
              </ul>
              {bench.length > 0 && (
                <BenchToggle count={bench.length}>
                  {bench.map((p) => (
                    <PlayerRow key={p.id} p={p} />
                  ))}
                </BenchToggle>
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

/** Rank · name · games · last game · week. Tight columns leave the rest for names. */
const ROW = "grid grid-cols-[1rem_minmax(0,1fr)_2.35rem_3.1rem_4rem] items-center gap-x-1 rounded px-1 py-1";

function PlayerRow({ p }: { p: LineupPlayer }) {
  return (
    <li className={`${ROW} text-sm ${p.counting ? "bg-white/[0.03]" : ""}`}>
      <span className="text-right text-xs tabular-nums text-slate-500">{p.rank}</span>
      <span className="min-w-0 truncate">
        <PlayerLink id={p.id} className={p.counting ? "font-semibold text-white" : "text-slate-300"}>
          {p.name}
        </PlayerLink>
        <span className="ml-1 text-[11px] text-slate-500">{p.nbaTeam}</span>
        {p.live && <LiveDot className="ml-1" />}
      </span>
      <span className="text-center text-[11px] tabular-nums text-slate-500" title="Games played / games this week">
        {p.weekGames > 0 || p.gamesPlayed > 0 ? `${p.gamesPlayed}/${p.weekGames}` : "—"}
      </span>
      <span className={`text-right tabular-nums ${fpClass(p.lastGameFp, 50)}`} title="Last game">
        {p.lastGameFp == null ? "—" : fmt(p.lastGameFp)}
      </span>
      <span className={`text-right tabular-nums ${fpClass(p.fp, 200)}`} title="Week">
        {p.fp > 0 ? fmt(p.fp) : "—"}
      </span>
    </li>
  );
}
