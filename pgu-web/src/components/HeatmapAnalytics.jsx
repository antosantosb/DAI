import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import api from '../services/api';

// Centro de Braga
const DEFAULT_CENTER = [41.55032, -8.42005];
const REFRESH_MS = 60_000;

export default function HeatmapAnalytics() {
  const mapRef       = useRef(null);
  const mapInstance  = useRef(null);
  const heatLayerRef = useRef(null);

  // Init map (uma vez)
  useEffect(() => {
    if (mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(mapInstance.current);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Polling de pontos
  useEffect(() => {
    const abort = new AbortController();

    const fetchHeatmap = async () => {
      try {
        const res = await api.get('/analytics/heatmap', { signal: abort.signal });
        const raw = res.data || [];

        // Normaliza intensidade face ao máximo observado (evita "magic number *3").
        // Cada célula já vem agregada ~50m pelo backend (v_heatmap_passenger_density).
        const maxPax = raw.reduce((m, p) => Math.max(m, p.passengerCount || 0), 0) || 1;
        const points = raw.map(p => [p.lat, p.lng, p.passengerCount / maxPax]);

        if (!mapInstance.current) return;

        if (heatLayerRef.current) {
          mapInstance.current.removeLayer(heatLayerRef.current);
          heatLayerRef.current = null;
        }

        if (points.length > 0) {
          heatLayerRef.current = L.heatLayer(points, {
            radius: 22,
            blur: 18,
            maxZoom: 16,
            max: 1.0,              // intensidades já normalizadas
            minOpacity: 0.35,
            gradient: {
              0.2: '#6366f1',      // primary — baixa densidade
              0.5: '#10b981',      // success — média
              0.75: '#f59e0b',     // warning — alta
              1.0: '#ef4444',      // danger — saturado
            },
          }).addTo(mapInstance.current);
        }
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          console.error('Error fetching heatmap', err);
        }
      }
    };

    fetchHeatmap();
    const iv = setInterval(fetchHeatmap, REFRESH_MS);
    return () => {
      abort.abort();
      clearInterval(iv);
    };
  }, []);

  return (
    <div
      ref={mapRef}
      className="heatmap-container"
      style={{
        width: '100%',
        height: '400px',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        zIndex: 0,
      }}
    />
  );
}
