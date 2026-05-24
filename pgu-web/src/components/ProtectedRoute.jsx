import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

/**
 * Wrapper de rota que exige autenticação.
 * Se não autenticado, redireciona para a Landing page.
 * Se autenticado como motorista, redireciona para o painel de bordo
 * (motoristas não têm acesso a backoffice nem livemap).
 */
export default function ProtectedRoute({ children }) {
  const { authenticated, roles } = useAuth();

  if (!authenticated) {
    return <Navigate to="/" replace />;
  }

  if (roles.includes('motorista')) {
    return <Navigate to="/bordo" replace />;
  }

  return children;
}
