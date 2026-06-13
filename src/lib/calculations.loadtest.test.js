/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
//  Calculation-engine stress test (pure CPU, no DB, no network).
//  Answers: "how many products / projects can the engine compute, how fast?"
//  Run:  CI=true npx jest calculations.loadtest --silent=false
// ─────────────────────────────────────────────────────────────────────────────
import { performance } from 'perf_hooks';
import { calcProducts, calcTotals } from './calculations';

const SETTINGS = {
  usd_rate: 3.7, customs: 12, vat: 18, agent_fee: 3500, insurance: 0.5,
  margin: 25, margin_type: 'markup', port_fees: 2000, local_transport: 1500,
  incoterms: 'FOB', shipping_method: 'sea', sea_type: 'fcl', actual_freight_usd: 4000,
};
const CTX = { containerTypes: [], pricing: [], projectId: 'bench' };

function makeProducts(n) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) {
    arr[i] = {
      id: 'p' + i, name: 'Product ' + i, item_no: 'SKU' + i,
      qty: 50, fob_price: 10 + (i % 90), cbm: 0.05 + (i % 10) * 0.01,
      gross_weight_kg: 2, box_l: 40, box_w: 30, box_h: 20,
      hs_code: '73219090', customs_rate_override: null, purchase_tax_rate_override: null,
    };
  }
  return arr;
}

function bench(fn, runs) {
  // warm-up
  fn();
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - t0) / runs;
}

test('calc engine — single project of increasing size', () => {
  console.log('\n=== CALC ENGINE — single project ===');
  console.log('products |  ms/calc | products/sec');
  for (const n of [10, 50, 100, 500, 1000, 5000]) {
    const products = makeProducts(n);
    const runs = n > 1000 ? 20 : 200;
    const ms = bench(() => { calcTotals(calcProducts(products, SETTINGS, CTX)); }, runs);
    const perSec = Math.round(n / (ms / 1000)).toLocaleString();
    console.log(`${String(n).padStart(8)} | ${ms.toFixed(3).padStart(8)} | ${perSec.padStart(12)}`);
  }
  expect(true).toBe(true);
});

test('dashboard — many projects computed in one render pass', () => {
  console.log('\n=== DASHBOARD — N projects × 50 products (projects-page stats) ===');
  console.log('projects | total products |  total ms | ms/project');
  for (const P of [10, 50, 100, 200, 500]) {
    const perProject = 50;
    const projects = Array.from({ length: P }, () => makeProducts(perProject));
    const runs = P > 200 ? 5 : 20;
    const ms = bench(() => {
      for (const prods of projects) calcTotals(calcProducts(prods, SETTINGS, CTX));
    }, runs);
    console.log(`${String(P).padStart(8)} | ${String(P * perProject).padStart(14)} | ${ms.toFixed(1).padStart(9)} | ${(ms / P).toFixed(3).padStart(10)}`);
  }
  expect(true).toBe(true);
}, 60000);
