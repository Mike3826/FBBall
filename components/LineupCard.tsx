import Link from "next/link";
import BenchToggle from "@/components/BenchToggle";
import PlayerLink from "@/components/PlayerLink";
import { LINEUP_SLOTS, SLOTS, SLOT_LABEL, type LineupPlayer, type TeamLineup } from "@/lib/lineups";
import { formatFp } from "@/lib/scoring";

export const fmt = formatFp;

/** Green if the in-progress value is above the week-opening baseline, red if below. */
export function projTone(current: number, baseline: number | null | undefined): string {
  if (baseline == null) return "text-slate-500";
  if (current - baseline > 0.005) return "text-proj-green";
  if (baseline - current > 0.005) return "text-raptor-soft";
  return "text-slate-500";
}

export function fmtWinPct(n: number): string {
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`;
}

export function winPctClass(n: number | null | undefined): string {
  if (n == null) return "text-slate-600";
  if (n > 50.05) return "text-proj-green";
  if (n < 49.95) return "text-raptor-soft";
  return "text-slate-400";
}

export function winBarClass(n: number | null | undefined): string {
  if (n == null || Math.abs(n - 50) < 0.05) return "bg-silver/60";
  return n > 50 ? "bg-proj-green" : "bg-raptor-soft";
}

export function WinPctBar({ winPct, className = "" }: { winPct: number | null; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-white/5 ${className}`}>
      <div className={`h-full rounded-full ${winBarClass(winPct)}`} style={{ width: `${winPct ?? 0}%` }} />
    </div>
  );
}

/** Current score on top; projection underneath, colored vs the frozen original. */
export function ScoreStack({
  actual,
  projected,
  baseline,
  current,
  actualClass,
  size = "lg",
  title = "Projected week total",
  showProjected,
}: {
  actual: number;
  projected: number;
  baseline?: number | null;
  /** Compared to baseline for color. Defaults to projected. */
  current?: number;
  actualClass: string;
  size?: "lg" | "xl" | "sm";
  title?: string;
  showProjected?: boolean;
}) {
  const showProj = showProjected ?? projected - actual > 0.005;
  const actualSize = size === "xl" ? "text-xl" : size === "sm" ? "text-sm" : "text-lg";
  return (
    <span className="inline-flex flex-col items-end justify-start leading-none">
      <span className={`${actualSize} font-extrabold tabular-nums ${actualClass}`}>{fmt(actual)}</span>
      {showProj && (
        <span className={`mt-0.5 text-[11px] tabular-nums ${projTone(current ?? projected, baseline)}`} title={title}>
          {fmt(projected)}
        </span>
      )}
    </span>
  );
}

export function LiveDot({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-raptor-soft align-middle ${className}`} title="In progress" />;
}

export function LineupCard({ t, rank, id }: { t: TeamLineup; rank: number; id?: string }) {
  return (
    <section className="card" id={id ?? `team-${t.team.id}`}>
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-white/15 px-3 py-3 sm:px-4">
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
        <div className="flex min-w-[10rem] flex-1 items-center gap-2.5">
          <span className={`shrink-0 text-sm font-extrabold tabular-nums ${winPctClass(t.winPct)}`} title="Chance to win the week">
            {t.winPct == null ? "—" : fmtWinPct(t.winPct)}
          </span>
          <WinPctBar winPct={t.winPct} className="min-w-0 flex-1" />
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-400">
          <span className="flex items-center gap-2">
            Roster
            <ScoreStack actual={t.rosterTotal} projected={t.projRosterTotal} baseline={t.origRosterTotal} actualClass="text-slate-300" />
          </span>
          <span className="flex items-center gap-2">
            Score
            <ScoreStack actual={t.score} projected={t.projScore} baseline={t.origScore} actualClass="text-gold" />
          </span>
        </div>
      </div>
      <div className="grid divide-y-2 divide-white/10 md:grid-cols-3 md:divide-x-2 md:divide-y-0">
        {SLOTS.map((slot) => {
          const players = t.groups[slot];
          const counting = players.filter((p) => p.counting);
          const bench = players.filter((p) => !p.counting);
          const slotTotal = counting.reduce((s, p) => s + p.fp, 0);
          const slotProj = [...players]
            .sort((a, b) => b.projWeek - a.projWeek || b.fp - a.fp)
            .slice(0, LINEUP_SLOTS[slot])
            .reduce((s, p) => s + p.projWeek, 0);
          const slotOrig = [...players]
            .sort((a, b) => b.origWeek - a.origWeek || b.projWeek - a.projWeek)
            .slice(0, LINEUP_SLOTS[slot])
            .reduce((s, p) => s + p.origWeek, 0);
          return (
            <div key={slot} className="px-1.5 py-3">
              <div className={`${ROW} mb-2`}>
                <span className="col-span-4 flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className={`pill pill-${slot}`}>{slot}</span>
                  <span className="truncate">
                    {SLOT_LABEL[slot]} · top {LINEUP_SLOTS[slot]}
                  </span>
                </span>
                <ScoreStack actual={slotTotal} projected={slotProj} baseline={slotOrig} actualClass="text-gold" />
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
const ROW = "grid grid-cols-[1rem_minmax(0,1fr)_2.35rem_3.1rem_4rem] items-start gap-x-1 rounded px-1 py-1";

function PlayerRow({ p }: { p: LineupPlayer }) {
  return (
    <li className={`${ROW} text-sm ${p.counting ? "bg-white/[0.03]" : ""}`}>
      <span className="pt-0.5 text-right text-xs tabular-nums text-slate-500">{p.rank}</span>
      <span className="min-w-0 truncate pt-0.5">
        <PlayerLink id={p.id} className={p.counting ? "font-semibold text-white" : "text-slate-300"}>
          {p.name}
        </PlayerLink>
        <span className="ml-1 text-[11px] text-slate-500">{p.nbaTeam}</span>
        {p.live && <LiveDot className="ml-1" />}
      </span>
      <span className="pt-0.5 text-center text-[11px] tabular-nums text-slate-500" title="Games played / games this week">
        {p.weekGames > 0 || p.gamesPlayed > 0 ? `${p.gamesPlayed}/${p.weekGames}` : "—"}
      </span>
      <span className="text-right">
        {p.lastGameFp == null ? (
          <span className="pt-0.5 tabular-nums text-slate-600">—</span>
        ) : (
          <ScoreStack
            actual={p.lastGameFp}
            projected={p.lastGameOrig ?? p.lastGameFp}
            baseline={p.lastGameOrig}
            current={p.lastGameFp}
            actualClass={p.lastGamePrior ? "font-bold text-slate-500" : fpClass(p.lastGameFp, 50)}
            size="sm"
            title={p.lastGameOrig == null ? "Last game" : "Last game · original projection"}
            showProjected={p.lastGameOrig != null}
          />
        )}
      </span>
      <span className="text-right" title="Week">
        {p.games > 0 || p.fp !== 0 || p.projWeek > 0 ? (
          <ScoreStack
            actual={p.fp}
            projected={p.projWeek}
            baseline={p.origWeek || null}
            actualClass={fpClass(p.fp, 200)}
            size="sm"
            title="Projected week vs original"
          />
        ) : (
          <span className="tabular-nums text-slate-600">—</span>
        )}
      </span>
    </li>
  );
}
