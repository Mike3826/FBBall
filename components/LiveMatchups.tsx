"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LineupCard, LiveDot, ScoreStack, WinPctBar, fmtWinPct, winPctClass } from "@/components/LineupCard";
import { LINEUP_SLOTS, type LiveMatchup, type TeamLineup } from "@/lib/lineups";

const ANIM_MS = 480;

function pairAt(matchups: LiveMatchup[], i: number | null): TeamLineup[] | null {
  if (i == null) return null;
  const game = matchups[i];
  return game?.away && game.home ? [game.away, game.home] : null;
}

export default function LiveMatchups({
  periodNumber,
  matchups,
  ranks,
  selectedIndex,
}: {
  periodNumber: number;
  matchups: LiveMatchup[];
  ranks: Record<string, number>;
  selectedIndex: number | null;
}) {
  const router = useRouter();
  const [active, setActive] = useState<number | null>(selectedIndex);
  const [pair, setPair] = useState<TeamLineup[] | null>(() => pairAt(matchups, selectedIndex));
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const gen = useRef(0);
  const busy = useRef(false);

  const clearWaits = () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (frame.current) cancelAnimationFrame(frame.current);
    timer.current = null;
    frame.current = null;
  };

  const finish = (token: number) => {
    timer.current = window.setTimeout(() => {
      if (token !== gen.current) return;
      busy.current = false;
      timer.current = null;
    }, ANIM_MS);
  };

  useEffect(() => {
    if (selectedIndex == null || !pairAt(matchups, selectedIndex)) return;
    const token = ++gen.current;
    busy.current = true;
    frame.current = requestAnimationFrame(() => {
      if (token !== gen.current) return;
      setOpen(true);
      finish(token);
    });
    return () => {
      clearWaits();
      busy.current = false;
    };
    // Only animate open from the URL on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearWaits(), []);

  const show = (i: number) => {
    const next = pairAt(matchups, i);
    if (!next) return;
    if (open && active === i) return;
    if (open && active !== i) {
      clearWaits();
      gen.current += 1;
      busy.current = false;
      setActive(i);
      setPair(next);
      router.replace(`/live?m=${i}`, { scroll: false });
      return;
    }
    if (busy.current) return;
    const token = ++gen.current;
    busy.current = true;
    clearWaits();
    setActive(i);
    setPair(next);
    frame.current = requestAnimationFrame(() => {
      if (token !== gen.current) return;
      setOpen(true);
      finish(token);
    });
    router.replace(`/live?m=${i}`, { scroll: false });
  };

  const hide = () => {
    if (busy.current || !open) return;
    const token = ++gen.current;
    busy.current = true;
    clearWaits();
    setOpen(false);
    setActive(null);
    router.replace("/live", { scroll: false });
    timer.current = window.setTimeout(() => {
      if (token !== gen.current) return;
      setPair(null);
      busy.current = false;
      timer.current = null;
    }, ANIM_MS);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="card-title">Matchups · Week {periodNumber}</h2>
        <span className="text-xs text-slate-500">
          Top {LINEUP_SLOTS.G} G · {LINEUP_SLOTS.F} F · {LINEUP_SLOTS.C} C · win% updates with live games
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {matchups.map((game, i) => {
          const a = game.away;
          const h = game.home;
          if (!a || !h) {
            return (
              <div key={i} className="card flex items-center justify-between p-4 text-sm">
                <span className="truncate font-semibold text-white">{a?.team.name ?? h?.team.name ?? "—"}</span>
                <span className="pill bg-white/5 text-slate-400">{game.label ?? "TBD"}</span>
              </div>
            );
          }
          const aLead = (a.winPct ?? 0) > (h.winPct ?? 0);
          const hLead = (h.winPct ?? 0) > (a.winPct ?? 0);
          const liveHere = a.liveCount + h.liveCount > 0;
          const isSelected = active === i;
          return (
            <div
              key={i}
              className={`card p-4 ${liveHere ? "border-raptor" : ""} ${isSelected ? "border-gold ring-1 ring-gold/40" : ""}`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Matchup {i + 1}</span>
                {liveHere ? (
                  <span className="inline-flex items-center gap-1.5 text-raptor-soft">
                    <LiveDot /> {a.liveCount + h.liveCount} playing
                  </span>
                ) : (
                  <span>{a.playedTodayCount + h.playedTodayCount} played today</span>
                )}
              </div>
              {[a, h].map((t, side) => {
                const lead = side === 0 ? aLead : hLead;
                return (
                  <div key={t.team.id} className={side === 0 ? "mt-3" : "mt-2"}>
                    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.1rem_5.5rem] items-center gap-x-2">
                      <span className="text-xs tabular-nums text-slate-500">#{ranks[t.team.id]}</span>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={`truncate text-sm font-bold ${lead ? "text-white" : "text-slate-300"}`}>{t.team.name}</span>
                        {t.liveCount > 0 && <LiveDot />}
                      </div>
                      <span
                        className={`text-right text-sm font-extrabold tabular-nums ${winPctClass(t.winPct)}`}
                        title="Chance to win the week"
                      >
                        {t.winPct == null ? "—" : fmtWinPct(t.winPct)}
                      </span>
                      <ScoreStack
                        actual={t.score}
                        projected={t.projScore}
                        baseline={t.origScore}
                        actualClass={lead ? "text-gold" : "text-slate-300"}
                        size="xl"
                      />
                      <WinPctBar winPct={t.winPct} className="col-span-4 mt-1.5" />
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                aria-expanded={isSelected}
                onClick={() => (isSelected ? hide() : show(i))}
                className={`mt-6 flex w-full items-center justify-center rounded-md border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                  isSelected
                    ? "border-gold bg-gold text-court hover:bg-gold-soft"
                    : "border-gold/50 bg-gold/10 text-gold hover:border-gold hover:bg-gold/20"
                }`}
              >
                {isSelected ? "Hide lineups" : "View lineups"}
              </button>
            </div>
          );
        })}
      </div>

      <div
        className={`grid motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        style={{ transition: `grid-template-rows ${ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
      >
        <div className="overflow-hidden">
          <section
            className={`space-y-4 pt-5 motion-reduce:transition-none ${open ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"}`}
            style={{ transition: `opacity ${ANIM_MS}ms ease, transform ${ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
          >
            {pair && (
              <>
                <h2 className="card-title">
                  Bestball Lineups
                  <span className="ml-2 font-medium text-slate-400">
                    · {pair[0].team.name} vs {pair[1].team.name}
                  </span>
                </h2>
                {pair.map((t) => (
                  <LineupCard key={t.team.id} t={t} rank={ranks[t.team.id] ?? 0} id={`matchup-team-${t.team.id}`} />
                ))}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
