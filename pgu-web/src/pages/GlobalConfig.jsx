// Backoffice > Parâmetros — vars globais do sistema.
// Sprint 0 (F4 follow-up): adicionado owner default das DataSources.

import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
import './GlobalConfig.css';

const DEFAULTS = {
  delayLimitMinutes: 5,
  socTolerancePercent: 20,
  iotIntegrationLimit: 1000,
  defaultOwnerName: '',
  defaultOwnerEmail: '',
};

export default function GlobalConfig() {
  const [configs, setConfigs] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/config')
      .then((r) => setConfigs({ ...DEFAULTS, ...(r.data || {}) }))
      .catch((err) => {
        console.error('Erro ao carregar configurações globais:', err);
        toast.error('Falha a carregar parâmetros');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setConfigs((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put('/config', configs);
      setConfigs({ ...DEFAULTS, ...(r.data || {}) });
      toast.success('Parâmetros atualizados');
    } catch (err) {
      console.error('Erro ao guardar:', err);
      toast.error('Falha ao atualizar, sem permissões de admin');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="config-page"><div className="config-loading">A carregar parâmetros…</div></div>;
  }

  return (
    <div className="config-page">
      <header className="config-header">
        <h1 className="config-title">Parâmetros Globais</h1>
      </header>

      <form className="config-form" onSubmit={handleSave}>
        <section className="config-section">
          <h2 className="config-section-title">Alertas</h2>
          <div className="config-grid">
            <div className="config-field">
              <label htmlFor="cfg-delay">Atraso tolerável</label>
              <div className="config-input-suffix">
                <input
                  id="cfg-delay"
                  type="number"
                  min="0"
                  value={configs.delayLimitMinutes ?? ''}
                  onChange={handleChange('delayLimitMinutes')}
                  required
                />
                <span className="config-unit">min</span>
              </div>
              <p className="config-hint">Acima disto, gera alerta.</p>
            </div>

            <div className="config-field">
              <label htmlFor="cfg-soc">Bateria mínima</label>
              <div className="config-input-suffix">
                <input
                  id="cfg-soc"
                  type="number"
                  min="0"
                  max="100"
                  value={configs.socTolerancePercent ?? ''}
                  onChange={handleChange('socTolerancePercent')}
                  required
                />
                <span className="config-unit">%</span>
              </div>
              <p className="config-hint">Abaixo disto, alerta crítico.</p>
            </div>

            <div className="config-field">
              <label htmlFor="cfg-iot">Mensagens IoT</label>
              <div className="config-input-suffix">
                <input
                  id="cfg-iot"
                  type="number"
                  min="0"
                  value={configs.iotIntegrationLimit ?? ''}
                  onChange={handleChange('iotIntegrationLimit')}
                />
                <span className="config-unit">/min</span>
              </div>
              <p className="config-hint">Limite de ingestão MQTT.</p>
            </div>
          </div>
        </section>

        <section className="config-section">
          <h2 className="config-section-title">Owner das Fontes</h2>
          <div className="config-grid">
            <div className="config-field">
              <label htmlFor="cfg-owner-name">Nome</label>
              <input
                id="cfg-owner-name"
                type="text"
                maxLength="64"
                placeholder="Operações TUB"
                value={configs.defaultOwnerName ?? ''}
                onChange={handleChange('defaultOwnerName')}
              />
              <p className="config-hint">Para fontes sem owner próprio.</p>
            </div>

            <div className="config-field">
              <label htmlFor="cfg-owner-email">Email</label>
              <input
                id="cfg-owner-email"
                type="email"
                maxLength="128"
                placeholder="operacoes@tub.pt"
                value={configs.defaultOwnerEmail ?? ''}
                onChange={handleChange('defaultOwnerEmail')}
              />
              <p className="config-hint">Recebe alertas DOWN.</p>
            </div>
          </div>
        </section>

        <footer className="config-actions">
          {configs.updatedAt && (
            <p className="config-meta">
              Última alteração {new Date(configs.updatedAt).toLocaleString('pt-PT')}
              {configs.updatedBy && <> por <strong>{configs.updatedBy}</strong></>}.
            </p>
          )}
          <button type="submit" className="config-btn-primary" disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar alterações'}
          </button>
        </footer>
      </form>
    </div>
  );
}
