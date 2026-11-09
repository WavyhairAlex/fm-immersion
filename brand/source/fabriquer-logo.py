"""Fabrique les SVG du logo FM Immersion (maillot vu de dos) en tracés purs, sans police à installer.

« IMMERSION » est en Barlow Condensed 900 (licence OFL, fonts/) converti en contours ; « FM » est dessiné à la main.
Usage : pip install fonttools brotli && python brand/source/fabriquer-logo.py
Sorties : fm-immersion-logo.svg (maillot domicile, fond transparent), fm-immersion-logo-exterieur.svg
(maillot extérieur bleu nuit liseré ambre), fm-immersion-icone.svg (icône de l'appli, source de src-tauri/icons).
"""
import math
import os
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ICI = os.path.dirname(os.path.abspath(__file__))
NUIT, AMBRE, CREME = '#0F1B2D', '#FFB547', '#FFF8EE'

# Dos du maillot (repère 0..360 en x, 0..412 en y ; les manches débordent un peu).
DOS = ('M120 0 Q180 22 240 0 L326 30 Q346 38 352 58 L372 140 L298 162 L292 400 '
       'Q180 412 68 400 L62 162 L-12 140 L8 58 Q14 38 34 30 Z')
COL = 'M120 0 Q180 22 240 0'
MANCHES = 'M-6 128 L62 150 M366 128 L298 150'
# « FM » façon numéro de maillot (154 × 122), coins coupés en biseau.
FM = ('M0 12 L12 0 H58 V20 H23 V50 H50 V69 H23 V122 H0 Z M68 122 V0 H93 L111 58 L129 0 H154 V110 '
      'L142 122 H131 V52 L118 98 H104 L91 52 V122 Z')


def nom_en_arc(texte, taille, espace, p0, p1, p2):
    """Contours du texte posé sur une courbe de Bézier quadratique, centré sur la courbe."""
    font = TTFont(os.path.join(ICI, 'fonts', 'barlow-condensed-latin-900-normal.woff2'))
    gs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm
    k = taille / upm
    noms = [cmap[ord(c)] for c in texte]
    avances = [gs[n].width * k for n in noms]
    total = sum(avances) + espace * (len(noms) - 1)

    def point(t):
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        return x, y

    # Table abscisse curviligne -> t
    pas = [i / 2000 for i in range(2001)]
    longueurs, l, prec = [0.0], 0.0, point(0)
    for t in pas[1:]:
        q = point(t)
        l += math.dist(prec, q)
        longueurs.append(l)
        prec = q

    def t_de(s):
        for i, li in enumerate(longueurs):
            if li >= s:
                return pas[i]
        return 1.0

    s = (l - total) / 2
    d = []
    for nom, av in zip(noms, avances):
        t = t_de(s + av / 2)
        x, y = point(t)
        x2, y2 = point(min(1, t + 0.001))
        a = math.atan2(y2 - y, x2 - x)
        ca, sa = math.cos(a), math.sin(a)
        # glyphe : origine au centre de son avance, y vers le haut -> repère SVG tourné
        m = (ca * k, sa * k, sa * k, -ca * k, x - ca * av / 2, y - sa * av / 2)
        pen = SVGPathPen(gs)
        gs[nom].draw(TransformPen(pen, m))
        d.append(pen.getCommands())
        s += av + espace
    return ' '.join(d)


NOM = nom_en_arc('IMMERSION', 38, 5, (80, 112), (180, 76), (280, 112))


def maillot(fond, lettres, details, liseret=None):
    contour = f' stroke="{liseret}" stroke-width="8" stroke-linejoin="round"' if liseret else ''
    return (f'<path d="{DOS}" fill="{fond}"{contour}/>'
            f'<path d="{COL}" fill="none" stroke="{details}" stroke-width="10" stroke-linecap="round"/>'
            f'<path d="{MANCHES}" fill="none" stroke="{details}" stroke-width="10" stroke-linecap="round"/>'
            f'<path d="{NOM}" fill="{lettres}"/>'
            f'<path d="{FM}" fill="{lettres}" transform="translate(84 140) scale(1.25)"/>')


ENTETE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="FM Immersion">\n  <title>FM Immersion</title>\n'
COMMENTAIRE = '  <!-- Généré par fabriquer-logo.py : ne pas modifier à la main. -->\n'


def ecrire(nom, vb, corps):
    with open(os.path.join(ICI, nom), 'w', encoding='utf-8') as f:
        f.write(ENTETE.format(vb=vb) + COMMENTAIRE + '  ' + corps + '\n</svg>\n')


ecrire('fm-immersion-logo.svg', '-20 -10 404 432', maillot(AMBRE, NUIT, NUIT))
ecrire('fm-immersion-logo-exterieur.svg', '-20 -10 404 432', maillot(NUIT, AMBRE, AMBRE, liseret=AMBRE))
# Icône : maillot domicile sur carré bleu nuit arrondi.
ecrire('fm-immersion-icone.svg', '0 0 512 512',
       f'<rect width="512" height="512" rx="112" fill="{NUIT}"/>'
       f'<g transform="translate(83 58) scale(0.96)">{maillot(AMBRE, NUIT, NUIT)}</g>')
print('ok')
