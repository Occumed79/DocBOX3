'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@5.0.0/dist/maplibre-gl.js';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@5.0.0/dist/maplibre-gl.css';
const DECK_JS = 'https://unpkg.com/deck.gl@^9.0.0/dist.min.js';

export type TerrainMode = 'price' | 'density' | 'spread';

export type TerrainObservation = {
  id: string;
  latitude: number;
  longitude: number;
  price: number;
  priceIndex: number;
  source: string;
  sourceId: string;
  provider?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  paymentBasis?: string;
};

export type TerrainInspection = {
  kind: 'hex' | 'provider';
  title: string;
  count: number;
  median: number | null;
  low: number | null;
  high: number | null;
  p25: number | null;
  p75: number | null;
  priceIndex: number | null;
  sources: string[];
  provider?: string;
  city?: string;
  state?: string;
  paymentBasis?: string;
};

type FocusMarket = {
  latitude: number;
  longitude: number;
  displayName?: string;
} | null;

type Props = {
  observations: TerrainObservation[];
  mode: TerrainMode;
  threeD: boolean;
  focus?: FocusMarket;
  radiusMiles?: number | null;
  onInspect?: (inspection: TerrainInspection) => void;
  onZoomChange?: (zoom: number) => void;
};

declare global {
  interface Window {
    maplibregl?: any;
    deck?: any;
  }
}

function ensureCss() {
  if (document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MAPLIBRE_CSS;
  document.head.appendChild(link);
}

function loadScript(src: string, globalReady: () => boolean) {
  if (globalReady()) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      if (globalReady()) return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); reject(new Error(`Failed to load ${src}`)); };
    document.head.appendChild(script);
  });
}

