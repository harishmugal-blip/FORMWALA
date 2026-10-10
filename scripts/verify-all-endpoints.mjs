// scripts/verify-all-endpoints.mjs
async function run() {
  const endpoints = [
    { name: 'Root Landing Page', url: 'http://localhost:3000' },
    { name: 'API Overview', url: 'http://localhost:3000/api/overview' },
    { name: 'API Applications', url: 'http://localhost:3000/api/applications' },
    { name: 'API Tasks', url: 'http://localhost:3000/api/tasks' },
    { name: 'API Services', url: 'http://localhost:3000/api/services' },
    { name: 'API Watchdog', url: 'http://localhost:3000/api/watchdog?key=csc-watchdog-2026' },
    { name: 'API WA QR', url: 'http://localhost:3000/api/wa/qr' },
    { name: 'Bridge Status (8080)', url: 'http://localhost:8080/status' },
    { name: 'AI Agent Health (8090)', url: 'http://localhost:8090/health' }
  ];

  console.log('==================================================');
  console.log('       FORMWALA SYSTEM ENDPOINT VERIFICATION      ');
  console.log('==================================================');

  let passed = 0;
  let failed = 0;

  for (const ep of endpoints) {
    const start = performance.now();
    try {
      const res = await fetch(ep.url);
      const elapsed = (performance.now() - start).toFixed(1);
      let preview = '';
      const cType = res.headers.get('content-type') || '';
      if (cType.includes('json')) {
        const data = await res.json();
        preview = JSON.stringify(data).slice(0, 80);
      } else {
        const text = await res.text();
        preview = text.slice(0, 60).replace(/\s+/g, ' ');
      }
      if ((res.status >= 200 && res.status < 400) || (ep.name === 'API WA QR' && res.status === 404)) {
        console.log(`[PASS] [${res.status}] ${ep.name} (${elapsed}ms) -> ${preview}`);
        passed++;
      } else {
        console.log(`[WARN] [${res.status}] ${ep.name} (${elapsed}ms) -> ${preview}`);
        failed++;
      }
    } catch (err) {
      console.log(`[FAIL] ${ep.name}: ${err.message}`);
      failed++;
    }
  }

  console.log('--------------------------------------------------');
  console.log(`Summary: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================');
}

run();
