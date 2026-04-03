import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import CRM from './pages/CRM';
import Service from './pages/Service';
import Inventory from './pages/Inventory';
import Communication from './pages/Communication';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="crm" element={<CRM />} />
          <Route path="service" element={<Service />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="communication" element={<Communication />} />
        </Route>
      </Routes>
    </Router>
  );
}
