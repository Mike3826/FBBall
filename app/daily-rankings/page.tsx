import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import PageHeader from "@/components/PageHeader";
import PublishToDiscordButton from "@/components/PublishToDiscordButton";
import StatLeaderboard from "@/components/StatLeaderboard";
import { formatDate, getCurrentPeriod, leagueInfo } from "@/lib/data";
import { LIVE_TTL_MS, todayEt } from "@/lib/nba";
import { datesInPeriod, getStats, publishableDate, updatedLabel } from "@/lib/stats";

export const metadata = { title: "Daily Rankings" };
export const dynamic = "force-dynamic";

function labelFor(ymd: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-US", opts);
}

export default async function DailyRankingsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [{ date: requested }, stats] = await Promise.all([searchParams, getStats()]);
  const period = getCurrentPeriod();
  const gameDates = stats.gameDates;
  const today = todayEt();

  // Default to the most recent date with data (usually tonight), else today.
  const latestWithData = [...gameDates].reverse().find((d) => d <= today) ?? gameDates[gameDates.length - 1];
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : (latestWithData ?? today);

  const chipDates = [...new Set([...(period ? datesInPeriod(period) : []), ...gameDates, date])].sort();
  const hasData = new Set(gameDates);

  const leaders = stats.dailyLeaders(date);
  const anyLive = leaders.some((l) => l.live);

  return (
    <div className="space-y-6">
      <PageHeader title="Daily Rankings" subtitle={`Fantasy points by game day · ${updatedLabel(stats.meta)}`}>
        <div className="flex items-center gap-4">
          <AutoRefresh intervalMs={LIVE_TTL_MS} label="Live" />
          <PublishToDiscordButton target={publishableDate(stats)} />
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {chipDates.map((d) => {
          const isSelected = d === date;
          const isToday = d === today;
          const available = hasData.has(d);
          const cls = isSelected
            ? "border-raptor/50 bg-raptor/15 text-gold"
            : available
              ? "border-white/10 text-slate-300 hover:border-white/30 hover:text-white"
              : "border-white/5 text-slate-600";
          const label = (
            <>
              {labelFor(d, { weekday: "short", month: "short", day: "numeric" })}
              {isToday && <span className="ml-1 text-[10px] uppercase opacity-70">today</span>}
            </>
          );
          return available || isSelected ? (
            <Link key={d} href={`/daily-rankings?date=${d}`} className={`rounded-md border px-3 py-1.5 text-xs font-medium tabular-nums ${cls}`}>
              {label}
            </Link>
          ) : (
            <span key={d} className={`rounded-md border px-3 py-1.5 text-xs font-medium tabular-nums ${cls}`}>
              {label}
            </span>
          );
        })}
      </div>

      <section className="card">
        <div className="flex items-center justify-between border-b-2 border-white/15 px-5 py-3">
          <h2 className="card-title">Leaderboard · {labelFor(date, { weekday: "long", month: "short", day: "numeric" })}</h2>
          <span className="text-xs text-slate-500">
            {leaders.length} players
            {anyLive && (
              <span className="ml-2 inline-flex items-center gap-1 text-rose-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                live
              </span>
            )}
          </span>
        </div>
        {leaders.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-2xl">🏀</div>
            <p className="mt-4 text-sm font-medium text-white">No box scores for this date</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              {date > today
                ? "Games haven't been played yet."
                : date < leagueInfo.startDate
                  ? `The season tips off ${formatDate(leagueInfo.startDate)}.`
                  : "No games were played on this date."}
            </p>
          </div>
        ) : (
          <StatLeaderboard rows={leaders} mode="daily" />
        )}
      </section>
    </div>
  );
}
