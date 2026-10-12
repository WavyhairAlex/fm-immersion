import { Navigate, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { UpdateGate } from './components/UpdateGate';
import { Home } from './pages/Home';

export function App() {
  return (
    <UpdateGate>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </UpdateGate>
  );
}
