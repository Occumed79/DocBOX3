import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';

const baseUrl = (process.env.PRICE_INTELLIGENCE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const allowed = new Set(['cash', 'self_pay', 'discounted_cash', 'uninsured', 'direct_pay', 'marketplace_cash']);
const scenarios = [
  { code: '71046', area: 'chest-xray' },
  { code: '93015', area: 'stress-test' },
  { code: 'D0330', area: 'dental-pano' },
  { code: '85025', area: 'cbc' },
];

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
let evidenceScenarios = 0;
for (const scenario of scenarios) {
  const url = `${baseUrl}/api/pricing/search?code=${encodeURIComponent(scenario.code)}`;
  try {
    const payload = await fetchJson(url);
    assert.equal(payload?.procedure?.code?.toUpperCase(), scenario.code.toUpperCase());
    assert.equal(payload?.location, null, 'public smoke uses national/no-location mode');
    assert.equal(payload?.combined?.median, payload?.benchmark?.median, 'headline median must remain provenance-balanced');
    assert.ok(Array.isArray(payload?.sources));

    let observations = 0;
    const status = {};
    for (const source of payload.sources) {
      status[source.sourceId] = source.status;
      for (const row of source.observations || []) {
        observations += 1;
        assert.ok(allowed.has(row.paymentBasis), `${source.sourceId} leaked ${row.paymentBasis}`);
        assert.ok(Number.isFinite(row.price) && row.price > 0, `${source.sourceId} returned invalid price`);
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
    console.log(`✓ ${scenario.area.padEnd(12)} ${scenario.code} obs=${observations} families=${payload?.benchmark?.provenanceFamilyCount ?? 0} median=${payload?.combined?.median ?? '—'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ ...scenario, ok: false, error: message });
    console.error(`✗ ${scenario.area} ${scenario.code}: ${message}`);
  }
}

const passed = results.filter((row) => row.ok).length;
const report = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  passed,
  failed: scenarios.length - passed,
  evidenceScenarios,
  scenarios: results,
};
fs.writeFileSync('public-source-smoke.json', JSON.stringify(report, null, 2));

assert.equal(passed, scenarios.length, `${scenarios.length - passed} public-source smoke scenarios failed`);
assert.ok(evidenceScenarios > 0, 'No public-source scenario returned qualifying self-pay evidence');
console.log(`Public source smoke passed ${passed}/${scenarios.length}; ${evidenceScenarios} scenario(s) returned qualifying evidence.`);
