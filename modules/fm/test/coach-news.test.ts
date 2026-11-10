import { describe, expect, it } from 'vitest';
import { breakingNews, cleanGameText, coachNews, gazetteIssues, inboxOf, type FmSnapshot } from '../src';

// Messages tels que le plugin les a lus dans FM27 le 10/11/2026 (liens du jeu \x01base64\x02texte\x01).
const RUZ = '\x01AwAAACAxMTEBIgMgMDExHAAAAGRpdUcFYoIAZmVyZA8MAANZY09PAQMBdG5paAEaOQ==\x02de Rużomberok\x01';
const MAL = '\x01AwAAACAxMTEBIgMgMDExHAAAAGRpdUcFYoIAZmVyZDV0ABhZY09PAQMBdG5paAEaIAAAAA==\x02de Malženice\x01';
type Msg = { id: number; title: string; body?: string; club?: string | null; age?: string };
const INTERVIEW: Msg = {
  id: 581,
  title: `Les dirigeants ${RUZ} proposent un entretien`,
  body: `Les dirigeants vous ont convié à un entretien afin de discuter avec vous de votre éventuelle nomination au poste d'entraîneur.\n\nLes dirigeants sont très impressionnés par votre prestation fantastique sur le banc ${MAL}.`,
  club: 'Rużomberok',
  age: 'Dès maintenant',
};
const MEETING: Msg = {
  id: 441,
  title: 'Les dirigeants demandent une réunion pour discuter de votre avenir',
  body: "Les dirigeants souhaiteraient vous rencontrer afin de discuter de votre avenir au club.\n\nNous avons appris que vous suscitiez de l'intérêt auprès d'autres clubs et souhaiterions négocier un nouveau contrat avec vous afin de vous conserver.",
  club: 'Malženice',
  age: 'Dès maintenant',
};
const OFFER: Msg = {
  id: 127,
  title: 'Menard',
  body: `Les dirigeants \x01AwAA\x02du Mestský Futbalový Klub Ružomberok\x01 vous proposent un contrat de deux ans assorti d'un salaire de 1,8K € par mois.`,
  club: 'Rużomberok',
  age: 'Dès maintenant',
};
const REVIEW: Msg = { id: 237, title: "Bilan mensuel du travail de l'entraîneur", body: 'Les dirigeants sont très contents.', club: 'Malženice', age: 'Il y a 4 semaines' };

const snap = (gameDate: string, inbox: Msg[] | null, club = 'Malženice') => {
  const partie: Record<string, unknown> = { coachNom: 'Sébastien Menard' };
  if (inbox) {
    for (let i = 0; i < 30; i++) {
      const n = String(i).padStart(2, '0');
      const m = inbox[i];
      partie[`boite${n}Titre`] = m?.title ?? null;
      partie[`boite${n}Texte`] = m?.body ?? null;
      partie[`boite${n}Id`] = m?.id ?? null;
      partie[`boite${n}Age`] = m?.age ?? null;
      partie[`boite${n}Club`] = m?.club ?? null;
    }
  }
  return { schema: 'archivix/1', club, gameDate, players: [], custom: { partie } } as unknown as FmSnapshot;
};
const e = (xs: FmSnapshot[]) => xs.map((data) => ({ gameDate: data.gameDate, data }));

describe('avenir du coach', () => {
  it('garde le texte affiché des liens du jeu', () => {
    expect(cleanGameText(INTERVIEW.title)).toBe('Les dirigeants de Rużomberok proposent un entretien');
    expect(inboxOf(snap('2027-12-10', [INTERVIEW]))[0]).toMatchObject({ key: '581|Les dirigeants de Rużomberok proposent un entretien', sender: 'Rużomberok' });
  });

  it("repère l'entretien, l'intérêt d'autres clubs et l'offre, une seule fois chacun", () => {
    const h = e([
      snap('2027-12-10', [REVIEW]),
      snap('2027-12-11', [INTERVIEW, REVIEW]),
      snap('2027-12-12', [MEETING, INTERVIEW, REVIEW]),
      snap('2027-12-13', [MEETING, INTERVIEW, REVIEW]),
      snap('2027-12-20', [OFFER, MEETING, INTERVIEW, REVIEW]),
    ]);
    expect(coachNews(h).map((c) => [c.kind, c.date, c.other])).toEqual([
      ['interview', '2027-12-11', 'Rużomberok'],
      ['courted', '2027-12-12', null],
      ['offer', '2027-12-20', 'Rużomberok'],
    ]);
    expect(coachNews(h)[0]).toMatchObject({ club: 'Malženice', coach: 'Sébastien Menard' });
  });

  it("n'annonce pas l'historique de la boîte au premier relevé, ni les messages de l'ancien club après un départ", () => {
    const old = { ...INTERVIEW, age: 'Il y a 9 jour(s)' };
    expect(coachNews(e([snap('2027-12-11', [old, REVIEW])]))).toEqual([]);
    // Après l'arrivée à Rużomberok, l'entretien déjà vu ne revient pas ; un message de Rużomberok n'est plus « ailleurs ».
    const welcome: Msg = { id: 213, title: `Bienvenue à Rużomberok !`, body: 'entretien pour le poste', club: 'Rużomberok', age: 'Dès maintenant' };
    const h = e([snap('2027-12-11', [INTERVIEW]), snap('2027-12-21', [welcome, INTERVIEW], 'Rużomberok')]);
    expect(coachNews(h).map((c) => c.kind)).toEqual(['interview']);
  });

  it("ignore une interview d'après-match et les offres faites aux joueurs", () => {
    const press: Msg = { id: 9, title: 'Interview après le match', body: 'Les journalistes vous attendent.', club: 'Slovan', age: 'Dès maintenant' };
    const bid: Msg = { id: 10, title: 'Offre pour Bačík', body: 'Slovan a proposé un contrat à Ján Bačík.', club: 'Slovan', age: 'Dès maintenant' };
    expect(coachNews(e([snap('2027-12-10', []), snap('2027-12-11', [press, bid])]))).toEqual([]);
  });

  it('en fait une dépêche avec le club qui le courtise, et une brève de la gazette', () => {
    const h = e([snap('2027-12-10', [REVIEW]), snap('2027-12-11', [INTERVIEW, REVIEW])]);
    expect(breakingNews(h)).toMatchObject([{ kind: 'interview', date: '2027-12-11', club: 'Malženice', name: 'Sébastien Menard', other: 'Rużomberok' }]);
    const issue = gazetteIssues(h)[0]!;
    // Un entretien ailleurs fait la une d'une semaine sans match.
    const story = issue.headline;
    expect(story).toMatchObject({ weight: 76, params: { type: 'interview', other: 'Rużomberok', coach: 'Sébastien Menard' } });
  });
});
