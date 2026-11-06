import { Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { UpdateGate } from './components/UpdateGate';
import { Faces } from './pages/Faces';
import { FmSave } from './pages/FmSave';
import { Home } from './pages/Home';
import { Overview } from './pages/Overview';
import { Soon } from './pages/Soon';

export function App() {
  return (
    <UpdateGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/visages" element={<Faces />} />
            <Route path="/coach" element={<Home />} />
            <Route path="/fm/:saveId" element={<FmSave />} />
            <Route path="/gazette" element={<Soon mode="gazette" />} />
            <Route path="/discord" element={<Soon mode="discord" />} />
            <Route path="/monde" element={<Soon mode="world" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </UpdateGate>
  );
}
