"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PlayerLink from "@/components/PlayerLink";
import PosPill from "@/components/PosPill";

export type PlayerRow = {
  id: string;
  name: string; // already "First Last"
  nbaTeam: string;
  position: string;
  eligiblePos: string;
  status: string;
  fantasyTeamId: string | null;
  fantasyTeamName: string | null;
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "T", label: "Rostered" },
  { value: "FA", label: "Free Agents" },
  { value: "WW", label: "Waivers" },
];

const POS_OPTIONS = ["ALL", "G", "F", "C"];
const PAGE_SIZE = 50;

export default function PlayerTable({ players, teams }: { players: PlayerRow[]; teams: { id: string; name: string }[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [pos, setPos] = useState("ALL");
  const [teamId, setTeamId] = useState("ALL");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.nbaTeam.toLowerCase().includes(q)) return false;
      if (status !== "ALL" && p.status !== status) return false;
      if (pos !== "ALL" && !p.eligiblePos.split(",").includes(pos)) return false;
      if (teamId !== "ALL" && p.fantasyTeamId !== teamId) return false;
      return true;
    });
  }, [players, query, status, pos, teamId]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          placeholder="Search player or NBA team…"
          value={query}
          onChange={(e) => reset(setQuery)(e.target.value)}
          className="w-full rounded-md border-2 border-white/15 bg-court px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-raptor/50 focus:outline-none sm:w-64"
        />
        <div className="flex gap-1 rounded-md border-2 border-white/15 bg-court p-1 text-xs">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => reset(setStatus)(o.value)}
              className={`rounded px-2.5 py-1 font-medium ${status === o.value ? "bg-raptor/20 text-gold" : "text-slate-400 hover:text-white"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-md border-2 border-white/15 bg-court p-1 text-xs">
          {POS_OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => reset(setPos)(o)}
              className={`rounded px-2.5 py-1 font-medium ${pos === o ? "bg-raptor/20 text-gold" : "text-slate-400 hover:text-white"}`}
            >
              {o === "ALL" ? "All Pos" : o}
            </button>
          ))}
        </div>
        <select
          value={teamId}
          onChange={(e) => reset(setTeamId)(e.target.value)}
          className="rounded-md border-2 border-white/15 bg-court px-3 py-2 text-sm text-white focus:border-raptor/50 focus:outline-none"
        >
          <option value="ALL">All fantasy teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length.toLocaleString()} player{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Player</th>
              <th>NBA</th>
              <th>Pos</th>
              <th>Eligible</th>
              <th>Status</th>
              <th>Fantasy Team</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td className="font-medium text-white">
                  <PlayerLink id={p.id}>{p.name}</PlayerLink>
                </td>
                <td className="text-slate-400">{p.nbaTeam}</td>
                <td className="text-slate-400">{p.position}</td>
                <td>
                  <PosPill pos={p.eligiblePos} />
                </td>
                <td>
                  <span
                    className={`pill ${
                      p.status === "T"
                        ? "bg-white/5 text-slate-300"
                        : p.status === "WW"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {p.status === "T" ? "Rostered" : p.status === "WW" ? "Waivers" : "FA"}
                  </span>
                </td>
                <td>
                  {p.fantasyTeamId ? (
                    <Link href={`/teams/${p.fantasyTeamId}`} className="hover:text-gold">
                      {p.fantasyTeamName}
                    </Link>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No players match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            className="rounded-md border-2 border-white/15 px-3 py-1.5 text-slate-300 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-slate-500">
            Page {current + 1} of {pageCount}
          </span>
          <button
            type="button"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
            className="rounded-md border-2 border-white/15 px-3 py-1.5 text-slate-300 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
