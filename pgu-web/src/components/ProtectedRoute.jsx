import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

/**
 * Wrapper de rota que faz enforcement de autenticacao e roles.
 *
 * Sprint 0 (F1): aceita prop {@code requiredRoles}.
 *   - `null` ou ausente   -> basta estar autenticado
 *   - array de roles      -> user precisa de pelo menos uma
 *
 * Regras:
 *   - Nao autenticado          -> redireciona para Landing ("/")
 *   - Motorista                -> redireciona para "/bordo" (motoristas
 *                                 nao acedem a backoffice ou livemap)
 *   - Falta role necessario    -> redireciona para "/403"
 *   - Tudo OK                  -> renderiza children
 */
export default function ProtectedRoute({ children, requiredRoles }) {
  const { authenticated, roles } = useAuth();

  if (!authenticated) {
    return <Navigate to="/" replace />;
  }

  // Motoristas tem painel proprio. Nunca devem ver o backoffice ou o livemap.
  // Excecao: se a rota requer explicitamente role 'motorista', deixar passar.
  const requiresMotorista = Array.isArray(requiredRoles) && requiredRoles.includes('motorista');
  if (roles.includes('motorista') && !requiresMotorista) {
    return <Navigate to="/bordo" replace />;
  }

  // Verificar role minimo
  if (Array.isArray(requiredRoles) && requiredRoles.length > 0) {
    const ok = requiredRoles.some((r) => roles.includes(r));
    if (!ok) {
      return <Navigate to="/403" replace />;
    }
  }

  return children;
}
