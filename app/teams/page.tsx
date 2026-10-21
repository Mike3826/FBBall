import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { getRoster, getTeam, standingsRows } from "@/lib/data";
import { formatFp } from "@/lib/scoring";

export const metadata = { title: "Teams" };

function rankTone(rank: number) {
  if (rank === 1) return "text-gold";
  if (rank === 2) return "text-silver";
  if (rank === 3) return "text-raptor-soft";
  return "text-slate-500";
}

function rankGlow(rank: number) {
  if (rank === 1) return "border-gold/45 bg-gradient-to-r from-gold/15 via-gold/5 to-transparent";
  if (rank === 2) return "border-silver/35 bg-gradient-to-r from-white/10 via-white/[0.03] to-transparent";
  if (rank === 3) return "border-raptor/40 bg-gradient-to-r from-raptor/20 via-raptor/5 to-transparent";
  return "hover:border-white/25";
}

export default function TeamsPage() {
  const rows = [...standingsRows].sort((a, b) => a.rank - b.rank);
  const maxPf = Math.max(...rows.map((s) => s.totalPointsFor), 1);

  return (
    <div>
      <PageHeader title="Teams" subtitle={`${rows.length} franchises · sorted by standings`} />
      <ol className="space-y-3">
        {rows.map((s) => {
          const team = getTeam(s.teamId);
          const roster = getRoster(s.teamId);
          const counts = roster.reduce<Record<string, number>>((acc, p) => {
            acc[p.rosterPosition] = (acc[p.rosterPosition] ?? 0) + 1;
            return acc;
          }, {});
          const name = team?.name ?? s.teamName;
          return (
            <li key={s.teamId}>
              <Link
                href={`/teams/${s.teamId}`}
                className={`card group relative flex flex-col gap-4 overflow-hidden px-5 py-5 transition-colors sm:flex-row sm:items-center sm:gap-6 sm:px-6 ${rankGlow(s.rank)}`}
              >
                <div className="flex min-w-0 items-center gap-4 sm:w-80 sm:shrink-0">
                  <span className={`w-14 shrink-0 text-4xl font-black tabular-nums leading-none ${rankTone(s.rank)}`}>
                    {String(s.rank).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-extrabold text-white group-hover:text-gold sm:text-2xl">{name}</h2>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="pill pill-G">G · {counts.G ?? 0}</span>
                      <span className="pill pill-F">F · {counts.F ?? 0}</span>
                      <span className="pill pill-C">C · {counts.C ?? 0}</span>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs text-slate-500">
                    <span>Points For</span>
                    <span className="font-extrabold tabular-nums text-gold">{formatFp(s.totalPointsFor)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${s.rank === 1 ? "bg-gold" : s.rank <= 3 ? "bg-raptor" : "bg-silver/70"}`}
                      style={{ width: `${(s.totalPointsFor / maxPf) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 sm:w-72 sm:shrink-0 sm:gap-5">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Record</div>
                    <div className="mt-0.5 text-lg font-extrabold tabular-nums text-white">{s.points}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Win %</div>
                    <div className="mt-0.5 text-lg font-extrabold tabular-nums text-slate-200">{s.winPercentage.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">GB</div>
                    <div className="mt-0.5 text-lg font-extrabold tabular-nums text-slate-200">
                      {s.gamesBack === 0 ? "—" : s.gamesBack}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
