import { describe, expect, it } from 'vitest';
import { FOCUS_REVIEW_DAYS, focusReview } from '../src';

const ctx = { gameDate: '2027-10-25', roleKeys: ['Tackling', 'Marking', 'Positioning', 'Pace'], fromStats: null, age: 25, gk: false };

describe('priorité individuelle gardée', () => {
  it('rien de réglé : on propose la priorité du jour', () => {
    expect(focusReview(undefined, 'marking', ctx)).toEqual({ focus: 'marking', keep: null, days: null });
  });

  it('un attribut qui bouge d’un point ne fait pas changer la priorité avant trois mois', () => {
    const r = focusReview({ focus: 'tackling', since: '2027-09-01' }, 'marking', ctx);
    expect(r).toEqual({ focus: 'tackling', keep: 'kept', days: 54 });
  });

  it('au bout de trois mois, on passe à la priorité proposée', () => {
    const r = focusReview({ focus: 'tackling', since: '2027-07-01' }, 'marking', ctx);
    expect(r.keep).toBe('review');
    expect(r.focus).toBe('marking');
    expect(r.days).toBeGreaterThanOrEqual(FOCUS_REVIEW_DAYS);
  });

  it('une priorité qui ne colle plus au rôle change tout de suite', () => {
    const r = focusReview({ focus: 'chanceConversion', since: '2027-10-20' }, 'marking', ctx);
    expect(r).toMatchObject({ focus: 'marking', keep: 'invalid' });
    expect(focusReview({ focus: 'gkHandling', since: '2027-10-20' }, 'marking', ctx).keep).toBe('invalid');
  });

  it('Vitesse reste valable pour un jeune, même hors des attributs clés', () => {
    const r = focusReview({ focus: 'quickness', since: '2027-10-01' }, 'marking', { ...ctx, roleKeys: ['Tackling'], age: 19 });
    expect(r.keep).toBe('kept');
  });

  it('réglage ancien sans date : gardé', () => {
    expect(focusReview({ focus: 'tackling' }, 'marking', ctx)).toEqual({ focus: 'tackling', keep: 'kept', days: null });
  });
});
