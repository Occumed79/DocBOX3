import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';

const baseUrl = (process.env.PRICE_INTELLIGENCE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const allowed = new Set(['cash', 'self_pay', 'discounted_cash', 'uninsured', 'direct_pay', 'marketplace_cash']);

// This matrix intentionally spans hospital/facility, local-provider, imaging,
// laboratory, dental and cardiology use cases. A source that is advertised as
// live must prove that it can return usable evidence somewhere in its domain.
const scenarios = [
  { code: '71046', area: 'chest-xray-national' },
  { code: '71046', area: 'chest-xray-austin', location: 'Austin, TX', radius: 50 },
  { code: '93015', area: 'stress-test-austin', location: 'Austin, TX', radius: 75 },
  { code: '93306', area: 'echo-austin', location: 'Austin, TX', radius: 75 },
  { code: 'D0330', area: 'dental-pano-austin', location: 'Austin, TX', radius: 75 },
  { code: '85025', area: 'cbc-national' },
  { code: '80053', area: 'cmp-national' },
  { code: '77067', area: 'mammogram-national' },
];

// These are the sources the runtime currently presents as executable sources.
// If one of them cannot produce a single usable observation across the matrix,
// it is not allowed to masquerade as healthy.
const expectedExecutableSources = new Set([
  'medrates',
  'medcompare',
  'fairvisit-health',
  'loa',
  'price-transparency',
  'hospital-ledger',
  'marketcare',
  'testwell',
  'labtestinsight',
  'real-dental-costs',
  'expected-health',
  'radiology-assist',
]);

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error(`Non-JSON response: ${text.slice(0, 180)}`); }
    if (!response.ok) throw new Error(`${response.status}: ${payload?.error || text.slice(0, 180)}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

const results = [];
const sourceHealth = new Map();
let evidenceScenarios = 0;

function healthFor(sourceId, sourceName) {
  if (!sourceHealth.has(sourceId)) {
    sourceHealth.set(sourceId, {
      sourceId,
      sourceName,
      attempts: 0,
      ok: 0,
      empty: 0,
      error: 0,
      unconfigured: 0,
      observations: 0,
      productiveScenarios: [],
      errors: [],
    });
  }
  return sourceHealth.get(sourceId);
}

for (const scenario of scenarios) {
  const params = new URLSearchParams({ code: scenario.code });
  if (scenario.location) params.set('location', scenario.location);
  if (scenario.radius) params.set('radius', String(scenario.radius));
  const url = `${baseUrl}/api/pricing/search?${params.toString()}`;

  try {
    const payload = await fetchJson(url);
    assert.equal(payload?.procedure?.code?.toUpperCase(), scenario.code.toUpperCase());
    if (scenario.location) assert.ok(payload?.resolvedLocation, `${scenario.area} failed to resolve ${scenario.location}`);
    else assert.equal(payload?.location, null, `${scenario.area} should run in national mode`);
    assert.equal(payload?.combined?.median, payload?.benchmark?.median, 'headline median must remain provenance-balanced');
    assert.ok(Array.isArray(payload?.sources));

    let observations = 0;
    const status = {};
    for (const source of payload.sources) {
      status[source.sourceId] = source.status;
      const health = healthFor(source.sourceId, source.sourceName);
      health.attempts += 1;
      health[source.status] = (health[source.status] || 0) + 1;
      if (source.status === 'error') {
        health.errors.push({ scenario: scenario.area, message: source.error || 'unknown source error' });
      }

      let sourceObservations = 0;
      for (const row of source.observations || []) {
        observations += 1;
        sourceObservations += 1;
        assert.ok(allowed.has(row.paymentBasis), `${source.sourceId} leaked ${row.paymentBasis}`);
        assert.ok(Number.isFinite(row.price) && row.price > 0, `${source.sourceId} returned invalid price`);
      }
      health.observations += sourceObservations;
      if (sourceObservations > 0 || source?.summary?.median !== null) {
        if (!health.productiveScenarios.includes(scenario.area)) health.productiveScenarios.push(scenario.area);
      }
    }

    if (observations > 0) evidenceScenarios += 1;
    results.push({
      ...scenario,
      ok: true,
      observations,
      median: payload?.combined?.median ?? null,
      provenanceFamilies: payload?.benchmark?.provenanceFamilyCount ?? 0,
      mappable: payload?.map?.mappableObservationCount ?? 0,
      sourceStatuses: status,
    });
    console.log(`✓ ${scenario.area.padEnd(22)} ${scenario.code} obs=${observations} families=${payload?.benchmark?.provenanceFamilyCount ?? 0} median=${payload?.combined?.median ?? '—'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ ...scenario, ok: false, error: message });
    console.error(`✗ ${scenario.area} ${scenario.code}: ${message}`);
  }
}

const sourceHealthRows = [...sourceHealth.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
const brokenSources = sourceHealthRows.filter((row) => row.error > 0);
const unproductiveSources = [...expectedExecutableSources]
  .filter((sourceId) => (sourceHealth.get(sourceId)?.observations || 0) === 0)
  .map((sourceId) => sourceHealth.get(sourceId) || { sourceId, sourceName: sourceId, observations: 0, attempts: 0, error: 0, empty: 0 });
const productiveSources = sourceHealthRows.filter((row) => row.observations > 0);
const passed = results.filter((row) => row.ok).length;

const report = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  passed,
  failed: scenarios.length - passed,
  evidenceScenarios,
  productiveSourceCount: productiveSources.length,
  expectedExecutableSourceCount: expectedExecutableSources.size,
  brokenSourceCount: brokenSources.length,
  unproductiveSourceCount: unproductiveSources.length,
  scenarios: results,
  sourceHealth: sourceHealthRows,
  brokenSources,
  unproductiveSources,
};
fs.writeFileSync('public-source-smoke.json', JSON.stringify(report, null, 2));

console.log('\nSource health matrix');
for (const row of sourceHealthRows) {
  console.log(`${row.sourceId.padEnd(22)} obs=${String(row.observations).padStart(5)} ok=${row.ok} empty=${row.empty} error=${row.error} productive=${row.productiveScenarios.length}`);
}

assert.equal(passed, scenarios.length, `${scenarios.length - passed} source-health scenarios failed at the request level`);
assert.ok(evidenceScenarios > 0, 'No source-health scenario returned qualifying self-pay evidence');
assert.equal(brokenSources.length, 0, `Source errors detected: ${brokenSources.map((row) => row.sourceId).join(', ')}`);
assert.equal(unproductiveSources.length, 0, `Executable sources produced no usable evidence across the matrix: ${unproductiveSources.map((row) => row.sourceId).join(', ')}`);

console.log(`Source health passed: ${productiveSources.length}/${expectedExecutableSources.size} executable sources produced evidence with zero source errors.`);