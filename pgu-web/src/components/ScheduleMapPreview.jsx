// Mapa de pre-visualizacao de uma escala (lista ordenada de BusDuty).
//
// Espelha o mapa da vista de revisao do BusScheduleModal (#4a): por padrao
// unico desenha uma polyline com cor distinta, mais deadheads pelas ruas via
// OSRM entre o fim de uma trip e o inicio da seguinte, mais markers S/E e
// markers numerados em todas as juncoes trip/deadhead.
//
// Props:
//   - duties: array de BusDutyDTO (precisa de patternId, routeShortName,
//             tripHeadsign, plannedStart). A ordem cronologica e calculada
//             internamente por plannedStart.

import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import './ScheduleMapPreview.css';

const COLORS = ['#009BDB', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#eab308', '#a855f7'];

function formatTime(iso, locale)
{
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(locale, {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch { return '—'; }
}

export default function ScheduleMapPreview({ duties = [] })
{
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'pt' ? 'pt-PT' : 'en-GB';
  const mapDivRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef(null);
  const geomCacheRef = useRef(new Map()); // patternId -> [[lat,lon], ...]

  // Padroes unicos com cor atribuida (mesma logica do BusScheduleModal).
  const patterns = useMemo(() => {
    const seen = new Map();
    let i = 0;
    for (const d of duties) {
      if (d.patternId == null || seen.has(d.patternId)) continue;
      seen.set(d.patternId, {
        id: d.patternId,
        routeCode: d.routeShortName || '',
        label: d.tripHeadsign || d.tripDisplayName || `#${d.patternId}`,
        color: COLORS[i % COLORS.length],
      });
      i++;
    }
    return Array.from(seen.values());
  }, [duties]);

  // Inicializa/destroi o mapa.
  useEffect(() => {
    if (!mapDivRef.current) return undefined;
    if (mapInstanceRef.current) return undefined;
    const m = L.map(mapDivRef.current, {
      zoomControl: true, attributionControl: false, scrollWheelZoom: true,
    }).setView([41.5454, -8.4265], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(m);
    layersRef.current = L.layerGroup().addTo(m);
    mapInstanceRef.current = m;
    const r1 = requestAnimationFrame(() => m.invalidateSize());
    const t1 = setTimeout(() => m.invalidateSize(), 200);
    return () => {
      cancelAnimationFrame(r1);
      clearTimeout(t1);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layersRef.current = null;
      }
    };
  }, []);

  // Desenha tudo quando duties/patterns muda.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    let cancelled = false;
    layers.clearLayers();

    const colorByPattern = new Map(patterns.map(p => [p.id, p.color]));
    const allBounds = [];

    (async () => {
      // 1) Polylines coloridas por padrao.
      for (const p of patterns) {
        let coords = geomCacheRef.current.get(p.id);
        if (!coords) {
          try {
            const r = await api.get(`/patterns/${p.id}/geometry`);
            const points = r.data?.points || [];
            coords = points
              .map(pt => Array.isArray(pt) ? [pt[0], pt[1]]
                : (pt && typeof pt.lat === 'number' && typeof pt.lon === 'number' ? [pt.lat, pt.lon] : null))
              .filter(Boolean);
            geomCacheRef.current.set(p.id, coords);
          } catch { coords = []; }
        }
        if (cancelled || !coords || coords.length === 0) continue;
        const pl = L.polyline(coords, { color: p.color, weight: 4, opacity: 0.85 }).addTo(layers);
        allBounds.push(pl.getBounds());
      }
      if (cancelled) return;

      // 2) Markers (S, numerados, E) em todas as juncoes trip/deadhead.
      const orderedDuties = [...duties]
        .filter(d => d.patternId != null)
        .sort((a, b) => {
          const ta = a.plannedStart ? new Date(a.plannedStart).getTime() : 0;
          const tb = b.plannedStart ? new Date(b.plannedStart).getTime() : 0;
          return ta - tb;
        });
      // Numeracao cronologica: S, 1, 2, 3, ..., E.
      const N = orderedDuties.length;
      let pointNum = 0;
      for (let i = 0; i < N; i++) {
        const coords = geomCacheRef.current.get(orderedDuties[i].patternId);
        if (!coords || coords.length === 0) continue;
        const startPt = coords[0];
        const endPt = coords[coords.length - 1];
        if (i === 0) {
          L.marker(startPt, {
            icon: L.divIcon({ className: 'smp-pin smp-pin--start', html: '<span>S</span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
            zIndexOffset: 1000,
          }).addTo(layers);
        } else {
          pointNum++;
          L.marker(startPt, {
            icon: L.divIcon({ className: 'smp-pin smp-pin--num', html: `<span>${pointNum}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
            zIndexOffset: 900,
          }).addTo(layers);
        }
        if (i === N - 1) {
          L.marker(endPt, {
            icon: L.divIcon({ className: 'smp-pin smp-pin--end', html: '<span>E</span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
            zIndexOffset: 1000,
          }).addTo(layers);
        } else {
          pointNum++;
          L.marker(endPt, {
            icon: L.divIcon({ className: 'smp-pin smp-pin--num', html: `<span>${pointNum}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
            zIndexOffset: 900,
          }).addTo(layers);
        }
      }

      // 3) Deadheads via OSRM (linha preta tracejada).
      for (let i = 0; i < N - 1; i++) {
        if (cancelled) return;
        const aCoords = geomCacheRef.current.get(orderedDuties[i].patternId);
        const bCoords = geomCacheRef.current.get(orderedDuties[i + 1].patternId);
        if (!aCoords || !bCoords || aCoords.length === 0 || bCoords.length === 0) continue;
        const endA = aCoords[aCoords.length - 1];
        const startB = bCoords[0];
        if (endA[0] === startB[0] && endA[1] === startB[1]) continue;
        let deadheadCoords = null;
        try {
          const r = await api.get('/osrm/route', {
            params: { lat1: endA[0], lon1: endA[1], lat2: startB[0], lon2: startB[1] },
          });
          const pts = r.data?.points;
          if (Array.isArray(pts) && pts.length >= 2) {
            deadheadCoords = pts
              .map(pt => Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number' ? [pt[0], pt[1]] : null)
              .filter(Boolean);
          }
        } catch { /* fallback abaixo */ }
        const coords = (deadheadCoords && deadheadCoords.length >= 2) ? deadheadCoords : [endA, startB];
        if (cancelled) return;
        L.polyline(coords, { color: '#0f172a', weight: 3, opacity: 0.75, dashArray: '5 7' }).addTo(layers);
      }

      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0].pad(0));
        map.fitBounds(combined, { padding: [20, 20] });
      }
    })();

    return () => { cancelled = true; };
  }, [duties, patterns]);

  // Lista cronologica para a tabela de horarios (igual UX da vista de revisao).
  const colorByPattern = useMemo(
    () => new Map(patterns.map(p => [p.id, p.color])),
    [patterns],
  );
  const orderedDuties = useMemo(() => {
    return [...duties].sort((a, b) => {
      const ta = a.plannedStart ? new Date(a.plannedStart).getTime() : 0;
      const tb = b.plannedStart ? new Date(b.plannedStart).getTime() : 0;
      return ta - tb;
    });
  }, [duties]);

  return (
    <div className="smp-wrap">
      <div ref={mapDivRef} className="smp-map" />
      {patterns.length > 0 && (
        <div className="smp-legend">
          {patterns.map(p => (
            <span key={p.id} className="smp-legend-item">
              <span className="smp-legend-swatch" style={{ background: p.color }} />
              {p.routeCode && <span className="smp-legend-route">{p.routeCode}</span>}
              <span className="smp-legend-name">{p.label}</span>
            </span>
          ))}
          {duties.length > 1 && (
            <span className="smp-legend-item">
              <span className="smp-legend-swatch smp-legend-swatch--deadhead" />
              <span className="smp-legend-name">{t('pages.buses.reviewDeadheadLabel')}</span>
            </span>
          )}
        </div>
      )}
      {orderedDuties.length > 0 && (
        <ol className="smp-trips-list">
          {orderedDuties.map((d, i) => {
            const color = colorByPattern.get(d.patternId);
            const label = d.tripHeadsign || d.tripDisplayName || `trip #${d.tripId}`;
            return (
              <li key={d.id} className="smp-trips-row">
                <span className="smp-trips-idx">{i + 1}</span>
                <span className="smp-trips-time">{formatTime(d.plannedStart, locale)}</span>
                {d.plannedEnd && (
                  <>
                    <span className="smp-trips-arrow" aria-hidden="true">→</span>
                    <span className="smp-trips-time smp-trips-time--end">{formatTime(d.plannedEnd, locale)}</span>
                  </>
                )}
                {d.routeShortName && (
                  <span
                    className="smp-trips-route"
                    style={color ? { background: color } : undefined}
                  >
                    {d.routeShortName}
                  </span>
                )}
                <span className="smp-trips-name" title={label}>{label}</span>
                {d.status && <span className={`smp-trips-status smp-trips-status--${d.status}`}>{d.status}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
