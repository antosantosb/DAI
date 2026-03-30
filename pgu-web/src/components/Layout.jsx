import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import './Layout.css';

export default function Layout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    // TODO: quando Keycloak estiver ligado, usar keycloak.logout()
    navigate('/');
  };

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
            <span className="nav-icon">&#9632;</span>
            Dashboard
          </NavLink>
          <NavLink to="/backoffice/buses">
            <span className="nav-icon">&#9654;</span>
            Autocarros
          </NavLink>
          <span className="sidebar-section-label">Gestao</span>
          <NavLink to="/backoffice/stops">
            <span className="nav-icon">&#9679;</span>
            Paragens
          </NavLink>
          <NavLink to="/backoffice/routes">
            <span className="nav-icon">&#8623;</span>
            Rotas
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-user">
            <div className="sidebar-avatar">A</div>
            <div className="sidebar-footer-info">
              <span className="sidebar-footer-name">Admin</span>
              <span className="sidebar-footer-role">Administrador</span>
            </div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout} title="Sair">
            <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
              <path d="M7 17H4C3.45 17 3 16.55 3 16V4C3 3.45 3.45 3 4 3H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M13 14L17 10L13 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="17" y1="10" x2="7" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
