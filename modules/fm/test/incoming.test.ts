import { describe, expect, it } from 'vitest';
import { incomingSignings } from '../src/incoming';
import type { FmSnapshot } from '../src/snapshot';

const link = (s: string) => `\x01QUJD\x02${s}\x01`;
const CLUB = 'Football Club Slutsk-2024';

function snap(messages: string[], extra: Partial<FmSnapshot> = {}): FmSnapshot {
  const partie: Record<string, unknown> = {};
  messages.forEach((t, i) => {
    const n = String(i).padStart(2, '0');
    partie[`boite${n}Titre`] = CLUB;
    partie[`boite${n}Texte`] = t;
    partie[`boite${n}Id`] = 80 + i;
    partie[`boite${n}Club`] = CLUB;
  });
  return {
    club: CLUB,
    players: [{ id: 1, name: 'Ilya Branovets', squadStatus: 'Gardien en coupe', contractEnd: '2027-12-31', wage: 725 }],
    shortlist: [{ id: 49055784, name: 'Vinni Triboulet', age: 28, positionsText: 'MO (DG), BT (C)', sources: ['selection'] }],
    custom: { partie },
    ...extra,
  } as unknown as FmSnapshot;
}

// Textes relevés dans la partie du joueur (16/11/2026), liens du jeu compris.
const AGREED = `${link('Vinni Triboulet')} a trouvé un accord pour rejoindre le club. L'essai ${link('de Vinni Triboulet')} peut désormais être finalisé.\n\nL'opération a été confirmée par ${link(CLUB)}.`;
const TRIAL = `Nous avons pris l'avant-centre ${link('Vinni Triboulet')} à l'essai pendant 2 semaines.`;

describe('incomingSignings', () => {
  it("annonce la recrue dès l'accord, avec les infos de la liste de suivi", () => {
    expect(incomingSignings(snap([TRIAL, AGREED]))).toEqual([
      { id: '49055784', name: 'Vinni Triboulet', age: 28, positions: 'MO (DG), BT (C)', trial: false },
    ]);
  });

  it("ne l'annonce plus une fois sous contrat au club", () => {
    const s = snap([AGREED], {
      players: [{ id: 49055784, name: 'Vinni Triboulet', squadStatus: 'Joueur important', contractEnd: '2029-12-31', wage: 7500 }],
    } as Partial<FmSnapshot>);
    expect(incomingSignings(s)).toEqual([]);
  });

  it('garde un joueur inconnu de la liste de suivi, par son nom', () => {
    const s = snap([`${link('Jean Dupont')} a trouvé un accord pour rejoindre le club.`]);
    expect(incomingSignings(s)).toEqual([{ id: null, name: 'Jean Dupont', age: null, positions: null, trial: false }]);
  });

  it('un refus plus récent annule l’accord', () => {
    const s = snap([`${link('Vinni Triboulet')} a finalement refusé de signer.`, AGREED]);
    expect(incomingSignings(s)).toEqual([]);
  });

  it('reconnaît les messages en anglais', () => {
    const s = snap([`${link('Vinni Triboulet')} has agreed to join the club.`]);
    expect(incomingSignings(s).map((x) => x.name)).toEqual(['Vinni Triboulet']);
  });

  it('rien sans boîte de réception', () => {
    expect(incomingSignings(snap([]))).toEqual([]);
  });
});
