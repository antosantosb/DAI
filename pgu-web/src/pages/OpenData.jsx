// Sprint 1 (F1): pagina publica de Open Data.
//
// URL: /open-data
// Acesso: public (sem auth)
// Publico-alvo: consumidores externos (QGIS, dados.gov.pt, devs de apps de
// mobilidade, jornalistas, academia).
//
// Mantem coerencia com §4.2 do PLANO_ITERACAO: PGU e' plataforma interna, mas
// expoe um sub-conjunto de dados em formatos standard.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeSwitcher from '../components/ThemeSwitcher';
import TubLogo from '../components/TubLogo';
import ProjectDisclaimer from '../components/ProjectDisclaimer';
import './OpenData.css';

// Pagina publica: NAO usar o `api` axios — a sua interceptor redireciona
// para a login em 401, o que rebenta visitantes anonimos. Usar fetch directo
// aos endpoints publicos GeoJSON e contar features.

const DATASETS = [
  {
    key: 'routes',
    url: '/api/v1/routes/export.geojson',
    filename: 'pgu-routes.geojson',
    geometry: 'LineString',
    countEndpoint: '/routes',
    schema: `{
  "type": "Feature",
  "geometry": { "type": "LineString", "coordinates": [[lon, lat], ...] },
  "properties": {
    "id": 1, "code": "2", "name": "...",
    "color": "#E63946",
    "operatorCode": "TUB",
    "operatorName": "Transportes Urbanos de Braga"
  }
}`,
    iconPath: (
      <>
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M6 8.5v3A4.5 4.5 0 0 0 10.5 16h3a4.5 4.5 0 0 1 4.5 4.5V16" />
      </>
    ),
  },
  {
    key: 'stops',
    url: '/api/v1/stops/export.geojson',
    filename: 'pgu-stops.geojson',
    geometry: 'Point',
    countEndpoint: '/stops',
    schema: `{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [lon, lat] },
  "properties": {
    "id": 42, "code": "BRG001", "name": "Avenida Central",
    "routeCodes": ["2", "11", "23"]
  }
}`,
    iconPath: (
      <>
        <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12z" />
        <circle cx="12" cy="9" r="2.5" />
      </>
    ),
  },
];

const COMING_SOON = [
  {
    key: 'gtfsRt',
    sprint: 'F7',
    iconPath: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></>,
  },
  {
    key: 'netex',
    sprint: 'F8',
    iconPath: <><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></>,
  },
];

const CODE_LANGS = ['curl', 'javascript', 'python'];

function buildCodeExample(lang, origin, url, filename) {
  const full = `${origin}${url}`;
  if (lang === 'curl') {
    return `curl -sS -o ${filename} \\\n  ${full}`;
  }
  if (lang === 'javascript') {
    return `const response = await fetch("${full}");\nconst geojson = await response.json();\nconsole.log(\`\${geojson.features.length} features loaded\`);`;
  }
  if (lang === 'python') {
    return `import requests\n\nresponse = requests.get("${full}")\ngeojson = response.json()\nprint(f"{len(geojson['features'])} features loaded")`;
  }
  return '';
}

