import { careerOf, GAME_QUALIFICATION, gameCoach, officialResults, sceneState, type Career, type CoachLife, type LifeResult } from '@fm-immersion/module-fm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useCareer } from './career';
import { fmData } from './data';
import { useHistory } from './fm-cache';

/**
 * Carrière de la partie suivie, telle que « Ma carrière » la montre : clubs cachés retirés, pays corrigés par le joueur.
 * Partagée par « Ma carrière » et « Ma vie ».
 */
export function useCareerSpells() {
  const { saveId, save, fmSaves } = useCareer();
  const { data: history = [], isLoading } = useHistory(saveId);
  const { data: settings } = useQuery({ queryKey: ['fm', saveId, 'settings'], queryFn: () => fmData.settings(saveId), enabled: !!saveId });
  const hidden = useMemo(() => settings?.careerHidden ?? [], [settings?.careerHidden]);
  const kept = useMemo(() => history.filter((h) => !hidden.includes(h.data.club)), [history, hidden]);
  const raw = useMemo(() => careerOf(kept, { freeSince: settings?.fmFreeSince ?? null }), [kept, settings?.fmFreeSince]);
  const fixed = useMemo(() => settings?.careerCountries ?? {}, [settings?.careerCountries]);
  const career: Career = useMemo(() => {
    const spells = raw.spells.map((s) => (fixed[s.club] ? { ...s, country: fixed[s.club]!, countrySource: null } : s));
    return { spells, totals: { ...raw.totals, countries: new Set(spells.map((s) => s.country).filter(Boolean)).size } };
  }, [raw, fixed]);
  return { saveId, save, fmSaves, history, isLoading, settings, hidden, kept, raw, fixed, career, gameDate: kept.at(-1)?.gameDate ?? null };
}

/** Matchs officiels un par un (détail connu), pour les séries de défaites et le club qui fait une offre. */
export function lifeResults(kept: { gameDate: string; data: Parameters<typeof officialResults>[0][number]['data'] }[]): LifeResult[] {
  return officialResults(kept)
    .filter((r) => r.matches === 1 && r.outcome)
    .map((r) => ({ date: (r.played ?? r.date).slice(0, 10), outcome: r.outcome!, opponent: r.opponent, competition: r.competition }));
}

/** Vie du coach complète : carrière, réglages, état des messages, jauges et proches. */
export function useCoachWorld() {
  const base = useCareerSpells();
  const { kept, settings, career, gameDate } = base;
  const game = useMemo(() => gameCoach(kept), [kept]);
  const life = useMemo<CoachLife>(() => ({ ...(settings?.coachLife ?? {}), currency: settings?.coachLife?.currency ?? game.currency ?? undefined }), [settings?.coachLife, game.currency]);
  const held = game.qualification != null ? (GAME_QUALIFICATION[game.qualification] ?? 0) : 0;
  const results = useMemo(() => lifeResults(kept), [kept]);
  const st = useMemo(() => sceneState(career.spells, life, gameDate, { held, results }), [career.spells, life, gameDate, held, results]);
  return { ...base, game, life, held, results, st };
}

/** Enregistre la vie du coach dans les réglages de la partie (rien n'est écrit dans FM27). */
export function useSaveLife(saveId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Patch appliqué sur la valeur enregistrée (pas sur celle affichée) : deux champs quittés coup sur coup ne s'écrasent pas.
    mutationFn: (patch: Partial<CoachLife> | ((cur: CoachLife) => Partial<CoachLife>)) =>
      fmData.updateSettings(saveId, (prev) => {
        const cur = prev.coachLife ?? {};
        return { coachLife: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } };
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fm', saveId, 'settings'] }),
  });
}
