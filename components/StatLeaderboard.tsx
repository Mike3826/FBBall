import Link from "next/link";
import PlayerLink from "@/components/PlayerLink";
import { formatFp } from "@/lib/scoring";
import type { PeriodPlayerTotal, ScoredLog } from "@/lib/stats";

type DailyProps = { mode: "daily"; rows: ScoredLog[]; limit?: number };
type WeeklyProps = { mode: "weekly"; rows: PeriodPlayerTotal[]; limit?: number };

function OwnerCell({
  id,
  name,
  status,
}: {
  id: string | null;
  name: string | null;
  status: ScoredLog["ownerStatus"];
}) {
  if (id) {
    return (
      <Link href={`/teams/${id}`} className="block max-w-[9rem] truncate hover:text-gold" title={name ?? undefined}>
        {name}
      </Link>
    );
  }
  return status === "WW" ? (
    <span className="pill bg-amber-500/15 text-amber-300">Waivers</span>
  ) : (
    <span className="pill bg-emerald-500/15 text-emerald-300">FA</span>
  );
}

const num = "text-right tabular-nums";

export default function StatLeaderboard(props: DailyProps | WeeklyProps) {
  const rows = props.limit ? props.rows.slice(0, props.limit) : props.rows;

  return (
    <div className="overflow-x-auto">
      <table className="table-base table-dense whitespace-nowrap">
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>Player</th>
            <th>NBA</th>
            {props.mode === "daily" ? <th>Opp</th> : <th className={num}>GP</th>}
            <th className={num}>MIN</th>
            <th className={num}>PTS</th>
            <th className={num}>REB</th>
            <th className={num}>AST</th>
            <th className={num}>STL</th>
            <th className={num}>BLK</th>
            <th className={num}>3PM</th>
            <th className={num}>TO</th>
            <th className={num}>FPts</th>
            {props.mode === "weekly" && <th className={num}>FP/G</th>}
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          {props.mode === "daily"
            ? (rows as ScoredLog[]).map((r, i) => (
                <tr key={`${r.gameId}-${r.nbaId}`}>
                  <td className="text-slate-500">{i + 1}</td>
                  <td className="font-medium text-white">
                    <PlayerLink id={r.fantraxId}>{r.displayName}</PlayerLink>
                    {r.td ? (
                      <span className="pill ml-1.5 bg-raptor/20 text-gold">TD</span>
                    ) : r.dd ? (
                      <span className="pill ml-1.5 bg-white/10 text-slate-200">DD</span>
                    ) : null}
                    {r.live && <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400 align-middle" title="In progress" />}
                  </td>
                  <td className="text-slate-400">{r.team}</td>
                  <td className="text-slate-400">{r.opponent}</td>
                  <td className={`${num} text-slate-400`}>{r.min.toFixed(0)}</td>
                  <td className={num}>{r.pts}</td>
                  <td className={num}>{r.reb}</td>
                  <td className={num}>{r.ast}</td>
                  <td className={num}>{r.stl}</td>
                  <td className={num}>{r.blk}</td>
                  <td className={num}>{r.fg3m}</td>
                  <td className={`${num} text-slate-400`}>{r.tov}</td>
                  <td className={`${num} font-bold ${r.fp > 50 ? "text-parse-pink" : "text-gold"}`}>{formatFp(r.fp)}</td>
                  <td>
                    <OwnerCell id={r.fantasyTeamId} name={r.fantasyTeamName} status={r.ownerStatus} />
                  </td>
                </tr>
              ))
            : (rows as PeriodPlayerTotal[]).map((r, i) => (
                <tr key={r.key}>
                  <td className="text-slate-500">{i + 1}</td>
                  <td className="font-medium text-white">
                    <PlayerLink id={r.fantraxId}>{r.displayName}</PlayerLink>
                    {r.live && <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400 align-middle" title="In progress" />}
                  </td>
                  <td className="text-slate-400">{r.team}</td>
                  <td className={`${num} text-slate-400`}>{r.games}</td>
                  <td className={`${num} text-slate-400`}>{r.min.toFixed(0)}</td>
                  <td className={num}>{r.pts}</td>
                  <td className={num}>{r.reb}</td>
                  <td className={num}>{r.ast}</td>
                  <td className={num}>{r.stl}</td>
                  <td className={num}>{r.blk}</td>
                  <td className={num}>{r.fg3m}</td>
                  <td className={`${num} text-slate-400`}>{r.tov}</td>
                  <td className={`${num} font-bold text-gold`}>{formatFp(r.fp)}</td>
                  <td className={`${num} text-slate-300`}>{formatFp(r.avg)}</td>
                  <td>
                    <OwnerCell id={r.fantasyTeamId} name={r.fantasyTeamName} status={r.ownerStatus} />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