export default function OpenData() {
  const { t } = useTranslation();
  const [activeLangByDs, setActiveLangByDs] = useState({});
  const [counts, setCounts] = useState({ routes: null, stops: null });
  const [copiedKey, setCopiedKey] = useState(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // Conta features descarregando os GeoJSON publicos (sem auth). Falha
  // silenciosa: se a rede falhar, fica "—" e o resto da pagina renderiza.
  useEffect(() => {
    const fetchCount = (url) =>
      fetch(url)
        .then(r => r.ok ? r.json() : null)
        .then(fc => fc?.features?.length ?? null)
        .catch(() => null);

    Promise.all([
      fetchCount('/api/v1/routes/export.geojson'),
      fetchCount('/api/v1/stops/export.geojson'),
    ]).then(([routes, stops]) => setCounts({ routes, stops }));
  }, []);

  const lastUpdated = useMemo(() => {
    return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }, []);

  const copyUrl = async (key, url) => {
    try {
      await navigator.clipboard.writeText(`${origin}${url}`);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch { /* clipboard recusou - ignora */ }
  };

  const setLang = (dsKey, lang) =>
    setActiveLangByDs(prev => ({ ...prev, [dsKey]: lang }));

  return (
    <div className="od-page">
      {/* Background decoration */}
      <div className="od-bg-glow" aria-hidden="true" />

      <header className="od-header">
        <div className="od-header-inner">
          <Link to="/" className="od-brand" aria-label="TUB Open Data">
            <TubLogo size={26} />
            <span className="od-brand-divider" aria-hidden="true" />
            <span className="od-brand-text">{t('pages.openData.brand')}</span>
          </Link>
          <div className="od-header-actions">
            <a href="#datasets" className="od-nav-link">{t('pages.openData.navDatasets')}</a>
            <a href="#developers" className="od-nav-link">{t('pages.openData.navDevelopers')}</a>
            <a href="#catalog" className="od-nav-link">{t('pages.openData.navCatalog')}</a>
            <a href="#licence" className="od-nav-link">{t('pages.openData.navLicence')}</a>
            <span className="od-header-divider" aria-hidden="true" />
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main className="od-main">
        {/* HERO */}
        <section className="od-hero">
          <h1 className="od-title">{t('pages.openData.title')}</h1>
          <p className="od-lede">{t('pages.openData.lede')}</p>

          {/* Stats strip */}
          <div className="od-stats" role="list">
            <div className="od-stat" role="listitem">
              <span className="od-stat-value">{counts.routes ?? '—'}</span>
              <span className="od-stat-label">{t('pages.openData.statRoutes')}</span>
            </div>
            <div className="od-stat" role="listitem">
              <span className="od-stat-value">{counts.stops ?? '—'}</span>
              <span className="od-stat-label">{t('pages.openData.statStops')}</span>
            </div>
            <div className="od-stat" role="listitem">
              <span className="od-stat-value">2</span>
              <span className="od-stat-label">{t('pages.openData.statDatasets')}</span>
            </div>
          </div>
        </section>

        {/* DATASETS */}
        <section id="datasets" className="od-section">
          <div className="od-section-head">
            <span className="od-section-tag">01</span>
            <h2>{t('pages.openData.availableTitle')}</h2>
          </div>

          <div className="od-datasets">
            {DATASETS.map((ds, idx) => {
              const count = counts[ds.key];
              const activeLang = activeLangByDs[ds.key] || 'curl';
              return (
                <article
                  key={ds.key}
                  className="od-card"
                  style={{ '--enter-delay': `${idx * 80}ms` }}
                >
                  <header className="od-card-header">
                    <div className="od-card-icon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        {ds.iconPath}
                      </svg>
                    </div>
                    <div className="od-card-badges">
                      <span className="od-badge od-badge-format">GeoJSON</span>
                      <span className="od-badge od-badge-geom">{ds.geometry}</span>
                    </div>
                  </header>

                  <h3 className="od-card-title">
                    {t(`pages.openData.datasets.${ds.key}.title`)}
                  </h3>

                  <dl className="od-card-meta">
                    <div>
                      <dt>{t('pages.openData.metaFeatures')}</dt>
                      <dd className="od-card-meta-strong">{count ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>{t('pages.openData.metaUpdated')}</dt>
                      <dd>{lastUpdated}</dd>
                    </div>
                    <div>
                      <dt>{t('pages.openData.metaCrs')}</dt>
                      <dd>WGS 84 · EPSG:4326</dd>
                    </div>
                  </dl>

                  <div className="od-endpoint">
                    <span className="od-endpoint-method">GET</span>
                    <code className="od-endpoint-url">{ds.url}</code>
                    <button
                      type="button"
                      className="od-endpoint-copy"
                      onClick={() => copyUrl(ds.key, ds.url)}
                      aria-label={t('pages.openData.copyUrl')}
                    >
                      {copiedKey === ds.key ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="9" y="9" width="13" height="13" rx="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      )}
                    </button>
                  </div>

                  <details className="od-schema">
                    <summary>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                      {t('pages.openData.schemaToggle')}
                    </summary>
                    <pre className="od-schema-code"><code>{ds.schema}</code></pre>
                  </details>

                  <div className="od-card-actions">
                    <a
                      href={ds.url}
                      download={ds.filename}
                      className="od-btn od-btn-primary od-btn-sm"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      {t('pages.openData.download')}
                    </a>
                    <a
                      href={ds.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="od-btn od-btn-ghost od-btn-sm"
                    >
                      {t('pages.openData.viewRaw')}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* DEVELOPERS / CODE EXAMPLES */}
        <section id="developers" className="od-section">
          <div className="od-section-head">
            <span className="od-section-tag">02</span>
            <h2>{t('pages.openData.devTitle')}</h2>
          </div>

          <div className="od-dev-grid">
            {DATASETS.map((ds) => {
              const activeLang = activeLangByDs[ds.key] || 'curl';
              return (
                <div key={ds.key} className="od-dev-block">
                  <div className="od-dev-block-head">
                    <h4>{t(`pages.openData.datasets.${ds.key}.title`)}</h4>
                    <div className="od-tabs" role="tablist" aria-label={ds.key}>
                      {CODE_LANGS.map(lang => (
                        <button
                          key={lang}
                          type="button"
                          role="tab"
                          aria-selected={activeLang === lang}
                          className={`od-tab${activeLang === lang ? ' od-tab--active' : ''}`}
                          onClick={() => setLang(ds.key, lang)}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>
                  <pre className="od-code"><code>{buildCodeExample(activeLang, origin, ds.url, ds.filename)}</code></pre>
                </div>
              );
            })}
          </div>
        </section>

        {/* CATALOG DCAT-AP (F3) */}
        <section id="catalog" className="od-section">
          <div className="od-section-head">
            <span className="od-section-tag">03</span>
            <h2>{t('pages.openData.catalogTitle')}</h2>
          </div>
          <a
            href="/api/v1/catalog/datasets"
            target="_blank"
            rel="noopener noreferrer"
            className="od-catalog-card"
          >
            <div className="od-catalog-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h8M8 9h2"/>
              </svg>
            </div>
            <div className="od-catalog-body">
              <div className="od-catalog-head">
                <h3>{t('pages.openData.catalogCardTitle')}</h3>
                <span className="od-badge od-badge-format">DCAT-AP · JSON-LD</span>
              </div>
              <p>{t('pages.openData.catalogCardDesc')}</p>
              <code className="od-catalog-url">GET /api/v1/catalog/datasets</code>
            </div>
            <svg className="od-catalog-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </a>
        </section>

        {/* COMING SOON */}
        <section className="od-section">
          <div className="od-section-head">
            <span className="od-section-tag">04</span>
            <h2>{t('pages.openData.roadmapTitle')}</h2>
          </div>

          <div className="od-soon-grid">
            {COMING_SOON.map((cs) => (
              <article key={cs.key} className="od-soon-card">
                <div className="od-soon-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {cs.iconPath}
                  </svg>
                </div>
                <div className="od-soon-meta">
                  <span className="od-soon-sprint">{cs.sprint}</span>
                  <h4>{t(`pages.openData.soon.${cs.key}.title`)}</h4>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* LICENCE / ATTRIBUTION — declaracao CC BY 4.0 com link oficial */}
        <section id="licence" className="od-licence">
          <div className="od-licence-body">
            <h3>{t('pages.openData.licenceTitle')}</h3>
            <p>{t('pages.openData.licenceText')}</p>

            <div className="od-attribution">
              <span className="od-attribution-label">{t('pages.openData.attributionLabel')}</span>
              <code>{t('pages.openData.attribution', { name: 'TUB - Transportes Urbanos de Braga' })}</code>
            </div>

            {/* Badge oficial 88x31 servido por licensebuttons.net (CDN da CC) — clicavel leva ao deed */}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="license noopener noreferrer"
              className="od-licence-button"
              aria-label="Creative Commons Attribution 4.0 International (abre em nova janela)"
              title={t('pages.openData.viewLegalCode')}
            >
              <img
                src="https://licensebuttons.net/l/by/4.0/88x31.png"
                alt="CC BY 4.0"
                width="88"
                height="31"
              />
            </a>
          </div>
        </section>
      </main>

      <footer className="od-footer">
        <div className="od-footer-inner">
          <div className="od-footer-brand">
            <TubLogo size={20} />
            <span className="od-brand-divider" aria-hidden="true" />
            <span>{t('pages.openData.footerMeta')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
