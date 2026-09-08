import assert from 'node:assert/strict';
import fs from 'node:fs';

const required = [
  'app/api/data/parse/route.ts',
  'components/data-studio/StudioDashboard.tsx',
  'components/data-studio/DataStudioPro.tsx',
  'components/data-studio/AdvancedVisualLab.tsx',
  'components/data-studio/StorytellingStudio.tsx',
  'components/data-studio/SpatialVisualLab.tsx',
  'components/data-studio/GridPivotLab.tsx',
  'lib/data-studio/datawrapper-model.ts',
  'app/styles/studio-dashboard.css',
  'app/styles/data-studio-pro.css',
  'app/styles/advanced-visual-lab.css',
  'app/styles/storytelling-studio.css',
  'app/styles/cyber-visual-lab.css',
  'app/styles/spatial-visual-lab.css',
  'app/styles/grid-pivot-lab.css',
  'app/styles/unified-product.css',
  'app/vault/page.tsx',
  'app/vault/studio/page.tsx',
  'app/vault/advanced/page.tsx',
  'app/vault/advanced/cyber/page.tsx',
  'app/vault/story/page.tsx',
  'app/vault/spatial/page.tsx',
  'app/vault/grid/page.tsx',
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
  'components/data-studio/WijmoWorkbench.tsx',
  'app/styles/wijmo-workbench.css',
  'docs/WIJMO_INTEGRATION.md',
];

for (const path of required) assert.ok(fs.existsSync(path), `Required Data Studio file is missing: ${path}`);
for (const path of forbidden) assert.ok(!fs.existsSync(path), `Forbidden legacy/proprietary artifact must be removed: ${path}`);

const page = fs.readFileSync('app/vault/page.tsx', 'utf8');
assert.match(page, /StudioDashboard/, 'The primary /vault route must render the workspace dashboard, not a marketing hero.');
assert.doesNotMatch(page, /DataStudioPro/, 'The primary /vault route must not render the publication editor directly.');
assert.doesNotMatch(page, /Pricing|PriceIntelligence|TremorPricing/, 'The primary /vault route still references pricing.');

const studioPage = fs.readFileSync('app/vault/studio/page.tsx', 'utf8');
assert.match(studioPage, /DataStudioPro/, 'The dedicated /vault/studio route must render Data Studio Pro.');

const dashboard = fs.readFileSync('components/data-studio/StudioDashboard.tsx', 'utf8');
for (const feature of ['Choose a workspace', 'Visualization library', 'Report output', 'Grid & Pivot', 'Advanced Visuals', 'Spatial Lab', 'Story Studio']) {
  assert.ok(dashboard.includes(feature), `Workspace dashboard is missing expected feature text: ${feature}`);
}

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
for (const feature of ['SPATIAL LAB', 'Hexagon aggregation', 'Grid aggregation', 'Heat surface', 'Density contours', 'Extruded columns', 'Arc / flow map', 'Animated trips', 'Origin lat', 'Destination lat', 'Export SVG']) {
  assert.ok(spatial.includes(feature), `Spatial Visual Lab is missing ${feature}`);
}

const gridPivot = fs.readFileSync('components/data-studio/GridPivotLab.tsx', 'utf8');
for (const feature of ['Editable data grid', 'Column filters', 'Grouping', 'Pivot tables', 'Drill-down', 'Saved views', 'Analyze current filtered grid view', 'Export pivot CSV', 'Freeze']) {
  assert.ok(gridPivot.includes(feature), `Native Grid & Pivot Lab is missing ${feature}`);
}
assert.doesNotMatch(gridPivot, /wijmo|mescius|NEXT_PUBLIC_WIJMO|cdn\.mescius/i, 'Native Grid & Pivot Lab must not load or reference Wijmo/MESCIUS runtime code.');

const unified = fs.readFileSync('app/styles/unified-product.css', 'utf8');
for (const selector of ['.dp-app', '.gpl-shell', '.av-app', '.spatial-app', '.st-app']) {
  assert.ok(unified.includes(selector), `Unified product visual layer must style ${selector}`);
}

const dashboardCss = fs.readFileSync('app/styles/studio-dashboard.css', 'utf8');
for (const selector of ['.studio-home', '.studio-workspace-grid', '.studio-visual-grid', '.studio-report-list']) {
  assert.ok(dashboardCss.includes(selector), `Dashboard visual layer must style ${selector}`);
}

console.log('Data Studio integrity check passed. Workspace dashboard, publication editor, native Grid & Pivot Lab, advanced visualization lab, deck.gl-inspired spatial layers, storytelling mode, unified product styling, accessibility metadata, report output, and pricing removal are all present.');
