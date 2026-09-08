import assert from 'node:assert/strict';
import fs from 'node:fs';

const required = [
  'app/api/data/parse/route.ts',
  'components/data-studio/DataStudio.tsx',
  'app/styles/data-studio.css',
  'app/vault/page.tsx',
];

const forbidden = [
  'app/api/pricing',
  'components/pricing',
  'lib/pricing',
  'app/vault/classic',
  'app/vault/lab',
  'README_PRICE_INTELLIGENCE.md',
  'scripts/public-source-smoke.mjs',
  'scripts/runtime-source-matrix.mjs',
  'scripts/verify-pricing-integrity.mjs',
  '.github/workflows/pricing-runtime.yml',
  '.github/workflows/public-source-smoke.yml',
  '.github/workflows/deployed-price-terrain-smoke.yml',
];

for (const path of required) assert.ok(fs.existsSync(path), `Required Data Studio file is missing: ${path}`);
for (const path of forbidden) assert.ok(!fs.existsSync(path), `Pricing artifact must be removed: ${path}`);

const page = fs.readFileSync('app/vault/page.tsx', 'utf8');
assert.match(page, /DataStudio/, 'The primary /vault route must render Data Studio.');
assert.doesNotMatch(page, /Pricing|PriceIntelligence|TremorPricing/, 'The primary /vault route still references pricing.');

const parser = fs.readFileSync('app/api/data/parse/route.ts', 'utf8');
assert.match(parser, /\.xlsx/, 'Data parser must accept XLSX workbooks.');
assert.match(parser, /\.csv/, 'Data parser must accept CSV files.');

const studio = fs.readFileSync('components/data-studio/DataStudio.tsx', 'utf8');
for (const feature of ['Use row as headers', 'Visualization builder', 'Report builder', 'Export cleaned CSV']) {
  assert.ok(studio.includes(feature), `Data Studio is missing expected feature text: ${feature}`);
}

console.log('Data Studio pivot integrity check passed. Pricing runtime artifacts are absent and spreadsheet visualization/report features are present.');
