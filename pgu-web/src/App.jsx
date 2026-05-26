// Sprint 0 (F1): app shell com routes manifest + lazy loading + role guards.
//
// Antes: rotas hardcoded e imports estaticos no topo (todo o JS de todas as
// paginas era descarregado no primeiro load).
// Agora: itera-se `routes` (manifest em src/routes.js), cada loader e
// React.lazy + Suspense, cada rota nao-publica passa por ProtectedRoute
// com `requiredRoles` apropriados.

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastContainer, Slide } from 'react-toastify';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import GlobalToastListener from './components/GlobalToastListener';
import { routes } from './routes';

import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import './toast-overrides.css';

// Cache lazy components by loader reference para nao recriar a cada render.
const lazyCache = new Map();
function getLazyComponent(loader) {
  let Comp = lazyCache.get(loader);
  if (!Comp) {
    Comp = lazy(loader);
    lazyCache.set(loader, Comp);
  }
  return Comp;
}

function PageLoading() {
  return (
    <div
      style={{
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255, 255, 255, 0.55)',
        fontSize: 14,
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      A carregar...
    </div>
  );
}

/**
 * Constroi o element JSX de uma rota (com lazy + guard apropriado).
 */
function buildRouteElement(route) {
  const Component = route.loader ? getLazyComponent(route.loader) : null;
  const inner = Component ? <Component /> : null;

  if (route.access === 'public') {
    return inner;
  }

  const requiredRoles = Array.isArray(route.access) ? route.access : null;
  return <ProtectedRoute requiredRoles={requiredRoles}>{inner}</ProtectedRoute>;
}

/**
 * Constroi o element JSX de uma rota com layout (Outlet vem do Layout).
 */
function buildLayoutElement(route) {
  const LayoutComponent = route.layout === 'backoffice' ? Layout : null;
  const inner = LayoutComponent ? <LayoutComponent /> : null;

  const requiredRoles = Array.isArray(route.access) ? route.access : null;
  return <ProtectedRoute requiredRoles={requiredRoles}>{inner}</ProtectedRoute>;
}

/**
 * Para children dentro de um Layout: aplica guard adicional apenas se
 * o child tiver `access` mais restrito que o pai (ex. admin-only).
 */
function buildChildElement(child) {
  const Component = getLazyComponent(child.loader);
  if (!Array.isArray(child.access)) {
    return <Component />;
  }
  return (
    <ProtectedRoute requiredRoles={child.access}>
      <Component />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer
        position="top-right"
        autoClose={5000}
        transition={Slide}
        theme="light"
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss={false}
        pauseOnHover
        draggable
        toastClassName="pgu-toast"
        bodyClassName="pgu-toast-body"
        progressClassName="pgu-toast-progress"
      />
      <GlobalToastListener />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          {routes.map((route) => {
            if (route.children) {
              return (
                <Route key={route.path} path={route.path} element={buildLayoutElement(route)}>
                  {route.children.map((child) => (
                    <Route
                      key={child.path ?? 'index'}
                      index={child.index || undefined}
                      path={child.path}
                      element={buildChildElement(child)}
                    />
                  ))}
                </Route>
              );
            }
            return <Route key={route.path} path={route.path} element={buildRouteElement(route)} />;
          })}
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
