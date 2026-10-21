import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { getRoster, standingsRows, teams } from "@/lib/data";

export const metadata = { title: "Teams" };

export default function TeamsPage() {
  const standingsById = new Map(standingsRows.map((s) => [s.teamId, s]));

  return (
    <div>
      <PageHeader title="Teams" subtitle={`${teams.length} franchises`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => {
          const s = standingsById.get(team.id);
          const roster = getRoster(team.id);
          const counts = roster.reduce<Record<string, number>>((acc, p) => {
            acc[p.rosterPosition] = (acc[p.rosterPosition] ?? 0) + 1;
            return acc;
          }, {});
          return (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className="card group flex flex-col gap-3 p-5 transition-colors hover:border-raptor/40"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-white group-hover:text-gold">{team.name}</h2>
                {s && (
                  <span className="shrink-0 rounded-md bg-white/5 px-2 py-1 text-xs font-semibold tabular-nums text-slate-300">
                    #{s.rank}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Record</div>
                  <div className="font-semibold tabular-nums">{s?.points ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Points For</div>
                  <div className="font-semibold tabular-nums">{s?.totalPointsFor.toFixed(2) ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Roster</div>
                  <div className="font-semibold tabular-nums">{roster.length}</div>
                </div>
              </div>
              <div className="flex gap-1.5 text-[11px]">
                <span className="pill pill-G">G · {counts.G ?? 0}</span>
                <span className="pill pill-F">F · {counts.F ?? 0}</span>
                <span className="pill pill-C">C · {counts.C ?? 0}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
