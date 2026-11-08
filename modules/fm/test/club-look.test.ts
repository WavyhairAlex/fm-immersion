import { describe, expect, it } from 'vitest';
import { clubLooks, contrast, crestLetters, inkOn, parseColour, snapshotClubLooks, visibleOn } from '../src/club-look';

describe('couleurs des clubs', () => {
  it('lit les couleurs du jeu quel que soit leur format', () => {
    expect(parseColour('#C8102E')).toBe('#c8102e');
    expect(parseColour('c8102e')).toBe('#c8102e');
    expect(parseColour('#fff')).toBe('#ffffff');
    expect(parseColour('RGBA(1.000, 0.000, 0.000, 1.000)')).toBe('#ff0000');
    // Décimales à la française.
    expect(parseColour('RGBA(0,502, 0,000, 1,000, 1,000)')).toBe('#8000ff');
    expect(parseColour('rgb(0, 128, 255)')).toBe('#0080ff');
    expect(parseColour('Color { R = 255, G = 255, B = 0, A = 255 }')).toBe('#ffff00');
    expect(parseColour({ r: 0, g: 0.5, b: 1, a: 1 })).toBe('#0080ff');
    expect(parseColour({ R: 10, G: 20, B: 30 })).toBe('#0a141e');
    expect(parseColour({ PropertyValue: '#00ff00' })).toBe('#00ff00');
    expect(parseColour(0xff0000)).toBe('#ff0000');
    expect(parseColour('RGBA(1.000, 0.000, 0.000, 0.000)')).toBeNull();
    expect(parseColour('FM.UI.ColourReference')).toBeNull();
    expect(parseColour(null)).toBeNull();
  });

  it('choisit un texte lisible et une couleur visible sur le papier', () => {
    expect(inkOn('#ffffff')).toBe('#25282D');
    expect(inkOn('#c8102e')).toBe('#FFFFFF');
    expect(inkOn('#ffd700')).toBe('#25282D');
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    // Club en blanc et noir : son blanc ne se voit pas sur le papier, son noir oui.
    expect(visibleOn(['#ffffff', '#111111'], '#F4F1EA', '#F26B1D')).toBe('#111111');
    expect(visibleOn(['#fafafa'], '#F4F1EA', '#F26B1D')).toBe('#F26B1D');
  });

  it('tire un sigle du nom quand le jeu ne le donne pas', () => {
    expect(crestLetters('Malženice')).toBe('MAL');
    expect(crestLetters('Považská Bystrica')).toBe('PB');
    expect(crestLetters('FC Košice')).toBe('KOŠ');
    expect(crestLetters('1.HFC Humenné')).toBe('HH');
    expect(crestLetters('Toulouse FC', 'TFC')).toBe('TFC');
  });

  it('retrouve le club du joueur et ceux du calendrier', () => {
    const snap = {
      club: 'Malženice',
      custom: {
        club: { idUnique: 123456, couleur1: 'RGBA(0.000, 0.400, 0.200, 1.000)', couleur2: '#ffffff', couleur3: null, abreviation: 'MAL' },
        equipe: {
          cal00Dom: 'Malženice',
          cal00Ext: 'Považská Bystrica',
          cal00DomId: '123456',
          cal00ExtId: '28706',
          cal00ExtC1: '#ff0000',
          cal00ExtC2: '#000000',
          cal01Dom: 'FC Košice',
          cal01Ext: 'Malženice',
          cal01DomId: '63035357',
          dernierAdvNom: 'Nitra',
          dernierAdvId: 0,
          dernierAdvC1: 'FM.UI.ColourReference',
        },
      },
    };
    const looks = snapshotClubLooks(snap);
    expect(looks[0]).toEqual({ name: 'Malženice', id: '123456', colors: ['#006633', '#ffffff'], abbr: 'MAL' });
    expect(looks.find((l) => l.name === 'Považská Bystrica')).toEqual({ name: 'Považská Bystrica', id: '28706', colors: ['#ff0000', '#000000'], abbr: null });
    expect(looks.find((l) => l.name === 'FC Košice')?.id).toBe('63035357');
    // Rien d'utile : pas de fiche.
    expect(looks.find((l) => l.name === 'Nitra')).toBeUndefined();

    // Sur l'historique : un instantané récent sans couleurs ne fait pas oublier celles d'avant.
    const map = clubLooks([
      { gameDate: '2027-08-24', data: { club: 'Malženice', custom: { club: { idUnique: 123456 } } } },
      { gameDate: '2027-08-23', data: snap },
    ]);
    expect(map.get('Malženice')).toEqual({ name: 'Malženice', id: '123456', colors: ['#006633', '#ffffff'], abbr: 'MAL' });
    expect(map.size).toBe(3);
  });
});
