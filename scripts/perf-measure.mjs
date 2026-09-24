const API = 'http://localhost:3000';
const WARMUP = 20;
const RUNS = 200;

export function p95(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}

async function time(path) {
  const start = performance.now();
  const response = await fetch(API + path);
  await response.arrayBuffer();
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return performance.now() - start;
}

async function main() {
  const { items } = await (await fetch(`${API}/accounts`)).json();
  const today = new Date();
  const iso = (date) => date.toISOString().slice(0, 10);
  const asOf = iso(new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), 15)));
  const horizon = iso(new Date(Date.UTC(today.getUTCFullYear() + 1, today.getUTCMonth(), 1)));
  const yearStart = iso(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 364)),
  );
  const endpoints = [
    { name: 'account list', path: '/accounts', budget: 1000 },
    { name: 'transaction list', path: '/transactions', budget: 1000 },
    { name: 'balance as-of', path: `/accounts/${items[0].id}/balance?asOf=${asOf}`, budget: 1000 },
    {
      name: 'monthly report',
      path: `/reports/monthly?month=${iso(today).slice(0, 7)}`,
      budget: 2000,
    },
    { name: '12-month projection', path: `/projection?horizon=${horizon}`, budget: 2000 },
    {
      name: 'balance history 1Y',
      path: `/accounts/balance-history?from=${yearStart}`,
      budget: 2000,
    },
    { name: 'balance history All', path: '/accounts/balance-history', budget: 2000 },
  ];
  let failed = false;
  for (const endpoint of endpoints) {
    for (let run = 0; run < WARMUP; run += 1) await time(endpoint.path);
    const durations = [];
    for (let run = 0; run < RUNS; run += 1) durations.push(await time(endpoint.path));
    const result = p95(durations);
    const pass = result <= endpoint.budget;
    failed ||= !pass;
    console.log(
      `${pass ? 'PASS' : 'FAIL'}  ${endpoint.name.padEnd(20)} p95 ${result.toFixed(1).padStart(7)} ms  (budget ${endpoint.budget} ms, n=${RUNS})`,
    );
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1]?.endsWith('perf-measure.mjs')) {
  await main();
}
