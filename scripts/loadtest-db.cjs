/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
//  Supabase READ-concurrency load test (read-only — does NOT write or pollute).
//  Simulates N concurrent users each doing the dashboard read mix, at several
//  concurrency levels, and reports latency percentiles + error rate.
//
//  Run:  node scripts/loadtest-db.cjs
// ─────────────────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.REACT_APP_SUPABASE_URL || 'https://eginihtpqahpejnkqznn.supabase.co';
const KEY = process.env.REACT_APP_SUPABASE_KEY || 'sb_publishable_dxvkjrqH1c0SULImna9L2A_qe9AkGTL';

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

// One "user action" = the read mix the dashboard/projects page performs.
async function readMix() {
  const t0 = performance.now();
  const [a, b, c, d] = await Promise.all([
    supabase.from('projects').select('*'),
    supabase.from('products').select('*').limit(2000),
    supabase.from('settings').select('*'),
    supabase.from('container_pricing').select('*'),
  ]);
  const err = a.error || b.error || c.error || d.error;
  return { ms: performance.now() - t0, ok: !err, err: err?.message };
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

async function runLevel(concurrency, rounds) {
  const lat = [];
  let errors = 0;
  let sampleErr = '';
  const t0 = performance.now();
  for (let r = 0; r < rounds; r++) {
    const batch = await Promise.all(Array.from({ length: concurrency }, () => readMix()));
    for (const res of batch) {
      if (res.ok) lat.push(res.ms);
      else { errors++; sampleErr = sampleErr || res.err; }
    }
  }
  const wall = performance.now() - t0;
  lat.sort((x, y) => x - y);
  const total = concurrency * rounds;
  return {
    concurrency, total, errors,
    p50: pct(lat, 50), p95: pct(lat, 95), max: lat[lat.length - 1] || 0,
    throughput: (total / (wall / 1000)),
    sampleErr,
  };
}

(async () => {
  console.log(`\nSupabase read-concurrency load test → ${URL}`);
  console.log('(read-only: projects + products + settings + container_pricing)\n');
  // First, how big is the dataset we're reading?
  const probe = await supabase.from('products').select('id', { count: 'exact', head: true });
  const projProbe = await supabase.from('projects').select('id', { count: 'exact', head: true });
  console.log(`dataset: ${projProbe.count ?? '?'} projects, ${probe.count ?? '?'} products\n`);

  console.log('concurrency | requests | errors |  p50 ms |  p95 ms |  max ms | req/sec');
  for (const c of [1, 5, 10, 25, 50, 100]) {
    const rounds = c >= 50 ? 3 : 5;
    const res = await runLevel(c, rounds);
    console.log(
      `${String(res.concurrency).padStart(11)} | ${String(res.total).padStart(8)} | ${String(res.errors).padStart(6)} | ` +
      `${res.p50.toFixed(0).padStart(7)} | ${res.p95.toFixed(0).padStart(7)} | ${res.max.toFixed(0).padStart(7)} | ${res.throughput.toFixed(1).padStart(7)}`
    );
    if (res.errors) console.log(`            ↳ sample error: ${res.sampleErr}`);
  }
  console.log('\nDone.');
  process.exit(0);
})().catch(e => { console.error('Load test failed:', e); process.exit(1); });
