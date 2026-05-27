// Backoffice > Parâmetros — vars globais do sistema.
// Sprint 0 (F4 follow-up): adicionado owner default das DataSources.

import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [configs, setConfigs] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/config')
      .then((r) => setConfigs({ ...DEFAULTS, ...(r.data || {}) }))
      .catch((err) => {
        console.error('Erro ao carregar configurações globais:', err);
        toast.error(t('pages.globalConfig.loadError'));
      })
      .finally(() => setLoading(false));
  }, [t]);

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
      toast.success(t('pages.globalConfig.savedSuccess'));
    } catch (err) {
      console.error('Erro ao guardar:', err);
      toast.error(t('pages.globalConfig.saveFailNoAdmin'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="config-page"><div className="config-loading">{t('pages.globalConfig.loading')}</div></div>;
  }

  return (
    <div className="config-page">
      <header className="config-header">
        <h1 className="config-title">{t('pages.globalConfig.pageTitle')}</h1>
      </header>

      <form className="config-form" onSubmit={handleSave}>
        <section className="config-section">
          <h2 className="config-section-title">{t('pages.globalConfig.alertsSection')}</h2>
          <div className="config-grid">
            <div className="config-field">
              <label htmlFor="cfg-delay">{t('pages.globalConfig.delayLabel')}</label>
              <div className="config-input-suffix">
                <input
                  id="cfg-delay"
                  type="number"
                  min="0"
                  value={configs.delayLimitMinutes ?? ''}
                  onChange={handleChange('delayLimitMinutes')}
                  required
                />
                <span className="config-unit">{t('pages.globalConfig.unitMin')}</span>
              </div>
              <p className="config-hint">{t('pages.globalConfig.delayHintShort')}</p>
            </div>

            <div className="config-field">
              <label htmlFor="cfg-soc">{t('pages.globalConfig.batteryLabel')}</label>
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
                <span className="config-unit">{t('pages.globalConfig.unitPercent')}</span>
              </div>
              <p className="config-hint">{t('pages.globalConfig.batteryHintShort')}</p>
            </div>

            <div className="config-field">
              <label htmlFor="cfg-iot">{t('pages.globalConfig.iotLabel')}</label>
              <div className="config-input-suffix">
                <input
                  id="cfg-iot"
                  type="number"
                  min="0"
                  value={configs.iotIntegrationLimit ?? ''}
                  onChange={handleChange('iotIntegrationLimit')}
                />
                <span className="config-unit">{t('pages.globalConfig.unitPerMin')}</span>
              </div>
              <p className="config-hint">{t('pages.globalConfig.iotHint')}</p>
            </div>
          </div>
        </section>

        <section className="config-section">
          <h2 className="config-section-title">{t('pages.globalConfig.sourcesOwnerSection')}</h2>
          <div className="config-grid">
            <div className="config-field">
              <label htmlFor="cfg-owner-name">{t('pages.globalConfig.ownerNameLabel')}</label>
              <input
                id="cfg-owner-name"
                type="text"
                maxLength="64"
                placeholder={t('pages.globalConfig.ownerNamePlaceholder')}
                value={configs.defaultOwnerName ?? ''}
                onChange={handleChange('defaultOwnerName')}
              />
              <p className="config-hint">{t('pages.globalConfig.ownerNameHintShort')}</p>
            </div>

            <div className="config-field">
              <label htmlFor="cfg-owner-email">{t('pages.globalConfig.ownerEmailLabel')}</label>
              <input
                id="cfg-owner-email"
                type="email"
                maxLength="128"
                placeholder={t('pages.globalConfig.ownerEmailPlaceholder')}
                value={configs.defaultOwnerEmail ?? ''}
                onChange={handleChange('defaultOwnerEmail')}
              />
              <p className="config-hint">{t('pages.globalConfig.ownerEmailHintShort')}</p>
            </div>
          </div>
        </section>

        <footer className="config-actions">
          {configs.updatedAt && (
            <p className="config-meta">
              {t('pages.globalConfig.lastChange', { date: new Date(configs.updatedAt).toLocaleString('pt-PT') })}
              {configs.updatedBy && <>{t('pages.globalConfig.lastChangeBy')}<strong>{configs.updatedBy}</strong></>}.
            </p>
          )}
          <button type="submit" className="config-btn-primary" disabled={saving}>
            {saving ? t('pages.globalConfig.savingShort') : t('pages.globalConfig.saveChanges')}
          </button>
        </footer>
      </form>
    </div>
  );
}
