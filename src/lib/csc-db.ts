import Database from "better-sqlite3";

// CSC Smart Seva reads/writes n8n's own data tables (physical tables:
// data_table_user_<id>). Table ids are resolved from n8n's `data_table`
// index so a restore/re-import never breaks the dashboard.

const N8N_DB = "/home/z/.n8n/database.sqlite";

let _db: Database.Database | null = null;
let _mapCache: Record<string, string> | null = null;
let _mapCacheAt = 0;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(N8N_DB);
    _db.pragma("busy_timeout = 10000");
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

function tableMap(): Record<string, string> {
  const now = Date.now();
  if (_mapCache && now - _mapCacheAt < 60_000) return _mapCache;
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name FROM data_table")
    .all() as { id: string; name: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.name] = `data_table_user_${r.id}`;
  _mapCache = map;
  _mapCacheAt = now;
  return map;
}

export function phys(name: string): string {
  const t = tableMap()[name];
  if (!t) throw new Error(`data table not found: ${name}`);
  return t;
}

export function q<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function q1<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): void {
  getDb().prepare(sql).run(...params);
}

// ---- JSON-safe parse for columns n8n stores as JSON strings ----
export function parseJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!(s.startsWith("{") || s.startsWith("["))) return v;
  try {
    return JSON.parse(s);
  } catch {
    return v;
  }
}

export function parseRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = parseJson(v);
  return out as T;
}

export function parseRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((r) => parseRow(r));
}

// num() — n8n may store numbers as strings in data tables
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

// unq() — older imported rows store text values JSON-encoded ("123" with
// literal quote chars). Runtime rows are plain. This strips quote chars so
// phones/ids match across mixed data.
export function unq(v: unknown): string {
  return String(v ?? "").replace(/"/g, "").trim();
}

// both plain and JSON-quoted variants of a value (for WHERE clauses)
export function variants(v: unknown): string[] {
  const raw = String(v ?? "");
  const plain = unq(raw);
  const quoted = JSON.stringify(plain);
  return Array.from(new Set([raw, plain, quoted]));
}

export function inVariants(v: unknown): string {
  return "(" + variants(v).map(() => "?").join(",") + ")";
}
