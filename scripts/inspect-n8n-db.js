// Inspect n8n DB with bun:sqlite
import { Database } from "bun:sqlite";

const db = new Database("/home/z/.n8n/database.sqlite", { readonly: true });

const users = db.prepare("SELECT * FROM user").all();
console.log("USERS:", JSON.stringify(users, null, 1));

const projects = db.prepare("SELECT id, name, type FROM project").all();
console.log("PROJECTS:", JSON.stringify(projects, null, 1));

try {
  const rel = db.prepare("SELECT projectId, userId, role FROM project_relation").all();
  console.log("PROJECT_RELATIONS:", JSON.stringify(rel, null, 1));
} catch (e) { console.log("project_relation error:", e.message); }

const shared = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%shared%'").all();
console.log("SHARED TABLES:", JSON.stringify(shared));

db.close();
