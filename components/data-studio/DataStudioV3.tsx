'use client';

import { useMemo, useState } from 'react';
import DataStudioV2 from './DataStudioV2';
import { DEFAULT_THEME, contrastRatio, type StudioTheme } from '@/lib/data-studio/datawrapper-model';

type ThemePreset = 'occu' | 'coral' | 'mono' | 'dark';

const PRESETS: Record<ThemePreset, StudioTheme> = {
  occu: DEFAULT_THEME,
  coral: {
    ...DEFAULT_THEME,
    id: 'editorial-coral',
    name: 'Editorial Coral',
    background: '#fffdfb',
    text: '#2b2b31',
    mutedText: '#6f6c75',
    gridline: '#e9e4e1',
    categorical: ['#F39A7D', '#F16D7A', '#D85F83', '#9A5B82', '#355F7B', '#62B6A7', '#F0C36E', '#6C7A89'],
    gradient: ['#ffe3d7', '#9a5b82'],
    darkBackground: '#171319',
    darkText: '#fff8f4',
    darkGridline: '#40343d',
  },
  mono: {
    ...DEFAULT_THEME,
    id: 'monochrome',
    name: 'Monochrome',
    background: '#ffffff',
    text: '#111827',
    mutedText: '#667085',
    gridline: '#e5e7eb',
    categorical: ['#111827', '#374151', '#6B7280', '#9CA3AF', '#4B5563', '#1F2937', '#D1D5DB', '#0F172A'],
    gradient: ['#e5e7eb', '#111827'],
    darkBackground: '#090b0f',
    darkText: '#f3f4f6',
    darkGridline: '#2d333d',
  },
  dark: {
    ...DEFAULT_THEME,
    id: 'occu-dark',
    name: 'Occu-Med Dark',
    background: '#0b1420',
    text: '#f4f7fb',
    mutedText: '#9badc2',
    gridline: '#26354a',
    categorical: ['#7dc7e7', '#52d6c7', '#a78bfa', '#f2b36f', '#ef7d91', '#73a5ff', '#44c17d', '#f08b63'],
    gradient: ['#17334a', '#7dc7e7'],
    darkBackground: '#0b1420',
    darkText: '#f4f7fb',
    darkGridline: '#26354a',
  },
};

