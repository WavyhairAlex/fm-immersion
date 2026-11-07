import { Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { UpdateGate } from './components/UpdateGate';
import { useGazetteAuto } from './lib/gazette-auto';
import { useLiveDiscord } from './lib/live-discord';
import { Discord } from './pages/Discord';
import { Faces } from './pages/Faces';
import { FmSave } from './pages/FmSave';
import { Gazette } from './pages/Gazette';
import { Home } from './pages/Home';
import { Overview } from './pages/Overview';
import { Soon } from './pages/Soon';

export function App() {
  useLiveDiscord();
  useGazetteAuto();
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
            <Route path="/gazette" element={<Gazette />} />
            <Route path="/discord" element={<Discord />} />
            <Route path="/monde" element={<Soon mode="world" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </UpdateGate>
  );
}
