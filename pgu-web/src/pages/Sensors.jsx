// Sprint 2 (refactor): inventario de MAIN SENSORS (gateways de telematica a
// bordo). 1 main sensor por autocarro; cada sensor esta LIVRE (sem autocarro)
// ou ATRIBUIDO a um. Agrega sub-sensores (rpm, bateria, km, passageiros, gps)
// com saude 0..1 no campo subsensorHealth.
//
// IMPORTANTE: subsensorHealth fica null/vazio ate a Fase C (telemetria) estar
// feita. A UI trata esse null com um empty state claro ("Aguarda telemetria").
//
// Backend (base /api/v1/sensors; roles admin/funcionario/developer):
//   GET    /                -> todos (ou so livres com ?free=true)
//   GET    /{id}            -> detalhe
//   POST   /                -> criar
//   PUT    /{id}/assign     -> atribui a autocarro (body { busId })
//   PUT    /{id}/unassign   -> liberta
//   DELETE /{id}            -> remover
//
// VehicleSensorDTO: id, gateway, busId, busCode, status, subsensorHealth,
// lastReadingAt, createdAt, updatedAt. Os campos legados do antigo sensor de
// porta (doorPosition, latitude, longitude, lastReading) NAO sao mostrados.
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import Modal from '../components/Modal';
import './Sensors.css';

// Estado -> classe do badge. Tolerante a maiusculas/minusculas e a valores
// desconhecidos (cai em "unknown"). O estado e' DERIVADO no backend (atribuicao
// + estado do autocarro + saude dos sub-sensores); deixou de ser editavel.
function statusKey(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'ATIVO') return 'ativo';
  if (s === 'INATIVO') return 'inativo';
  if (s === 'AVARIA') return 'avaria';
  if (s === 'DISPONIVEL' || s === 'AVAILABLE') return 'disponivel';
  return 'desconhecido';
}

// Ordem canonica dos sub-sensores no breakdown de saude.
const SUBSENSOR_ORDER = ['rpm', 'bateria', 'km', 'passageiros', 'gps'];

// Verde >=0.8, ambar 0.4-0.8, vermelho <0.4.
function healthKey(value) {
  if (value == null || Number.isNaN(value)) return 'none';
  if (value >= 0.8) return 'good';
  if (value >= 0.4) return 'warn';
  return 'bad';
}

// Normaliza uma entrada do subsensorHealth para um numero 0..1, ou null.
// Forma canonica: { value, health } (value=leitura crua, health=saude 0..1).
// Em entradas com health explicito, usa health. So' cai em value se NAO houver
// health E a entrada nao parecer trazer leituras cruas (i.e. forma legada
// degenerada onde "value" foi guardada como saude direta 0..1).
function readHealth(entry) {
  if (entry == null) return null;
  if (typeof entry === 'number') return entry;
  if (typeof entry !== 'object') return null;
  if (typeof entry.health === 'number') return entry.health;
  // Compat legada: { value: 0..1 } sem outros campos -> trata value como saude.
  if (typeof entry.value === 'number' && Object.keys(entry).length === 1) {
    return entry.value;
  }
  return null;
}

// Formata o numero pt-PT/en com separador de milhares. Se invalido devolve null.
function fmtNumber(n, locale) {
  if (n == null || Number.isNaN(Number(n))) return null;
  try {
    return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'pt-PT').format(Number(n));
  } catch {
    return String(n);
  }
}

