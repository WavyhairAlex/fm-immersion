import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';

export const meQueryKey = ['me'] as const;

/** Utilisateur connecté, ou null. Un 401 n'est pas une erreur : on n'est simplement pas connecté. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}
