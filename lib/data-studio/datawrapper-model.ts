export type DwEditorStep = 'describe' | 'axes' | 'visualize' | 'annotate' | 'publish';

export type DwVisualType =
  | 'd3-bars'
  | 'd3-bars-split'
  | 'd3-bars-stacked'
  | 'd3-bars-bullet'
  | 'd3-dot-plot'
  | 'd3-range-plot'
  | 'd3-arrow-plot'
  | 'column-chart'
  | 'grouped-column-chart'
  | 'stacked-column-chart'
  | 'd3-area'
  | 'd3-lines'
  | 'multiple-lines'
  | 'd3-pies'
  | 'd3-donuts'
  | 'd3-multiple-pies'
  | 'd3-multiple-donuts'
  | 'd3-scatter-plot'
  | 'tables'
  | 'd3-maps-choropleth'
  | 'd3-maps-symbols'
  | 'locator-map';

export type StudioTheme = {
  id: string;
  name: string;
  fontFamily: 'system' | 'humanist' | 'serif' | 'mono';
  background: string;
  text: string;
  mutedText: string;
  gridline: string;
  categorical: string[];
  gradient: [string, string];
  darkBackground: string;
  darkText: string;
  darkGridline: string;
  lockPalette: boolean;
};

export type DwDescribe = {
  intro: string;
  byline: string;
  sourceName: string;
  sourceUrl: string;
  ariaDescription: string;
  numberPrepend: string;
  numberAppend: string;
};

export type DwAnnotate = {
  notes: string;
  highlightCategory: string;
};

export type DwLocatorSettings = {
  center: [number, number];
  zoom: number;
  height: number;
  bearing: number;
  pitch: number;
  style: 'dw-light' | 'dw-earth' | 'dw-white' | 'dw-white-invert';
  mapLabel: boolean;
  scale: boolean;
  compass: boolean;
  visibility: {
    boundaryCountry: boolean;
    boundaryState: boolean;
    building: boolean;
    green: boolean;
    mountains: boolean;
    roads: boolean;
    urban: boolean;
    water: boolean;
    building3d: boolean;
  };
};

export type DwVisualMetadata = {
  data: {
    transpose: boolean;
    verticalHeader: boolean;
    horizontalHeader: boolean;
    columnOrder: number[];
  };
  describe: DwDescribe;
  annotate: DwAnnotate;
  axes: Record<string, string>;
  visualize: {
    showGrid: boolean;
    showLegend: boolean;
    darkMode: boolean;
    responsive: boolean;
    locator: DwLocatorSettings;
  };
  publish: {
    background: string;
    text: string;
    embedWidth: number;
    chartHeight: number;
  };
};

export type DwChartSpec = {
  id: string;
  type: DwVisualType;
  title: string;
  theme: string;
  language: string;
  metadata: DwVisualMetadata;
};

export const DEFAULT_THEME: StudioTheme = {
  id: 'occu-med',
  name: 'Occu-Med',
  fontFamily: 'system',
  background: '#ffffff',
  text: '#172033',
  mutedText: '#667085',
  gridline: '#e7ecf2',
  categorical: ['#315E9E', '#29A7C8', '#31C48D', '#8B5CF6', '#F59E0B', '#E85D75', '#6172F3', '#F04438'],
  gradient: ['#d9eef7', '#315e9e'],
  darkBackground: '#0b1420',
  darkText: '#f4f7fb',
  darkGridline: '#26354a',
  lockPalette: false,
};

export const DEFAULT_METADATA: DwVisualMetadata = {
  data: {
    transpose: false,
    verticalHeader: true,
    horizontalHeader: true,
    columnOrder: [],
  },
  describe: {
    intro: '',
    byline: '',
    sourceName: '',
    sourceUrl: '',
    ariaDescription: '',
    numberPrepend: '',
    numberAppend: '',
  },
  annotate: {
    notes: '',
    highlightCategory: '',
  },
  axes: {},
  visualize: {
    showGrid: true,
    showLegend: true,
    darkMode: false,
    responsive: true,
    locator: {
      center: [-98.5, 39.5],
      zoom: 3,
      height: 62,
      bearing: 0,
      pitch: 0,
      style: 'dw-light',
      mapLabel: true,
      scale: false,
      compass: false,
      visibility: {
        boundaryCountry: true,
        boundaryState: true,
        building: true,
        green: true,
        mountains: true,
        roads: true,
        urban: true,
        water: true,
        building3d: false,
      },
    },
  },
  publish: {
    background: '#ffffff',
    text: '#172033',
    embedWidth: 700,
    chartHeight: 460,
  },
};

export const DW_VISUAL_TYPES: Array<{ type: DwVisualType; name: string; family: 'Bars' | 'Columns' | 'Lines & areas' | 'Shares' | 'Relationships' | 'Tables' | 'Maps' }> = [
  { type: 'd3-bars', name: 'Bar chart', family: 'Bars' },
  { type: 'd3-bars-split', name: 'Split bars', family: 'Bars' },
  { type: 'd3-bars-stacked', name: 'Stacked bars', family: 'Bars' },
  { type: 'd3-bars-bullet', name: 'Bullet bars', family: 'Bars' },
  { type: 'd3-dot-plot', name: 'Dot plot', family: 'Bars' },
  { type: 'd3-range-plot', name: 'Range plot', family: 'Bars' },
  { type: 'd3-arrow-plot', name: 'Arrow plot', family: 'Bars' },
  { type: 'column-chart', name: 'Column chart', family: 'Columns' },
  { type: 'grouped-column-chart', name: 'Grouped columns', family: 'Columns' },
  { type: 'stacked-column-chart', name: 'Stacked columns', family: 'Columns' },
  { type: 'd3-area', name: 'Area chart', family: 'Lines & areas' },
  { type: 'd3-lines', name: 'Line chart', family: 'Lines & areas' },
  { type: 'multiple-lines', name: 'Multiple lines', family: 'Lines & areas' },
  { type: 'd3-pies', name: 'Pie chart', family: 'Shares' },
  { type: 'd3-donuts', name: 'Donut chart', family: 'Shares' },
  { type: 'd3-multiple-pies', name: 'Multiple pies', family: 'Shares' },
  { type: 'd3-multiple-donuts', name: 'Multiple donuts', family: 'Shares' },
  { type: 'd3-scatter-plot', name: 'Scatter plot', family: 'Relationships' },
  { type: 'tables', name: 'Table', family: 'Tables' },
  { type: 'd3-maps-choropleth', name: 'Choropleth map', family: 'Maps' },
  { type: 'd3-maps-symbols', name: 'Symbol map', family: 'Maps' },
  { type: 'locator-map', name: 'Locator map', family: 'Maps' },
];

export function cloneDefaultMetadata(): DwVisualMetadata {
  return JSON.parse(JSON.stringify(DEFAULT_METADATA)) as DwVisualMetadata;
}

export function contrastRatio(hexA: string, hexB: string) {
  const luminance = (hex: string) => {
    const clean = hex.replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(clean)) return 0;
    const channels = [0, 2, 4].map((offset) => parseInt(clean.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const a = luminance(hexA);
  const b = luminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
