import { useMemo } from 'react';
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
  const busList = useMemo(() =>
    Object.values(buses)
      .filter(bus => {
        const backend = backendBuses[bus.busId];
        return backend && backend.status !== 'STOPPED';
      })
      .map(bus => {
        const backend = backendBuses[bus.busId];
        const displayStatus = getBusDisplayStatus(backend?.status, bus.status);
        return { ...bus, displayStatus, backend };
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

  const activeBusCount = useMemo(() =>
    busList.filter(b => b.displayStatus !== 'deactivated').length,
    [busList]
  );

  const totalPassengers = useMemo(() =>
    busList.reduce((sum, b) => sum + (b.passengers ?? 0), 0),
    [busList]
  );

  const filteredBusList = useMemo(() =>
    busSearch
      ? busList.filter(bus => {
          const q = busSearch.toLowerCase();
          const backend = backendBuses[bus.busId];
          const route = backend?.routeId ? routes.find(r => r.id === backend.routeId) : null;
          return bus.busId.toLowerCase().includes(q)
            || (route?.name?.toLowerCase().includes(q))
            || (route?.code?.toLowerCase().includes(q));
        })
      : busList,
    [busList, busSearch, backendBuses, routes]
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
      const backend = backendBuses[bus.busId];
      const route = backend?.routeId ? routes.find(r => r.id === backend.routeId) : null;
      const key = route ? route.id : 'unassigned';
      if (!groups[key]) {
        groups[key] = {
          route,
          routeName: route ? route.name : 'Sem Rota',
          routeCode: route ? route.code : '—',
          routeColor: route ? (route.color || '#6366f1') : '#94a3b8',
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
  }, [filteredBusList, backendBuses, routes, busSort]);

  return (
    <>
      <div className="livemap-stats">
        <div className="livemap-stat">
          <div className="livemap-stat-value">{activeBusCount}</div>
          <div className="livemap-stat-label">Ativos</div>
        </div>
        <div className="livemap-stat">
          <div className="livemap-stat-value">{activeRouteIds.size}</div>
          <div className="livemap-stat-label">Rotas Ativas</div>
        </div>
        <div className="livemap-stat">
          <div className="livemap-stat-value">{totalPassengers}</div>
          <div className="livemap-stat-label">Passageiros</div>
        </div>
      </div>

      <div className="livemap-toolbar">
        <div className="livemap-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input
            type="text"
            placeholder="Pesquisar autocarro..."
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
          <option value="route">Por Rota</option>
          <option value="name">Por Codigo</option>
          <option value="passengers">Por Passageiros</option>
          <option value="speed">Por Velocidade</option>
        </select>
      </div>

      {filteredBusList.length === 0 ? (
        <div className="livemap-empty">
          {busSearch ? 'Nenhum resultado encontrado' : 'Nenhum autocarro ativo'}
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
