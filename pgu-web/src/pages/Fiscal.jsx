import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import { createStompClient } from '../services/stompClient';
import { useAuth } from '../context/AuthProvider';
import { createBusIcon } from '../components/livemap/constants';
import ThemeSwitcher from '../components/ThemeSwitcher';
import LanguageSwitcher from '../components/LanguageSwitcher';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import AccountForm from '../components/AccountForm';
import './Fiscal.css';

/**
 * Sprint 5 follow-up: Painel do Fiscal (v3, com mapa + resolvidas).
 *
 * - 3 KPIs: pendentes / a minha carga / resolvidas hoje.
 * - 3 tabs: pendentes / a minha carga / resolvidas (com filtro RESOLVIDA / FALSO_POSITIVO).
 * - Cada fraude pendente/em curso: mini-mapa com localizacao do bus + paragem mais proxima.
 * - Resolvida: clicar abre detalhe (acao corretiva ou justificacao FP).
 */
export default function Fiscal() {
  const { t, i18n } = useTranslation();
  const { logout, username: authUsername, authenticated } = useAuth();
  const [fraudes, setFraudes] = useState([]);
  const [historico, setHistorico] = useState([]); // resolvidas + FP hoje
  const [loading, setLoading] = useState(true);
  const [reportFor, setReportFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [filter, setFilter] = useState('pending'); // pending | mine | resolved
  const [resolvedSub, setResolvedSub] = useState('all'); // all | resolved | false
  const [submitting, setSubmitting] = useState(false);
  const [live, setLive] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountData, setAccountData] = useState(null);
  const username = authUsername || 'fiscal';
  const locale = i18n.language?.startsWith('en') ? 'en-GB' : 'pt-PT';

  // ─── Account (perfil / password / avatar) ────────────────────
  useEffect(() => {
    if (!authenticated || accountData) return;
    api.get('/me')
      .then(({ data }) => setAccountData(data))
      .catch(() => { /* silencioso — o user nao tem perfil ainda */ });
  }, [authenticated, accountData]);

  const handleSaveProfile = async (patch) => {
    const { data } = await api.patch('/me', patch);
    setAccountData(data);
    toast.success(t('common.savedOk', 'Guardado.'));
  };
  const handleChangePassword = async (currentPassword, newPassword) => {
    await api.post('/me/password', { currentPassword, newPassword });
    toast.success(t('common.passwordChanged', 'Password actualizada.'));
  };
  const handleUploadAvatar = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/me/avatar', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    setAccountData((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
  };
  const handleDeleteAvatar = async () => {
    await api.delete('/me/avatar');
    setAccountData((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
  };

  const load = () => {
    Promise.all([
      api.get('/ocorrencias', { params: { estado: 'ABERTA' } }).then(r => r.data).catch(() => []),
      api.get('/ocorrencias', { params: { estado: 'EM_CURSO' } }).then(r => r.data).catch(() => []),
      api.get('/ocorrencias', { params: { estado: 'RESOLVIDA' } }).then(r => r.data).catch(() => []),
      api.get('/ocorrencias', { params: { estado: 'FALSO_POSITIVO' } }).then(r => r.data).catch(() => []),
    ]).then(([abertas, emCurso, resolvidas, fp]) => {
      const fraudOnly = arr => (Array.isArray(arr) ? arr : []).filter(o => o.tipoAnomalia === 'FRAUDE');
      setFraudes([...fraudOnly(abertas), ...fraudOnly(emCurso)]);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const isToday = ts => ts && new Date(ts) >= today;
      setHistorico([
        ...fraudOnly(resolvidas).filter(o => isToday(o.timestampFecho)).map(o => ({ ...o, _outcome: 'RESOLVIDA' })),
        ...fraudOnly(fp).filter(o => isToday(o.timestampFecho)).map(o => ({ ...o, _outcome: 'FALSO_POSITIVO' })),
      ]);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const client = createStompClient({
      onConnect: () => {
        setLive(true);
        client.subscribe('/topic/ocorrencias', msg => {
          try {
            const ev = JSON.parse(msg.body);
            if (ev?.tipoAnomalia === 'FRAUDE') {
              load();
              toast.info(`🚨 ${t('pages.fiscal.newToast', 'Nova fraude reportada')}: ${ev.ativoId || ''}`);
            }
          } catch { /* ignore */ }
        });
      },
      onDisconnect: () => setLive(false),
      onStompError: () => setLive(false),
    });
    client.activate();
    return () => { setLive(false); client.deactivate(); };
  }, [t]);

  const assumir = async (o) => {
    try {
      await api.post(`/ocorrencias/${o.id}/assumir`);
      toast.success(t('pages.fiscal.assumedOk', 'Assumiste a fraude.'));
      load();
    } catch (err) {
      toast.error(t('pages.fiscal.assumedError', 'Falhou: ') + (err.response?.data?.message || err.message));
    }
  };

  const submitReport = async (e) => {
    e.preventDefault();
    if (!reportFor || submitting) return;
    setSubmitting(true);
    const fd = new FormData(e.target);
    const acao = fd.get('acao');
    const outcome = fd.get('outcome');
    try {
      await api.post(`/ocorrencias/${reportFor.id}/acao-corretiva`, { acaoCorretiva: acao });
      if (outcome === 'FALSO_POSITIVO') {
        await api.post(`/ocorrencias/${reportFor.id}/falso-positivo`, { justificacao: acao });
      } else {
        await api.post(`/ocorrencias/${reportFor.id}/fechar`);
      }
      toast.success(t('pages.fiscal.reportedOk', 'Relatório enviado.'));
      setReportFor(null);
      load();
    } catch (err) {
      toast.error(t('pages.fiscal.reportedError', 'Falhou: ') + (err.response?.data?.message || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Derivados ───────────────────────────────────────────────
  const pending = fraudes.filter(o => !o.timestampAssumida);
  const mine = fraudes.filter(o => o.timestampAssumida && o.responsavel === username);
  const othersInProgress = fraudes.filter(o => o.timestampAssumida && o.responsavel !== username);
  const resolvedToday = historico.filter(o => o._outcome === 'RESOLVIDA').length;
  const falseToday = historico.filter(o => o._outcome === 'FALSO_POSITIVO').length;

  const sortDesc = (a, b) => new Date(b.timestampAbertura || 0) - new Date(a.timestampAbertura || 0);

  const activeList = useMemo(() => {
    let list;
    if (filter === 'pending') list = pending;
    else if (filter === 'mine') list = mine;
    else list = [];
    return [...list].sort(sortDesc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, fraudes, username]);

  const resolvedList = useMemo(() => {
    let list = historico;
    if (resolvedSub === 'resolved') list = list.filter(o => o._outcome === 'RESOLVIDA');
    else if (resolvedSub === 'false') list = list.filter(o => o._outcome === 'FALSO_POSITIVO');
    return [...list].sort((a, b) => new Date(b.timestampFecho || 0) - new Date(a.timestampFecho || 0));
  }, [historico, resolvedSub]);

  // ─── Helpers ─────────────────────────────────────────────────
  const initials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase() || '?';
  };
  const relTime = (ts) => {
    if (!ts) return '—';
    const diffMs = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diffMs / 60000);
    if (m < 1) return t('pages.fiscal.justNow', 'agora mesmo');
    if (m < 60) return t('pages.fiscal.minsAgo', '{{n}} min', { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t('pages.fiscal.hoursAgo', '{{n}} h', { n: h });
    return new Date(ts).toLocaleDateString(locale);
  };

  return (
    <div className="fiscal-page">
      <header className="fiscal-header">
        <div className="fiscal-header-left">
          <div className="fiscal-logo" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div>
            <h1>{t('pages.fiscal.title', 'Painel do Fiscal')}</h1>
            <p className="fiscal-subtitle">
              <span className={`fiscal-live-dot ${live ? 'is-live' : ''}`} />
              {live ? t('pages.fiscal.liveOn', 'Em direto') : t('pages.fiscal.liveOff', 'A reconectar...')}
              <span className="fiscal-sep">•</span>
              {t('pages.fiscal.subtitle', 'Alertas de fraude em tempo real')}
            </p>
          </div>
        </div>
        <div className="fiscal-header-right">
          <button
            type="button"
            className="fiscal-account-btn"
            onClick={() => setAccountOpen(true)}
            title={t('pages.bordo.accountButton', 'Conta')}
            aria-label={t('pages.bordo.accountButton', 'Conta')}
          >
            <Avatar
              url={accountData?.avatarUrl}
              name={
                [accountData?.firstName, accountData?.lastName].filter(Boolean).join(' ').trim()
                || accountData?.username
                || username
              }
              size="sm"
            />
            <span className="fiscal-account-meta">
              <span className="fiscal-account-name">
                {[accountData?.firstName, accountData?.lastName].filter(Boolean).join(' ').trim() || username}
              </span>
              <span className="fiscal-account-role">{t('auth.roles.fiscal', 'Fiscal')}</span>
            </span>
          </button>
          <button
            type="button"
            className="fiscal-logout-btn"
            onClick={logout}
            title={t('common.logout', 'Sair')}
            aria-label={t('common.logout', 'Sair')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>{t('common.logout', 'Sair')}</span>
          </button>
          <div className="fiscal-switchers">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      {/* Modal de conta */}
      <Modal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={t('pages.bordo.accountModalTitle', 'A minha conta')}
      >
        <AccountForm
          initialData={accountData}
          onSaveProfile={handleSaveProfile}
          onChangePassword={handleChangePassword}
          onUploadAvatar={handleUploadAvatar}
          onDeleteAvatar={handleDeleteAvatar}
          compact
        />
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => setAccountOpen(false)}>
            {t('common.close', 'Fechar')}
          </button>
        </div>
      </Modal>

      <main className="fiscal-content">
        {/* KPIs — 3 cards */}
        <section className="fiscal-kpis" aria-label={t('pages.fiscal.kpisLabel', 'Resumo')}>
          <KpiCard tone="alert" label={t('pages.fiscal.kpiPending', 'Pendentes')} value={pending.length} icon="alert" />
          <KpiCard tone="active" label={t('pages.fiscal.kpiMine', 'A minha carga')} value={mine.length} icon="user" />
          <KpiCard tone="ok" label={t('pages.fiscal.kpiResolved', 'Resolvidas hoje')} value={resolvedToday + falseToday} icon="check" />
        </section>

        {/* Tabs */}
        <nav className="fiscal-tabs" role="tablist">
          <button
            role="tab"
            className={`fiscal-tab ${filter === 'pending' ? 'is-active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            {t('pages.fiscal.tabPending', 'Pendentes')}
            <span className="fiscal-tab-count">{pending.length}</span>
          </button>
          <button
            role="tab"
            className={`fiscal-tab ${filter === 'mine' ? 'is-active' : ''}`}
            onClick={() => setFilter('mine')}
          >
            {t('pages.fiscal.tabMine', 'A minha carga')}
            <span className="fiscal-tab-count">{mine.length}</span>
          </button>
          <button
            role="tab"
            className={`fiscal-tab ${filter === 'resolved' ? 'is-active' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            {t('pages.fiscal.tabResolved', 'Resolvidas')}
            <span className="fiscal-tab-count">{historico.length}</span>
          </button>
          {filter !== 'resolved' && othersInProgress.length > 0 && (
            <span className="fiscal-hint">
              {t('pages.fiscal.hintOthers', '{{n}} a serem tratadas por outros fiscais', { n: othersInProgress.length })}
            </span>
          )}
        </nav>

        {/* Sub-filtro no resolved */}
        {filter === 'resolved' && (
          <nav className="fiscal-subtabs">
            <button className={`fiscal-subtab ${resolvedSub === 'all' ? 'is-active' : ''}`} onClick={() => setResolvedSub('all')}>
              {t('pages.fiscal.subAll', 'Todas')}
              <span className="fiscal-subtab-count">{historico.length}</span>
            </button>
            <button className={`fiscal-subtab ${resolvedSub === 'resolved' ? 'is-active' : ''}`} onClick={() => setResolvedSub('resolved')}>
              {t('pages.fiscal.subResolved', 'Resolvidas')}
              <span className="fiscal-subtab-count">{resolvedToday}</span>
            </button>
            <button className={`fiscal-subtab ${resolvedSub === 'false' ? 'is-active' : ''}`} onClick={() => setResolvedSub('false')}>
              {t('pages.fiscal.subFalse', 'Falsos positivos')}
              <span className="fiscal-subtab-count">{falseToday}</span>
            </button>
          </nav>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="fiscal-list">
            {[0, 1, 2].map(i => <div key={i} className="fiscal-card fiscal-card--skeleton" />)}
          </div>
        )}

        {/* Empty states */}
        {!loading && filter !== 'resolved' && activeList.length === 0 && (
          <EmptyState
            title={t('pages.fiscal.emptyTitle', 'Tudo tranquilo')}
            sub={t('pages.fiscal.emptySub', 'Sem fraudes pendentes. As novas vão aparecer aqui em tempo real.')}
          />
        )}
        {!loading && filter === 'resolved' && resolvedList.length === 0 && (
          <EmptyState
            title={t('pages.fiscal.emptyResolvedTitle', 'Sem resolvidas hoje')}
            sub={t('pages.fiscal.emptyResolvedSub', 'À medida que fechares fraudes vão aparecer aqui.')}
          />
        )}

        {/* Lista activa (pending/mine) */}
        {!loading && filter !== 'resolved' && activeList.length > 0 && (
          <div className="fiscal-list">
            {activeList.map(f => (
              <ActiveCard
                key={f.id}
                f={f}
                username={username}
                t={t}
                locale={locale}
                relTime={relTime}
                onAssume={() => assumir(f)}
                onReport={() => setReportFor(f)}
              />
            ))}
          </div>
        )}

        {/* Lista resolvidas */}
        {!loading && filter === 'resolved' && resolvedList.length > 0 && (
          <div className="fiscal-list">
            {resolvedList.map(f => (
              <ResolvedCard
                key={f.id}
                f={f}
                t={t}
                locale={locale}
                onOpen={() => setDetailFor(f)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modal de relatório */}
      {reportFor && (
        <div className="fiscal-modal-overlay" onClick={() => !submitting && setReportFor(null)}>
          <form className="fiscal-modal" onClick={e => e.stopPropagation()} onSubmit={submitReport}>
            <header className="fiscal-modal-header">
              <h2>{t('pages.fiscal.reportTitle', 'Relatório da fiscalização')}</h2>
              <p className="fiscal-modal-meta">
                <strong>{reportFor.ativoId}</strong>
                <span className="fiscal-sep">•</span>
                {new Date(reportFor.timestampAbertura).toLocaleString(locale)}
              </p>
            </header>
            {reportFor.descricao && (
              <div className="fiscal-modal-context">
                <span className="fiscal-modal-context-label">{t('pages.fiscal.reportedBy', 'Reportado pelo motorista')}</span>
                <p>{reportFor.descricao}</p>
              </div>
            )}
            <label>
              <span>{t('pages.fiscal.fldAction', 'O que aconteceu / acção tomada')}</span>
              <textarea
                name="acao"
                required
                rows="6"
                placeholder={t('pages.fiscal.fldActionPh', 'Descreve a verificação no terreno, sanção aplicada, identificação do passageiro (se houver), etc.')}
              />
            </label>
            <label>
              <span>{t('pages.fiscal.fldOutcome', 'Resultado')}</span>
              <select name="outcome" required defaultValue="RESOLVIDA">
                <option value="RESOLVIDA">{t('pages.fiscal.outcomeResolved', 'Resolvida (fraude confirmada / contraordenação)')}</option>
                <option value="FALSO_POSITIVO">{t('pages.fiscal.outcomeFalse', 'Falso positivo (sem fraude)')}</option>
              </select>
            </label>
            <div className="fiscal-modal-actions">
              <button type="button" className="fiscal-btn-secondary" disabled={submitting} onClick={() => setReportFor(null)}>
                {t('common.cancel', 'Cancelar')}
              </button>
              <button type="submit" className="fiscal-btn-primary" disabled={submitting}>
                {submitting ? t('common.submitting', 'A submeter...') : t('common.submit', 'Submeter')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de detalhe (resolvida) */}
      {detailFor && (
        <div className="fiscal-modal-overlay" onClick={() => setDetailFor(null)}>
          <div className="fiscal-modal" onClick={e => e.stopPropagation()}>
            <header className="fiscal-modal-header">
              <h2>
                {detailFor._outcome === 'FALSO_POSITIVO'
                  ? t('pages.fiscal.detailTitleFalse', 'Falso positivo')
                  : t('pages.fiscal.detailTitleResolved', 'Fraude resolvida')}
              </h2>
              <p className="fiscal-modal-meta">
                <strong>{detailFor.ativoId}</strong>
                <span className="fiscal-sep">•</span>
                {t('pages.fiscal.detailReportedAt', 'reportada')} {new Date(detailFor.timestampAbertura).toLocaleString(locale)}
                <span className="fiscal-sep">•</span>
                {t('pages.fiscal.detailClosedAt', 'fechada')} {new Date(detailFor.timestampFecho).toLocaleString(locale)}
              </p>
            </header>
            {detailFor.descricao && (
              <div className="fiscal-modal-context">
                <span className="fiscal-modal-context-label">{t('pages.fiscal.reportedBy', 'Reportado pelo motorista')}</span>
                <p>{detailFor.descricao}</p>
              </div>
            )}
            <div className="fiscal-modal-section">
              <span className="fiscal-modal-context-label">
                {detailFor._outcome === 'FALSO_POSITIVO'
                  ? t('pages.fiscal.fldJustification', 'Justificação do falso positivo')
                  : t('pages.fiscal.fldAction', 'Acção tomada')}
              </span>
              <p>
                {detailFor._outcome === 'FALSO_POSITIVO'
                  ? (detailFor.falsoPositivoJustificacao || detailFor.acaoCorretiva || '—')
                  : (detailFor.acaoCorretiva || '—')}
              </p>
            </div>
            <p className="fiscal-meta">
              {t('pages.fiscal.handledBy', 'Tratada por')}: <strong>{detailFor.responsavel || '—'}</strong>
            </p>
            <div className="fiscal-modal-actions">
              <button className="fiscal-btn-primary" onClick={() => setDetailFor(null)}>
                {t('common.close', 'Fechar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────
function KpiCard({ tone, label, value, icon }) {
  const icons = {
    alert: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    user:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    check: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  };
  return (
    <div className={`fiscal-kpi fiscal-kpi--${tone}`}>
      <div className="fiscal-kpi-icon">{icons[icon]}</div>
      <div className="fiscal-kpi-text">
        <span className="fiscal-kpi-value">{value}</span>
        <span className="fiscal-kpi-label">{label}</span>
      </div>
    </div>
  );
}

function EmptyState({ title, sub }) {
  return (
    <div className="fiscal-empty">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
      <h3>{title}</h3>
      <p>{sub}</p>
    </div>
  );
}

function ActiveCard({ f, username, t, locale, relTime, onAssume, onReport }) {
  const assumida = !!f.timestampAssumida;
  const isMine = f.responsavel === username;
  const ownState = assumida ? (isMine ? 'mine' : 'others') : 'pending';
  return (
    <article className={`fiscal-card fiscal-card--${ownState}`}>
      <div className="fiscal-card-bar" aria-hidden="true" />
      <div className="fiscal-card-body">
        <div className="fiscal-card-header">
          <span className="fiscal-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {t('pages.fiscal.fraudLabel', 'FRAUDE')}
          </span>
          <span className="fiscal-bus">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h20"/><path d="M7 18h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>
            {f.ativoId}
          </span>
          <span className="fiscal-time" title={f.timestampAbertura ? new Date(f.timestampAbertura).toLocaleString(locale) : ''}>
            {relTime(f.timestampAbertura)}
          </span>
        </div>
        {f.descricao && <p className="fiscal-desc">{f.descricao}</p>}

        {/* Mini-mapa de localização */}
        <FiscalMiniMap ocorrenciaId={f.id} t={t} />

        {assumida && (
          <p className="fiscal-meta">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {t('pages.fiscal.assumedBy', 'Assumida por')} <strong>{f.responsavel}</strong>
            {' '}· {relTime(f.timestampAssumida)}
          </p>
        )}
        <div className="fiscal-actions">
          {!assumida && (
            <button className="fiscal-btn-primary" onClick={onAssume}>
              {t('pages.fiscal.takeIt', 'Vou resolver')}
            </button>
          )}
          {assumida && isMine && (
            <button className="fiscal-btn-primary" onClick={onReport}>
              {t('pages.fiscal.report', 'Reportar resolução')}
            </button>
          )}
          {assumida && !isMine && (
            <span className="fiscal-locked">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              {t('pages.fiscal.lockedByOther', 'Em curso por outro fiscal')}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function ResolvedCard({ f, t, locale, onOpen }) {
  const isFP = f._outcome === 'FALSO_POSITIVO';
  return (
    <article
      className={`fiscal-card fiscal-card--${isFP ? 'false' : 'resolved'} fiscal-card--clickable`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
    >
      <div className="fiscal-card-bar" aria-hidden="true" />
      <div className="fiscal-card-body">
        <div className="fiscal-card-header">
          <span className={`fiscal-badge ${isFP ? 'fiscal-badge--false' : 'fiscal-badge--resolved'}`}>
            {isFP
              ? t('pages.fiscal.badgeFalse', 'FALSO POSITIVO')
              : t('pages.fiscal.badgeResolved', 'RESOLVIDA')}
          </span>
          <span className="fiscal-bus">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h20"/><path d="M7 18h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>
            {f.ativoId}
          </span>
          <span className="fiscal-time">
            {f.timestampFecho ? new Date(f.timestampFecho).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '—'}
          </span>
        </div>
        {f.descricao && <p className="fiscal-desc fiscal-desc--clip">{f.descricao}</p>}
        <p className="fiscal-meta">
          <strong>{f.responsavel || '—'}</strong>
          <span className="fiscal-sep">•</span>
          {t('pages.fiscal.clickToOpen', 'clica para ver detalhe')}
        </p>
      </div>
    </article>
  );
}

// ─── Mini-mapa Leaflet ──────────────────────────────────────────
function FiscalMiniMap({ ocorrenciaId, t }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(`/ocorrencias/${ocorrenciaId}/location-context`)
      .then(r => { if (!cancelled) setCtx(r.data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ocorrenciaId]);

  useEffect(() => {
    if (!ctx || !containerRef.current || mapRef.current) return;
    if (!ctx.busLat || !ctx.busLon) return;

    const map = L.map(containerRef.current, {
      attributionControl: false,
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: false,
      doubleClickZoom: false,
      keyboard: false,
      touchZoom: false,
    }).setView([ctx.busLat, ctx.busLon], 16);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Marker do bus — usa o mesmo factory do Livemap para coerencia visual.
    // Forca 'stopping' (cor de alerta laranja) para sinalizar que ha incidente.
    L.marker([ctx.busLat, ctx.busLon], { icon: createBusIcon('stopping') }).addTo(map);

    const bounds = [[ctx.busLat, ctx.busLon]];

    // Marker da paragem mais próxima — azul TUB
    if (ctx.nearestStopLat && ctx.nearestStopLon) {
      const stopIcon = L.divIcon({
        className: 'fiscal-map-stop',
        html: '<div class="fiscal-map-stop-dot" title="Paragem mais próxima">P</div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([ctx.nearestStopLat, ctx.nearestStopLon], { icon: stopIcon }).addTo(map);
      L.polyline(
        [[ctx.busLat, ctx.busLon], [ctx.nearestStopLat, ctx.nearestStopLon]],
        { color: '#009BDB', weight: 3, opacity: 0.55, dashArray: '6 6' }
      ).addTo(map);
      bounds.push([ctx.nearestStopLat, ctx.nearestStopLon]);
    }

    // Marker da paragem DESTINO (para onde o bus vai) — verde, com seta
    if (ctx.destStopLat && ctx.destStopLon) {
      const destIcon = L.divIcon({
        className: 'fiscal-map-dest',
        html: '<div class="fiscal-map-dest-dot" title="Paragem destino">→</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([ctx.destStopLat, ctx.destStopLon], { icon: destIcon }).addTo(map);
      // Linha bus → destino: cor verde mais forte para distinguir da nearest
      L.polyline(
        [[ctx.busLat, ctx.busLon], [ctx.destStopLat, ctx.destStopLon]],
        { color: '#10b981', weight: 3, opacity: 0.75 }
      ).addTo(map);
      bounds.push([ctx.destStopLat, ctx.destStopLon]);
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
    }

    return () => {
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    };
  }, [ctx]);

  if (loading) {
    return <div className="fiscal-map fiscal-map--loading">{t('common.loading', 'A carregar...')}</div>;
  }
  if (error || !ctx || !ctx.busLat) {
    return (
      <div className="fiscal-map fiscal-map--empty">
        {t('pages.fiscal.mapNoLoc', 'Sem localização recente do autocarro.')}
      </div>
    );
  }
  return (
    <div className="fiscal-map-wrap">
      <div ref={containerRef} className="fiscal-map" />
      <div className="fiscal-map-captions">
        {ctx.destStopName && (
          <p className="fiscal-map-caption fiscal-map-caption--dest">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            {t('pages.fiscal.destStop', 'Em direção a')}: <strong>{ctx.destStopName}</strong>
            {ctx.destStopDistanceMeters != null && <span> ({ctx.destStopDistanceMeters} m)</span>}
          </p>
        )}
        {ctx.nearestStopName && (
          <p className="fiscal-map-caption">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 7 8 12 8 12s8-5 8-12a8 8 0 0 0-8-8z"/></svg>
            {t('pages.fiscal.nearestStop', 'Paragem mais próxima')}: <strong>{ctx.nearestStopName}</strong>
            {ctx.nearestStopDistanceMeters != null && <span> ({ctx.nearestStopDistanceMeters} m)</span>}
          </p>
        )}
      </div>
    </div>
  );
}