// Devolve um node React (ou null) com o valor formatado do sub-sensor
// consoante a chave. "passageiros" devolve uma string compacta com
// onboard/boarded/alighted; gps nao tem valor (so' saude).
function renderSubsensorValue(key, entry, t, locale) {
  if (entry == null || typeof entry !== 'object') return null;
  switch (key) {
    case 'rpm': {
      const v = fmtNumber(entry.value, locale);
      return v != null ? t('pages.sensors.unitRpm', { value: v }) : null;
    }
    case 'bateria': {
      const v = fmtNumber(entry.value, locale);
      return v != null ? t('pages.sensors.unitBattery', { value: v }) : null;
    }
    case 'km': {
      const v = fmtNumber(entry.value, locale);
      return v != null ? t('pages.sensors.unitKm', { value: v }) : null;
    }
    case 'passageiros': {
      const onboard = entry.onboard;
      const boarded = entry.boarded;
      const alighted = entry.alighted;
      const hasAny = [onboard, boarded, alighted].some(v => v != null && !Number.isNaN(Number(v)));
      if (!hasAny) return null;
      const ob = onboard != null ? fmtNumber(onboard, locale) : '—';
      const bo = boarded != null ? fmtNumber(boarded, locale) : '—';
      const al = alighted != null ? fmtNumber(alighted, locale) : '—';
      return `${t('pages.sensors.paxOnboard', { value: ob })} · ${t('pages.sensors.paxBoarded', { value: bo })} · ${t('pages.sensors.paxAlighted', { value: al })}`;
    }
    case 'gps':
    default:
      return null;
  }
}

