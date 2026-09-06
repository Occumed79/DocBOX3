'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProcedureDefinition } from '@/lib/pricing/procedures';

const MAPTILER_VERSION = '4.1.0';
const MAPTILER_SCRIPT = `https://cdn.maptiler.com/maptiler-sdk-js/v${MAPTILER_VERSION}/maptiler-sdk.umd.min.js`;
const MAPTILER_CSS = `https://cdn.maptiler.com/maptiler-sdk-js/v${MAPTILER_VERSION}/maptiler-sdk.css`;

type MapObservation = {
  id: string;
  latitude: number;
  longitude: number;
  price: number;
  priceIndex?: number;
  source: string;
  provider?: string;
  city?: string;
  state?: string;
};

type PriceMapProps = {
  procedure: ProcedureDefinition;
  observations?: MapObservation[];
};

declare global {
  interface Window {
    maptilersdk?: any;
  }
}

function ensureMapTilerCss() {
  if (document.querySelector(`link[href="${MAPTILER_CSS}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MAPTILER_CSS;
  document.head.appendChild(link);
}

function ensureMapTilerScript(): Promise<any> {
  if (window.maptilersdk) return Promise.resolve(window.maptilersdk);
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${MAPTILER_SCRIPT}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(window.maptilersdk), { once: true });
      existing.addEventListener('error', () => reject(new Error('MapTiler SDK failed to load.')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MAPTILER_SCRIPT;
    script.async = true;
    script.onload = () => resolve(window.maptilersdk);
    script.onerror = () => reject(new Error('MapTiler SDK failed to load.'));
    document.head.appendChild(script);
  });
}

export default function PriceMap({ procedure, observations = [] }: PriceMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;

  const geoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: observations.map((observation) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [observation.longitude, observation.latitude],
      },
      properties: {
        id: observation.id,
        price: observation.price,
        priceIndex: observation.priceIndex ?? 100,
        source: observation.source,
        provider: observation.provider ?? '',
        city: observation.city ?? '',
        state: observation.state ?? '',
      },
    })),
  }), [observations]);

  useEffect(() => {
    if (!containerRef.current || !apiKey) return;
    let cancelled = false;

    ensureMapTilerCss();
    ensureMapTilerScript()
      .then((maptilersdk) => {
        if (cancelled || !containerRef.current) return;
        maptilersdk.config.apiKey = apiKey;
        const map = new maptilersdk.Map({
          container: containerRef.current,
          style: maptilersdk.MapStyle?.DATAVIZ?.LIGHT || maptilersdk.MapStyle?.STREETS,
          center: [-98.5795, 39.8283],
          zoom: 3.15,
          pitch: 0,
          antialias: true,
        });
        map.addControl(new maptilersdk.NavigationControl({ showCompass: false }), 'bottom-right');
        mapRef.current = map;

        map.on('load', () => {
          if (!geoJson.features.length) return;
          map.addSource('self-pay-prices', { type: 'geojson', data: geoJson });
          map.addLayer({
            id: 'self-pay-price-heat',
            type: 'heatmap',
            source: 'self-pay-prices',
            maxzoom: 10,
            paint: {
              'heatmap-weight': [
                'interpolate', ['linear'], ['get', 'priceIndex'],
                60, 0.1,
                100, 0.45,
                160, 1,
              ],
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 2, 0.7, 9, 2.2],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 2, 16, 9, 38],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.78, 10, 0.25],
            },
          });
          map.addLayer({
            id: 'self-pay-price-points',
            type: 'circle',
            source: 'self-pay-prices',
            minzoom: 8,
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 13, 9],
              'circle-color': '#ffffff',
              'circle-stroke-color': '#315d8f',
              'circle-stroke-width': 2,
              'circle-opacity': 0.88,
            },
          });
        });
      })
      .catch((error) => {
        if (!cancelled) setMapError(error instanceof Error ? error.message : 'Map unavailable.');
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, [apiKey, geoJson]);

  return (
    <div className="pi-map-stage">
      <div className="pi-map-meta glass-panel">
        <span className="pi-eyebrow">PRICE HEAT MAP</span>
        <strong>{procedure.name}</strong>
        <span>{procedure.codeSystem} {procedure.code}</span>
      </div>

      {!apiKey ? (
        <div className="pi-map-empty">
          <div className="pi-map-orb" aria-hidden="true" />
          <strong>MapTiler is ready to connect.</strong>
          <p>Add <code>NEXT_PUBLIC_MAPTILER_KEY</code> in the Render environment to activate the live map. Procedure exploration remains independent from quote analysis.</p>
        </div>
      ) : mapError ? (
        <div className="pi-map-empty"><strong>{mapError}</strong></div>
      ) : (
        <div ref={containerRef} className="pi-map-canvas" aria-label={`Self-pay price heat map for ${procedure.name}`} />
      )}

      <div className="pi-map-legend glass-panel" aria-label="Price index legend">
        <span>LOWER</span>
        <div className="pi-legend-ramp" />
        <span>HIGHER</span>
      </div>
    </div>
  );
}
