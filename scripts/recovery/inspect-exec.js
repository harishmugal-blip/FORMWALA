// Inspect execution data (handles gzip-compressed resultData)
import { DatabaseSync } from 'node:sqlite';
import zlib from 'node:zlib';
const db = new DatabaseSync('/home/z/.n8n/database.sqlite', { readOnly: true });
const id = process.argv[2];
const rows = db.prepare(`SELECT e.workflowId, w.name, ed.data, e.status FROM execution_entity e
  LEFT JOIN execution_data ed ON ed.executionId = e.id
  LEFT JOIN workflow_entity w ON w.id = e.workflowId
  WHERE e.id = ?`).all(id);
for (const r of rows) {
  console.log('workflow:', r.name, '| status:', r.status);
  let raw = r.data;
  if (!raw) { console.log('no data'); continue; }
  if (typeof raw === 'string' && raw.startsWith('{')) {
    // JSON blob (newer n8n)
    try { raw = JSON.parse(raw); } catch (e) {}
    if (raw.resultData?.runData) raw = raw.resultData.runData;
  } else if (Buffer.isBuffer(raw) || (typeof raw === 'string' && !raw.startsWith('{'))) {
    try { raw = zlib.gunzipSync(Buffer.from(raw, 'base64')).toString(); raw = JSON.parse(raw); if (raw.resultData?.runData) raw = raw.resultData.runData; } catch (e) { console.log('decompress fail'); continue; }
  }
  const runData = raw?.resultData?.runData || raw;
  for (const [node, runs] of Object.entries(runData)) {
    const err = runs[0]?.error;
    const errStr = err ? JSON.stringify(err).slice(0, 200) : '';
    console.log(`  ${err ? 'X' : ' '} ${node} ${errStr}`);
    if (node.includes('AI Intent') && !err) {
      const out = runs[0]?.data?.main?.[0]?.[0]?.json;
      console.log('    output:', JSON.stringify(out).slice(0, 300));
    }
  }
}
db.close();
