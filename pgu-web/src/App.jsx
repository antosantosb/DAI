import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Buses from './pages/Buses';
import Stops from './pages/Stops';
import RoutesPage from './pages/Routes';
import BusHealthDashboard from './pages/BusHealthDashboard';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import Exports from './pages/Exports';
import AuditLogs from './pages/AuditLogs';
import Livemap from './pages/Livemap';
import { ToastContainer, Slide } from 'react-toastify';
import GlobalToastListener from './components/GlobalToastListener';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import './toast-overrides.css';

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
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/backoffice"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="buses" element={<Buses />} />
          <Route path="stops" element={<Stops />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="health" element={<BusHealthDashboard />} />
          <Route path="analytics" element={<AnalyticsDashboard />} />
          <Route path="exports" element={<Exports />} />
          <Route path="audit" element={<AuditLogs />} />
        </Route>
        <Route
          path="/livemap"
          element={
            <ProtectedRoute>
              <Livemap />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
