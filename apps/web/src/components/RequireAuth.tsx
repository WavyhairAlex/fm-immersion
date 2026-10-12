import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../lib/auth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  if (!me) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
