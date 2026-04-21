import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Buses from './pages/Buses';
import Stops from './pages/Stops';
import RoutesPage from './pages/Routes';
import BusHealthDashboard from './pages/BusHealthDashboard';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import Livemap from './pages/livemap';

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer position="top-right" autoClose={5000} theme="colored" />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/backoffice" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="buses" element={<Buses />} />
          <Route path="stops" element={<Stops />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="health" element={<BusHealthDashboard />} />
          <Route path="analytics" element={<AnalyticsDashboard />} />
        </Route>
        <Route path="/livemap" element={<Livemap />} />
      </Routes>
    </BrowserRouter>
  );
}
