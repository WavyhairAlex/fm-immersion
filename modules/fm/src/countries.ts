/**
 * Pays du football, pour situer les clubs entraînés sur la carte de « Ma carrière ».
 * Le plugin ne lit pas le pays du club : on le déduit de la nationalité la plus présente dans l'effectif
 * (champ `nationality` des joueurs, en français ou en anglais selon la langue du jeu), sinon du nom du championnat.
 * Le joueur peut toujours corriger à la main.
 *
 * `code` : ISO 3166-1 alpha-2, sauf les quatre nations britanniques (GB-ENG, GB-SCT, GB-WLS, GB-NIR), qui ont
 * chacune leur championnat. `lat`/`lon` : point où placer le club sur la carte (centre du pays ou grande ville).
 * `fr`/`en` : nationalités telles que FM les écrit (masculin d'abord).
 */
export interface Country {
  code: string;
  lat: number;
  lon: number;
  fr: string[];
  en: string[];
}

const c = (code: string, lat: number, lon: number, fr: string[], en: string[]): Country => ({ code, lat, lon, fr, en });

export const COUNTRIES: Country[] = [
  // Europe
  c('FR', 46.6, 2.4, ['français', 'française'], ['French']),
  c('GB-ENG', 52.6, -1.5, ['anglais', 'anglaise'], ['English']),
  c('GB-SCT', 56.6, -4.1, ['écossais', 'écossaise'], ['Scottish']),
  c('GB-WLS', 52.3, -3.7, ['gallois', 'galloise'], ['Welsh']),
  c('GB-NIR', 54.6, -6.7, ['nord-irlandais', 'nord-irlandaise'], ['Northern Irish']),
  c('IE', 53.2, -8.0, ['irlandais', 'irlandaise'], ['Irish']),
  c('ES', 40.2, -3.7, ['espagnol', 'espagnole'], ['Spanish']),
  c('PT', 39.6, -8.0, ['portugais', 'portugaise'], ['Portuguese']),
  c('IT', 42.8, 12.5, ['italien', 'italienne'], ['Italian']),
  c('DE', 51.1, 10.4, ['allemand', 'allemande'], ['German']),
  c('NL', 52.2, 5.5, ['néerlandais', 'néerlandaise', 'hollandais'], ['Dutch']),
  c('BE', 50.6, 4.6, ['belge'], ['Belgian']),
  c('LU', 49.7, 6.1, ['luxembourgeois', 'luxembourgeoise'], ['Luxembourgish', 'Luxembourger']),
  c('CH', 46.8, 8.2, ['suisse'], ['Swiss']),
  c('AT', 47.6, 14.1, ['autrichien', 'autrichienne'], ['Austrian']),
  c('DK', 56.0, 9.3, ['danois', 'danoise'], ['Danish']),
  c('SE', 59.5, 15.0, ['suédois', 'suédoise'], ['Swedish']),
  c('NO', 61.0, 9.0, ['norvégien', 'norvégienne'], ['Norwegian']),
  c('FI', 62.0, 25.7, ['finlandais', 'finlandaise'], ['Finnish']),
  c('IS', 64.9, -18.6, ['islandais', 'islandaise'], ['Icelandic']),
  c('FO', 62.0, -6.9, ['féroïen', 'féroïenne'], ['Faroese']),
  c('PL', 52.1, 19.4, ['polonais', 'polonaise'], ['Polish']),
  c('CZ', 49.8, 15.5, ['tchèque'], ['Czech']),
  c('SK', 48.7, 19.5, ['slovaque'], ['Slovak', 'Slovakian']),
  c('HU', 47.2, 19.4, ['hongrois', 'hongroise'], ['Hungarian']),
  c('SI', 46.1, 14.8, ['slovène'], ['Slovenian', 'Slovene']),
  c('HR', 45.5, 16.0, ['croate'], ['Croatian']),
  c('BA', 44.0, 17.8, ['bosnien', 'bosnienne', 'bosniaque'], ['Bosnian']),
  c('RS', 44.2, 20.8, ['serbe'], ['Serbian']),
  c('ME', 42.8, 19.3, ['monténégrin', 'monténégrine'], ['Montenegrin']),
  c('XK', 42.6, 20.9, ['kosovar', 'kosovare'], ['Kosovan', 'Kosovar']),
  c('AL', 41.1, 20.0, ['albanais', 'albanaise'], ['Albanian']),
  c('MK', 41.6, 21.7, ['macédonien', 'macédonienne', 'nord-macédonien'], ['Macedonian', 'North Macedonian']),
  c('GR', 39.3, 22.0, ['grec', 'grecque'], ['Greek']),
  c('BG', 42.7, 25.3, ['bulgare'], ['Bulgarian']),
  c('RO', 45.9, 24.9, ['roumain', 'roumaine'], ['Romanian']),
  c('MD', 47.2, 28.5, ['moldave'], ['Moldovan']),
  c('UA', 49.0, 31.4, ['ukrainien', 'ukrainienne'], ['Ukrainian']),
  c('BY', 53.7, 27.9, ['biélorusse'], ['Belarusian']),
  c('RU', 55.8, 37.6, ['russe'], ['Russian']),
  c('LT', 55.2, 23.9, ['lituanien', 'lituanienne'], ['Lithuanian']),
  c('LV', 56.9, 24.6, ['letton', 'lettone'], ['Latvian']),
  c('EE', 58.6, 25.0, ['estonien', 'estonienne'], ['Estonian']),
  c('TR', 39.0, 35.2, ['turc', 'turque'], ['Turkish']),
  c('CY', 35.0, 33.2, ['chypriote'], ['Cypriot']),
  c('MT', 35.9, 14.4, ['maltais', 'maltaise'], ['Maltese']),
  c('AD', 42.5, 1.5, ['andorran', 'andorrane'], ['Andorran']),
  c('SM', 43.9, 12.4, ['saint-marinais', 'saint-marinaise'], ['Sammarinese']),
  c('GI', 36.1, -5.35, ['gibraltarien', 'gibraltarienne'], ['Gibraltarian']),
  c('LI', 47.15, 9.55, ['liechtensteinois', 'liechtensteinoise'], ['Liechtensteiner']),
  c('MC', 43.74, 7.42, ['monégasque'], ['Monegasque']),
  c('GE', 42.3, 43.4, ['géorgien', 'géorgienne'], ['Georgian']),
  c('AM', 40.1, 45.0, ['arménien', 'arménienne'], ['Armenian']),
  c('AZ', 40.4, 47.6, ['azerbaïdjanais', 'azerbaïdjanaise', 'azéri'], ['Azerbaijani', 'Azeri']),
  c('KZ', 48.0, 67.0, ['kazakh', 'kazakhe'], ['Kazakh', 'Kazakhstani']),
  c('IL', 31.4, 35.0, ['israélien', 'israélienne'], ['Israeli']),
  // Amériques
  c('US', 39.5, -98.4, ['américain', 'américaine', 'états-unien'], ['American']),
  c('CA', 45.5, -75.0, ['canadien', 'canadienne'], ['Canadian']),
  c('MX', 23.6, -102.5, ['mexicain', 'mexicaine'], ['Mexican']),
  c('CR', 9.9, -84.1, ['costaricien', 'costaricienne', 'costaricain'], ['Costa Rican']),
  c('HN', 14.8, -86.6, ['hondurien', 'hondurienne'], ['Honduran']),
  c('GT', 15.6, -90.3, ['guatémaltèque'], ['Guatemalan']),
  c('SV', 13.8, -88.9, ['salvadorien', 'salvadorienne'], ['Salvadoran', 'Salvadorian']),
  c('PA', 8.5, -80.1, ['panaméen', 'panaméenne'], ['Panamanian']),
  c('JM', 18.1, -77.3, ['jamaïcain', 'jamaïcaine'], ['Jamaican']),
  c('HT', 19.0, -72.7, ['haïtien', 'haïtienne'], ['Haitian']),
  c('TT', 10.5, -61.3, ['trinidadien', 'trinidadienne'], ['Trinidadian', 'Trinidad & Tobago']),
  c('BR', -15.8, -47.9, ['brésilien', 'brésilienne'], ['Brazilian']),
  c('AR', -34.6, -62.0, ['argentin', 'argentine'], ['Argentine', 'Argentinian']),
  c('UY', -32.8, -56.0, ['uruguayen', 'uruguayenne'], ['Uruguayan']),
  c('PY', -23.4, -58.4, ['paraguayen', 'paraguayenne'], ['Paraguayan']),
  c('CL', -33.5, -70.7, ['chilien', 'chilienne'], ['Chilean']),
  c('BO', -16.5, -64.7, ['bolivien', 'bolivienne'], ['Bolivian']),
  c('PE', -10.0, -75.5, ['péruvien', 'péruvienne'], ['Peruvian']),
  c('EC', -1.6, -78.5, ['équatorien', 'équatorienne'], ['Ecuadorian']),
  c('CO', 4.6, -74.2, ['colombien', 'colombienne'], ['Colombian']),
  c('VE', 7.6, -66.4, ['vénézuélien', 'vénézuélienne'], ['Venezuelan']),
  // Afrique
  c('MA', 32.0, -6.8, ['marocain', 'marocaine'], ['Moroccan']),
  c('DZ', 34.5, 3.0, ['algérien', 'algérienne'], ['Algerian']),
  c('TN', 34.6, 9.6, ['tunisien', 'tunisienne'], ['Tunisian']),
  c('EG', 28.0, 30.8, ['égyptien', 'égyptienne'], ['Egyptian']),
  c('LY', 29.0, 17.0, ['libyen', 'libyenne'], ['Libyan']),
  c('SN', 14.5, -14.5, ['sénégalais', 'sénégalaise'], ['Senegalese']),
  c('ML', 14.0, -4.0, ['malien', 'malienne'], ['Malian']),
  c('CI', 7.6, -5.5, ['ivoirien', 'ivoirienne'], ['Ivorian']),
  c('GH', 7.9, -1.0, ['ghanéen', 'ghanéenne'], ['Ghanaian']),
  c('NG', 9.1, 8.7, ['nigérian', 'nigériane', 'nigérian'], ['Nigerian']),
  c('CM', 5.7, 12.4, ['camerounais', 'camerounaise'], ['Cameroonian']),
  c('GN', 10.4, -10.9, ['guinéen', 'guinéenne'], ['Guinean']),
  c('BF', 12.3, -1.6, ['burkinabé', 'burkinabè'], ['Burkinabe', 'Burkinabé']),
  c('CD', -2.9, 23.6, ['congolais (rdc)', 'congolais (rd congo)'], ['Congolese (DR)', 'DR Congolese']),
  c('CG', -0.7, 15.2, ['congolais'], ['Congolese']),
  c('GA', -0.8, 11.6, ['gabonais', 'gabonaise'], ['Gabonese']),
  c('AO', -12.3, 17.5, ['angolais', 'angolaise'], ['Angolan']),
  c('ZA', -29.0, 25.1, ['sud-africain', 'sud-africaine'], ['South African']),
  c('KE', 0.2, 37.9, ['kényan', 'kényane'], ['Kenyan']),
  c('TZ', -6.4, 34.9, ['tanzanien', 'tanzanienne'], ['Tanzanian']),
  c('ET', 9.1, 39.6, ['éthiopien', 'éthiopienne'], ['Ethiopian']),
  c('ZM', -13.1, 27.8, ['zambien', 'zambienne'], ['Zambian']),
  c('ZW', -19.0, 29.9, ['zimbabwéen', 'zimbabwéenne'], ['Zimbabwean']),
  c('CV', 15.1, -23.6, ['cap-verdien', 'cap-verdienne', 'capverdien'], ['Cape Verdean']),
  // Asie, Moyen-Orient, Océanie
  c('SA', 24.0, 45.0, ['saoudien', 'saoudienne'], ['Saudi', 'Saudi Arabian']),
  c('AE', 24.3, 54.3, ['émirien', 'émirienne', 'émirati'], ['Emirati']),
  c('QA', 25.3, 51.2, ['qatarien', 'qatarienne', 'qatari'], ['Qatari']),
  c('IR', 32.4, 53.7, ['iranien', 'iranienne'], ['Iranian']),
  c('IQ', 33.2, 43.7, ['irakien', 'irakienne'], ['Iraqi']),
  c('JP', 36.2, 138.3, ['japonais', 'japonaise'], ['Japanese']),
  c('KR', 36.4, 127.9, ['sud-coréen', 'sud-coréenne', 'coréen (sud)'], ['South Korean', 'Korean']),
  c('CN', 35.0, 105.0, ['chinois', 'chinoise'], ['Chinese']),
  c('IN', 21.0, 78.9, ['indien', 'indienne'], ['Indian']),
  c('TH', 15.9, 101.0, ['thaïlandais', 'thaïlandaise'], ['Thai']),
  c('VN', 16.0, 107.8, ['vietnamien', 'vietnamienne'], ['Vietnamese']),
  c('ID', -2.5, 118.0, ['indonésien', 'indonésienne'], ['Indonesian']),
  c('MY', 3.1, 101.7, ['malaisien', 'malaisienne'], ['Malaysian']),
  c('SG', 1.35, 103.8, ['singapourien', 'singapourienne'], ['Singaporean']),
  c('AU', -25.3, 133.8, ['australien', 'australienne'], ['Australian']),
  c('NZ', -41.0, 174.0, ['néo-zélandais', 'néo-zélandaise'], ['New Zealander', 'New Zealand']),
];

