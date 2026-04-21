import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

/**
 * Wrapper de rota que exige autenticação.
 * Se não autenticado, redireciona para a Landing page.
 */
export default function ProtectedRoute({ children }) {
  const { authenticated } = useAuth();

  if (!authenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}
