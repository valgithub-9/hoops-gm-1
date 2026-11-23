import type { Table } from "dexie";
import { LEAGUE_OWNED_TABLES, SCHEMA_VERSION, type League, type SaveDb } from "../db/schema";

export const SAVE_FORMAT = "hoops-gm-save";
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

type Tables = Record<(typeof LEAGUE_OWNED_TABLES)[number], Record<string, unknown>[]>;
export interface SaveFile { format: typeof SAVE_FORMAT; schemaVersion: number; exportedAt: string; league: League; tables: Tables }

export async function exportLeague(db: SaveDb, leagueId: string): Promise<SaveFile> {
  const league = await db.leagues.get(leagueId);
  if (!league) throw new Error("找不到這個聯盟");
  const tables = {} as Tables;
  for (const t of LEAGUE_OWNED_TABLES) {
    tables[t] = (await db[t].where("leagueId").equals(leagueId).toArray()) as unknown as Record<string, unknown>[];
  }
  return { format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), league, tables };
}

/**
 * Imports a save file. The file is untrusted data: it is shape-checked,
 * every row must belong to the file's league, and nothing in it is executed.
 */
export async function importLeague(db: SaveDb, text: string): Promise<string> {
  if (text.length > MAX_IMPORT_BYTES) throw new Error("檔案太大（上限 100 MB）");
  let data: SaveFile;
  try { data = JSON.parse(text); } catch { throw new Error("不是有效的存檔檔案（JSON 格式錯誤）"); }
  if (!data || data.format !== SAVE_FORMAT) throw new Error("不是 Hoops GM 的存檔檔案");
  if (typeof data.schemaVersion !== "number" || data.schemaVersion > SCHEMA_VERSION) throw new Error("這份存檔來自較新的版本，請先更新遊戲");
  const league = data.league;
  if (!league || typeof league.id !== "string" || typeof league.name !== "string" || typeof league.season !== "number") throw new Error("存檔內容不完整");
  if (await db.leagues.get(league.id)) throw new Error("這份存檔已經在這個瀏覽器裡了");
  for (const t of LEAGUE_OWNED_TABLES) {
    const rows = data.tables?.[t];
    if (!Array.isArray(rows)) throw new Error(`存檔內容不完整（缺少 ${t}）`);
    for (const r of rows) {
      if (!r || typeof r !== "object" || typeof r.id !== "string" || r.leagueId !== league.id) throw new Error(`存檔內容有誤（${t}）`);
    }
  }
  // Migrations for older files.
  if (data.schemaVersion < 2) for (const r of data.tables.playerGameStats) r.isPlayoff ??= 0;
  league.schemaVersion = SCHEMA_VERSION;

  const tables = [db.leagues, ...LEAGUE_OWNED_TABLES.map((t) => db[t])];
  await db.transaction("rw", tables, async () => {
    await db.leagues.add(league);
    for (const t of LEAGUE_OWNED_TABLES) await (db[t] as unknown as Table<unknown>).bulkAdd(data.tables[t]);
  });
  return league.id;
}