function downloadTheme(theme: StudioTheme) {
  const blob = new Blob([JSON.stringify({ version: 1, theme }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${theme.id}-theme.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DataStudioV3() {
  const [theme, setTheme] = useState<StudioTheme>(PRESETS.occu);
  const [panelOpen, setPanelOpen] = useState(false);
  const [darkPreview, setDarkPreview] = useState(false);

  const effectiveBackground = darkPreview ? theme.darkBackground : theme.background;
  const effectiveText = darkPreview ? theme.darkText : theme.text;
  const effectiveGrid = darkPreview ? theme.darkGridline : theme.gridline;
  const ratio = useMemo(() => contrastRatio(effectiveText, effectiveBackground), [effectiveText, effectiveBackground]);
  const contrastLabel = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'Large text only' : 'Fail';

  const style = {
    '--dv-theme-bg': effectiveBackground,
    '--dv-theme-text': effectiveText,
    '--dv-theme-muted': theme.mutedText,
    '--dv-theme-grid': effectiveGrid,
    '--dv-theme-accent': theme.categorical[0],
    '--dv-theme-accent-2': theme.categorical[1] || theme.categorical[0],
    '--dv-theme-font': theme.fontFamily === 'serif'
      ? 'Georgia, Cambria, Times New Roman, serif'
      : theme.fontFamily === 'mono'
        ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
        : theme.fontFamily === 'humanist'
          ? 'Aptos, Segoe UI, Helvetica Neue, Arial, sans-serif'
          : 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  } as React.CSSProperties;

  function applyPreset(preset: ThemePreset) {
    setTheme(JSON.parse(JSON.stringify(PRESETS[preset])) as StudioTheme);
    setDarkPreview(preset === 'dark');
  }

  function exportCurrentSvg() {
    const svg = document.querySelector('.dv-chart-stage svg');
    if (!(svg instanceof SVGElement)) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'visualization.svg';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={`dw3-theme-shell ${darkPreview ? 'is-dark-preview' : ''}`} style={style}>
      <DataStudioV2 />

      <div className="dw3-floating-tools" aria-label="Visualization house style tools">
        <button onClick={() => setPanelOpen((value) => !value)}>{panelOpen ? 'Close theme' : 'House style'}</button>
        <button onClick={exportCurrentSvg}>Export current SVG</button>
      </div>

      {panelOpen && (
        <aside className="dw3-theme-panel">
          <header>
            <div>
              <span>WORKSPACE THEME</span>
              <h2>House style</h2>
            </div>
            <button onClick={() => setPanelOpen(false)}>×</button>
          </header>

          <section>
            <label>Preset</label>
            <div className="dw3-preset-grid">
              <button onClick={() => applyPreset('occu')}>Occu-Med</button>
              <button onClick={() => applyPreset('coral')}>Editorial Coral</button>
              <button onClick={() => applyPreset('mono')}>Monochrome</button>
              <button onClick={() => applyPreset('dark')}>Dark</button>
            </div>
          </section>

          <section>
            <label>Theme name</label>
            <input value={theme.name} onChange={(event) => setTheme((current) => ({ ...current, name: event.target.value }))} />
            <label>Typography</label>
            <select value={theme.fontFamily} onChange={(event) => setTheme((current) => ({ ...current, fontFamily: event.target.value as StudioTheme['fontFamily'] }))}>
              <option value="system">System sans</option>
              <option value="humanist">Humanist sans</option>
              <option value="serif">Editorial serif</option>
              <option value="mono">Monospace</option>
            </select>
          </section>

          <section className="dw3-color-section">
            <div><label>Background</label><input type="color" value={theme.background} onChange={(event) => setTheme((current) => ({ ...current, background: event.target.value }))} /></div>
            <div><label>Text</label><input type="color" value={theme.text} onChange={(event) => setTheme((current) => ({ ...current, text: event.target.value }))} /></div>
            <div><label>Gridlines</label><input type="color" value={theme.gridline} onChange={(event) => setTheme((current) => ({ ...current, gridline: event.target.value }))} /></div>
            <div><label>Muted text</label><input type="color" value={theme.mutedText} onChange={(event) => setTheme((current) => ({ ...current, mutedText: event.target.value }))} /></div>
          </section>

          <section>
            <label>Categorical palette</label>
            <div className="dw3-palette-editor">
              {theme.categorical.slice(0, 8).map((color, index) => (
                <input key={`${index}-${color}`} type="color" value={color} onChange={(event) => setTheme((current) => ({ ...current, categorical: current.categorical.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} />
              ))}
            </div>
            <label className="dw3-check"><input type="checkbox" checked={theme.lockPalette} onChange={(event) => setTheme((current) => ({ ...current, lockPalette: event.target.checked }))} /> Lock visualizations to this palette</label>
          </section>

          <section>
            <div className="dw3-accessibility-row">
              <div><span>COLOR CHECK</span><strong>{contrastLabel}</strong></div>
              <div><span>Contrast ratio</span><strong>{ratio.toFixed(2)}:1</strong></div>
            </div>
            <p className="dw3-help">AA body-text target is 4.5:1. The preview updates from the active light or dark theme colors.</p>
            <label className="dw3-check"><input type="checkbox" checked={darkPreview} onChange={(event) => setDarkPreview(event.target.checked)} /> Preview dark-mode equivalents</label>
          </section>

          <footer>
            <button onClick={() => downloadTheme(theme)}>Export theme JSON</button>
          </footer>
        </aside>
      )}
    </div>
  );
}
