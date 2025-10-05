/*
  Smoke test script for Bloocube backend
  Usage:
    node scripts/smoke_test.js [baseUrl]
  Env (optional for auth tests):
    TEST_EMAIL, TEST_PASSWORD
*/

const DEFAULT_BASE = process.argv[2] || process.env.BASE_URL || 'https://api-backend.bloocube.com';

// Provided test credentials
const CREDS = {
  admin: { email: 'theadmin@gmail.com', password: '123456' },
  brand: { email: 'blooc@gmail.com', password: '123456' },
  creator: { email: 'bloocubetech@gmail.com', password: 'Cubebloo@2025' }
};

async function request(method, path, body, token) {
  const url = `${DEFAULT_BASE}${path}`;
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  };
  if (body) init.body = JSON.stringify(body);
  const start = Date.now();
  const res = await fetch(url, init);
  const elapsed = Date.now() - start;
  let json = null;
  try { json = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data: json, ms: elapsed, url };
}

async function run() {
  const results = [];
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  let token = null;

  // Health checks (try multiple common paths)
  const healthPaths = ['/api/health', '/health', '/'];
  for (const p of healthPaths) {
    const r = await request('GET', p);
    results.push({ name: `GET ${p}`, ...r });
    if (r.ok) break; // stop after first success
  }

  // Helper to login and run an endpoint list with a name prefix
  async function runRoleSuite(label, credentials, endpoints) {
    const out = [];
    const login = await request('POST', '/api/auth/login', credentials);
    out.push({ name: `${label} login`, ...login });
    let tkn = null;
    if (login.ok && login.data?.data?.tokens?.accessToken) {
      tkn = login.data.data.tokens.accessToken;
    }
    for (const ep of endpoints) {
      if (!tkn && ep.auth) {
        out.push({ name: `${label} ${ep.name} (skipped)`, ok: false, status: 0, data: { message: 'No auth token' }, ms: 0 });
        continue;
      }
      const r = await request(ep.method || 'GET', ep.path, ep.body, tkn);
      out.push({ name: `${label} ${ep.name}`, ...r });
    }
    return out;
  }

  // Define endpoint suites based on README overview (GET only to avoid mutations)
  const adminEndpoints = [
    { name: 'GET /api/admin/dashboard', path: '/api/admin/dashboard', auth: true },
    { name: 'GET /api/admin/users', path: '/api/admin/users', auth: true },
    { name: 'GET /api/admin/campaigns', path: '/api/admin/campaigns', auth: true },
    { name: 'GET /api/admin/logs', path: '/api/admin/logs', auth: true }
  ];
  const commonEndpoints = [
    { name: 'GET /api/campaigns', path: '/api/campaigns', auth: true },
    { name: 'GET /api/analytics/top', path: '/api/analytics/top', auth: true },
    { name: 'GET /api/analytics/platform/:platform', path: '/api/analytics/platform/twitter', auth: true }
  ];
  const creatorEndpoints = [
    { name: 'GET /api/bids', path: '/api/bids', auth: true },
    { name: 'GET /api/competitor/history', path: '/api/competitor/history', auth: true }
  ];
  const brandEndpoints = [
    { name: 'GET /api/campaigns', path: '/api/campaigns', auth: true }
  ];

  // Health endpoints (API mounted health routes)
  {
    const h = await request('GET', '/api/health');
    results.push({ name: 'GET /api/health', ...h });
  }
  {
    const hr = await request('GET', '/api/health/redis');
    results.push({ name: 'GET /api/health/redis', ...hr });
  }
  {
    const hm = await request('GET', '/api/health/mongo');
    results.push({ name: 'GET /api/health/mongo', ...hm });
  }

  // Social/public diagnostics
  results.push({ name: 'GET /api/twitter/callback-test', ...(await request('GET', '/api/twitter/callback-test')) });
  results.push({ name: 'GET /api/youtube/callback-test', ...(await request('GET', '/api/youtube/callback-test')) });
  results.push({ name: 'GET /api/linkedin/ping', ...(await request('GET', '/api/linkedin/ping')) });

  // Run suites
  results.push(...(await runRoleSuite('ADMIN', CREDS.admin, [...adminEndpoints, ...commonEndpoints])));
  results.push(...(await runRoleSuite('BRAND', CREDS.brand, [...brandEndpoints, ...commonEndpoints])));
  results.push(...(await runRoleSuite('CREATOR', CREDS.creator, [...creatorEndpoints, ...commonEndpoints])));

  // Print summary
  const lines = results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}  [${r.status}] ${r.ms}ms  ${r.url || ''}  ${r.data?.message || ''}`);
  console.log(lines.join('\n'));

  // Non-zero exit on any hard failures (status >=500) or health failing
  const failed = results.some(r => r && (r.status >= 500 || ((r.name || '').startsWith('GET /api/health') && !r.ok)));
  process.exit(failed ? 1 : 0);
}

run().catch(err => {
  console.error('Smoke test error:', err);
  process.exit(2);
});


