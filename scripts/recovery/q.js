// Quick sqlite query helper: bun /home/z/my-project/scripts/recovery/q.js "SELECT ..."
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/home/z/.n8n/database.sqlite', { readOnly: false });
const sql = process.argv[2];
if (!sql) { console.log('usage: bun q.js "SQL"'); process.exit(1); }
try {
  const rows = db.prepare(sql).all();
  console.log(JSON.stringify(rows, null, 1));
} catch (e) { console.error('ERR', e.message); process.exit(1); }
db.close();
