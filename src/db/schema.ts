/**
 * Save-file schema for the basketball GM sim (IndexedDB via Dexie).
 *
 * This plays the role of replica-architect's schema.sql: the game runs
 * fully in the browser, so the "database" is IndexedDB. Rules carried over
 * from the skill:
 *   - ids are UUID strings (crypto.randomUUID()), safe to sync to a server later
 *   - every table has leagueId: the owner column; one league = one save
 *   - status fields are closed union types, validated at runtime in src/data/
 *   - money is an integer number of thousands (fictional currency), never a float
 *   - in-game time is season + day integers; real time (UTC ISO strings) only on League
 *   - IndexedDB cannot index booleans or null: a row with such a value is
 *     silently missing from every compound index that uses it. So indexed
 *     flags are 0 | 1, and "no team" / "not retired" use sentinels below
 *   - there are no foreign keys in IndexedDB: src/data/ enforces them, and
 *     deleteLeague() removes every row with that leagueId in one transaction
 *
 * Never edit a shipped version in place:
 * add db.version(n + 1) with an upgrade() and bump SCHEMA_VERSION.
 */
import Dexie, { type Table } from "dexie";

export const SCHEMA_VERSION = 1;

export type Id = string; // UUID
export type Money = number; // integer, thousands of in-game currency
export type Season = number; // e.g. 2027
export type Day = number; // 0-based day within the season
export type Flag = 0 | 1; // indexed boolean

export const FREE_AGENT: Id = "FA"; // Player.teamId for free agents and undrafted prospects
export const ACTIVE: Season = 0; // Player.retiredSeason for players still playing

export type Phase =
  | "preseason"
  | "regular"
  | "playoffs"
  | "draft_lottery"
  | "draft"
  | "free_agency"
  | "training_camp";

export type Position = "PG" | "SG" | "SF" | "PF" | "C";

export interface Ratings {
  // 0-100 each
  inside: number;
  midrange: number;
  three: number;
  freeThrow: number;
  passing: number;
  handling: number;
  rebounding: number;
  perimeterD: number;
  interiorD: number;
  athleticism: number;
  stamina: number;
  iq: number;
}

export interface LeagueSettings {
  numTeams: number; // 8-30
  gamesPerSeason: number; // e.g. 82
  rosterMin: number; // e.g. 13
  rosterMax: number; // e.g. 15
  salaryCap: Money;
  luxuryTax: Money;
  minSalary: Money;
  maxContractYears: number;
  tradeDeadlineDay: Day;
  playoffTeams: number; // power of two
  keepPlayByPlaySeasons: number; // storage cleanup
}

export interface League {
  id: Id;
  name: string;
  seed: string; // master seed; every game seed derives from it
  userTeamId: Id;
  difficulty: "easy" | "normal" | "hard";
  season: Season;
  phase: Phase;
  day: Day;
  settings: LeagueSettings;
  schemaVersion: number;
  createdAt: string; // UTC ISO, real time
  updatedAt: string; // UTC ISO, real time (last played)
}

export interface Team {
  id: Id;
  leagueId: Id;
  city: string; // fictional
  name: string; // fictional
  abbrev: string; // unique per league
  colors: { primary: string; secondary: string };
  crestSeed: string;
  conference: 0 | 1;
  division: number;
  isUser: boolean;
  strategy: "contending" | "rebuilding";
  rotation: Rotation;
}

export interface Rotation {
  starters: Id[]; // exactly 5 player ids
  minutes: Record<Id, number>; // must sum to 240
  tactics: {
    pace: number; // -2..2
    threePointFocus: number; // -2..2
    defensePressure: number; // -2..2
  };
}

export interface Injury {
  type: string;
  gamesRemaining: number;
}

export interface Player {
  id: Id;
  leagueId: Id;
  teamId: Id; // FREE_AGENT when unsigned or not yet drafted
  firstName: string; // generated
  lastName: string; // generated
  bornYear: number;
  position: Position;
  heightCm: number;
  ratings: Ratings;
  overall: number; // derived from ratings, stored for sorting
  potential: number; // hidden from the player; UI shows a scouted range
  injury: Injury | null;
  draft: { season: Season; round: number; pick: number; teamId: Id } | null;
  isProspect: Flag; // 1 = in the upcoming draft class
  retiredSeason: Season; // ACTIVE (0) while playing; never delete retired players: history needs them
  portraitSeed: string;
}

export interface RatingHistory {
  id: Id;
  leagueId: Id;
  playerId: Id;
  season: Season;
  ratings: Ratings;
  overall: number;
}

export interface Contract {
  id: Id;
  leagueId: Id;
  playerId: Id;
  teamId: Id;
  salaryPerYear: Money;
  startSeason: Season;
  endSeason: Season; // inclusive; one active contract per player at a time
  type: "rookie" | "standard" | "minimum";
  option: { kind: "player" | "team"; season: Season } | null;
}

export interface DraftPick {
  id: Id;
  leagueId: Id;
  season: Season;
  round: 1 | 2;
  originalTeamId: Id; // [leagueId+season+round+originalTeamId] is unique
  ownerTeamId: Id; // trades change only this
  pickNo: number | null; // set after the lottery
  playerId: Id | null; // set when used
}

