import { useEffect, useState, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import './Routes.css';

const PAGE_SIZE = 50;

export default function Routes() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  // Sprint 1 follow-up: dev tem os mesmos privilégios de gestão que admin.
  const isAdmin = hasRole('admin') || hasRole('developer');
  const [routes, setRoutes] = useState([]);
  const [allStops, setAllStops] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', color: '', operatorId: '' });
  const [showForm, setShowForm] = useState(false);
  // Sprint 1 (F4): pre-popular a pesquisa a partir de ?q= (deep-link do
  // calendario — clicar numa rota leva aqui ja' filtrado).
  const [search, setSearch] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('q') || '';
    } catch { return ''; }
  });
  const [modal, setModal] = useState({ open: false });
  // Sprint 1 (F0): filtro de operador. Pre-popula do query param ?operator=CODE
  // (usado pelo link "Rotas" na pagina Operators).
  const [operatorsList, setOperatorsList] = useState([]);
  const [operatorFilter, setOperatorFilter] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('operator') || 'all';
    } catch { return 'all'; }
  });

  // Sprint 1: vista de "padrões da linha" (trajetórias distintas de cada rota).
  // expandedId: rota actualmente expandida (apenas uma de cada vez).
  // patternsCache: padrões já carregados por routeId (lazy, uma vez por rota).
  // patternsState: estado de carregamento por routeId ('loading' | 'error').
  const [expandedId, setExpandedId] = useState(null);
  const [patternsCache, setPatternsCache] = useState({});
  const [patternsState, setPatternsState] = useState({});

  const togglePatterns = (routeId) => {
    // Fechar se já estiver aberta.
    if (expandedId === routeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(routeId);
    // Lazy fetch: só pede uma vez por rota.
    if (patternsCache[routeId] || patternsState[routeId] === 'loading') return;
    setPatternsState(s => ({ ...s, [routeId]: 'loading' }));
    api.get(`/routes/${routeId}/patterns`)
      .then(r => {
        setPatternsCache(c => ({ ...c, [routeId]: r.data || [] }));
        setPatternsState(s => { const next = { ...s }; delete next[routeId]; return next; });
      })
      .catch(() => {
        setPatternsState(s => ({ ...s, [routeId]: 'error' }));
      });
  };

  const showModalMsg = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  // Apagar um padrao de uma linha (otimista: tira da lista e decrementa a
  // contagem logo; reverte se o backend falhar).
  const handlePatternDelete = (route, p) => {
    showModalMsg({
      type: 'danger',
      title: t('pages.routes.patterns.deleteTitle'),
      message: t('pages.routes.patterns.deleteMessage'),
      confirmText: t('pages.routes.deleteConfirm'),
      onConfirm: () => {
        closeModal();
        setPatternsCache(c => ({ ...c, [route.id]: (c[route.id] || []).filter(x => x.id !== p.id) }));
        setRoutes(prev => prev.map(r => r.id === route.id ? { ...r, patternCount: Math.max(0, (r.patternCount || 0) - 1) } : r));
        api.delete(`/routes/${route.id}/patterns/${p.id}`)
          .then(() => toast.success(t('pages.routes.patterns.deleteSuccess')))
          .catch(err => {
            api.get(`/routes/${route.id}/patterns`)
              .then(r => setPatternsCache(c => ({ ...c, [route.id]: r.data || [] })))
              .catch(() => {});
            load();
            toast.error(err.response?.data?.message || t('pages.routes.errorTitle'));
          });
      },
    });
  };

  // Sprint 1: modal com mapa do padrão (trajetória + paragens).
  // patternModal guarda o padrão clicado (id, directionId, name) + a rota-pai
  // (code, color) para o titulo e a cor da linha. mapDivRef aponta para o
  // container do mapa; patternMapRef guarda a instancia Leaflet para destruir
  // ao fechar.
  const [patternModal, setPatternModal] = useState(null);
  const mapDivRef = useRef(null);
  const patternMapRef = useRef(null);

  const openPatternMap = (pattern, route) => {
    setPatternModal({ pattern, route });
  };
  const closePatternMap = () => setPatternModal(null);

  const load = () => {
    api.get('/routes').then(r => setRoutes(r.data || [])).catch(() => setRoutes([]));
    api.get('/stops').then(r => setAllStops(r.data || [])).catch(() => setAllStops([]));
    // Sprint 1 (F0): carregar operadores para popular o filtro
    api.get('/operators').then(r => setOperatorsList(r.data || [])).catch(() => setOperatorsList([]));
  };

  useEffect(load, []);

  const resetForm = () => {
    setForm({ name: '', code: '', color: '', operatorId: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Sprint 2 (redesign): editar Linha = so' identidade (nome, codigo, cor).
    // As paragens vivem nos Padroes (JourneyPattern), nao na Linha.
    const payload = editing
      ? {
          ...(form.name ? { name: form.name } : {}),
          ...(form.code ? { code: form.code } : {}),
          ...(form.color ? { color: form.color } : {}),
          ...(form.operatorId ? { operatorId: Number(form.operatorId) } : {}),
        }
      : {
          name: form.name,
          code: form.code,
          // Cor por defeito (azul TUB) se o utilizador nao mexer no seletor —
          // antes ficava null e a coluna nao mostrava cor ate' editar.
          color: form.color || '#009BDB',
          operatorId: form.operatorId ? Number(form.operatorId) : null,
        };

    const req = editing
      ? api.patch(`/routes/${editing}`, payload)
      : api.post('/routes', payload);

    req.then(() => {
      resetForm();
      load();
      showModalMsg({ type: 'success', title: t('pages.routes.successTitle'), message: editing ? t('pages.routes.successUpdated') : t('pages.routes.successCreated') });
    }).catch(err => {
      showModalMsg({ type: 'danger', title: t('pages.routes.errorTitle'), message: err.response?.data?.message || err.message });
    });
  };

  const startEdit = (route) => {
    setForm({ name: route.name, code: route.code, color: route.color || '', operatorId: route.operatorId || '' });
    setEditing(route.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id) => {
    showModalMsg({
      type: 'danger',
      title: t('pages.routes.deleteTitle'),
      message: t('pages.routes.deleteMessage'),
      confirmText: t('pages.routes.deleteConfirm'),
      onConfirm: () => {
        closeModal();
        // Otimista: tira a linha da lista logo (resposta instantanea); o delete
        // corre em fundo. Se falhar, recarrega para reverter ao estado real.
        setRoutes(prev => prev.filter(r => r.id !== id));
        api.delete(`/routes/${id}`)
          .then(() => toast.success(t('pages.routes.deleteSuccess')))
          .catch(err => {
            load();
            toast.error(err.response?.data?.message || t('pages.routes.errorTitle'));
          });
      },
    });
  };

  const filtered = routes.filter(r => {
    // Sprint 1 (F0): filtrar por operador
    if (operatorFilter && operatorFilter !== 'all') {
      if (r.operatorCode !== operatorFilter) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q);
  });

  // Sprint 0 (F4 follow-up): infinite scroll, igual ao Stops.jsx.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, operatorFilter, routes.length]);

  useEffect(() => {
    if (visibleCount >= filtered.length) return;
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
      }
    }, { rootMargin: '300px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount]);

  const visible = filtered.slice(0, visibleCount);

  // Sprint 1: inicializa o mapa Leaflet quando o modal do padrão abre.
  // Keyed no id do padrão: re-corre se o utilizador abrir outro padrão sem
  // fechar o modal pelo meio. Desenha a trajetória (geometry) na cor da rota
  // e as paragens (resolvidas via allStops, que so' trazem stopId no endpoint
  // /stops do padrao). Destroi o mapa no cleanup para evitar leaks/re-init.
  const patternId = patternModal?.pattern?.id;
  useEffect(() => {
    if (!patternId || !mapDivRef.current) return undefined;

    const routeColor = patternModal.route?.color || '#009BDB';

    // Lookup {stopId: [lat, lon]} a partir das paragens ja' carregadas na
    // pagina (GET /stops). O endpoint /patterns/{id}/stops nao traz coords.
    const coordsById = {};
    allStops.forEach(s => {
      if (s.latitude != null && s.longitude != null) {
        coordsById[s.id] = [s.latitude, s.longitude];
      }
    });

    const map = L.map(mapDivRef.current, { zoomControl: true });
    patternMapRef.current = map;
    map.setView([41.5454, -8.4265], 12); // Braga — fallback ate' ao fitBounds

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Gotcha: o container tem tamanho 0 enquanto o modal nao esta' visivel.
    // invalidateSize apos montar garante que os tiles renderizam bem.
    const sizeTimer = setTimeout(() => map.invalidateSize(), 100);

    let cancelled = false;

    api.get(`/patterns/${patternId}/geometry`)
      .then(({ data }) => {
        if (cancelled) return;
        const points = data?.points || [];
        if (points.length >= 2) {
          const polyline = L.polyline(points, { color: routeColor, weight: 5, opacity: 0.9 }).addTo(map);
          const bounds = polyline.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
        }
        // Paragens: circleMarker por paragem com coords resolvidas. Skip se sem coords.
        api.get(`/patterns/${patternId}/stops`)
          .then(({ data: stopsData }) => {
            if (cancelled) return;
            (stopsData || []).forEach(s => {
              const coords = coordsById[s.stopId];
              if (!coords) return;
              L.circleMarker(coords, {
                radius: 4, color: '#fff', weight: 2, fillColor: routeColor, fillOpacity: 1,
              })
                .bindTooltip(s.stopName, { direction: 'top' })
                .addTo(map);
            });
          })
          .catch(() => { /* paragens sao opcionais para o desenho */ });
      })
      .catch(() => { /* sem geometria: o mapa fica no fallback de Braga */ });

    return () => {
      cancelled = true;
      clearTimeout(sizeTimer);
      map.remove();
      patternMapRef.current = null;
    };
  }, [patternId, patternModal, allStops]);

  return (
    <div>
      <Modal
        open={modal.open}
        onClose={closeModal}
        onConfirm={modal.onConfirm}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        confirmText={modal.confirmText}
      />

      {/* Sprint 1: modal com mapa do padrão (trajetória + paragens). */}
      <Modal open={!!patternModal} onClose={closePatternMap}>
        {patternModal && (
          <div className="pattern-map-modal">
            <div className="pattern-map-modal-header">
              <h3 className="modal-title pattern-map-modal-title">
                <code style={{ color: patternModal.route?.color || 'var(--color-primary)' }}>
                  {patternModal.route?.code}
                </code>
                <span className={`route-pattern-dir route-pattern-dir--${patternModal.pattern?.directionId === 1 ? 'inbound' : 'outbound'}`}>
                  {patternModal.pattern?.directionId === 1 ? t('pages.schedules.inbound') : t('pages.schedules.outbound')}
                </span>
                {patternModal.pattern?.name && (
                  <span className="pattern-map-modal-name">{patternModal.pattern.name}</span>
                )}
              </h3>
              <button
                type="button"
                className="pattern-map-modal-close"
                onClick={closePatternMap}
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                &#10005;
              </button>
            </div>
            <div ref={mapDivRef} className="pattern-map-canvas" />
          </div>
        )}
      </Modal>

      <div className="page-header">
        <div>
          <h1>{t('pages.routes.title')}</h1>
          <p className="page-subtitle">{t('pages.routes.registered', { count: routes.length })}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Sprint 1 (F1): export GeoJSON (R.BO.01) — aberto a qualquer
              utilizador autenticado (na pratica o endpoint e' permitAll,
              mas escondemos o botao no UI fora de admin para nao poluir). */}
          {isAdmin && (
            <a
              href="/api/v1/routes/export.geojson"
              className="btn btn-secondary"
              download="pgu-routes.geojson"
              title={t('pages.routes.exportGeoJsonTitle')}
            >
              {t('pages.routes.exportGeoJson')}
            </a>
          )}
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
              {t('pages.routes.newButton')}
            </button>
          )}
        </div>
      </div>

      <div
        className="bus-toolbar routes-toolbar"
        style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'nowrap' }}
      >
        <div className="search-bar" style={{ flex: '1 1 auto', minWidth: 0, maxWidth: 340 }}>
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            placeholder={t('pages.routes.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {/* Sprint 1 (F0): filtro por operador (R.IVT.03) */}
        {operatorsList.length > 0 && (
          <div
            className="routes-operator-filter"
            style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
          >
            <label htmlFor="route-operator-filter" className="user-filter-label">
              {t('pages.routes.filterOperatorLabel')}
            </label>
            <select
              id="route-operator-filter"
              value={operatorFilter}
              onChange={e => setOperatorFilter(e.target.value)}
              className="routes-operator-select"
              style={{ maxWidth: 160 }}
            >
              <option value="all">{t('pages.routes.filterOperatorAll')}</option>
              {operatorsList.map(op => (
                <option key={op.id} value={op.code} title={op.name}>
                  {op.code}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {showForm && (
        <div className="form-overlay">
          <form className="form-card" onSubmit={handleSubmit}>
            <h3>{editing ? t('pages.routes.edit') : t('pages.routes.create')}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('pages.routes.fieldName')}</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required={!editing} />
              </div>
              <div className="form-group">
                <label>{t('pages.routes.fieldCode')}</label>
                <input value={form.code} onChange={e => setForm({...form, code: e.target.value})} required={!editing} />
              </div>
              <div className="form-group">
                <label>{t('pages.routes.fieldColor')}</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={form.color || '#009BDB'}
                    onChange={e => setForm({...form, color: e.target.value})}
                    style={{ width: '44px', height: '40px', padding: '2px', cursor: 'pointer', borderRadius: '8px', border: '1.5px solid var(--color-border)' }}
                  />
                  <input value={form.color} onChange={e => setForm({...form, color: e.target.value})} placeholder="#009BDB" style={{ flex: 1 }} />
                </div>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>{t('pages.routes.fieldOperator')}</label>
                <select value={form.operatorId} onChange={e => setForm({...form, operatorId: e.target.value})}>
                  <option value="">{t('pages.routes.noOperator')}</option>
                  {operatorsList.map(op => (
                    <option key={op.id} value={op.id}>{op.code} - {op.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">{editing ? t('pages.routes.save') : t('common.create')}</button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>{t('pages.routes.cancel')}</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '44px' }} aria-hidden="true"></th>
              <th style={{ width: '70px' }}>{t('pages.routes.headers.id')}</th>
              <th style={{ width: '110px' }}>{t('pages.routes.headers.code')}</th>
              <th>{t('pages.routes.headers.name')}</th>
              <th style={{ width: '110px' }}>{t('pages.routes.headers.operator')}</th>
              <th style={{ width: '130px' }}>{t('pages.routes.headers.color')}</th>
              <th style={{ width: '110px' }}>{t('pages.routes.headers.patterns')}</th>
              <th style={{ width: '300px' }}>{t('pages.routes.headers.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(route => {
              const isExpanded = expandedId === route.id;
              const patterns = patternsCache[route.id];
              const loadState = patternsState[route.id];
              return (
              <Fragment key={route.id}>
              <tr className={isExpanded ? 'route-row--expanded' : ''}>
                <td className="route-expand-cell">
                  <button
                    type="button"
                    className={`route-expand-btn ${isExpanded ? 'route-expand-btn--open' : ''}`}
                    onClick={() => togglePatterns(route.id)}
                    aria-expanded={isExpanded}
                    title={isExpanded ? t('pages.routes.patterns.hide') : t('pages.routes.patterns.show')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </td>
                <td><span className="count-badge">{route.id}</span></td>
                <td><code style={{ fontSize: 13, fontWeight: 700, color: route.color || 'var(--color-primary)' }}>{route.code}</code></td>
                <td><strong>{route.name}</strong></td>
                <td>
                  {route.operatorCode ? (
                    <span className="count-badge" title={route.operatorName || route.operatorCode}>
                      {route.operatorCode}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-light)' }}>—</span>
                  )}
                </td>
                <td>
                  {route.color && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span className="color-dot" style={{ background: route.color }}></span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{route.color}</span>
                    </span>
                  )}
                </td>
                <td><span className="count-badge">{route.patternCount ?? 0}</span></td>
                <td className="actions">
                  {isAdmin && (
                    <>
                      <button className="btn btn-sm" onClick={() => startEdit(route)}>{t('common.edit')}</button>
                      <button className="btn btn-sm" onClick={() => navigate(`/backoffice/routes/${route.id}/patterns/new`)}>{t('pages.routes.addPattern')}</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(route.id)}>{t('common.delete')}</button>
                    </>
                  )}
                </td>
              </tr>
              {isExpanded && (
                <tr className="route-patterns-row">
                  <td colSpan="8" className="route-patterns-cell">
                    <div className="route-patterns-panel">
                      <span className="route-patterns-title">{t('pages.routes.patterns.title')}</span>
                      {loadState === 'loading' && (
                        <div className="route-patterns-msg">{t('pages.routes.patterns.loading')}</div>
                      )}
                      {loadState === 'error' && (
                        <div className="route-patterns-msg route-patterns-msg--error">{t('pages.routes.patterns.loadError')}</div>
                      )}
                      {!loadState && patterns && patterns.length === 0 && (
                        <div className="route-patterns-msg">{t('pages.routes.patterns.empty')}</div>
                      )}
                      {!loadState && patterns && patterns.length > 0 && (
                        <ul className="route-patterns-list">
                          {patterns.map(p => (
                            <li
                              key={p.id}
                              className="route-pattern-item route-pattern-item--clickable"
                              role="button"
                              tabIndex={0}
                              onClick={() => openPatternMap(p, route)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPatternMap(p, route); } }}
                              title={t('pages.routes.patterns.viewMap', 'Ver trajeto no mapa')}
                            >
                              <span className={`route-pattern-dir route-pattern-dir--${p.directionId === 1 ? 'inbound' : 'outbound'}`}>
                                {p.directionId === 1 ? t('pages.schedules.inbound') : t('pages.schedules.outbound')}
                              </span>
                              {p.name && <span className="route-pattern-name">{p.name}</span>}
                              <span className="route-pattern-meta">{t('pages.routes.patterns.stopCount', { count: p.stopCount ?? 0 })}</span>
                              <span className="route-pattern-sep" aria-hidden="true">·</span>
                              <span className="route-pattern-meta">{t('pages.routes.patterns.tripCount', { count: p.tripCount ?? 0 })}</span>
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="route-pattern-edit"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/backoffice/routes/${route.id}/patterns/${p.id}/edit`); }}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  title={t('common.edit')}
                                  aria-label={t('common.edit')}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                  </svg>
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="route-pattern-delete"
                                  onClick={(e) => { e.stopPropagation(); handlePatternDelete(route, p); }}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  title={t('common.delete')}
                                  aria-label={t('common.delete')}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M3 6h18" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              )}
                              <svg className="route-pattern-map-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                                <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
                              </svg>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
            {visibleCount < filtered.length && (
              <tr ref={loaderRef}>
                <td colSpan="8" className="empty" style={{ padding: '14px', color: 'var(--color-text-light)' }}>
                  {t('pages.routes.loadingMore', { current: visibleCount, total: filtered.length })}
                </td>
              </tr>
            )}
            {filtered.length === 0 && (
              <tr><td colSpan="8" className="empty">
                {search ? t('pages.routes.notFound') : t('pages.routes.noRoutes')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
