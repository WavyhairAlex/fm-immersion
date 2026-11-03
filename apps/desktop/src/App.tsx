import { Navigate, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { UpdateGate } from './components/UpdateGate';
import { FmSave } from './pages/FmSave';
import { Home } from './pages/Home';
import { Pz2Save } from './pages/Pz2Save';
import { Tf3Save } from './pages/Tf3Save';

export function App() {
  return (
    <UpdateGate>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/fm/:saveId" element={<FmSave />} />
            <Route path="/pz2/:saveId" element={<Pz2Save />} />
            <Route path="/tf3/:saveId" element={<Tf3Save />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </UpdateGate>
  );
}
