import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../services/api';
import { createStompClient } from '../services/stompClient';
import { useAuth } from '../context/AuthProvider';
import './Fiscal.css';

/**
 * Sprint 5 follow-up: Painel do Fiscal.
 *
 * - Lista todas as ocorrencias FRAUDE abertas em tempo real.
 * - Botao "Vou resolver" -> POST /ocorrencias/{id}/assumir (estado=EM_CURSO).
 * - Modal de relatorio -> POST /ocorrencias/{id}/acao-corretiva + /fechar.
 *
 * O role `fiscal` so' tem acesso a esta pagina. Despacho a partir do botao
 * FRAUDE do motorista.
 */
export default function Fiscal() {
  const { t } = useTranslation();
  const { logout, getUsername } = useAuth();
  const [fraudes, setFraudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportFor, setReportFor] = useState(null); // ocorrencia para a qual escreve relatorio
  const username = getUsername?.() || 'fiscal';

  const load = () => {
    api.get('/ocorrencias', { params: { estado: 'ABERTA' } })
      .then(r => {
        const all = Array.isArray(r.data) ? r.data : [];
        const onlyFraude = all.filter(o => o.tipoAnomalia === 'FRAUDE');
        setFraudes(onlyFraude);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const client = createStompClient({
      onConnect: () => {
        client.subscribe('/topic/ocorrencias', msg => {
          try {
            const ev = JSON.parse(msg.body);
            if (ev?.tipoAnomalia === 'FRAUDE') {
              // Refresca lista para apanhar a nova
              load();
              toast.info(t('pages.fiscal.newToast', 'Nova fraude reportada: ') + (ev.ativoId || ''));
            }
          } catch { /* ignore */ }
        });
      },
    });
    client.activate();
    return () => client.deactivate();
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
    if (!reportFor) return;
    const fd = new FormData(e.target);
    const acao = fd.get('acao');
    const outcome = fd.get('outcome'); // RESOLVIDA | FALSO_POSITIVO
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
    }
  };

  return (
    <div className="fiscal-page">
      <header className="fiscal-header">
        <div>
          <h1>{t('pages.fiscal.title', 'Painel do Fiscal')}</h1>
          <p className="fiscal-subtitle">
            {t('pages.fiscal.subtitle', 'Alertas de fraude reportados pelos motoristas em tempo real.')}
          </p>
        </div>
        <div className="fiscal-user">
          <span>{username}</span>
          <button className="fiscal-btn-secondary" onClick={logout}>
            {t('common.logout', 'Sair')}
          </button>
        </div>
      </header>

      {loading && <p style={{ padding: '0 2rem' }}>{t('common.loading', 'A carregar...')}</p>}

      <div className="fiscal-list">
        {fraudes.length === 0 && !loading && (
          <div className="fiscal-empty">
            {t('pages.fiscal.empty', 'Sem fraudes pendentes. Aguarda alertas.')}
          </div>
        )}
        {fraudes.map(f => {
          const assumida = !!f.timestampAssumida;
          const isMine = f.responsavel === username;
          return (
            <article key={f.id} className={`fiscal-card ${assumida ? 'fiscal-card--assumed' : ''}`}>
              <div className="fiscal-card-header">
                <span className="fiscal-badge">FRAUDE</span>
                <span className="fiscal-bus">{f.ativoId}</span>
                <span className="fiscal-time">
                  {f.timestampAbertura ? new Date(f.timestampAbertura).toLocaleTimeString('pt-PT') : '—'}
                </span>
              </div>
              {f.descricao && <p className="fiscal-desc">{f.descricao}</p>}
              {assumida && (
                <p className="fiscal-meta">
                  {t('pages.fiscal.assumedBy', 'Assumida por')}: <strong>{f.responsavel}</strong> · {new Date(f.timestampAssumida).toLocaleTimeString('pt-PT')}
                </p>
              )}
              <div className="fiscal-actions">
                {!assumida && (
                  <button className="fiscal-btn-primary" onClick={() => assumir(f)}>
                    {t('pages.fiscal.takeIt', 'Vou resolver')}
                  </button>
                )}
                {assumida && isMine && (
                  <button className="fiscal-btn-primary" onClick={() => setReportFor(f)}>
                    {t('pages.fiscal.report', 'Reportar resolução')}
                  </button>
                )}
                {assumida && !isMine && (
                  <span className="fiscal-locked">
                    {t('pages.fiscal.lockedByOther', 'Em curso por outro fiscal')}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {reportFor && (
        <div className="fiscal-modal-overlay" onClick={() => setReportFor(null)}>
          <form className="fiscal-modal" onClick={e => e.stopPropagation()} onSubmit={submitReport}>
            <h2>{t('pages.fiscal.reportTitle', 'Relatório da fiscalização')}</h2>
            <p className="fiscal-modal-meta">
              {t('pages.fiscal.bus', 'Autocarro')}: <strong>{reportFor.ativoId}</strong> · {new Date(reportFor.timestampAbertura).toLocaleString('pt-PT')}
            </p>
            <label>
              {t('pages.fiscal.fldAction', 'O que aconteceu / acção tomada')}
              <textarea name="acao" required rows="6" placeholder={t('pages.fiscal.fldActionPh', 'Descreve a verificação no terreno, sanção aplicada, identificação do passageiro (se houver), etc.')}></textarea>
            </label>
            <label>
              {t('pages.fiscal.fldOutcome', 'Resultado')}
              <select name="outcome" required defaultValue="RESOLVIDA">
                <option value="RESOLVIDA">{t('pages.fiscal.outcomeResolved', 'Resolvida (fraude confirmada / contraordenação)')}</option>
                <option value="FALSO_POSITIVO">{t('pages.fiscal.outcomeFalse', 'Falso positivo (sem fraude)')}</option>
              </select>
            </label>
            <div className="fiscal-modal-actions">
              <button type="button" className="fiscal-btn-secondary" onClick={() => setReportFor(null)}>
                {t('common.cancel', 'Cancelar')}
              </button>
              <button type="submit" className="fiscal-btn-primary">
                {t('common.submit', 'Submeter')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
