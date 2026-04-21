import { createContext, useContext, useEffect, useRef, useState } from 'react';
import keycloak from '../keycloak';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const didInit = useRef(false);

  useEffect(() => {
    // Guard against StrictMode double-invoke
    if (didInit.current) return;
    didInit.current = true;

    keycloak
      .init({ onLoad: 'check-sso', pkceMethod: 'S256', checkLoginIframe: false })
      .then((auth) => {
        setAuthenticated(auth);
        setReady(true);
      })
      .catch((err) => {
        console.error('Keycloak init failed', err);
        setReady(true);
      });

    // Auto-refresh token
    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => {
        console.warn('Token refresh failed, logging out');
        keycloak.logout({ redirectUri: window.location.origin });
      });
    };
  }, []);

  // Show loading while Keycloak initializes
  if (!ready) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0f172a', color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}>
        A carregar...
      </div>
    );
  }

  const login = () => keycloak.login({ redirectUri: window.location.origin });

  const logout = () =>
    keycloak.logout({ redirectUri: window.location.origin });

  const hasRole = (role) =>
    keycloak.hasRealmRole?.(role) ?? false;

  const username =
    keycloak.tokenParsed?.preferred_username ?? null;

  const roles =
    keycloak.tokenParsed?.realm_access?.roles?.filter(
      (r) => r === 'admin' || r === 'operator'
    ) ?? [];

  const value = {
    keycloak,
    authenticated,
    login,
    logout,
    hasRole,
    username,
    roles,
    token: keycloak.token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
