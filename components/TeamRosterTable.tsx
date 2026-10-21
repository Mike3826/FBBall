"use client";

import { useMemo, useState, type ReactNode } from "react";
import PlayerLink from "@/components/PlayerLink";
import PosPill from "@/components/PosPill";
import { formatFp } from "@/lib/scoring";

export type RosterTableRow = {
  id: string;
  name: string;
  nbaTeam: string;
  rosterPosition: string;
  eligiblePos: string;
  age: number | null;
  games: number;
  fppg: number | null;
  weeks: number;
};

type SortKey = "age" | "games" | "fppg" | "weeks";

const COLS: { key: SortKey; label: string; title?: string }[] = [
  { key: "age", label: "Age" },
  { key: "games", label: "GP" },
  { key: "fppg", label: "FPPG" },
  { key: "weeks", label: "BB Wks", title: "Weeks in this team's top 6 G / 6 F / 3 C bestball lineup" },
];

function cmpNull(a: number | null, b: number | null, dir: 1 | -1) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

function NumCell({ children }: { children: ReactNode }) {
  return (
    <td className="tabular-nums">
      <span className="flex w-full items-center justify-end gap-1">
        <span>{children}</span>
        <span className="w-2.5 shrink-0" aria-hidden />
      </span>
    </td>
  );
}

export default function TeamRosterTable({ rows }: { rows: RosterTableRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const d = cmpNull(a[sort.key], b[sort.key], sort.dir);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
  }, [rows, sort]);

  const toggle = (key: SortKey) => {
    setSort((cur) => {
      if (cur?.key !== key) return { key, dir: -1 };
      if (cur.dir === -1) return { key, dir: 1 };
      return null;
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Slot</th>
            <th>Player</th>
            <th>Team</th>
            <th>Eligible</th>
            {COLS.map((col) => {
              const active = sort?.key === col.key;
              return (
                <th key={col.key}>
                  <button
                    type="button"
                    title={col.title}
                    onClick={() => toggle(col.key)}
                    className={`flex w-full items-center justify-end gap-1 font-bold uppercase tracking-wider ${
                      active ? "text-gold" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {col.label}
                    <span className="w-2.5 shrink-0 text-[10px] leading-none" aria-hidden>
                      {active ? (sort.dir === -1 ? "↓" : "↑") : ""}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id}>
              <td>
                <span className={`pill pill-${p.rosterPosition}`}>{p.rosterPosition}</span>
              </td>
              <td className="font-medium text-white">
                <PlayerLink id={p.id}>{p.name}</PlayerLink>
              </td>
              <td className="text-slate-400">{p.nbaTeam}</td>
              <td>
                <PosPill pos={p.eligiblePos} />
              </td>
              <NumCell>
                <span className="text-slate-300">{p.age ?? "—"}</span>
              </NumCell>
              <NumCell>
                <span className="text-slate-300">{p.games || "—"}</span>
              </NumCell>
              <NumCell>
                <span className="text-gold">{p.fppg != null ? formatFp(p.fppg) : "—"}</span>
              </NumCell>
              <NumCell>
                <span className="font-semibold text-white">{p.weeks}</span>
              </NumCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
