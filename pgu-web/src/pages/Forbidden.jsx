import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import './Forbidden.css';

/**
 * Sprint 0 (F1): pagina 403.
 *
 * Mostrada quando o user esta autenticado mas nao tem o role necessario
 * para a rota que pediu. Tem botoes para voltar atras e fazer logout.
 */
export default function Forbidden() {
  const navigate = useNavigate();
  const { authenticated, username, roles, logout } = useAuth();

  return (
    <div className="forbidden-page">
      <div className="forbidden-card">
        <div className="forbidden-code">403</div>
        <h1 className="forbidden-title">Sem permissão</h1>
        <p className="forbidden-message">
          Não tens permissão para aceder a esta página.
        </p>
        {authenticated && (
          <p className="forbidden-meta">
            Sessão: <strong>{username}</strong>
            {roles.length > 0 && (
              <>
                {' '}
                · roles: <strong>{roles.join(', ')}</strong>
              </>
            )}
          </p>
        )}
        <div className="forbidden-actions">
          <button
            type="button"
            className="forbidden-btn forbidden-btn-primary"
            onClick={() => navigate(-1)}
          >
            Voltar
          </button>
          <button
            type="button"
            className="forbidden-btn forbidden-btn-secondary"
            onClick={() => navigate('/')}
          >
            Página inicial
          </button>
          {authenticated && (
            <button
              type="button"
              className="forbidden-btn forbidden-btn-ghost"
              onClick={logout}
            >
              Terminar sessão
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
