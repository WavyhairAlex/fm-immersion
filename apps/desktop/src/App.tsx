import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { UpdateGate } from './components/UpdateGate';
import { useCareer, useCareerStore } from './lib/career';
import { useFmSync } from './lib/fm-sync';
import { useGazetteAuto } from './lib/gazette-auto';
import { useLiveDiscord } from './lib/live-discord';
import { Challenges } from './pages/Challenges';
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
  useFmSync();
  return (
    <UpdateGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/club/:view" element={<CareerOnly><FmSave /></CareerOnly>} />
            <Route path="/reglages" element={<CareerOnly><FmSave page="settings" /></CareerOnly>} />
            <Route path="/parties" element={<Home />} />
            <Route path="/visages" element={<Faces />} />
            <Route path="/gazette" element={<Gazette />} />
            <Route path="/discord" element={<Discord />} />
            <Route path="/defis" element={<Challenges />} />
            <Route path="/monde" element={<Soon mode="world" />} />
            {/* Anciennes adresses (avant la barre latérale unique). */}
            <Route path="/coach" element={<Navigate to="/" replace />} />
            <Route path="/fm/:saveId" element={<OpenCareer />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </UpdateGate>
  );
}

/** Accueil : « Aujourd'hui » de la carrière suivie, ou la présentation de l'appli tant qu'il n'y a pas de carrière. */
function Today() {
  const { saveId, isLoading } = useCareer();
  if (isLoading) return null;
  return saveId ? <FmSave page="home" /> : <Overview />;
}

/** Écrans qui demandent une carrière : sans carrière, retour à l'accueil (qui propose d'en créer une). */
function CareerOnly({ children }: { children: React.ReactNode }) {
  const { saveId, isLoading } = useCareer();
  if (isLoading) return null;
  return saveId ? <>{children}</> : <Navigate to="/" replace />;
}

/** Ancien lien vers une partie : elle devient la carrière suivie. */
function OpenCareer() {
  const { saveId = '' } = useParams();
  const setSaveId = useCareerStore((s) => s.setSaveId);
  useEffect(() => {
    if (saveId) setSaveId(saveId);
  }, [saveId, setSaveId]);
  return <Navigate to="/" replace />;
}
