import { describe, expect, it } from 'vitest';
import { competitionKind, cupFinalsWon, cupRuns, isSuperCup, managerAwards, managerYearAwards, type FmSnapshot, type MatchResult } from '../src';

const CUP = 'Slovnaft Cup';
const EURO = 'UEFA Europa League';
const res = (date: string, competition: string, opponent: string, f: number, a: number) =>
  ({ date, since: date, matches: 1, competition, opponent, friendly: false, goalsFor: f, goalsAgainst: a, outcome: f > a ? 'W' : f < a ? 'L' : 'D', wins: +(f > a), draws: +(f === a), losses: +(f < a), players: [] }) as unknown as MatchResult;
/** Instantané au `date` avec ces matchs à venir au calendrier [date, compétition, adversaire]. */
const snap = (date: string, fixtures: [string, string, string][] = [['2027-12-01', 'Niké liga', 'Senica']]) =>
  ({
    club: 'Malženice',
    gameDate: date,
    players: [],
    custom: {
      equipe: Object.fromEntries(
        fixtures.flatMap(([d, c, o], i) => {
          const n = String(i).padStart(2, '0');
          return [[`cal${n}Date`, d], [`cal${n}Dom`, 'Malženice'], [`cal${n}Ext`, o], [`cal${n}Comp`, c]];
        }),
      ),
    },
  }) as unknown as FmSnapshot;

describe('parcours en coupe', () => {
  it('défaite sur match sec sans match suivant : éliminé', () => {
    const [c] = cupRuns([res('2027-09-10', CUP, 'Trnava', 2, 0), res('2027-10-20', CUP, 'Žilina', 0, 1)], snap('2027-10-21'));
    expect(c).toMatchObject({ competition: CUP, kind: 'cup', status: 'out', played: 2, outBy: { opponent: 'Žilina', goalsFor: 0, goalsAgainst: 1 } });
  });

  it('match au calendrier : encore en course ; victoire sans tirage : qualifié', () => {
    expect(cupRuns([res('2027-09-10', CUP, 'Trnava', 2, 0)], snap('2027-09-11', [['2027-10-20', CUP, 'Žilina']]))[0]!.status).toBe('alive');
    expect(cupRuns([res('2027-09-10', CUP, 'Trnava', 2, 0)], snap('2027-09-11'))[0]!.status).toBe('through');
  });

  it('aller-retour : le score cumulé décide', () => {
    const ms = [res('2027-10-01', CUP, 'Žilina', 0, 1), res('2027-10-08', CUP, 'Žilina', 3, 1)];
    const [c] = cupRuns(ms, snap('2027-10-09'));
    expect(c!.ties).toHaveLength(1);
    expect(c).toMatchObject({ status: 'through', ties: [{ legs: 2, goalsFor: 3, goalsAgainst: 2 }] });
  });

  it('nul (tirs au but inconnus) : on attend, puis éliminé si rien ne revient', () => {
    const ms = [res('2027-10-20', CUP, 'Žilina', 1, 1)];
    expect(cupRuns(ms, snap('2027-10-22'))[0]!.status).toBe('unknown');
    expect(cupRuns(ms, snap('2027-11-25'))[0]!.status).toBe('out');
  });

  it("coupe d'Europe : une défaite en phase de groupes n'élimine pas tout de suite", () => {
    const ms = [res('2027-10-20', EURO, 'Ajax', 0, 2)];
    expect(cupRuns(ms, snap('2027-10-22'))[0]!.status).toBe('unknown');
    expect(cupRuns(ms, snap('2027-12-01'))[0]!.status).toBe('out');
  });

  it('victoire en fin de saison sans match suivant : vainqueur', () => {
    const [c] = cupRuns([res('2028-05-01', CUP, 'Slovan', 2, 1)], snap('2028-05-20'), { seasonOver: true, seasonEnd: '2028-05-20' });
    expect(c!.status).toBe('won');
  });

  it('Supercoupe : gagnée dès la victoire, en début de saison', () => {
    const SUPER = 'Supierkubok Belarusi';
    expect(cupRuns([res('2028-02-27', SUPER, 'Dinamo Minsk', 2, 1)], snap('2028-02-28', [['2028-03-05', 'Kubok Belarusi', 'Smorgon']]))[0]!.status).toBe('won');
    // Nul : tirs au but inconnus, on attend le message du jeu.
    expect(cupRuns([res('2028-02-27', SUPER, 'Dinamo Minsk', 1, 1)], snap('2028-02-28'))[0]!.status).toBe('unknown');
    expect(cupRuns([res('2028-02-27', SUPER, 'Dinamo Minsk', 0, 1)], snap('2028-02-28'))[0]!.status).toBe('out');
  });

  it('reconnaît les Supercoupes, pas les coupes', () => {
    for (const n of ['Supierkubok Belarusi', 'Trophée des Champions', 'FA Community Shield', 'Supercopa de España', 'DFL-Supercup', 'Supercoppa Italiana'])
      expect(isSuperCup(n)).toBe(true);
    for (const n of ['Betera Kubok Belarusi', 'Coupe de France', 'FA Cup', 'UEFA Super League']) expect(isSuperCup(n)).toBe(false);
  });

  it('sans calendrier lu : inconnu', () => {
    const s = { club: 'Malženice', gameDate: '2027-10-21', players: [], custom: { equipe: {} } } as unknown as FmSnapshot;
    expect(cupRuns([res('2027-10-20', CUP, 'Žilina', 0, 1)], s)[0]!.status).toBe('unknown');
  });
});

