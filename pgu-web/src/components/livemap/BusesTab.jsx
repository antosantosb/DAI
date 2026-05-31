import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import BusCard from './BusCard';
import { getBusDisplayStatus } from './constants';

export default function BusesTab({
  buses,
  backendBuses,
  routes,
  selectedBus,
  onBusClick,
  busSearch,
  setBusSearch,
  busSort,
  setBusSort,
}) {
  const { t } = useTranslation();
  // Fonte primaria: backendBuses (autocarros em operacao no backend, mesmo
  // antes da 1a telemetria chegar). Telemetria, quando existe, enriquece
  // o card com speed/passengers/nextStop. Antes filtravamos por
  // Object.values(buses) (so' buses ja' a publicar), o que dava 0 Ativos
  // enquanto o simulador resolvia a polyline da pattern.
  const busList = useMemo(() => {
    const ACTIVE_STATES = new Set(['STARTING', 'EM_SERVICO', 'STOPPING']);
    return Object.values(backendBuses)
      .filter(b => ACTIVE_STATES.has(b.status))
      .map(backend => {
        const tel = buses[backend.busCode] || {};
        const displayStatus = getBusDisplayStatus(backend.status, tel.status);
        return {
          // shape compativel com BusCard/popup: prefere campos da telemetria
          // quando existem (lat/lon/speed/passengers); fallback aos do backend.
          busId: backend.busCode,
          latitude: tel.latitude,
          longitude: tel.longitude,
          speed: tel.speed,
          passengers: tel.passengers,
          nextStop: tel.nextStop,
          stopsRemaining: tel.stopsRemaining,
          status: tel.status,
          timestamp: tel.timestamp,
          // metadata derivada
          displayStatus,
          backend,
        };
      });
  }, [buses, backendBuses]);

  // Modelo Transmodel: routeId no Bus e' sempre null. A linha actual vem
  // de `currentRouteCode` (derivada da duty RUNNING/PLANNED).
  const activeRouteIds = useMemo(() =>
    new Set(
      busList
        .filter(b => b.displayStatus !== 'deactivated')
        .map(b => b.backend?.currentRouteCode || b.backend?.routeId)
        .filter(Boolean)
    ),
    [busList]
  );

  const activeBusCount = useMemo(() =>
    busList.filter(b => b.displayStatus !== 'deactivated').length,
    [busList]
  );

  const filteredBusList = useMemo(() =>
    busSearch
      ? busList.filter(bus => {
          const q = busSearch.toLowerCase();
          const backend = bus.backend;
          // Modelo Transmodel: routeId pode ser null; usa o currentRouteCode
          // como chave de pesquisa primaria.
          const routeCode = backend?.currentRouteCode;
          const routeName = backend?.currentRouteName;
          const fallbackRoute = backend?.routeId ? routes.find(r => r.id === backend.routeId) : null;
          return bus.busId.toLowerCase().includes(q)
            || (routeCode?.toLowerCase().includes(q))
            || (routeName?.toLowerCase().includes(q))
            || (fallbackRoute?.name?.toLowerCase().includes(q))
            || (fallbackRoute?.code?.toLowerCase().includes(q));
        })
      : busList,
    [busList, busSearch, routes]
  );

  const sortedBusList = useMemo(() =>
    [...filteredBusList].sort((a, b) => {
      if (busSort === 'name') return a.busId.localeCompare(b.busId);
      if (busSort === 'passengers') return (b.passengers ?? 0) - (a.passengers ?? 0);
      if (busSort === 'speed') return (b.speed ?? 0) - (a.speed ?? 0);
      return 0;
    }),
    [filteredBusList, busSort]
  );

  const filteredGroupedByRoute = useMemo(() => {
    if (busSort !== 'route') return null;
    const groups = {};
    filteredBusList.forEach(bus => {
      const backend = bus.backend;
      // Modelo Transmodel: agrupa pelo currentRouteCode (linha actual da
      // duty RUNNING) em vez do routeId fixo. Fallback ao route por id
      // se ainda houver buses legados com routeId.
      const code = backend?.currentRouteCode;
      const fallbackRoute = backend?.routeId ? routes.find(r => r.id === backend.routeId) : null;
      const key = code || (fallbackRoute ? fallbackRoute.id : 'unassigned');
      if (!groups[key]) {
        const route = code
          ? { id: code, code, name: backend?.currentRouteName || code, color: '#009BDB' }
          : fallbackRoute;
        groups[key] = {
          route,
          routeName: route ? route.name : t('livemap.noRouteFallback'),
          routeCode: route ? route.code : '—',
          routeColor: route ? (route.color || '#009BDB') : '#94a3b8',
          buses: [],
        };
      }
      groups[key].buses.push(bus);
    });
    return Object.values(groups).sort((a, b) => {
      if (a.route && !b.route) return -1;
      if (!a.route && b.route) return 1;
      return a.routeName.localeCompare(b.routeName);
    });
  }, [filteredBusList, routes, busSort, t]);

  const checkIfOnline = (bus) => {
    if (!bus.timestamp) return false;
    const lastTime = new Date(bus.timestamp).getTime();
    const now = Date.now();
    return (now - lastTime) < 30000; // 30s online check latency
  };

  return (
    <>
      <div className="livemap-stats">
        <div className="livemap-stat">
          <div className="livemap-stat-value">{activeBusCount}</div>
          <div className="livemap-stat-label">{t('livemap.statsActives')}</div>
        </div>
        <div className="livemap-stat">
          <div className="livemap-stat-value">{activeRouteIds.size}</div>
          <div className="livemap-stat-label">{t('livemap.statsActiveRoutes')}</div>
        </div>
      </div>

      <div className="livemap-toolbar">
        <div className="livemap-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input
            type="text"
            placeholder={t('livemap.searchBus')}
            value={busSearch}
            onChange={e => setBusSearch(e.target.value)}
          />
          {busSearch && (
            <button className="livemap-search-clear" onClick={() => setBusSearch('')}>&times;</button>
          )}
        </div>
        <select
          className="livemap-sort"
          value={busSort}
          onChange={e => setBusSort(e.target.value)}
        >
          <option value="route">{t('livemap.filterByRoute')}</option>
          <option value="name">{t('livemap.filterByCode')}</option>
          <option value="passengers">{t('livemap.filterByPassengers')}</option>
          <option value="speed">{t('livemap.filterBySpeed')}</option>
        </select>
      </div>

      {filteredBusList.length === 0 ? (
        <div className="livemap-empty">
          {busSearch ? t('livemap.noResultsFound') : t('livemap.noActiveBus')}
        </div>
      ) : busSort === 'route' && filteredGroupedByRoute ? (
        <div className="livemap-bus-groups">
          {filteredGroupedByRoute.map(group => (
            <div key={group.routeName} className="livemap-bus-group">
              <div className="livemap-bus-group-header">
                <div className="livemap-route-color" style={{ background: group.routeColor }} />
                <span className="livemap-bus-group-name">{group.routeName}</span>
                <span className="livemap-bus-group-code">{group.routeCode}</span>
                <span className="livemap-bus-group-count">{group.buses.length}</span>
              </div>
              <div className="livemap-bus-list">
                {group.buses.map(bus => (
                  <BusCard
                    key={bus.busId}
                    bus={bus}
                    isSelected={selectedBus === bus.busId}
                    onClick={() => onBusClick(bus)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="livemap-bus-list">
          {sortedBusList.map(bus => (
            <BusCard
              key={bus.busId}
              bus={bus}
              isSelected={selectedBus === bus.busId}
              onClick={() => onBusClick(bus)}
            />
          ))}
        </div>
      )}
    </>
  );
}