const BY_CODE = new Map(COUNTRIES.map((x) => [x.code, x]));
export const countryByCode = (code: string | null | undefined): Country | null => (code ? (BY_CODE.get(code) ?? null) : null);

const norm = (s: string) => s.normalize('NFC').toLowerCase().trim();
const DEMONYMS = new Map<string, string>();
for (const x of COUNTRIES) for (const d of [...x.fr, ...x.en]) DEMONYMS.set(norm(d), x.code);

/**
 * Pays d'une nationalité écrite par FM (« slovaque », « argentin, slovaque », « congolais (RDC) », « Swedish ») :
 * la première nationalité seulement. Null si elle n'est pas connue.
 */
export function countryOfNationality(text: string | null | undefined): string | null {
  if (!text) return null;
  const first = norm(text.split(',')[0] ?? '');
  return DEMONYMS.get(first) ?? DEMONYMS.get(first.replace(/\s*\(.*\)\s*$/, '')) ?? null;
}

/**
 * Championnats au nom sans ambiguïté (noms FM, français ou anglais), pour les clubs dont l'effectif est très
 * international. Testés dans l'ordre : le plus précis d'abord.
 */
const LEAGUES: [RegExp, string][] = [
  [/nifl|irish league|northern ireland|irlande du nord/i, 'GB-NIR'],
  [/scottish|écoss|premiership/i, 'GB-SCT'],
  [/cymru|welsh|gallois/i, 'GB-WLS'],
  [/^(premier league|sky bet championship|championship|league one|league two|vanarama national league|national league)\b/i, 'GB-ENG'],
  [/^ligue [12]\b|^championnat national\b|coupe de france/i, 'FR'],
  [/laliga|la liga|copa del rey|segunda división/i, 'ES'],
  [/^serie [abc]\b|coppa italia/i, 'IT'],
  [/^(2\. |3\. )?bundesliga$|dfb-pokal/i, 'DE'],
  [/eredivisie|eerste divisie|knvb/i, 'NL'],
  [/jupiler|challenger pro league|beker van belgi|coupe de belgique/i, 'BE'],
  [/liga portugal|primeira liga|taça de portugal/i, 'PT'],
  [/süper lig|super lig/i, 'TR'],
  [/allsvenskan|superettan|norra götaland|södra götaland|svenska cupen/i, 'SE'],
  [/eliteserien|obos-ligaen/i, 'NO'],
  [/veikkausliiga/i, 'FI'],
  [/ekstraklasa/i, 'PL'],
  [/slovensk|niké liga/i, 'SK'],
  [/chance liga|fortuna:liga|czech/i, 'CZ'],
  [/nb i\b|otp bank liga/i, 'HU'],
  [/major league soccer|^mls\b/i, 'US'],
  [/liga mx/i, 'MX'],
  [/brasileir|série [ab]\b/i, 'BR'],
  [/liga profesional|primera nacional/i, 'AR'],
  [/saudi|roshn/i, 'SA'],
  [/a-league/i, 'AU'],
  [/j1 league|j\.league/i, 'JP'],
];

/** Pays d'un championnat d'après son nom, ou null. */
export function countryOfLeague(name: string | null | undefined): string | null {
  if (!name) return null;
  for (const [re, code] of LEAGUES) if (re.test(name)) return code;
  return null;
}
