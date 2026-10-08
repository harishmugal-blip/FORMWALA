// Verify credential import in n8n DB
import { Database } from "bun:sqlite";

const db = new Database("/home/z/.n8n/database.sqlite", { readonly: true });

const creds = db.prepare("SELECT id, name, type, LENGTH(data) as dataLen FROM credentials_entity").all();
console.log("CREDENTIALS:", JSON.stringify(creds, null, 1));

const shared = db.prepare("SELECT * FROM shared_credentials").all();
console.log("SHARED_CREDENTIALS:", JSON.stringify(shared, null, 1));

db.close();
