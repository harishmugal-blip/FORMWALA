import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, '..', 'db', 'custom.db'));

console.log('--- DATABASE HEALTH & INDEX AUDIT ---');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
console.log(`Total Tables: ${tables.length}`);

const indexes = db.prepare("SELECT tbl_name, name FROM sqlite_master WHERE type='index'").all();
console.log(`Total Indexes: ${indexes.length}`);

// Check critical performance queries & missing indexes
const missingIndexes = [];

// Check index on applications(customer_phone)
const appPhoneIdx = indexes.find(i => i.tbl_name === 'applications' && i.name.includes('phone'));
if (!appPhoneIdx) missingIndexes.push({ table: 'applications', column: 'customer_phone', name: 'idx_applications_phone' });

// Check index on applications(application_number)
const appNumIdx = indexes.find(i => i.tbl_name === 'applications' && (i.name.includes('number') || i.name.includes('token')));
if (!appNumIdx) missingIndexes.push({ table: 'applications', column: 'application_number', name: 'idx_applications_appnum' });

// Check index on applications(status)
const appStatusIdx = indexes.find(i => i.tbl_name === 'applications' && i.name.includes('status'));
if (!appStatusIdx) missingIndexes.push({ table: 'applications', column: 'status', name: 'idx_applications_status' });

// Check index on customers(phone)
const custPhoneIdx = indexes.find(i => i.tbl_name === 'customers' && i.name.includes('phone'));
if (!custPhoneIdx) missingIndexes.push({ table: 'customers', column: 'phone', name: 'idx_customers_phone' });

// Check index on conversation_state(phone)
const convPhoneIdx = indexes.find(i => i.tbl_name === 'conversation_state' && i.name.includes('phone'));
if (!convPhoneIdx) missingIndexes.push({ table: 'conversation_state', column: 'phone', name: 'idx_conv_phone' });

// Check index on message_log(phone)
const msgPhoneIdx = indexes.find(i => i.tbl_name === 'message_log' && i.name.includes('phone'));
if (!msgPhoneIdx) missingIndexes.push({ table: 'message_log', column: 'phone', name: 'idx_message_log_phone' });

// Check index on payments(application_id)
const payAppIdx = indexes.find(i => i.tbl_name === 'payments' && i.name.includes('application'));
if (!payAppIdx) missingIndexes.push({ table: 'payments', column: 'application_id', name: 'idx_payments_appid' });

// Check index on operator_tasks(application_id)
const taskAppIdx = indexes.find(i => i.tbl_name === 'operator_tasks' && i.name.includes('application'));
if (!taskAppIdx) missingIndexes.push({ table: 'operator_tasks', column: 'application_id', name: 'idx_tasks_appid' });

console.log('\nMissing Performance Indexes:', missingIndexes);

for (const mi of missingIndexes) {
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS ${mi.name} ON ${mi.table}(${mi.column})`);
    console.log(`✅ Created index ${mi.name} ON ${mi.table}(${mi.column})`);
  } catch (err) {
    console.error(`Failed to create index ${mi.name}:`, err.message);
  }
}

// PRAGMA optimize & WAL mode
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA busy_timeout = 10000');
db.exec('PRAGMA optimize');

console.log('\nDatabase optimization complete. WAL mode and high-speed indexes active.');
