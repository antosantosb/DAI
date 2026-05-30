// Sprint 2 (redesign): editor manual de Padrao (trajeto) de uma Linha.
//
// Modelo: o utilizador coloca uma sequencia ORDENADA de pontos no mapa.
//   - Clicar numa PARAGEM   -> entra no padrao (fica guardada).
//   - Clicar fora de paragem -> ANCORA (waypoint) que so' molda o tracado.
// O OSRM cola a linha as ruas passando por todos os pontos pela ordem. Ao
// guardar, so' as paragens + a geometria ficam; as ancoras desaparecem.

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import './PatternEditor.css';

const BRAGA = [41.5454, -8.4265];

const IconUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
);
const IconDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
);
const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);

export default function PatternEditor() {
  const { id, patternId } = useParams();
  const routeId = Number(id);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [line, setLine] = useState(null);
  const [stops, setStops] = useState([]);
  // sequencia: { type:'STOP'|'WAYPOINT', stopId?, lat, lon, name?, code? }
  const [sequence, setSequence] = useState([]);
  const [directionId, setDirectionId] = useState(0);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const stopsLayerRef = useRef(null);
  const seqLayerRef = useRef(null);
  const lineLayerRef = useRef(null);
  const highlightRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const color = line?.color || '#009BDB';

  // ── carregar linha + paragens ──
  useEffect(() => {
    api.get('/routes')
      .then(r => setLine((r.data || []).find(x => x.id === routeId) || null))
      .catch(() => setLine(null));
    api.get('/stops').then(r => setStops(r.data || [])).catch(() => setStops([]));
  }, [routeId]);

  // ── modo edicao: carregar a sequencia de autoria (paragens + ancoras) ──
  useEffect(() => {
    if (!patternId) return;
    api.get(`/patterns/${patternId}/authoring`)
      .then(({ data }) => {
        setDirectionId(data.directionId ?? 0);
        setName(data.name || '');
        const pts = (data.points || []).map(p => ({ ...p }));
        setSequence(pts);
        if (mapRef.current && pts.length >= 2) {
          mapRef.current.fitBounds(pts.map(p => [p.lat, p.lon]), { padding: [40, 40], maxZoom: 16 });
        }
      })
      .catch(() => toast.error(t('pages.patternEditor.loadError')));
  }, [patternId, t]);

  // ── init do mapa (uma vez) ──
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return undefined;
    const map = L.map(mapDivRef.current, { zoomControl: true }).setView(BRAGA, 13);
    mapRef.current = map;
    // Basemap minimalista CARTO Voyager (limpo mas com contexto suave). Sempre
    // claro, mesmo em tema escuro (o escuro ficava duro com tantas paragens).
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20,
      detectRetina: true,
    }).addTo(map);
    lineLayerRef.current = L.layerGroup().addTo(map);
    stopsLayerRef.current = L.layerGroup().addTo(map);
    seqLayerRef.current = L.layerGroup().addTo(map);
    highlightRef.current = L.layerGroup().addTo(map);
    // Clique no mapa (fora de paragem) cria uma ancora. Cliques em paragens
    // sao consumidos pelo proprio marcador (nao disparam este handler).
    map.on('click', (e) => {
      setSequence(prev => [...prev, { type: 'WAYPOINT', lat: e.latlng.lat, lon: e.latlng.lng }]);
    });
    setTimeout(() => map.invalidateSize(), 80);
    setMapReady(true);
    return () => { map.remove(); mapRef.current = null; setMapReady(false); };
  }, []);

  // ── desenhar todas as paragens (paleta clicavel) ──
  useEffect(() => {
    if (!mapReady || !stopsLayerRef.current) return;
    const layer = stopsLayerRef.current;
    layer.clearLayers();
    stops.forEach(s => {
      if (s.latitude == null || s.longitude == null) return;
      const m = L.circleMarker([s.latitude, s.longitude], {
        radius: 6, color: '#fff', weight: 1.5, fillColor: '#475569', fillOpacity: 0.9,
        // Sem isto, o clique na paragem propaga ao mapa e cria tambem uma ancora.
        bubblingMouseEvents: false,
      });
      m.bindTooltip(`${s.code} · ${s.name}`, { direction: 'top' });
      m.on('click', () => {
        setSequence(prev => [...prev, { type: 'STOP', stopId: s.id, lat: s.latitude, lon: s.longitude, name: s.name, code: s.code }]);
      });
      m.addTo(layer);
    });
  }, [stops, mapReady]);

  // ── desenhar a sequencia (marcadores numerados + ancoras) ──
  useEffect(() => {
    if (!mapReady || !seqLayerRef.current) return;
    const layer = seqLayerRef.current;
    layer.clearLayers();
    let n = 0;
    sequence.forEach((p, idx) => {
      if (p.type === 'STOP') {
        n += 1;
        const icon = L.divIcon({
          className: 'pe-stop-divicon',
          html: `<div class="pe-stop-marker" style="background:${color}">${n}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13],
        });
        L.marker([p.lat, p.lon], { icon, interactive: false }).addTo(layer);
      } else {
        // Ancora arrastavel: pode reposicionar-se depois de colocada.
        const wpIcon = L.divIcon({
          className: 'pe-wp-divicon',
          html: `<div class="pe-wp-marker" style="border-color:${color}"></div>`,
          iconSize: [16, 16], iconAnchor: [8, 8],
        });
        const m = L.marker([p.lat, p.lon], { icon: wpIcon, draggable: true });
        m.on('dragend', (e) => {
          const ll = e.target.getLatLng();
          setSequence(prev => prev.map((pt, i) => (i === idx ? { ...pt, lat: ll.lat, lon: ll.lng } : pt)));
        });
        m.addTo(layer);
      }
    });
  }, [sequence, mapReady, color]);

  // ── preview OSRM (cola as ruas), com debounce ──
  useEffect(() => {
    if (!mapReady || !lineLayerRef.current) return undefined;
    const pts = sequence.map(p => [p.lat, p.lon]);
    if (pts.length < 2) { lineLayerRef.current.clearLayers(); return undefined; }
    const handle = setTimeout(() => {
      api.post('/routes/preview-geometry', { points: pts })
        .then(({ data }) => {
          const layer = lineLayerRef.current;
          if (!layer) return;
          layer.clearLayers();
          L.polyline(data?.points || pts, { color, weight: 5, opacity: 0.9 }).addTo(layer);
        })
        .catch(() => {
          const layer = lineLayerRef.current;
          if (!layer) return;
          layer.clearLayers();
          L.polyline(pts, { color, weight: 4, opacity: 0.5, dashArray: '6,6' }).addTo(layer);
        });
    }, 450);
    return () => clearTimeout(handle);
  }, [sequence, mapReady, color]);

  // Ctrl+Z (ou Cmd+Z) remove o ultimo ponto colocado (paragem ou ancora).
  // Ignorado quando o foco esta' num campo, para nao roubar o undo de texto.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName ? e.target.tagName : '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        setSequence(prev => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stopCount = sequence.filter(p => p.type === 'STOP').length;

  const removePoint = (idx) => setSequence(prev => prev.filter((_, i) => i !== idx));
  const movePoint = (idx, dir) => setSequence(prev => {
    const to = idx + dir;
    if (to < 0 || to >= prev.length) return prev;
    const arr = [...prev];
    const [it] = arr.splice(idx, 1);
    arr.splice(to, 0, it);
    return arr;
  });
  const clearAll = () => setSequence([]);

  const reorder = (from, to) => setSequence(prev => {
    const arr = [...prev];
    const [it] = arr.splice(from, 1);
    arr.splice(to, 0, it);
    return arr;
  });

  // Procurar paragem e voar ate' ela (com realce temporario), para ajudar a
  // encontrar a proxima paragem no meio de centenas.
  const goToStop = (s) => {
    const map = mapRef.current;
    if (!map || s.latitude == null || s.longitude == null) return;
    map.flyTo([s.latitude, s.longitude], 17, { duration: 0.8 });
    if (highlightRef.current) {
      highlightRef.current.clearLayers();
      L.circleMarker([s.latitude, s.longitude], { radius: 16, color: '#E2231A', weight: 3, fill: false, opacity: 0.95, interactive: false }).addTo(highlightRef.current);
      setTimeout(() => { if (highlightRef.current) highlightRef.current.clearLayers(); }, 1800);
    }
    setSearch('');
  };

  const searchResults = search.trim()
    ? stops.filter(s => {
        const q = search.trim().toLowerCase();
        return (s.name && s.name.toLowerCase().includes(q)) || (s.code && String(s.code).toLowerCase().includes(q));
      }).slice(0, 8)
    : [];

  const handleSave = () => {
    if (stopCount < 2) { toast.error(t('pages.patternEditor.needTwoStops')); return; }
    setSaving(true);
    const points = sequence.map(p => p.type === 'STOP'
      ? { type: 'STOP', stopId: p.stopId, lat: p.lat, lon: p.lon }
      : { type: 'WAYPOINT', lat: p.lat, lon: p.lon });
    const body = { directionId, name: name || null, points };
    const req = patternId
      ? api.put(`/routes/${routeId}/patterns/${patternId}`, body)
      : api.post(`/routes/${routeId}/patterns`, body);
    req
      .then(() => {
        toast.success(t(patternId ? 'pages.patternEditor.updated' : 'pages.patternEditor.saved'));
        navigate('/backoffice/routes');
      })
      .catch(err => {
        toast.error(err.response?.data?.message || t('pages.patternEditor.saveError'));
        setSaving(false);
      });
  };

  // Numero das paragens na lista lateral (so' as paragens contam).
  let counter = 0;

  return (
    <div className="pe">
      <div className="page-header">
        <div>
          <h1>{t(patternId ? 'pages.patternEditor.editTitle' : 'pages.patternEditor.title')}</h1>
          <p className="page-subtitle">
            {line
              ? <>{t('pages.patternEditor.forLine')} <code style={{ color }}>{line.code}</code> {line.name}</>
              : '...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/backoffice/routes')}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || stopCount < 2}>
            {saving ? t('pages.patternEditor.saving') : t('pages.patternEditor.save')}
          </button>
        </div>
      </div>

      <div className="pe-body">
        <div className="pe-map-wrap">
          <div ref={mapDivRef} className="pe-map" />
          <div className="pe-legend">
            <span className="pe-legend-item">
              <span className="pe-legend-dot pe-legend-dot--stop" style={{ background: color }}></span>
              {t('pages.patternEditor.legendStop')}
            </span>
            <span className="pe-legend-item">
              <span className="pe-legend-dot pe-legend-dot--wp" style={{ borderColor: color }}></span>
              {t('pages.patternEditor.legendWaypoint')}
            </span>
          </div>
        </div>

        <aside className="pe-panel">
          <div className="pe-search">
            <svg className="pe-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            <input
              className="pe-search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('pages.patternEditor.searchStops')}
            />
            {searchResults.length > 0 && (
              <ul className="pe-search-results">
                {searchResults.map(s => (
                  <li key={s.id} className="pe-search-item" onClick={() => goToStop(s)}>
                    <span className="pe-search-code">{s.code}</span>
                    <span className="pe-search-name">{s.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pe-meta">
            <div className="form-group">
              <label>{t('pages.patternEditor.direction')}</label>
              <select value={directionId} onChange={e => setDirectionId(Number(e.target.value))}>
                <option value={0}>{t('pages.schedules.outbound')}</option>
                <option value={1}>{t('pages.schedules.inbound')}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t('pages.patternEditor.nameLabel')}</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={t('pages.patternEditor.namePlaceholder')} />
            </div>
          </div>

          <div className="pe-seq-header">
            <span className="pe-seq-title">{t('pages.patternEditor.sequence')}</span>
            <span className="pe-seq-count">{t('pages.patternEditor.stopsCount', { count: stopCount })}</span>
          </div>

          {sequence.length === 0 ? (
            <div className="pe-seq-empty">{t('pages.patternEditor.empty')}</div>
          ) : (
            <ul className="pe-seq-list">
              {sequence.map((p, idx) => {
                const n = p.type === 'STOP' ? (counter += 1) : null;
                return (
                  <li
                    key={idx}
                    className={`pe-seq-item pe-seq-item--${p.type.toLowerCase()}${dragIdx === idx ? ' pe-seq-item--dragging' : ''}`}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragIdx !== null && dragIdx !== idx) reorder(dragIdx, idx); setDragIdx(null); }}
                    onDragEnd={() => setDragIdx(null)}
                  >
                    <span className="pe-seq-badge" style={p.type === 'STOP' ? { background: color } : undefined}>
                      {p.type === 'STOP' ? n : ''}
                    </span>
                    <span className="pe-seq-label">
                      {p.type === 'STOP'
                        ? (p.name || stops.find(s => s.id === p.stopId)?.name || `#${p.stopId}`)
                        : t('pages.patternEditor.waypoint')}
                    </span>
                    <span className="pe-seq-actions">
                      <button className="pe-seq-btn" onClick={() => movePoint(idx, -1)} disabled={idx === 0} title={t('pages.patternEditor.moveUp')} type="button"><IconUp /></button>
                      <button className="pe-seq-btn" onClick={() => movePoint(idx, 1)} disabled={idx === sequence.length - 1} title={t('pages.patternEditor.moveDown')} type="button"><IconDown /></button>
                      <button className="pe-seq-btn pe-seq-btn--remove" onClick={() => removePoint(idx)} title={t('common.remove')} type="button"><IconX /></button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {sequence.length > 0 && (
            <button className="pe-clear" onClick={clearAll} type="button">{t('pages.patternEditor.clear')}</button>
          )}

          <p className="pe-hint">{t('pages.patternEditor.hint')}</p>
        </aside>
      </div>
    </div>
  );
}