describe('finale gagnée lue dans la boîte de réception', () => {
  const snap = (gameDate: string, titre: string, texte: string) =>
    ({ gameDate: gameDate, data: { gameDate, club: 'Slutsk', players: [], custom: { partie: { boite00Titre: titre, boite00Texte: texte } } } as unknown as FmSnapshot });
  const L = (t: string) => `\x01QUJD\x02${t}\x01`;

  it('repère la coupe gagnée en finale, une seule fois, en français et en anglais', () => {
    const fr = snap('2027-05-26', 'Prime', `Nous avons reçu 93,12K € après avoir battu ${L('Football Club Gomel')} en ${L('Finale de Betera Kubok Belarusi')}.`);
    const again = snap('2027-05-27', 'Prime', `Nous avons reçu 93,12K € après avoir battu ${L('Football Club Gomel')} en ${L('Finale de Betera Kubok Belarusi')}.`);
    const en = snap('2027-05-28', 'Prize', `We have received €50K after beating ${L('Gomel')} in the ${L('FA Cup Final')}.`);
    expect(cupFinalsWon([fr, again, en])).toEqual([
      { date: '2027-05-26', competition: 'Betera Kubok Belarusi' },
      { date: '2027-05-28', competition: 'FA Cup' },
    ]);
  });

  it("trophée annoncé par l'actualité du jeu (succès de l'équipe), coupes seulement", () => {
    const cup = snap('2028-02-28', 'Menard mène Football Club Slutsk-2024 au sommet', "Profitez bien des compliments à votre égard suite au succès de l'équipe en Supierkubok Belarusi !");
    const fans = snap('2028-02-29', 'Au sommet', "Les fans ont scandé le nom de l'entraîneur, qui a mené leur équipe à la victoire en Betera Kubok Belarusi.");
    const league = snap('2028-11-20', 'Champion', "Profitez bien des compliments à votre égard suite au succès de l'équipe en Vyšejšaja Liha !");
    expect(cupFinalsWon([cup, fans, league])).toEqual([
      { date: '2028-02-28', competition: 'Supierkubok Belarusi' },
      { date: '2028-02-29', competition: 'Betera Kubok Belarusi' },
    ]);
  });

  it('ignore les demi-finales et les annonces sans victoire', () => {
    const semi = snap('2027-04-15', 'Prime', `Nous avons reçu 34,92K € après avoir battu ${L('Niva Dolbizno')} en ${L('Demi-finale de Betera Kubok Belarusi')}.`);
    const press = snap('2027-05-25', 'Conférence', `Une conférence de presse va avoir lieu avant la rencontre de ${L('Finale de Betera Kubok Belarusi')}.`);
    expect(cupFinalsWon([semi, press])).toEqual([]);
  });

  it('les coupes slaves sont des coupes', () => {
    expect(competitionKind('Betera Kubok Belarusi')).toBe('cup');
    expect(competitionKind('Puchar Polski')).toBe('cup');
    expect(competitionKind('Ziraat Türkiye Kupası')).toBe('cup');
  });
});

