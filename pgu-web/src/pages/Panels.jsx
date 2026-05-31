import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { createStompClient } from '../services/stompClient';
import './Panels.css';

/**
 * Sprint 3 (3.5): CRUD de paineis DMS.
 *
 * - Lista painéis com status em tempo real (STOMP /topic/panels).
 * - Form criar/editar com selector de paragem.
 * - Eliminar (com confirm).
 */
export default function Panels() {
  const { t } = useTranslation();
  const [panels, setPanels] = useState([]);
  const [stops, setStops] = useState([]);
  const [stats, setStats] = useState({ total: 0, byStatus: [], byType: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} (novo) | {...painel} (editar)

  const load = () => {
    Promise.all([
      api.get('/panels').then(r => r.data || []),
      api.get('/stops').then(r => r.data || []),
      api.get('/panels/stats').then(r => r.data || {}),
    ]).then(([p, s, st]) => {
      setPanels(p);
      setStops(s);
      setStats(st);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const client = createStompClient({
      onConnect: () => {
        client.subscribe('/topic/panels', msg => {
          try {
            const ev = JSON.parse(msg.body);
            setPanels(prev => prev.map(p =>
              p.code === ev.code
                ? { ...p, status: ev.status, batteryPct: ev.batteryPct > 0 ? ev.batteryPct : p.batteryPct, lastHeartbeat: ev.lastHeartbeat }
                : p
            ));
          } catch { /* ignore */ }
        });
      },
    });
    client.activate();
    return () => client.deactivate();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      code: fd.get('code'),
      name: fd.get('name'),
      type: fd.get('type'),
      stopId: Number(fd.get('stopId')),
      currentMessage: fd.get('currentMessage') || null,
      enabled: fd.get('enabled') === 'on',
    };
    try {
      if (editing?.id) {
        await api.put(`/panels/${editing.id}`, body);
      } else {
        await api.post('/panels', body);
      }
      setEditing(null);
      load();
    } catch (err) {
      alert(t('pages.panels.saveError', 'Falhou: ') + (err.response?.data?.message || err.message));
    }
  };

  const onDelete = async (p) => {
    if (!window.confirm(t('pages.panels.confirmDelete', `Eliminar painel ${p.code}?`))) return;
    await api.delete(`/panels/${p.id}`);
    load();
  };

  const statusColor = {
    ONLINE: '#10b981', OFFLINE: '#ef4444', FAULTY: '#f59e0b',
    LOW_BATTERY: '#f59e0b', UNKNOWN: '#94a3b8', DISABLED: '#64748b',
  };

  return (
    <div className="panels-page">
      <header className="panels-header">
        <h1>{t('pages.panels.title', 'Painéis DMS')}</h1>
        <p className="panels-subtitle">
          {t('pages.panels.subtitle', 'Painéis de informação nas paragens da rede TUB.')}
        </p>
        <button className="panels-btn-primary" onClick={() => setEditing({})}>
          + {t('pages.panels.create', 'Novo painel')}
        </button>
      </header>

      {/* KPIs */}
      <div className="panels-kpis">
        <div className="kpi-card"><div className="kpi-label">{t('pages.panels.kpiTotal', 'Total')}</div><div className="kpi-value">{stats.total}</div></div>
        {(stats.byStatus || []).map(s => (
          <div key={s.status} className="kpi-card">
            <div className="kpi-label" style={{ color: statusColor[s.status] || '#94a3b8' }}>{s.status}</div>
            <div className="kpi-value">{s.total}</div>
          </div>
        ))}
      </div>

      {loading && <p style={{ padding: '0 2rem' }}>{t('common.loading', 'A carregar...')}</p>}

      {/* Tabela */}
      <table className="panels-table">
        <thead>
          <tr>
            <th>{t('pages.panels.colCode', 'Código')}</th>
            <th>{t('pages.panels.colName', 'Nome')}</th>
            <th>{t('pages.panels.colType', 'Tipo')}</th>
            <th>{t('pages.panels.colStop', 'Paragem')}</th>
            <th>{t('pages.panels.colStatus', 'Estado')}</th>
            <th>{t('pages.panels.colBattery', 'Bateria')}</th>
            <th>{t('pages.panels.colHeartbeat', 'Último heartbeat')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {panels.map(p => {
            const stop = stops.find(s => s.id === p.stopId);
            return (
              <tr key={p.id}>
                <td><code>{p.code}</code></td>
                <td>{p.name}</td>
                <td><span className={`panel-type panel-type--${p.type.toLowerCase()}`}>{p.type}</span></td>
                <td>{stop?.name || `#${p.stopId}`}</td>
                <td>
                  <span className="panel-status" style={{ background: statusColor[p.status] }}>
                    {p.status}
                  </span>
                </td>
                <td>{p.batteryPct != null ? `${p.batteryPct}%` : '—'}</td>
                <td>{p.lastHeartbeat ? new Date(p.lastHeartbeat).toLocaleTimeString('pt-PT') : '—'}</td>
                <td>
                  <button className="panels-btn-link" onClick={() => setEditing(p)}>
                    {t('common.edit', 'Editar')}
                  </button>
                  <button className="panels-btn-link panels-btn-danger" onClick={() => onDelete(p)}>
                    {t('common.delete', 'Eliminar')}
                  </button>
                </td>
              </tr>
            );
          })}
          {!loading && panels.length === 0 && (
            <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
              {t('pages.panels.empty', 'Sem painéis. Cria o primeiro com o botão acima.')}
            </td></tr>
          )}
        </tbody>
      </table>

      {/* Modal CRUD */}
      {editing && (
        <div className="panels-modal-overlay" onClick={() => setEditing(null)}>
          <form className="panels-modal" onClick={e => e.stopPropagation()} onSubmit={onSubmit}>
            <h2>{editing.id ? t('pages.panels.editTitle', 'Editar painel') : t('pages.panels.createTitle', 'Novo painel')}</h2>
            <label>
              {t('pages.panels.fldCode', 'Código (serial)')}
              <input name="code" required defaultValue={editing.code || ''} disabled={!!editing.id} />
            </label>
            <label>
              {t('pages.panels.fldName', 'Nome')}
              <input name="name" required defaultValue={editing.name || ''} />
            </label>
            <label>
              {t('pages.panels.fldType', 'Tipo')}
              <select name="type" required defaultValue={editing.type || 'EPAPER'}>
                <option value="EPAPER">EPAPER (solar)</option>
                <option value="LED">LED</option>
                <option value="TFT">TFT</option>
              </select>
            </label>
            <label>
              {t('pages.panels.fldStop', 'Paragem')}
              <select name="stopId" required defaultValue={editing.stopId || ''}>
                <option value="">— escolher —</option>
                {stops.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </label>
            <label>
              {t('pages.panels.fldMessage', 'Mensagem actual (opcional)')}
              <input name="currentMessage" defaultValue={editing.currentMessage || ''} />
            </label>
            <label className="panels-checkbox">
              <input type="checkbox" name="enabled" defaultChecked={editing.enabled !== false} />
              {t('pages.panels.fldEnabled', 'Activo')}
            </label>
            <div className="panels-modal-actions">
              <button type="button" className="panels-btn-secondary" onClick={() => setEditing(null)}>
                {t('common.cancel', 'Cancelar')}
              </button>
              <button type="submit" className="panels-btn-primary">
                {t('common.save', 'Guardar')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