function quantile(values: number[], percentile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function median(values: number[]) { return quantile(values, 0.5); }

function inspectionFromPoints(points: TerrainObservation[]): TerrainInspection {
  const prices = points.map((item) => item.price).filter((value) => Number.isFinite(value) && value > 0);
  const indices = points.map((item) => item.priceIndex).filter(Number.isFinite);
  return {
    kind: 'hex',
    title: `${points.length.toLocaleString()} self-pay observation${points.length === 1 ? '' : 's'} in this cell`,
    count: points.length,
    median: median(prices),
    low: prices.length ? Math.min(...prices) : null,
    high: prices.length ? Math.max(...prices) : null,
    p25: quantile(prices, 0.25),
    p75: quantile(prices, 0.75),
    priceIndex: median(indices),
    sources: [...new Set(points.map((item) => item.source))].sort(),
  };
}

function money(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export default function PriceTerrainMap({ observations, mode, threeD, focus = null, radiusMiles = null, onInspect, onZoomChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(3.25);
  const [error, setError] = useState<string | null>(null);

  const validObservations = useMemo(() => observations.filter((item) => (
    Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && Number.isFinite(item.price) && item.price > 0
  )), [observations]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    ensureCss();
    Promise.all([
      loadScript(MAPLIBRE_JS, () => Boolean(window.maplibregl)),
      loadScript(DECK_JS, () => Boolean(window.deck)),
    ]).then(() => {
      if (cancelled || !containerRef.current || !window.maplibregl || !window.deck) return;
      const maplibregl = window.maplibregl;
      const deck = window.deck;
      const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      const style = mapTilerKey
        ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${encodeURIComponent(mapTilerKey)}`
        : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: [-98.45, 38.4],
        zoom: 3.25,
        pitch: 48,
        bearing: -7,
        antialias: true,
        attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
      const overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(overlay);
      mapRef.current = map;
      overlayRef.current = overlay;
      map.on('load', () => { if (!cancelled) setReady(true); });
      const syncZoom = () => {
        const next = map.getZoom();
        setZoom(next);
        onZoomChange?.(next);
      };
      map.on('zoomend', syncZoom);
      map.on('pitchend', syncZoom);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Map renderer failed to load.');
    });
    return () => { cancelled = true; };
  }, [onZoomChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.easeTo({ pitch: threeD ? 48 : 0, bearing: threeD ? -7 : 0, duration: 700 });
  }, [threeD, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focus) return;
    map.flyTo({ center: [focus.longitude, focus.latitude], zoom: 6.15, pitch: threeD ? 48 : 0, speed: 0.8, curve: 1.35, essential: true });
  }, [focus?.latitude, focus?.longitude, ready, threeD]);

  useEffect(() => {
    if (!ready || !overlayRef.current || !window.deck) return;
    const deck = window.deck;
    const cellRadius = zoom < 4.2 ? 70000 : zoom < 5.8 ? 36000 : zoom < 7.2 ? 18000 : 8500;
    const colorRange = [
      [28, 74, 118],
      [26, 126, 153],
      [48, 181, 167],
      [216, 202, 113],
      [238, 139, 79],
      [220, 70, 102],
    ];
    const priceValues = (points: TerrainObservation[]) => points.map((item) => item.priceIndex).filter(Number.isFinite);
    const elevationValue = (points: TerrainObservation[]) => {
      if (mode === 'density') return points.length;
      const values = priceValues(points);
      if (mode === 'spread') {
        const p25 = quantile(values, 0.25) ?? 0;
        const p75 = quantile(values, 0.75) ?? 0;
        return Math.max(0, p75 - p25);
      }
      return median(values) ?? 0;
    };
    const colorValue = (points: TerrainObservation[]) => {
      const values = priceValues(points);
      if (mode === 'spread') {
        const p25 = quantile(values, 0.25) ?? 0;
        const p75 = quantile(values, 0.75) ?? 0;
        return Math.max(0, p75 - p25);
      }
      return median(values) ?? 0;
    };

    const layers: any[] = [];
    if (validObservations.length) {
      layers.push(new deck.HexagonLayer({
        id: `self-pay-hex-${mode}-${threeD ? '3d' : '2d'}`,
        data: validObservations,
        getPosition: (item: TerrainObservation) => [item.longitude, item.latitude],
        radius: cellRadius,
        extruded: threeD,
        elevationScale: mode === 'density' ? 900 : mode === 'spread' ? 620 : 180,
        getElevationValue: elevationValue,
        getColorValue: colorValue,
        colorRange,
        coverage: 0.88,
        opacity: threeD ? 0.9 : 0.72,
        upperPercentile: 99,
        lowerPercentile: 1,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 105],
        gpuAggregation: false,
        material: { ambient: 0.45, diffuse: 0.72, shininess: 42, specularColor: [110, 150, 180] },
        transitions: { elevationScale: 650 },
        onClick: (info: any) => {
          const points = info?.object?.points as TerrainObservation[] | undefined;
          if (points?.length) onInspect?.(inspectionFromPoints(points));
        },
      }));

      layers.push(new deck.ScatterplotLayer({
        id: 'self-pay-provider-points',
        data: validObservations,
        visible: zoom >= 6.4,
        getPosition: (item: TerrainObservation) => [item.longitude, item.latitude],
        getRadius: zoom >= 9 ? 1100 : 2200,
        radiusMinPixels: 3,
        radiusMaxPixels: 11,
        getFillColor: (item: TerrainObservation) => item.priceIndex > 125 ? [235, 111, 92, 210] : item.priceIndex < 80 ? [42, 174, 175, 210] : [224, 205, 125, 210],
        getLineColor: [255, 255, 255, 225],
        lineWidthMinPixels: 1,
        stroked: true,
        pickable: true,
        autoHighlight: true,
        onClick: (info: any) => {
          const item = info?.object as TerrainObservation | undefined;
          if (!item) return;
          onInspect?.({
            kind: 'provider',
            title: item.provider || item.source,
            count: 1,
            median: item.price,
            low: item.price,
            high: item.price,
            p25: item.price,
            p75: item.price,
            priceIndex: item.priceIndex,
            sources: [item.source],
            provider: item.provider,
            city: item.city,
            state: item.state,
            paymentBasis: item.paymentBasis,
          });
        },
      }));
    }

    if (focus && radiusMiles) {
      layers.push(new deck.ScatterplotLayer({
        id: 'strict-market-radius',
        data: [focus],
        getPosition: (item: FocusMarket) => [item!.longitude, item!.latitude],
        getRadius: radiusMiles * 1609.344,
        radiusUnits: 'meters',
        filled: true,
        stroked: true,
        getFillColor: [44, 207, 195, 22],
        getLineColor: [82, 235, 220, 210],
        lineWidthMinPixels: 2,
        pickable: false,
      }));
      layers.push(new deck.ScatterplotLayer({
        id: 'strict-market-center',
        data: [focus],
        getPosition: (item: FocusMarket) => [item!.longitude, item!.latitude],
        getRadius: 9,
        radiusUnits: 'pixels',
        filled: true,
        getFillColor: [111, 255, 239, 245],
        getLineColor: [7, 25, 35, 255],
        lineWidthMinPixels: 2,
        stroked: true,
      }));
    }

    overlayRef.current.setProps({
      layers,
      getTooltip: ({ object, layer }: any) => {
        if (!object) return null;
        if (layer?.id === 'self-pay-provider-points') {
          const item = object as TerrainObservation;
          return { text: `${item.provider || item.source}\n${money(item.price)} cash · index ${Math.round(item.priceIndex)}\n${[item.city, item.state].filter(Boolean).join(', ')}\n${item.source}` };
        }
        const points = object.points as TerrainObservation[] | undefined;
        if (!points?.length) return null;
        const summary = inspectionFromPoints(points);
        return { text: `${summary.count} observations\nMedian ${money(summary.median)} · index ${summary.priceIndex ? Math.round(summary.priceIndex) : '—'}\n${summary.sources.length} source${summary.sources.length === 1 ? '' : 's'}` };
      },
    });
  }, [validObservations, mode, threeD, zoom, ready, focus, radiusMiles, onInspect]);

  useEffect(() => () => {
    try { overlayRef.current?.finalize?.(); } catch {}
    try { mapRef.current?.remove?.(); } catch {}
    overlayRef.current = null;
    mapRef.current = null;
  }, []);

  return (
    <div className="kx-map-root">
      <div ref={containerRef} className="kx-map-canvas" />
      {!error && !ready && <div className="kx-map-loading"><span /><b>Initializing spatial engine</b><small>MapLibre + deck.gl</small></div>}
      {error && <div className="kx-map-failure"><b>Map renderer unavailable</b><span>{error}</span></div>}
      {ready && !validObservations.length && <div className="kx-map-empty"><b>No national geocoded evidence for this procedure yet.</b><span>The strict pricing engine is still available; the map will never invent geography to fill the screen.</span></div>}
    </div>
  );
}
