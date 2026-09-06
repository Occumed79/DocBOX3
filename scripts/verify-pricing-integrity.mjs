import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const registry = read('lib/pricing/source-registry.ts');
const route = read('app/api/pricing/search/route.ts');
const turquoise = read('lib/pricing/adapters/turquoise.ts');
const schema = read('db/schema.sql');
const render = read('render.yaml');
const ui = read('components/pricing/PriceIntelligenceApp.tsx');
const mapEnrichment = read('lib/pricing/map-enrichment.ts');

const allowed = ['cash', 'self_pay', 'discounted_cash', 'uninsured', 'direct_pay', 'marketplace_cash'];
const forbidden = [
  'medicare', 'medicaid', 'commercial_negotiated', 'insurance_allowed',
  'insurance_claim', 'claims_average', 'chargemaster', 'gross_charge', 'unknown',
];

for (const basis of allowed) {
  assert.match(registry, new RegExp(`['\"]${basis}['\"]`), `registry must include ${basis}`);
  assert.match(schema, new RegExp(`['\"]${basis}['\"]`), `database CHECK must include ${basis}`);
}

const checkBody = schema.match(/payment_basis\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(payment_basis\s+IN\s*\(([\s\S]*?)\)\)/i)?.[1] || '';
assert.ok(checkBody, 'pi_price_observations payment-basis CHECK constraint must exist');
for (const basis of forbidden) {
  assert.doesNotMatch(checkBody, new RegExp(`['\"]${basis}['\"]`, 'i'), `database must reject ${basis}`);
}

assert.match(turquoise, /pricing:\s*\{\s*type:\s*['\"]cash['\"]\s*\}/, 'Turquoise requests cash pricing only');
assert.match(turquoise, /item\.pricing\?\.type\s*!==\s*['\"]cash['\"]/, 'Turquoise rechecks response type');
assert.match(turquoise, /item\.pricing\?\.payer\s*\|\|\s*item\.pricing\?\.network/, 'Turquoise rejects payer/network rows');

assert.match(route, /familyBalancedMedian\(/, 'headline benchmark must be provenance-family balanced');
assert.match(route, /provenanceFamilyCount/, 'API must expose provenance-family count');
assert.match(route, /dedupeObservations\(/, 'pooled observations must be deduplicated');
assert.match(route, /National map search bypasses external AI ranking/, 'national map must bypass external AI');
assert.match(route, /Presentation-only geocoding is deliberately after benchmark calculation/, 'map geocoding must happen after benchmark calculation');
assert.match(mapEnrichment, /never changes a price, payment basis, source median, provenance family, or\s*\n?\s*local headline eligibility/i, 'map enrichment must remain presentation-only');

assert.match(ui, /PROVENANCE-BALANCED MEDIAN/, 'UI must describe the current benchmark correctly');
assert.doesNotMatch(ui, /SOURCE-BALANCED MEDIAN/, 'stale source-balanced label must not return');
assert.match(ui, /Independent evidence families/i, 'leadership report must expose provenance families');
assert.match(ui, /Evidence #/, 'UI must surface evidence ranking');
assert.doesNotMatch(ui, /PRICING_SOURCES\.slice\(0,\s*8\)/, 'lookup must not hide sources after the first eight');

assert.doesNotMatch(render, /CLEARHEALTHCOSTS_API_/i, 'ClearHealthCosts inactive credential placeholders must stay removed');
assert.doesNotMatch(render, /FAIR_HEALTH_CASH_FEED_/i, 'FAIR Health inactive credential placeholders must stay removed');
assert.match(render, /TURQUOISE_ORGANIZATION_ID/, 'Turquoise org id slot must remain');
assert.match(render, /TURQUOISE_CLIENT_ID/, 'Turquoise client id slot must remain');
assert.match(render, /TURQUOISE_CLIENT_SECRET/, 'Turquoise client secret slot must remain');

const adapterDir = path.join(root, 'lib/pricing/adapters');
const adapterNames = fs.readdirSync(adapterDir).map((name) => name.toLowerCase());
assert.ok(!adapterNames.some((name) => name.includes('opendoc')), 'OpenDoc adapter must remain physically absent');

const requiredFamilies = [
  'hospital_mrf_cash', 'provider_verified_quote', 'provider_published_cash',
  'direct_pay_marketplace', 'imaging_clinic_cash', 'dental_observed_cash', 'lab_direct_purchase',
];
for (const family of requiredFamilies) assert.match(registry, new RegExp(family), `missing provenance family ${family}`);

console.log(`Pricing integrity checks passed: ${allowed.length} eligible payment bases; ${requiredFamilies.length} independent provenance families protected.`);
