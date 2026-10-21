"use client";

import { useMemo, useState } from "react";
import { scoreBreakdown, type ScoringRule, type StatLine } from "@/lib/scoring";

const INPUT_FIELDS: { key: keyof StatLine; label: string }[] = [
  { key: "pts", label: "Points" },
  { key: "reb", label: "Rebounds" },
  { key: "ast", label: "Assists" },
  { key: "stl", label: "Steals" },
  { key: "blk", label: "Blocks" },
  { key: "fg3m", label: "3PT Made" },
  { key: "tov", label: "Turnovers" },
];

export default function ScoringCalculator({ rules }: { rules: ScoringRule[] }) {
  const [stats, setStats] = useState<StatLine>({ pts: 25, reb: 8, ast: 6, stl: 1, blk: 1, fg3m: 2, tov: 3 });
  const breakdown = useMemo(() => scoreBreakdown(stats, rules), [stats, rules]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
        {INPUT_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-400">{f.label}</span>
            <input
              type="number"
              min={0}
              value={stats[f.key]}
              onChange={(e) => setStats((s) => ({ ...s, [f.key]: Number(e.target.value) || 0 }))}
              className="w-20 rounded-md border-2 border-white/15 bg-court px-2 py-1 text-right tabular-nums text-white focus:border-raptor/50 focus:outline-none"
            />
          </label>
        ))}
      </div>
      <div className="rounded-lg border-2 border-white/15 bg-court p-4">
        <div className="text-xs text-slate-500">Fantasy points</div>
        <div className="text-4xl font-black tabular-nums text-gold">{breakdown.total.toFixed(2)}</div>
        <ul className="mt-3 space-y-1 text-xs">
          {breakdown.rows.map((r) => (
            <li key={r.label} className="flex justify-between text-slate-400">
              <span>
                {r.label} <span className="text-slate-600">× {r.perUnit}</span>
              </span>
              <span className={`tabular-nums ${r.total < 0 ? "text-rose-400" : "text-slate-200"}`}>
                {r.total >= 0 ? "+" : ""}
                {r.total.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
