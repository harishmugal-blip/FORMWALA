import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, '..', 'src', 'app', 'api');

console.log('--- AUDITING ALL NEXT.JS API ROUTES ---\n');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(full));
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const files = getFiles(apiDir);
console.log(`Found ${files.length} API files to inspect.`);

let issues = [];

for (const f of files) {
  const rel = path.relative(path.join(__dirname, '..'), f);
  const content = fs.readFileSync(f, 'utf8');

  // Check 1: Hardcoded Linux paths
  if (content.includes('/home/z/') || content.includes('/.n8n/')) {
    issues.push({ file: rel, issue: 'Hardcoded Linux path (/home/z/ or /.n8n/)' });
  }

  // Check 2: Direct n8n webhook calls that might hang if n8n is offline
  if (content.includes('localhost:5678') || content.includes('127.0.0.1:5678')) {
    issues.push({ file: rel, issue: 'Direct call to dead n8n port :5678 without fallback' });
  }

  // Check 3: Check better-sqlite3 without fallback
  if (content.includes('better-sqlite3') && !content.includes('csc-db')) {
    issues.push({ file: rel, issue: 'Direct better-sqlite3 import instead of csc-db helper' });
  }
}

console.log(`\nScan finished. Total issues found: ${issues.length}`);
for (const i of issues) {
  console.log(`⚠️  ${i.file} -> ${i.issue}`);
}
