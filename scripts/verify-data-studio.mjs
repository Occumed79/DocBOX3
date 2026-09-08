import assert from 'node:assert/strict';
import fs from 'node:fs';

const required = [
  'app/api/data/parse/route.ts',
  'components/data-studio/DataStudioPro.tsx',
  'components/data-studio/AdvancedVisualLab.tsx',
  'components/data-studio/StorytellingStudio.tsx',
  'components/data-studio/SpatialVisualLab.tsx',
  'lib/data-studio/datawrapper-model.ts',
  'app/styles/data-studio-pro.css',
  'app/styles/advanced-visual-lab.css',
  'app/styles/storytelling-studio.css',
  'app/styles/cyber-visual-lab.css',
  'app/styles/spatial-visual-lab.css',
  'app/vault/page.tsx',
  'app/vault/advanced/page.tsx',
  'app/vault/advanced/cyber/page.tsx',
  'app/vault/story/page.tsx',
  'app/vault/spatial/page.tsx',
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
assert.match(page, /DataStudioPro/, 'The primary /vault route must render Data Studio Pro.');
assert.match(page, /Advanced Visual Lab/, 'The primary workspace must link to the Advanced Visual Lab.');
assert.doesNotMatch(page, /Pricing|PriceIntelligence|TremorPricing/, 'The primary /vault route still references pricing.');

const parser = fs.readFileSync('app/api/data/parse/route.ts', 'utf8');
assert.match(parser, /\.xlsx/, 'Data parser must accept XLSX workbooks.');
assert.match(parser, /\.csv/, 'Data parser must accept CSV files.');

const studio = fs.readFileSync('components/data-studio/DataStudioPro.tsx', 'utf8');
for (const feature of [
  'Use row as headers',
  'Visualization editor',
  'House style',
  'Accessibility description',
  'Source name',
  'Source URL',
  'Highlight category',
  'Responsive visualization',
  'Locator map view',
  'Center lon',
  'Center lat',
  'Map style',
  'Compass',
  'Scale',
  'Search table',
  'Export SVG',
  'Print / Save PDF',
]) assert.ok(studio.includes(feature), `Data Studio Pro is missing expected feature text: ${feature}`);

for (const step of ['describe', 'axes', 'visualize', 'annotate', 'publish']) {
  assert.ok(studio.includes(`'${step}'`), `Data Studio Pro is missing editor step: ${step}`);
}

const model = fs.readFileSync('lib/data-studio/datawrapper-model.ts', 'utf8');
for (const typeId of ['d3-bars-split', 'd3-bars-stacked', 'd3-bars-bullet', 'd3-range-plot', 'd3-arrow-plot', 'grouped-column-chart', 'stacked-column-chart', 'multiple-lines', 'd3-multiple-pies', 'd3-multiple-donuts', 'd3-maps-choropleth', 'd3-maps-symbols', 'locator-map']) {
  assert.ok(model.includes(typeId), `Datawrapper-inspired type registry is missing ${typeId}`);
}
for (const property of ['describe', 'annotate', 'axes', 'visualize', 'publish', 'ariaDescription', 'mapLabel', 'compass', 'scale', 'visibility']) {
  assert.ok(model.includes(property), `Datawrapper-inspired property model is missing ${property}`);
}

const advanced = fs.readFileSync('components/data-studio/AdvancedVisualLab.tsx', 'utf8');
for (const feature of ['Histogram', 'Box plot', 'Bubble chart', 'Beeswarm', 'Funnel', 'Slope chart', 'Treemap', 'Force network', 'Sankey flow', 'Timeline', 'Globe']) {
  assert.ok(advanced.includes(feature), `Advanced Visual Lab is missing ${feature}`);
}

const story = fs.readFileSync('components/data-studio/StorytellingStudio.tsx', 'utf8');
for (const feature of ['Storytelling Studio', 'Chapter title', 'Chapter text', 'Latitude', 'Longitude']) {
  assert.ok(story.includes(feature), `Storytelling Studio is missing ${feature}`);
}

const spatial = fs.readFileSync('components/data-studio/SpatialVisualLab.tsx', 'utf8');
for (const feature of ['Spatial Lab', 'Hexagon aggregation', 'Grid aggregation', 'Heat surface', 'Density contours', 'Extruded columns', 'Arc / flow map', 'Animated trips', 'Origin lat', 'Destination lat', 'Export SVG']) {
  assert.ok(spatial.includes(feature), `Spatial Visual Lab is missing ${feature}`);
}

console.log('Data Studio integrity check passed. Publication editor, advanced visualization lab, deck.gl-inspired spatial layers, globe/network/statistical visuals, storytelling mode, house-style theming, accessibility metadata, report output, and pricing removal are all present.');
