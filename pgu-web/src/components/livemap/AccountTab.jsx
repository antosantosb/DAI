import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider';

export default function AccountTab() {
  const { username, roles, logout } = useAuth();
  const navigate = useNavigate();

  const roleLabel = roles.includes('admin') ? 'Administrador' : 'Operador';

  return (
    <div className="livemap-account">
      <div className="livemap-account-avatar">
        <span>{(username || '?')[0].toUpperCase()}</span>
      </div>
      <div className="livemap-account-info">
        <span className="livemap-account-name">{username || 'Utilizador'}</span>
        <span className="livemap-account-role">{roleLabel}</span>
      </div>
      <div className="livemap-account-actions">
        <button className="livemap-btn-home" onClick={() => navigate('/')}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M3 10L10 3L17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 8.5V16C5 16.55 5.45 17 6 17H8.5V12.5H11.5V17H14C14.55 17 15 16.55 15 16V8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Página Inicial
        </button>
        <button className="livemap-btn-logout" onClick={logout}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
          Terminar Sessão
        </button>
      </div>
    </div>
  );
}