export interface Game {
  id: Id;
  leagueId: Id;
  season: Season;
  day: Day;
  homeTeamId: Id;
  awayTeamId: Id;
  isPlayoff: Flag;
  seriesId: string | null;
  status: "scheduled" | "final"; // simulate only when scheduled (idempotency)
  seed: string; // hash(league.seed, season, id)
  scoreHome: number | null;
  scoreAway: number | null;
  playByPlay: PlayEvent[] | null; // dropped after keepPlayByPlaySeasons; replay from seed
}

export interface PlayEvent {
  q: number; // quarter, 5+ = overtime
  clock: number; // seconds left in the quarter
  teamId: Id;
  playerId: Id | null;
  kind: string; // "made2", "miss3", "rebound", "turnover", ...
  scoreHome: number;
  scoreAway: number;
}

export interface PlayerGameStat {
  id: Id;
  leagueId: Id;
  gameId: Id;
  season: Season;
  playerId: Id;
  teamId: Id;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  pf: number;
}

export interface PlayerSeasonStat {
  id: Id;
  leagueId: Id;
  playerId: Id;
  season: Season;
  teamId: Id; // one row per team played for that season
  isPlayoff: Flag;
  gp: number;
  gs: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  pf: number;
}

export interface TeamSeason {
  id: Id;
  leagueId: Id;
  teamId: Id;
  season: Season;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  playoffResult: "missed" | "round" | "finals" | "champion" | null;
  playoffRoundReached: number | null;
}

export type TradeAsset =
  | { kind: "player"; playerId: Id }
  | { kind: "pick"; pickId: Id };

export interface Trade {
  id: Id;
  leagueId: Id;
  season: Season;
  day: Day;
  teamA: Id;
  teamB: Id;
  assetsA: TradeAsset[]; // A sends these to B
  assetsB: TradeAsset[]; // B sends these to A
  status: "proposed" | "accepted" | "rejected" | "countered";
  reason: string | null; // AI's explanation
}

export interface Award {
  id: Id;
  leagueId: Id;
  season: Season;
  type: "MVP" | "ROY" | "DPOY" | "SMOY" | "MIP" | "FINALS_MVP" | "ALL_LEAGUE_1" | "ALL_LEAGUE_2" | "ALL_LEAGUE_3" | "CHAMPION";
  playerId: Id | null;
  teamId: Id;
}

export interface GameEvent {
  id: Id;
  leagueId: Id;
  season: Season;
  day: Day;
  type: "injury" | "trade_offer" | "milestone" | "contract" | "retirement" | "draft" | "award";
  payload: Record<string, unknown>;
  blocksAdvance: boolean; // stop advance() until the player handles it (not indexed)
  read: Flag;
}

/**
 * Dexie index strings. First entry is the primary key. Every column the
 * UI filters or sorts by, and every "foreign key", is indexed. Compound
 * indexes in [brackets]; & marks unique.
 */
export class SaveDb extends Dexie {
  leagues!: Table<League, Id>;
  teams!: Table<Team, Id>;
  players!: Table<Player, Id>;
  ratingHistory!: Table<RatingHistory, Id>;
  contracts!: Table<Contract, Id>;
  draftPicks!: Table<DraftPick, Id>;
  games!: Table<Game, Id>;
  playerGameStats!: Table<PlayerGameStat, Id>;
  playerSeasonStats!: Table<PlayerSeasonStat, Id>;
  teamSeasons!: Table<TeamSeason, Id>;
  trades!: Table<Trade, Id>;
  awards!: Table<Award, Id>;
  events!: Table<GameEvent, Id>;

  constructor() {
    super("hoops-gm");
    this.version(SCHEMA_VERSION).stores({
      leagues: "id, updatedAt",
      teams: "id, leagueId, &[leagueId+abbrev]",
      players:
        "id, leagueId, [leagueId+teamId], [leagueId+isProspect], [leagueId+retiredSeason], [leagueId+overall]",
      ratingHistory: "id, leagueId, &[playerId+season]",
      contracts: "id, leagueId, [leagueId+teamId], [playerId+endSeason], [leagueId+endSeason]",
      draftPicks:
        "id, leagueId, [leagueId+season], [leagueId+ownerTeamId], &[leagueId+season+round+originalTeamId]",
      games:
        "id, leagueId, [leagueId+season+day], [leagueId+season+status], [leagueId+homeTeamId+season], [leagueId+awayTeamId+season]",
      playerGameStats: "id, leagueId, gameId, [leagueId+season], [playerId+season], &[gameId+playerId]",
      playerSeasonStats:
        "id, leagueId, [leagueId+season+isPlayoff], [playerId+season], &[playerId+season+teamId+isPlayoff]",
      teamSeasons: "id, leagueId, &[teamId+season], [leagueId+season]",
      trades: "id, leagueId, [leagueId+season]",
      awards: "id, leagueId, [leagueId+season], playerId",
      events: "id, leagueId, [leagueId+read], [leagueId+season+day]",
    });
  }
}

/** Every table that carries leagueId. deleteLeague() clears all of them in one transaction. */
export const LEAGUE_OWNED_TABLES = [
  "teams",
  "players",
  "ratingHistory",
  "contracts",
  "draftPicks",
  "games",
  "playerGameStats",
  "playerSeasonStats",
  "teamSeasons",
  "trades",
  "awards",
  "events",
] as const;
