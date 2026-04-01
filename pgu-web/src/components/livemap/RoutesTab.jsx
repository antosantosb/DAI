import { useMemo } from 'react';
import { getBusDisplayStatus } from './constants';

// Sort numérico natural: L2 < L10 < L11
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export default function RoutesTab({
  routes,
  stops,
  buses,
  backendBuses,
  selectedRoute,
  onRouteClick,
  routeSearch,
  setRouteSearch,
  routeSort,
  setRouteSort,
}) {
  const busList = useMemo(() =>
    Object.values(buses).map(bus => {
      const backend = backendBuses[bus.busId];
      const displayStatus = getBusDisplayStatus(backend?.status, bus.status);
      return { ...bus, displayStatus };
    }),
    [buses, backendBuses]
  );

  const activeRouteIds = useMemo(() =>
    new Set(
      busList
        .filter(b => b.displayStatus !== 'deactivated')
        .map(b => backendBuses[b.busId]?.routeId)
        .filter(Boolean)
    ),
    [busList, backendBuses]
  );

  const filteredRoutes = useMemo(() => {
    let list = routes;
    if (routeSearch) {
      const q = routeSearch.toLowerCase();
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      // Rotas com autocarros ativos vêm sempre primeiro
      const aActive = activeRouteIds.has(a.id);
      const bActive = activeRouteIds.has(b.id);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      // Dentro de cada grupo, aplicar o sort escolhido
      if (routeSort === 'name') return a.name.localeCompare(b.name);
      if (routeSort === 'code') return naturalCompare(a.code, b.code);
      if (routeSort === 'stops') return (b.stops?.length || 0) - (a.stops?.length || 0);
      return a.name.localeCompare(b.name);
    });
  }, [routes, routeSearch, routeSort, activeRouteIds]);

  return (
    <>
      <div className="livemap-stats">
        <div className="livemap-stat">
          <div className="livemap-stat-value">{routes.length}</div>
          <div className="livemap-stat-label">Total Rotas</div>
        </div>
        <div className="livemap-stat">
          <div className="livemap-stat-value">{stops.length}</div>
          <div className="livemap-stat-label">Total Paragens</div>
        </div>
      </div>

      <div className="livemap-toolbar">
        <div className="livemap-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input
            type="text"
            placeholder="Pesquisar rota..."
            value={routeSearch}
            onChange={e => setRouteSearch(e.target.value)}
          />
          {routeSearch && (
            <button className="livemap-search-clear" onClick={() => setRouteSearch('')}>&times;</button>
          )}
        </div>
        <select
          className="livemap-sort"
          value={routeSort}
          onChange={e => setRouteSort(e.target.value)}
        >
          <option value="name">Por Nome</option>
          <option value="code">Por Codigo</option>
          <option value="stops">Por Paragens</option>
        </select>
      </div>

      {filteredRoutes.length === 0 ? (
        <div className="livemap-empty">
          {routeSearch ? 'Nenhum resultado encontrado' : 'Nenhuma rota registada'}
        </div>
      ) : (
        <div className="livemap-route-list">
          {filteredRoutes.map(route => {
            const isActive = activeRouteIds.has(route.id);
            const busCount = busList.filter(b => backendBuses[b.busId]?.routeId === route.id && b.displayStatus !== 'deactivated').length;
            return (
              <div
                key={route.id}
                className={`livemap-route-item ${selectedRoute === route.id ? 'selected' : ''} ${!isActive ? 'inactive' : ''}`}
                onClick={() => onRouteClick(route.id)}
              >
                <div className="livemap-route-color" style={{ background: route.color || '#6366f1' }} />
                <div className="livemap-route-info">
                  <span className="livemap-route-name">{route.name}</span>
                  <span className="livemap-route-code">{route.code}</span>
                </div>
                <div className="livemap-route-meta">
                  {isActive && <span className="livemap-route-bus-count">{busCount} bus</span>}
                  {!isActive && <span className="livemap-route-no-service">Sem servico</span>}
                  <span className="livemap-route-stops">{route.stops?.length || 0} paragens</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedRoute && (
        <button className="livemap-btn-reset" onClick={() => onRouteClick(null)}>
          Mostrar Todas as Rotas
        </button>
      )}
    </>
  );
}
