// Insert a public API key for seeding data tables via REST API
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite");
const USER = "8715d6d2-70e5-4474-9df0-17efba0ede89";
const KEY = "csc-build-2026-a7f3d9e2b8c4"; // plaintext key (n8n stores it plaintext)
const now = new Date().toISOString().replace("T", " ").replace("Z", "").slice(0, 19) + ".000";

const scopes = db.prepare("SELECT s.slug FROM role_scope rs JOIN scope s ON s.slug=rs.scopeSlug JOIN role r ON r.slug=rs.roleSlug WHERE r.slug=?").all("global:owner").map(r => r.slug);
console.log("scopes:", scopes.length);

const ex = db.prepare("SELECT id FROM user_api_keys WHERE label = ?").get("CSC Builder Key");
if (ex) {
  console.log("key exists:", ex.id);
} else {
  db.prepare("INSERT INTO user_api_keys (id, userId, label, scopes, apiKey, audience, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)")
    .run(crypto.randomUUID(), USER, "CSC Builder Key", JSON.stringify(scopes), KEY, "public-api", now, now);
  console.log("API key inserted");
}
db.close();
console.log("KEY=" + KEY);
