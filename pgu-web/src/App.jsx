import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Buses from './pages/Buses';
import Stops from './pages/Stops';
import RoutesPage from './pages/Routes';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/backoffice" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="buses" element={<Buses />} />
          <Route path="stops" element={<Stops />} />
          <Route path="routes" element={<RoutesPage />} />
        </Route>
        <Route path="/livemap" element={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#64748b', fontSize: 18 }}>LiveMap — Em breve</div>} />
      </Routes>
    </BrowserRouter>
  );
}
