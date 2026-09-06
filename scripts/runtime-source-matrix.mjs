import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';

const baseUrl = (process.env.PRICE_INTELLIGENCE_BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) {
  console.error('PRICE_INTELLIGENCE_BASE_URL is required, for example https://your-service.onrender.com');
  process.exit(2);
}

const allowed = new Set(['cash', 'self_pay', 'discounted_cash', 'uninsured', 'direct_pay', 'marketplace_cash']);
const matrix = [
  { code: '71046', location: 'Fresno, CA', radius: 50, area: 'chest-xray' },
  { code: '93015', location: 'Dallas, TX', radius: 75, area: 'stress-test' },
  { code: '93000', location: 'Atlanta, GA', radius: 50, area: 'ekg' },
  { code: '94010', location: 'Minneapolis, MN', radius: 50, area: 'spirometry' },
  { code: '92557', location: 'New York, NY', radius: 50, area: 'audiometry' },
  { code: 'D0330', location: 'Austin, TX', radius: 50, area: 'dental-pano' },
  { code: 'D0150', location: 'Phoenix, AZ', radius: 50, area: 'dental-exam' },
  { code: '85025', location: 'Chicago, IL', radius: 50, area: 'cbc' },
  { code: '80053', location: 'Houston, TX', radius: 50, area: 'cmp' },
  { code: '70551', location: 'Sacramento, CA', radius: 75, area: 'mri' },
];

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 500) }; }
    if (!response.ok) throw new Error(`${response.status}: ${payload?.error || text.slice(0, 180)}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

const results = [];
for (const test of matrix) {
  const params = new URLSearchParams({ code: test.code, location: test.location, radius: String(test.radius) });
  const url = `${baseUrl}/api/pricing/search?${params.toString()}`;
  try {
    const payload = await fetchJson(url);
    assert.equal(payload?.procedure?.code?.toUpperCase(), test.code.toUpperCase(), 'procedure code mismatch');
    assert.equal(payload?.combined?.median, payload?.benchmark?.median, 'combined median must equal provenance-balanced benchmark median');
    assert.ok(Array.isArray(payload?.sources), 'sources must be an array');

    let observationCount = 0;
    let liveSourceCount = 0;
    for (const source of payload.sources) {
      if (source.status === 'ok') liveSourceCount += 1;
      for (const row of source.observations || []) {
        observationCount += 1;
        assert.ok(allowed.has(row.paymentBasis), `${source.sourceId} leaked disallowed payment basis ${row.paymentBasis}`);
        assert.ok(Number.isFinite(row.price) && row.price > 0, `${source.sourceId} returned invalid price`);
      }
    }

    const record = {
      ...test,
      ok: true,
      median: payload?.combined?.median ?? null,
      observations: observationCount,
      liveSources: liveSourceCount,
      provenanceFamilies: payload?.benchmark?.provenanceFamilyCount ?? 0,
      mappable: payload?.map?.mappableObservationCount ?? 0,
      ranking: payload?.ranking?.provider ?? null,
      sourceStatuses: Object.fromEntries(payload.sources.map((source) => [source.sourceId, source.status])),
    };
    results.push(record);
    console.log(`✓ ${test.area.padEnd(14)} ${test.code.padEnd(6)} ${test.location.padEnd(18)} median=${record.median ?? '—'} obs=${record.observations} families=${record.provenanceFamilies}`);
  } catch (error) {
    results.push({ ...test, ok: false, error: error instanceof Error ? error.message : String(error) });
    console.error(`✗ ${test.area} ${test.code} ${test.location}: ${error instanceof Error ? error.message : error}`);
  }
}

const passed = results.filter((row) => row.ok).length;
const withEvidence = results.filter((row) => row.ok && row.observations > 0).length;
const report = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  passed,
  failed: results.length - passed,
  scenariosWithEvidence: withEvidence,
  scenarios: results,
};
fs.writeFileSync('runtime-source-matrix.json', JSON.stringify(report, null, 2));

assert.ok(passed === matrix.length, `${matrix.length - passed} runtime scenarios failed`);
assert.ok(withEvidence > 0, 'runtime matrix returned no self-pay evidence at all');
console.log(`Runtime matrix passed ${passed}/${matrix.length}; ${withEvidence} scenario(s) returned qualifying self-pay evidence.`);
