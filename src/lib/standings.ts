import type { Team, TeamSeason } from "../db";

export interface StandingRow { team: Team; ts: TeamSeason; pct: number; gb: number; rank: number }

export const pct = (w: number, l: number) => (w + l === 0 ? 0 : w / (w + l));
export const fmtPct = (p: number) => p.toFixed(3).replace(/^0/, "");

/** Sorted by win percentage, then point differential. GB from the conference leader. */
export function conferenceStandings(teams: Team[], standings: TeamSeason[], conference: 0 | 1): StandingRow[] {
  const rows = teams
    .filter((t) => t.conference === conference)
    .map((team) => {
      const ts = standings.find((s) => s.teamId === team.id)!;
      return { team, ts, pct: pct(ts.wins, ts.losses), gb: 0, rank: 0 };
    })
    .sort((a, b) => b.pct - a.pct || (b.ts.pointsFor - b.ts.pointsAgainst) - (a.ts.pointsFor - a.ts.pointsAgainst));
  const lead = rows[0];
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.gb = lead ? ((lead.ts.wins - r.ts.wins) + (r.ts.losses - lead.ts.losses)) / 2 : 0;
  });
  return rows;
}

export const CONFERENCE_NAMES = ["東區", "西區"] as const;
