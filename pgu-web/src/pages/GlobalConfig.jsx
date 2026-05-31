// Backoffice > Parâmetros — vars globais do sistema.
// Sprint 0 (F4 follow-up): adicionado owner default das DataSources.

import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import './GlobalConfig.css';

const DEFAULTS = {
  delayLimitMinutes: 5,
  socTolerancePercent: 20,
  iotIntegrationLimit: 1000,
  defaultOwnerName: '',
  defaultOwnerEmail: '',
  // Central TUB: lat/lon clicaveis no mapa (em vez de input manual).
  // null = sem central configurada (DriverDepartureService usa fallback Braga).
  tubCentralLat: null,
  tubCentralLon: null,
};

// Coordenadas exactas da garagem TUB Braga. Servem para dois efeitos:
//  1) Centrar o mapa picker quando ainda nao ha central configurada.
//  2) Mostrar como sugestao default (texto "Sem central definida (usará o
//     ponto da TUB como fallback)") no info-box abaixo do mapa.
// O backend tem o mesmo valor em DriverDepartureService.FALLBACK_CENTRAL_*
// e a migracao V59 fa-lo persistir em global_config.
const TUB_CENTRAL_DEFAULT = [41.539908, -8.435542];

export default function GlobalConfig() {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Refs para o picker de mapa da Central TUB. O `marker` move-se em cada
  // click; `map` para chamadas imperativas (setView, etc.).
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    api.get('/config')
      .then((r) => setConfigs({ ...DEFAULTS, ...(r.data || {}) }))
      .catch((err) => {
        console.error('Erro ao carregar configurações globais:', err);
        toast.error(t('pages.globalConfig.loadError'));
      })
      .finally(() => setLoading(false));
  }, [t]);

  // Inicializa o mapa Leaflet apos o componente montar (post-loading).
  // Re-centra e move o marker quando os valores da central mudam externamente
  // (e.g. apos GET /config). Click no mapa = nova posicao da central.
  useEffect(() => {
    if (loading) return;
    if (!mapDivRef.current) return;
    if (mapRef.current) return; // ja inicializado

    const initLat = configs.tubCentralLat ?? TUB_CENTRAL_DEFAULT[0];
    const initLon = configs.tubCentralLon ?? TUB_CENTRAL_DEFAULT[1];
    const map = L.map(mapDivRef.current, {
      center: [initLat, initLon],
      zoom: 14,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Marker so' aparece quando ha central definida (ou apos primeiro click).
    if (configs.tubCentralLat != null && configs.tubCentralLon != null) {
      markerRef.current = L.marker([configs.tubCentralLat, configs.tubCentralLon], { draggable: true }).addTo(map);
      markerRef.current.on('dragend', (e) => {
        const { lat, lng } = e.target.getLatLng();
        setConfigs((prev) => ({ ...prev, tubCentralLat: lat, tubCentralLon: lng }));
      });
    }

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
        markerRef.current.on('dragend', (ev) => {
          const p = ev.target.getLatLng();
          setConfigs((prev) => ({ ...prev, tubCentralLat: p.lat, tubCentralLon: p.lng }));
        });
      }
      setConfigs((prev) => ({ ...prev, tubCentralLat: lat, tubCentralLon: lng }));
    });

    mapRef.current = map;
    // Cleanup: destroi o mapa quando o componente desmonta para evitar leaks
    // de listeners e o erro "Map container is already initialized".
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Botao "Remover central": apaga marker e poe lat/lon a null.
  const clearCentral = () => {
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    setConfigs((prev) => ({ ...prev, tubCentralLat: null, tubCentralLon: null }));
  };

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

        <section className="config-section">
          <h2 className="config-section-title">{t('pages.globalConfig.centralSection', 'Central TUB')}</h2>
          <p className="config-hint">
            {t('pages.globalConfig.centralHint', 'Clica no mapa para definir o ponto de partida e regresso dos autocarros (deadheads). Podes arrastar o marker para ajustar.')}
          </p>
          <div ref={mapDivRef} className="config-central-map" />
          <div className="config-central-meta">
            <span>
              {configs.tubCentralLat != null && configs.tubCentralLon != null
                ? `${t('pages.globalConfig.centralCoords', 'Coordenadas')}: ${configs.tubCentralLat.toFixed(6)}, ${configs.tubCentralLon.toFixed(6)}`
                : t('pages.globalConfig.centralNone', 'Sem central definida (será usado o ponto da TUB Braga: 41.539908, -8.435542)')}
            </span>
            {configs.tubCentralLat != null && (
              <button type="button" className="config-btn-secondary" onClick={clearCentral}>
                {t('pages.globalConfig.centralClear', 'Remover')}
              </button>
            )}
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
