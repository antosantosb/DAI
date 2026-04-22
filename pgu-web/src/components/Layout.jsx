import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import {
  IconDashboard, IconAnalytics, IconBus, IconHealth,
  IconStop, IconRoute, IconExport, IconAudit,
} from './NavIcon';
import './Layout.css';

export default function Layout() {
  const { logout, username, roles } = useAuth();
  const navigate = useNavigate();

  const isAdmin = roles.includes('admin');
  const displayRole = isAdmin ? 'Administrador' : 'Operador';
  const avatarLetter = username ? username.charAt(0).toUpperCase() : '?';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">T</div>
            <div>
              <h2>TUB</h2>
              <small>Backoffice</small>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Principal</span>
          <NavLink to="/backoffice" end>
            <span className="nav-icon"><IconDashboard /></span>
            Dashboard
          </NavLink>
          <NavLink to="/backoffice/analytics">
            <span className="nav-icon"><IconAnalytics /></span>
            Analytics
          </NavLink>
          <NavLink to="/backoffice/buses">
            <span className="nav-icon"><IconBus /></span>
            Autocarros
          </NavLink>
          <NavLink to="/backoffice/health">
            <span className="nav-icon"><IconHealth /></span>
            Saúde da Rede
          </NavLink>
          <span className="sidebar-section-label">Gestão</span>
          <NavLink to="/backoffice/stops">
            <span className="nav-icon"><IconStop /></span>
            Paragens
          </NavLink>
          <NavLink to="/backoffice/routes">
            <span className="nav-icon"><IconRoute /></span>
            Rotas
          </NavLink>
          <NavLink to="/backoffice/exports">
            <span className="nav-icon"><IconExport /></span>
            Exportações
          </NavLink>
          <NavLink to="/backoffice/audit">
            <span className="nav-icon"><IconAudit /></span>
            Logs
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-user">
            <div className="sidebar-avatar">{avatarLetter}</div>
            <div className="sidebar-footer-info">
              <span className="sidebar-footer-name">{username}</span>
              <span className="sidebar-footer-role">{displayRole}</span>
            </div>
          </div>
          <div className="sidebar-footer-actions">
            <button className="sidebar-home" onClick={() => navigate('/')} title="Voltar ao início">
              <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
                <path d="M3 10L10 3L17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 8.5V16C5 16.55 5.45 17 6 17H8.5V12.5H11.5V17H14C14.55 17 15 16.55 15 16V8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="sidebar-logout" onClick={logout} title="Sair">
              <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
                <path d="M7 17H4C3.45 17 3 16.55 3 16V4C3 3.45 3.45 3 4 3H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M13 14L17 10L13 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="17" y1="10" x2="7" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
