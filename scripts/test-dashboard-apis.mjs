import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'db', 'custom.db');
const db = new DatabaseSync(dbPath, { readOnly: true });

console.log('--- TESTING ALL DASHBOARD BACKEND QUERIES ---');

let passed = 0;
let failed = 0;

function testQuery(name, sql, params = []) {
  try {
    const res = db.prepare(sql).all(...params);
    console.log(`✅ [${name}] OK (returned ${res.length} rows)`);
    passed++;
    return res;
  } catch (err) {
    console.error(`❌ [${name}] FAILED:`, err.message);
    failed++;
    return null;
  }
}

// 1. Overview KPIs
testQuery('Overview: Applications', 'SELECT application_id, application_number, service_id, customer_phone, status, total_fee, createdAt, updatedAt FROM applications ORDER BY createdAt DESC');
testQuery('Overview: Tasks', 'SELECT task_id, application_number, status, createdAt FROM operator_tasks ORDER BY createdAt DESC');
testQuery('Overview: Message Log', 'SELECT phone, direction, body, createdAt FROM message_log ORDER BY createdAt DESC LIMIT 100');
testQuery('Overview: Conversation State', 'SELECT phone, state, service_id, handoff_active, updatedAt FROM conversation_state');
testQuery('Overview: Payments', 'SELECT amount, status, paid_at, createdAt FROM payments');
testQuery('Overview: Handoff Queue', 'SELECT phone, name, reason, status, createdAt FROM handoff_queue ORDER BY createdAt DESC');
testQuery('Overview: Service Catalog', 'SELECT service_id, service_name, category, total_fee, active FROM service_catalog');

// 2. Applications Screen
testQuery('Applications: List with Payments', `
  SELECT a.application_id, a.application_number, a.service_id, a.customer_phone, a.status, a.total_fee, a.gov_fee, a.service_charge, a.gst, a.createdAt, a.updatedAt,
         (SELECT SUM(CAST(p.amount AS REAL)) FROM payments p WHERE REPLACE(p.application_id, '"', '') = REPLACE(a.application_id, '"', '') AND UPPER(p.status) IN ('PAID','SUCCESS','CAPTURED')) AS paid_amount
  FROM applications a ORDER BY a.createdAt DESC LIMIT 50
`);

// 3. Operator Tasks Screen
testQuery('Tasks: List with Join', `
  SELECT t.id, t.task_id, t.application_id, t.application_number, t.status, t.note, t.operator_phone, t.createdAt, t.updatedAt,
         a.service_id, a.customer_phone, a.total_fee
  FROM operator_tasks t
  LEFT JOIN applications a ON REPLACE(a.application_id, '"', '') = REPLACE(t.application_id, '"', '')
  ORDER BY t.createdAt DESC LIMIT 50
`);

// 4. Conversations Screen
testQuery('Conversations: Active States', `
  SELECT c.phone, c.state, c.service_id, c.handoff_active, c.updated_at,
         (SELECT count(*) FROM message_log m WHERE m.phone = c.phone) AS msg_count
  FROM conversation_state c ORDER BY c.id DESC LIMIT 50
`);

// 5. Services Screen
testQuery('Services: Catalog with Fields and Docs', `
  SELECT s.service_id, s.service_name, s.category, s.government_fee, s.service_charge, s.gst_percent, s.total_fee, s.active
  FROM service_catalog s ORDER BY s.service_name
`);

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed === 0) {
  console.log('🎉 ALL OPERATOR DASHBOARD DATABASE QUERIES ARE 100% OPERATIONAL!');
} else {
  process.exit(1);
}
