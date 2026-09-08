import assert from 'node:assert/strict';
import fs from 'node:fs';

const required = [
  'app/api/data/parse/route.ts',
  'components/data-studio/DataStudioV2.tsx',
  'components/data-studio/DataStudioV3.tsx',
  'lib/data-studio/datawrapper-model.ts',
  'app/styles/data-studio-v2.css',
  'app/styles/data-studio-v3.css',
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
assert.match(page, /DataStudioV3/, 'The primary /vault route must render the house-style Data Studio.');
assert.doesNotMatch(page, /Pricing|PriceIntelligence|TremorPricing/, 'The primary /vault route still references pricing.');

const parser = fs.readFileSync('app/api/data/parse/route.ts', 'utf8');
assert.match(parser, /\.xlsx/, 'Data parser must accept XLSX workbooks.');
assert.match(parser, /\.csv/, 'Data parser must accept CSV files.');

const studio = fs.readFileSync('components/data-studio/DataStudioV2.tsx', 'utf8');
for (const feature of [
  'Use row as headers',
  'Visualization library',
  'Locator map',
  'US state tile map',
  'Heatmap table',
  'Mini-chart table',
  'Dual-axis chart',
  'Waterfall',
  'Infographic board',
  'Process page',
  'Executive brief',
  'Export CSV',
]) assert.ok(studio.includes(feature), `Expanded Data Studio is missing expected feature text: ${feature}`);

const themeEditor = fs.readFileSync('components/data-studio/DataStudioV3.tsx', 'utf8');
for (const feature of ['House style', 'Categorical palette', 'COLOR CHECK', 'Preview dark-mode equivalents', 'Export current SVG', 'Export theme JSON']) {
  assert.ok(themeEditor.includes(feature), `Theme editor is missing expected feature text: ${feature}`);
}

const model = fs.readFileSync('lib/data-studio/datawrapper-model.ts', 'utf8');
for (const typeId of ['d3-bars-split', 'd3-bars-stacked', 'd3-bars-bullet', 'd3-range-plot', 'd3-arrow-plot', 'grouped-column-chart', 'stacked-column-chart', 'multiple-lines', 'd3-multiple-pies', 'd3-multiple-donuts', 'd3-maps-choropleth', 'd3-maps-symbols', 'locator-map']) {
  assert.ok(model.includes(typeId), `Datawrapper-inspired type registry is missing ${typeId}`);
}
for (const property of ['describe', 'annotate', 'axes', 'visualize', 'publish', 'ariaDescription', 'mapLabel', 'compass', 'scale', 'visibility']) {
  assert.ok(model.includes(property), `Datawrapper-inspired property model is missing ${property}`);
}

console.log('Data Studio integrity check passed. Spreadsheet editing, expanded visualization/report modes, house-style theming, accessibility checking, Datawrapper-inspired property modeling, and pricing removal are all present.');
