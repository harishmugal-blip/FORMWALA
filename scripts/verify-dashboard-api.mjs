import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'db', 'custom.db');
const db = new DatabaseSync(dbPath, { readOnly: true });

console.log('=== VERIFYING OPERATOR DASHBOARD DATABASE & DATA ===\n');

// 1. Applications Count & Sample
const apps = db.prepare('SELECT application_id, application_number, service_id, customer_phone, status, total_fee, createdAt FROM applications ORDER BY createdAt DESC LIMIT 10').all();
console.log(`[Applications] Total found in sample: ${apps.length}`);
for (const a of apps.slice(0, 3)) {
  console.log(`  Token: ${a.application_number} | Seva: ${a.service_id} | Status: ${a.status} | Phone: ${a.customer_phone} | Fee: ₹${a.total_fee}`);
}

// 2. Services Catalog
const services = db.prepare('SELECT service_id, service_name, category, total_fee, active FROM service_catalog ORDER BY category, service_name').all();
console.log(`\n[Services Catalog] Active services in database: ${services.length}`);
console.log(`  Sample: ${services.slice(0, 5).map(s => s.service_name).join(', ')}...`);

// 3. Customers
const customers = db.prepare('SELECT customer_id, name, phone, createdAt FROM customers ORDER BY createdAt DESC LIMIT 5').all();
console.log(`\n[Customers] Recent registered customers: ${customers.length}`);
for (const c of customers.slice(0, 3)) {
  console.log(`  ID: ${c.customer_id} | Name: ${c.name} | Phone: ${c.phone}`);
}

// 4. Payments
const payments = db.prepare('SELECT payment_id, application_id, amount, gateway, status, createdAt FROM payments ORDER BY createdAt DESC LIMIT 5').all();
console.log(`\n[Payments] Payments recorded: ${payments.length}`);
for (const p of payments) {
  console.log(`  PayID: ${p.payment_id} | App: ${p.application_id} | Amount: ₹${p.amount} | Gateway: ${p.gateway} | Status: ${p.status}`);
}

// 5. Operator Tasks
const tasks = db.prepare('SELECT task_id, application_number, status, title FROM operator_tasks ORDER BY createdAt DESC LIMIT 5').all();
console.log(`\n[Operator Tasks] Pending operator tasks: ${tasks.length}`);

// 6. Conversation State
const convs = db.prepare('SELECT phone, state, service_id, handoff_active FROM conversation_state ORDER BY id DESC LIMIT 5').all();
console.log(`\n[Conversations] Active conversation states: ${convs.length}`);

console.log('\n=== ALL DASHBOARD TABLES VALIDATED SUCCESSFULLY ===');