describe('entraîneur du mois lu dans la boîte de réception', () => {
  const L = (t: string) => `\x01AgAA\x02${t}\x01`;
  const snap = (gameDate: string, items: [string, string][]) =>
    ({
      gameDate,
      data: {
        gameDate,
        club: 'Slutsk',
        players: [],
        custom: { partie: Object.fromEntries(items.flatMap(([t, x], i) => [[`boite0${i}Titre`, t], [`boite0${i}Texte`, x]])) },
      } as unknown as FmSnapshot,
    });
  const ANNONCE = `Voici des infos concernant le vainqueur ${L("de l'Entraîneur du mois en CS de Biélorussie")}.`;
  const BRAVO = `Je pense que ceci devrait vous plaire, il est vraiment sympa de voir ${L('Vitaliy Bunos')} parler de vous de manière aussi élogieuse.`;

  it("compte le prix quand un proche s'en réjouit, pour le mois précédent, une fois", () => {
    const won = snap('2027-06-01', [['Entraîneur du mois', BRAVO], ['Entraîneur du mois', ANNONCE]]);
    expect(managerAwards([won, { ...won, gameDate: '2027-06-02' }])).toEqual([{ month: '2027-05', competition: 'CS de Biélorussie' }]);
  });

  it("ignore l'annonce mensuelle seule (prix d'un autre entraîneur)", () => {
    expect(managerAwards([snap('2026-11-01', [['Entraîneur du mois', ANNONCE]])])).toEqual([]);
  });
});

describe("entraîneur de l'année lu dans la boîte de réception", () => {
  const L = (t: string) => `\x01AgAA\x02${t}\x01`;
  const snap = (gameDate: string, items: [string, string, string?][]) =>
    ({
      gameDate,
      data: {
        gameDate,
        club: 'Slutsk',
        players: [],
        custom: {
          partie: Object.fromEntries(
            items.flatMap(([t, x, age], i) => [[`boite0${i}Titre`, t], [`boite0${i}Texte`, x], ...(age ? [[`boite0${i}Age`, age]] : [])]),
          ),
        },
      } as unknown as FmSnapshot,
    });
  const TITRE = "Entraîneur de l'année";
  const ANNONCE = `Voici des infos concernant le vainqueur ${L("de l'Entraîneur français de l'année")}.`;
  const BRAVO = `Je pense que ceci devrait vous plaire, il est vraiment sympa de voir ${L('Vitaliy Bunos')} parler de vous de manière aussi élogieuse.`;

  it('compte le prix avec son nom, au jour du message, une seule fois', () => {
    const a = snap('2027-12-31', [["Joueur de l'année", `Voici des infos concernant le vainqueur ${L("du Joueur de l'année en Biélorussie")}.`], [TITRE, BRAVO, 'Il y a 2 jour(s)'], [TITRE, ANNONCE, 'Il y a 2 jour(s)']]);
    const b = snap('2028-01-05', [[TITRE, BRAVO, 'Il y a 1 semaine(s)'], [TITRE, ANNONCE]]);
    expect(managerYearAwards([a, b])).toEqual([{ date: '2027-12-29', award: "Entraîneur français de l'année" }]);
  });

  it("ignore l'annonce seule (prix d'un autre entraîneur) et le prix du mois", () => {
    expect(managerYearAwards([snap('2027-12-31', [[TITRE, ANNONCE]])])).toEqual([]);
    expect(managerYearAwards([snap('2027-06-01', [['Entraîneur du mois', BRAVO]])])).toEqual([]);
  });

  it('compte deux prix différents la même saison, et un prix sans annonce reste sans nom', () => {
    const other = `Voici des infos concernant le vainqueur ${L("de l'Entraîneur de l'année en Div. sup. de Biélorussie")}.`;
    const a = snap('2027-12-01', [[TITRE, BRAVO], [TITRE, other]]);
    const b = snap('2027-12-31', [[TITRE, BRAVO], [TITRE, ANNONCE]]);
    expect(managerYearAwards([a, b]).map((x) => x.award)).toEqual(["Entraîneur de l'année en Div. sup. de Biélorussie", "Entraîneur français de l'année"]);
    expect(managerYearAwards([snap('2027-12-31', [[TITRE, BRAVO]])])).toEqual([{ date: '2027-12-31', award: null }]);
  });

  it("un ancien bravo resté dans la boîte ne prend pas le prix annoncé plus tard pour un autre", () => {
    const other = `Voici des infos concernant le vainqueur ${L("de l'Entraîneur de l'année en Div. sup. de Biélorussie")}.`;
    const a = snap('2027-12-01', [[TITRE, BRAVO], [TITRE, other]]);
    const b = snap('2027-12-31', [[TITRE, BRAVO, 'Il y a 4 semaine(s)'], [TITRE, ANNONCE]]);
    expect(managerYearAwards([a, b])).toEqual([{ date: '2027-12-01', award: "Entraîneur de l'année en Div. sup. de Biélorussie" }]);
  });
});
