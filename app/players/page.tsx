import PageHeader from "@/components/PageHeader";
import PlayerTable, { type PlayerRow } from "@/components/PlayerTable";
import { allPlayers, formatPlayerName, getTeamName, playerTeamMap, teams } from "@/lib/data";

export const metadata = { title: "Players" };

export default function PlayersPage() {
  const rows: PlayerRow[] = allPlayers
    .map((p) => {
      const fantasyTeamId = playerTeamMap[p.id] ?? null;
      return {
        id: p.id,
        name: formatPlayerName(p.name),
        nbaTeam: p.nbaTeam,
        position: p.position,
        eligiblePos: p.eligiblePos,
        status: p.status,
        fantasyTeamId,
        fantasyTeamName: fantasyTeamId ? getTeamName(fantasyTeamId) : null,
      };
    })
    // Rostered players first, then alphabetical.
    .sort((a, b) => {
      if ((a.fantasyTeamId === null) !== (b.fantasyTeamId === null)) return a.fantasyTeamId === null ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

  const rostered = rows.filter((r) => r.status === "T").length;

  return (
    <div>
      <PageHeader
        title="Players"
        subtitle={`${rows.length.toLocaleString()} players in the pool · ${rostered} rostered · ${rows.length - rostered} available`}
      />
      <PlayerTable players={rows} teams={teams} />
    </div>
  );
}
