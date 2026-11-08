// Génère src/lib/world-map.ts : contours des pays (Natural Earth 1:50m, domaine public, via world-atlas)
// projetés une fois pour toutes (Equal Earth), et la position de chaque pays de modules/fm/src/countries.ts.
// L'écran « Ma carrière » dessine la carte en SVG sans rien charger d'Internet (CSP stricte).
// Relancer après un ajout de pays : node apps/desktop/scripts/world-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea, geoEqualEarth, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { presimplify, quantile, simplify, sphericalTriangleArea } from 'topojson-simplify';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Contours simplifiés (environ un point sur six gardé, les plus marquants) : la carte reste légère, les petits pays restent.
const raw = presimplify(structuredClone(require('world-atlas/countries-50m.json')), sphericalTriangleArea);
const world = simplify(raw, quantile(raw, 0.15));

const W = 1000;
const countriesTs = readFileSync(join(here, '../../../modules/fm/src/countries.ts'), 'utf8');
const ours = [...countriesTs.matchAll(/c\('([A-Z-]+)', (-?[\d.]+), (-?[\d.]+),/g)].map((m) => ({ code: m[1], lat: +m[2], lon: +m[3] }));

// Noms de world-atlas qui ne se déduisent pas du nom anglais du code ISO.
const ALIAS = {
  'United Kingdom': 'GB',
  'United States of America': 'US',
  Czechia: 'CZ',
  'Bosnia and Herz.': 'BA',
  Macedonia: 'MK',
  Kosovo: 'XK',
  'Dem. Rep. Congo': 'CD',
  Congo: 'CG',
  "Côte d'Ivoire": 'CI',
  'South Korea': 'KR',
  'Faeroe Is.': 'FO',
  Russia: 'RU',
  Turkey: 'TR',
  'Cabo Verde': 'CV',
  Vietnam: 'VN',
  Iran: 'IR',
  Moldova: 'MD',
  Tanzania: 'TZ',
  Bolivia: 'BO',
  Venezuela: 'VE',
  'Trinidad and Tobago': 'TT',
};
const en = new Intl.DisplayNames(['en'], { type: 'region' });
const wanted = new Set(ours.map((o) => (o.code.startsWith('GB-') ? 'GB' : o.code)));
const byName = new Map([...wanted].filter((c) => c !== 'XK').map((c) => [en.of(c), c]));

const features = feature(world, world.objects.countries).features.filter((f) => f.properties.name !== 'Antarctica');
// precision(0) : pas de rééchantillonnage des contours (des points en plus pour rien à cette échelle).
const projection = geoEqualEarth().precision(0).fitWidth(W, { type: 'FeatureCollection', features });
const path = geoPath(projection);

// Coordonnées au dixième, points répétés retirés après arrondi.
const round = (d) =>
  d
    .replace(/-?\d+\.\d+/g, (n) => String(Math.round(+n * 10) / 10))
    .replace(/L(-?[\d.]+,-?[\d.]+)(?=L\1(?![\d.]))/g, '');
// Petites îles retirées (sauf si le pays n'a qu'elles) : la carte reste légère.
const MIN_AREA = 2e-6;
function trim(f) {
  const g = f.geometry;
  if (g.type !== 'MultiPolygon') return f;
  const polys = g.coordinates.filter((p) => geoArea({ type: 'Polygon', coordinates: p }) > MIN_AREA);
  return polys.length ? { ...f, geometry: { type: 'MultiPolygon', coordinates: polys } } : f;
}

const shapes = [];
const found = new Set();
for (const f of features) {
  const code = ALIAS[f.properties.name] ?? byName.get(f.properties.name) ?? null;
  const d = path(trim(f));
  if (!d) continue;
  const known = code && wanted.has(code) ? code : null;
  if (known) found.add(known);
  shapes.push({ code: known, d: round(d) });
}
const missing = [...wanted].filter((c) => !found.has(c));

const pins = Object.fromEntries(
  ours.map((o) => {
    const [x, y] = projection([o.lon, o.lat]);
    return [o.code, [Math.round(x * 10) / 10, Math.round(y * 10) / 10]];
  }),
);
const H = Math.ceil(path.bounds({ type: 'FeatureCollection', features })[1][1]);

const out = `// Fichier généré par scripts/world-map.mjs : ne pas modifier à la main.
// Contours : Natural Earth 1:50m (domaine public), via le paquet world-atlas (ISC). Projection Equal Earth.
/* eslint-disable */

export const MAP_WIDTH = ${W};
export const MAP_HEIGHT = ${H};

/** Contours des pays ; \`code\` = pays de countries.ts (GB pour le Royaume-Uni), null pour les autres. */
export const MAP_SHAPES: { code: string | null; d: string }[] = ${JSON.stringify(shapes)};

/** Position de chaque pays de countries.ts sur la carte. */
export const MAP_PINS: Record<string, [number, number]> = ${JSON.stringify(pins)};

/** Pays sans contour sur la carte (trop petits) : seule leur position est connue. */
export const MAP_NO_SHAPE: string[] = ${JSON.stringify(missing)};
`;
writeFileSync(join(here, '../src/lib/world-map.ts'), out);
console.log(`${shapes.length} contours, ${Object.keys(pins).length} positions, sans contour : ${missing.join(', ') || 'aucun'}, ${(out.length / 1024).toFixed(0)} Ko`);