export default function Sensors() {
  const { t, i18n } = useTranslation();
  const { hasRole } = useAuth();
  // Mutacoes permitidas a admin/funcionario/developer (alinhado com a rota).
  const canEdit = hasRole('admin') || hasRole('funcionario') || hasRole('developer');

  const [sensors, setSensors] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  // Pre-preenche a pesquisa a partir de ?q= no URL. Permite que outros ecras
  // (ex.: painel de detalhe do autocarro no livemap) abram esta pagina ja' a
  // focar um sensor especifico pelo gateway. Aditivo: sem ?q= comporta-se na boa.
  const [search, setSearch] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') || '';
  });
  const [filter, setFilter] = useState('all'); // all | assigned | free

  const [selected, setSelected] = useState(null); // sensor do painel de detalhe
  const [form, setForm] = useState(null);         // null = fechado; objeto = aberto
  const [assignFor, setAssignFor] = useState(null); // sensor a atribuir (modal)
  const [assignSearch, setAssignSearch] = useState('');
  const [modal, setModal] = useState({ open: false });

  const showModal = (opts) => setModal({ open: true, ...opts });
  const closeModal = () => setModal({ open: false });

  const load = useCallback(() => {
    api.get('/sensors')
      // 204 No Content -> r.data === '' (axios). Normaliza para [].
      .then(r => setSensors(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSensors([]))
      .finally(() => setLoading(false));
    api.get('/buses')
      .then(r => setBuses(Array.isArray(r.data) ? r.data : []))
      .catch(() => setBuses([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Formato relativo da ultima leitura; "Nunca" se ausente.
  const fmtRelative = useCallback((iso) => {
    if (!iso) return t('pages.sensors.never');
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return t('pages.sensors.never');
    const diffMs = Date.now() - d.getTime();
    const sec = Math.round(diffMs / 1000);
    if (sec < 60) return t('pages.sensors.relNow');
    const min = Math.round(sec / 60);
    if (min < 60) return t('pages.sensors.relMin', { count: min });
    const hr = Math.round(min / 60);
    if (hr < 24) return t('pages.sensors.relHour', { count: hr });
    const day = Math.round(hr / 24);
    if (day < 30) return t('pages.sensors.relDay', { count: day });
    return d.toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }, [t, i18n.language]);

  // Resumo curto da saude para a coluna da tabela.
  // null/vazio -> "Sem dados"; senao "OK" ou "N em falha".
  const healthSummary = useCallback((sensor) => {
    const sh = sensor.subsensorHealth;
    if (!sh || typeof sh !== 'object' || Object.keys(sh).length === 0) {
      return { key: 'none', label: t('pages.sensors.healthNoData') };
    }
    let failing = 0;
    Object.values(sh).forEach(entry => {
      const h = readHealth(entry);
      if (h != null && h < 0.4) failing += 1;
    });
    if (failing === 0) return { key: 'good', label: t('pages.sensors.healthOk') };
    return { key: 'bad', label: t('pages.sensors.healthFailing', { count: failing }) };
  }, [t]);

  const counts = useMemo(() => ({
    all: sensors.length,
    assigned: sensors.filter(s => s.busId != null || s.busCode).length,
    free: sensors.filter(s => s.busId == null && !s.busCode).length,
  }), [sensors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sensors.filter(s => {
      const isFree = s.busId == null && !s.busCode;
      if (filter === 'assigned' && isFree) return false;
      if (filter === 'free' && !isFree) return false;
      if (!q) return true;
      return (
        (s.gateway || '').toLowerCase().includes(q) ||
        (s.busCode || '').toLowerCase().includes(q) ||
        (s.status || '').toLowerCase().includes(q)
      );
    });
  }, [sensors, search, filter]);

  // Autocarros sem main sensor (candidatos a atribuir). Um bus ja' coberto por
  // outro sensor nao deve aparecer na lista (e o backend devolveria 409).
  const busesWithSensor = useMemo(
    () => new Set(sensors.map(s => s.busId).filter(v => v != null)),
    [sensors],
  );
  const assignableBuses = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return buses
      // Descomissionados nao sao operacionais; excluidos sempre.
      .filter(b => b.status !== 'DECOMMISSIONED')
      .filter(b => !busesWithSensor.has(b.id))
      .filter(b => !q || (b.busCode || '').toLowerCase().includes(q) || (b.routeCode || '').toLowerCase().includes(q));
  }, [buses, busesWithSensor, assignSearch]);

  // ─── Criar / Editar ─────────────────────────────────────────────────────
  // O estado deixou de ser pedido no criar: e' derivado no backend. No editar,
  // se o sensor estiver LIVRE, permitimos um override manual restrito a
  // DISPONIVEL/AVARIA (todos os outros estados continuam 100% derivados).
  const startCreate = () => setForm({ id: null, gateway: '', isFree: true, status: 'DISPONIVEL' });
  const startEdit = (s) => {
    const isFree = s.busId == null && !s.busCode;
    const current = String(s.status || '').toUpperCase();
    const initialStatus = current === 'AVARIA' ? 'AVARIA' : 'DISPONIVEL';
    setForm({ id: s.id, gateway: s.gateway || '', isFree, status: initialStatus });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const gateway = form.gateway.trim();
    if (!gateway) return;
    const payload = { gateway };
    // So envia status quando estamos a editar um sensor livre (override manual
    // AVARIA <-> DISPONIVEL). Atribuido => status e' 100% derivado no backend.
    if (form.id && form.isFree && (form.status === 'AVARIA' || form.status === 'DISPONIVEL')) {
      payload.status = form.status;
    }
    const req = form.id
      ? api.put(`/sensors/${form.id}`, payload)
      : api.post('/sensors', payload);
    req
      .then(() => {
        setForm(null);
        load();
        toast.success(form.id
          ? t('pages.sensors.updatedToast', { gateway })
          : t('pages.sensors.createdToast', { gateway }));
      })
      .catch(err => showModal({
        type: 'danger',
        title: t('pages.sensors.errorTitle'),
        message: err.response?.data?.message || err.message,
      }));
  };

  // ─── Atribuir / Libertar ────────────────────────────────────────────────
  const handleAssign = (sensor, bus) => {
    api.put(`/sensors/${sensor.id}/assign`, { busId: bus.id })
      .then(() => {
        setAssignFor(null);
        setAssignSearch('');
        load();
        toast.success(t('pages.sensors.assignedToast', { gateway: sensor.gateway, bus: bus.busCode }));
      })
      .catch(err => {
        const status = err.response?.status;
        const serverMsg = err.response?.data?.message;
        // 409 = sensor ja atribuido, autocarro ja tem sensor, OU sensor em AVARIA.
        // Damos prioridade a mensagem do servidor (mais especifica) em todos os 409.
        const msg = status === 409
          ? (serverMsg || t('pages.sensors.assignConflict', { bus: bus.busCode }))
          : status === 404
            ? t('pages.sensors.assignNotFound')
            : (serverMsg || t('pages.sensors.assignFailed'));
        toast.error(msg);
      });
  };

  const handleUnassign = (sensor) => {
    showModal({
      type: 'warning',
      title: t('pages.sensors.unassignTitle'),
      message: t('pages.sensors.unassignMessage', { gateway: sensor.gateway, bus: sensor.busCode || '' }),
      confirmText: t('pages.sensors.unassignConfirm'),
      onConfirm: () => {
        closeModal();
        api.put(`/sensors/${sensor.id}/unassign`)
          .then(() => {
            load();
            // Mantem o painel aberto mas com o sensor atualizado (livre).
            setSelected(prev => prev && prev.id === sensor.id ? { ...prev, busId: null, busCode: null } : prev);
            toast.success(t('pages.sensors.unassignedToast', { gateway: sensor.gateway }));
          })
          .catch(err => toast.error(err.response?.data?.message || t('pages.sensors.unassignFailed')));
      },
    });
  };

  // ─── Remover ────────────────────────────────────────────────────────────
  const handleDelete = (sensor) => {
    showModal({
      type: 'danger',
      title: t('pages.sensors.deleteTitle'),
      message: t('pages.sensors.deleteMessage', { gateway: sensor.gateway }),
      confirmText: t('pages.sensors.deleteConfirm'),
      onConfirm: () => {
        closeModal();
        // Optimistic: remove da lista; rollback em erro.
        const prev = sensors;
        setSensors(prev.filter(x => x.id !== sensor.id));
        if (selected?.id === sensor.id) setSelected(null);
        api.delete(`/sensors/${sensor.id}`)
          .then(() => toast.success(t('pages.sensors.deletedToast', { gateway: sensor.gateway })))
          .catch(err => {
            setSensors(prev);
            toast.error(err.response?.data?.message || t('pages.sensors.deleteErrorToast'));
          });
      },
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('pages.sensors.title')}</h1>
          <p className="page-subtitle">{t('pages.sensors.subtitle')}</p>
        </div>
        {canEdit && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={startCreate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '6px', verticalAlign: '-3px' }}>
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('pages.sensors.newSensor')}
            </button>
          </div>
        )}
      </div>

      <div className="sensors-toolbar">
        <div className="search-bar">
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            placeholder={t('pages.sensors.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="sensor-filters">
          {[
            { key: 'all', label: t('pages.sensors.filterAll'), count: counts.all },
            { key: 'assigned', label: t('pages.sensors.filterAssigned'), count: counts.assigned },
            { key: 'free', label: t('pages.sensors.filterFree'), count: counts.free },
          ].map(f => (
            <button
              key={f.key}
              className={`btn btn-filter btn-filter--sm${filter === f.key ? ' btn-filter--active' : ''}`}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
            >
              {`${f.label} (${f.count})`}
            </button>
          ))}
        </div>
      </div>

      <div className="table-container">
        <table className="data-table sensors-table">
          <thead>
            <tr>
              <th>{t('pages.sensors.headers.gateway')}</th>
              <th>{t('pages.sensors.headers.status')}</th>
              <th>{t('pages.sensors.headers.bus')}</th>
              <th>{t('pages.sensors.headers.lastReading')}</th>
              <th>{t('pages.sensors.headers.health')}</th>
              {canEdit && <th className="col-actions">{t('pages.sensors.headers.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canEdit ? 6 : 5} className="empty">{t('pages.sensors.loading')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="empty">
                  {search || filter !== 'all' ? t('pages.sensors.noResults') : t('pages.sensors.noSensors')}
                </td>
              </tr>
            ) : (
              filtered.map(s => {
                const isFree = s.busId == null && !s.busCode;
                // Regra EXATA do motorista: so' bloqueia quando o sensor esta'
                // atribuido E o autocarro NAO esta' parado (STOPPED). Sensores
                // livres, ou atribuidos a um bus parado, ficam funcionais.
                const busStopped = s.busStatus === 'STOPPED';
                const locked = !isFree && !busStopped;
                // Sensor livre marcado como AVARIA (aparelho na oficina) nao
                // pode ser atribuido. O botao Assign aparece, mas desativado.
                const isFault = String(s.status || '').toUpperCase() === 'AVARIA';
                const assignBlocked = isFree && isFault;
                const hs = healthSummary(s);
                return (
                  <tr key={s.id} className="sensor-row" onClick={() => setSelected(s)} tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') setSelected(s); }}>
                    <td><span className="sensor-gateway">{s.gateway}</span></td>
                    <td>
                      <span className={`sensor-badge sensor-badge--${statusKey(s.status)}`}>
                        <span className="sensor-badge-dot" aria-hidden="true" />
                        {t(`pages.sensors.statusLabel.${statusKey(s.status)}`)}
                      </span>
                    </td>
                    <td>
                      {isFree
                        ? <span className="sensor-bus-empty" aria-label={t('pages.sensors.free')}>—</span>
                        : <span className="sensor-buscode">{s.busCode}</span>}
                    </td>
                    <td className="sensor-reading">{fmtRelative(s.lastReadingAt)}</td>
                    <td>
                      <span className={`sensor-health-chip sensor-health-chip--${hs.key}`}>{hs.label}</span>
                    </td>
                    {canEdit && (
                      <td className="actions col-actions" onClick={(e) => e.stopPropagation()}>
                        {isFree ? (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => { setAssignSearch(''); setAssignFor(s); }}
                            disabled={assignBlocked}
                            title={assignBlocked ? t('pages.sensors.assignFaultBlocked') : t('pages.sensors.assign')}
                          >
                            {t('pages.sensors.assign')}
                          </button>
                        ) : (
                          // Atribuido: libertar so' bloqueia se o autocarro NAO
                          // estiver parado (mesma regra do motorista). Bus parado
                          // (STOPPED) => libertar funciona.
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleUnassign(s)}
                            disabled={locked}
                            title={locked ? t('pages.sensors.inUseTitle') : t('pages.sensors.unassignTitle')}
                          >
                            {t('pages.sensors.unassign')}
                          </button>
                        )}
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => startEdit(s)}
                          disabled={locked}
                          title={locked ? t('pages.sensors.inUseTitle') : t('common.edit')}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(s)}
                          disabled={locked}
                          title={locked ? t('pages.sensors.inUseTitle') : t('common.delete')}
                        >
                          {t('common.delete')}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Painel de detalhe (slide-in), so' leitura ─── */}
      {selected && (
        <SensorDetailPanel
          sensor={sensors.find(x => x.id === selected.id) || selected}
          fmtRelative={fmtRelative}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Form criar/editar — padrao global form-overlay/form-card/form-grid
          para ser coerente com os outros modais de criacao (New Bus etc.). */}
      {form && canEdit && (() => {
        const editingAssigned = !!form.id && !form.isFree;
        const sensorOrig = editingAssigned ? sensors.find(x => x.id === form.id) : null;
        const busCode = sensorOrig?.busCode || '';
        const showStatusSelect = form.id && form.isFree;
        return (
          <div className="form-overlay">
            <form className="form-card" onSubmit={handleSubmit}>
              <h3>{form.id ? t('pages.sensors.editTitle') : t('pages.sensors.create')}</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>{t('pages.sensors.fieldGateway')}</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={64}
                    value={form.gateway}
                    onChange={e => setForm({ ...form, gateway: e.target.value })}
                    placeholder="GW-TLM-001"
                  />
                  <span className="form-hint">{t('pages.sensors.gatewayHintShort')}</span>
                </div>
                {showStatusSelect && (
                  <div className="form-group">
                    <label>{t('pages.sensors.fieldStatus')}</label>
                    <select
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value })}
                    >
                      <option value="DISPONIVEL">{t('pages.sensors.statusLabel.disponivel')}</option>
                      <option value="AVARIA">{t('pages.sensors.statusLabel.avaria')}</option>
                    </select>
                    <span className="form-hint">{t('pages.sensors.statusFreeNoteShort')}</span>
                  </div>
                )}
                {editingAssigned && (
                  <div className="form-group">
                    <label>{t('pages.sensors.headers.bus')}</label>
                    <input type="text" value={busCode} disabled readOnly />
                  </div>
                )}
              </div>
              {!showStatusSelect && (
                <p className="form-hint" style={{ marginBottom: 12 }}>
                  {t('pages.sensors.statusAutoNoteShort')}
                </p>
              )}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {form.id ? t('common.save') : t('common.create')}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        );
      })()}

      {/* ─── Modal de atribuicao a autocarro ─── */}
      {assignFor && (
        <Modal
          open
          title={t('pages.sensors.assignModalTitle', { gateway: assignFor.gateway })}
          onClose={() => { setAssignFor(null); setAssignSearch(''); }}
        >
          {buses.length === 0 ? (
            <p className="sensor-assign-empty">{t('pages.sensors.assignNoBuses')}</p>
          ) : assignableBuses.length === 0 && !assignSearch ? (
            <p className="sensor-assign-empty">{t('pages.sensors.assignAllCovered')}</p>
          ) : (
            <>
              <div className="sensor-assign-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder={t('pages.sensors.assignSearch')}
                  value={assignSearch}
                  onChange={e => setAssignSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {assignableBuses.length === 0 ? (
                <p className="sensor-assign-empty">{t('pages.sensors.assignNoResults')}</p>
              ) : (
                <div className="sensor-assign-grid">
                  {assignableBuses.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      className="sensor-assign-card"
                      onClick={() => handleAssign(assignFor, b)}
                    >
                      <span className="sensor-assign-code">{b.busCode}</span>
                      <span className="sensor-assign-route">
                        {b.routeCode ? `${b.routeCode}${b.routeName ? ' · ' + b.routeName : ''}` : t('pages.sensors.assignNoRoute')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      <Modal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText={modal.confirmText}
        onConfirm={modal.onConfirm}
        onClose={closeModal}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Painel lateral de detalhe do sensor. SO' LEITURA: mostra a que autocarro
// pertence (com link para o livemap, se atribuido), os dados em tempo real
// (ultima leitura) e o breakdown de saude dos sub-sensores. As acoes (editar/
// eliminar/libertar) vivem nas linhas da tabela, nao aqui. Se subsensorHealth
// for null/vazio, mostra empty state "Aguarda telemetria".
// ─────────────────────────────────────────────────────────────────────────
function SensorDetailPanel({ sensor, fmtRelative, onClose }) {
  const { t, i18n } = useTranslation();
  const [closing, setClosing] = useState(false);
  const isFree = sensor.busId == null && !sensor.busCode;
  const isFault = String(sensor.status || '').toUpperCase() === 'AVARIA';

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose(), 220);
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const sh = sensor.subsensorHealth;
  const hasHealth = sh && typeof sh === 'object' && Object.keys(sh).length > 0;

  // Ordena os sub-sensores pela ordem canonica e acrescenta extras no fim.
  // entry e' a leitura bruta (mantida para render do VALOR alem da saude).
  const rows = useMemo(() => {
    if (!hasHealth) return [];
    const keys = Object.keys(sh);
    const ordered = [
      ...SUBSENSOR_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !SUBSENSOR_ORDER.includes(k)),
    ];
    return ordered.map(k => ({ key: k, value: readHealth(sh[k]), entry: sh[k] }));
  }, [sh, hasHealth]);

  return (
    <>
      <div className={`sdp-backdrop ${closing ? 'sdp-backdrop--closing' : ''}`} onClick={requestClose} />
      <aside className={`sdp-panel ${closing ? 'sdp-panel--closing' : ''}`} role="dialog" aria-modal="true" aria-label={sensor.gateway}>
        <header className="sdp-header">
          <div>
            <div className="sdp-header-code">{sensor.gateway}</div>
            <div className="sdp-header-sub">{t('pages.sensors.panelSubtitle')}</div>
          </div>
          <div className="sdp-header-right">
            <span className={`sensor-badge sensor-badge--${statusKey(sensor.status)}`}>
              <span className="sensor-badge-dot" aria-hidden="true" />
              {t(`pages.sensors.statusLabel.${statusKey(sensor.status)}`)}
            </span>
            <button className="sdp-close" onClick={requestClose} aria-label={t('common.close')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="sdp-content">
          {/* Atribuicao (so' leitura). As acoes vivem nas linhas da tabela. */}
          <section className="sdp-section">
            <h4 className="sdp-section-title">{t('pages.sensors.headers.bus')}</h4>
            {isFree ? (
              <div className="sdp-assign-row">
                <span className="sensor-bus-empty" aria-label={t('pages.sensors.free')}>—</span>
              </div>
            ) : (
              <div className="sdp-assign-row">
                <span className="sensor-buscode sensor-buscode--lg">{sensor.busCode}</span>
                <a
                  href={`/backoffice/buses?q=${encodeURIComponent(sensor.busCode || '')}`}
                  className="inline-link"
                >
                  {t('pages.sensors.panelViewBus')}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </a>
              </div>
            )}
          </section>

          {/* Saude dos sub-sensores.
              REGRA: nao mostramos a saude nem a ultima leitura quando o sensor
              nao esta efectivamente a transmitir, mesmo que existam valores
              guardados de uma atribuicao anterior (seriam enganadores). Casos:
                * sensor LIVRE (sem autocarro) -> DISPONIVEL ou AVARIA manual
                * sensor ATRIBUIDO mas INATIVO (autocarro parado) -> aguarda servico
              Em todos os casos mostramos um empty state curto. */}
          <section className="sdp-section">
            {(isFree || sensor.status === 'INATIVO') ? (
              <>
                <div className="sdp-section-head">
                  <h4 className="sdp-section-title">{t('pages.sensors.subsensorsTitle')}</h4>
                </div>
                <div className="sdp-empty">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {isFault ? (
                      <>
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </>
                    )}
                  </svg>
                  <div className="sdp-empty-title">
                    {isFree
                      ? (isFault ? t('pages.sensors.panelFreeFaultTitle') : t('pages.sensors.panelFreeAvailableTitle'))
                      : t('pages.sensors.panelInactiveTitle')}
                  </div>
                  <div className="sdp-empty-sub">
                    {isFree
                      ? (isFault ? t('pages.sensors.panelFreeFault') : t('pages.sensors.panelFreeAvailable'))
                      : t('pages.sensors.panelInactive')}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="sdp-section-head">
                  <h4 className="sdp-section-title">{t('pages.sensors.subsensorsTitle')}</h4>
                  <span className="sdp-reading">{t('pages.sensors.lastReadingLabel')}: {fmtRelative(sensor.lastReadingAt)}</span>
                </div>
                {!hasHealth ? (
                  <div className="sdp-empty">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                    <div className="sdp-empty-title">{t('pages.sensors.awaitingTelemetry')}</div>
                    <div className="sdp-empty-sub">{t('pages.sensors.awaitingTelemetrySub')}</div>
                  </div>
                ) : (
                  <ul className="sdp-health-list">
                    {rows.map(({ key, value, entry }) => {
                      const hk = healthKey(value);
                      const pct = value == null ? 0 : Math.round(value * 100);
                      const valueLabel = renderSubsensorValue(key, entry, t, i18n.language);
                      // GPS nao tem valor proprio (so' saude). Para os outros,
                      // se nao tivermos leitura, mostramos um traco.
                      const hasOwnValue = key !== 'gps';
                      return (
                        <li key={key} className="sdp-health-item">
                          <div className="sdp-health-top">
                            <span className="sdp-health-name">{t(`pages.sensors.subsensor.${key}`, key)}</span>
                            {hasOwnValue && (
                              <span className="sdp-health-value">{valueLabel || '—'}</span>
                            )}
                            <span className={`sdp-health-val sdp-health-val--${hk}`}>
                              {value == null ? t('pages.sensors.subsensorNoReading') : `${pct}%`}
                            </span>
                          </div>
                          <div className="sdp-health-bar">
                            <div className={`sdp-health-fill sdp-health-fill--${hk}`} style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
