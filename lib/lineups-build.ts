import { formatPlayerName, getRoster, leagueInfo, standingsRows, type ScoringPeriod } from "@/lib/data";
import { gamePlayedFrac, nbaTeamInGame } from "@/lib/nba";
import { LINEUP_SLOTS, SLOTS, playerSlot, type LineupPlayer, type Slot, type TeamLineup } from "@/lib/lineups";
import { playerGameProjection, playerOrigWeek, playerProjectedRemaining, type WeekProjections } from "@/lib/projections";
import { datesInPeriod, type Stats } from "@/lib/stats";

const r2 = (n: number) => Math.round(n * 100) / 100;

function currentPlayedSlate(stats: Stats): string {
  const dates = new Set<string>();
  for (const l of stats.logs) dates.add(l.date);
  for (const g of stats.games) {
    if (g.status >= 2) dates.add(g.date);
  }
  return [...dates].filter((d) => d <= stats.meta.today).sort().at(-1) ?? stats.meta.today;
}

function lastGameByPlayer(stats: Stats): Map<string, { date: string; fp: number }> {
  const latest = new Map<string, { date: string; fp: number }>();
  for (const l of stats.logs) {
    if (!l.fantraxId) continue;
    const cur = latest.get(l.fantraxId);
    if (!cur || l.date > cur.date) latest.set(l.fantraxId, { date: l.date, fp: l.fp });
  }
  return latest;
}

export function buildTeamLineups(stats: Stats, period: ScoringPeriod, projs?: WeekProjections | null): TeamLineup[] {
  const weekly = new Map(stats.periodLeaders(period).filter((t) => t.fantraxId).map((t) => [t.fantraxId!, t]));
  const today = new Map(stats.dailyLeaders(stats.meta.today).filter((l) => l.fantraxId).map((l) => [l.fantraxId!, l]));
  const lastGame = lastGameByPlayer(stats);
  const currentSlate = currentPlayedSlate(stats);
  const weekDates = new Set(datesInPeriod(period));
  const weekSlate = stats.games.filter((g) => weekDates.has(g.date));
  const upcoming = weekSlate.filter((g) => g.status === 1);

  return leagueInfo.teams.map((team) => {
    const groups: Record<Slot, LineupPlayer[]> = { G: [], F: [], C: [] };
    for (const p of getRoster(team.id)) {
      const slot = playerSlot(p);
      const w = weekly.get(p.id);
      const t = today.get(p.id);
      const last = lastGame.get(p.id);
      const slate = weekSlate.filter((g) => nbaTeamInGame(p.nbaTeam, g));
      const started = slate.filter((g) => g.status >= 2).length;
      const logged = w?.games ?? 0;
      const gamesPlayed = Math.max(started, logged, t?.live ? 1 : 0);
      const remainingDates = upcoming.filter((g) => nbaTeamInGame(p.nbaTeam, g)).map((g) => g.date);
      const weekGameDates = slate.map((g) => g.date);
      const fallbackFppg = logged > 0 ? (w?.fp ?? 0) / logged : 0;
      const remainSlices: number[] = remainingDates
        .map((date) => playerGameProjection(projs, p.id, date) ?? fallbackFppg)
        .filter((mean) => mean > 0);
      const liveGame = slate.find((g) => g.status === 2);
      if (liveGame) {
        const left = 1 - gamePlayedFrac(liveGame);
        const liveMean = (playerGameProjection(projs, p.id, liveGame.date) ?? fallbackFppg) * left;
        if (liveMean > 0.05) remainSlices.push(Math.round(liveMean * 100) / 100);
      }
      const projRemaining = remainSlices.reduce((s, n) => s + n, 0) || playerProjectedRemaining(projs, p.id, remainingDates, fallbackFppg);
      const fp = w?.fp ?? 0;
      const lastCompleted = Boolean(last && !(t?.live && last.date === stats.meta.today));
      groups[slot].push({
        id: p.id,
        name: formatPlayerName(p.name),
        nbaTeam: p.nbaTeam,
        slot,
        eligiblePos: p.eligiblePos,
        games: logged,
        gamesPlayed,
        weekGames: Math.max(slate.length, gamesPlayed),
        fp,
        lastGameFp: last?.fp ?? null,
        lastGameOrig: lastCompleted ? playerGameProjection(projs, p.id, last?.date) : null,
        lastGamePrior: Boolean(last && last.date < currentSlate),
        liveFp: t?.live ? t.fp : 0,
        live: Boolean(t?.live),
        playedToday: Boolean(t),
        gamesRemaining: remainingDates.length,
        projRemaining,
        projWeek: r2(fp + projRemaining),
        origWeek: playerOrigWeek(projs, p.id, weekGameDates),
        remainSlices,
        counting: false,
        rank: 0,
      });
    }

    let score = 0;
    let rosterTotal = 0;
    let projScore = 0;
    let projRosterTotal = 0;
    let origScore = 0;
    let origRosterTotal = 0;
    let liveCount = 0;
    let playedTodayCount = 0;
    let countingGames = 0;
    let gamesRemaining = 0;
    for (const slot of SLOTS) {
      groups[slot].sort((a, b) => b.fp - a.fp || b.games - a.games || a.name.localeCompare(b.name));
      const projected = [...groups[slot]].sort(
        (a, b) => b.projWeek - a.projWeek || b.fp - a.fp || a.name.localeCompare(b.name),
      );
      const original = [...groups[slot]].sort(
        (a, b) => b.origWeek - a.origWeek || b.projWeek - a.projWeek || a.name.localeCompare(b.name),
      );
      groups[slot].forEach((p, i) => {
        p.rank = i + 1;
        p.counting = i < LINEUP_SLOTS[slot];
        rosterTotal += p.fp;
        projRosterTotal += p.projWeek;
        origRosterTotal += p.origWeek;
        if (p.live) liveCount++;
        if (p.playedToday) playedTodayCount++;
        if (p.counting) {
          score += p.fp;
          countingGames += p.games;
          gamesRemaining += p.gamesRemaining;
        }
      });
      projScore += projected.slice(0, LINEUP_SLOTS[slot]).reduce((s, p) => s + p.projWeek, 0);
      origScore += original.slice(0, LINEUP_SLOTS[slot]).reduce((s, p) => s + p.origWeek, 0);
    }

    const record = standingsRows.find((s) => s.teamId === team.id)?.points ?? "";
    return {
      team,
      record,
      score: r2(score),
      rosterTotal: r2(rosterTotal),
      projScore: r2(projScore),
      projRosterTotal: r2(projRosterTotal),
      origScore: r2(origScore),
      origRosterTotal: r2(origRosterTotal),
      winPct: null,
      groups,
      liveCount,
      playedTodayCount,
      countingGames,
      gamesRemaining,
    };
  });
}
