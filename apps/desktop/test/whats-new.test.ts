import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareVersions, entriesToShow, WHATS_NEW, type WhatsNewEntry } from '../src/lib/whats-new';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const e = (version: string): WhatsNewEntry => ({ version, date: '2026-11-09', fr: [version], en: [version] });
const all = ['0.1.114', '0.1.113', '0.1.112', '0.1.111', '0.1.110'].map(e);

describe('Quoi de neuf', () => {
  it('chaque version publiée a sa note pour les joueurs', () => {
    // Monter la version sans écrire sa note dans src/i18n/whats-new.json fait échouer ce test.
    expect(WHATS_NEW[0]?.version).toBe(pkg.version);
  });

  it('notes complètes, en français et en anglais, de la plus récente à la plus ancienne', () => {
    const versions = WHATS_NEW.map((n) => n.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < WHATS_NEW.length; i++) expect(compareVersions(versions[i - 1] ?? '', versions[i] ?? '')).toBeGreaterThan(0);
    for (const n of WHATS_NEW) {
      expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(n.fr.length).toBeGreaterThan(0);
      expect(n.en.length).toBe(n.fr.length);
      for (const line of [...n.fr, ...n.en]) expect(line.trim().length).toBeGreaterThan(10);
    }
  });

  it('compare les numéros de version chiffre par chiffre', () => {
    expect(compareVersions('0.1.100', '0.1.99')).toBeGreaterThan(0);
    expect(compareVersions('0.2.0', '0.1.113')).toBeGreaterThan(0);
    expect(compareVersions('0.1.113', '0.1.113')).toBe(0);
  });

  it('après une mise à jour : les versions pas encore vues', () => {
    expect(entriesToShow('0.1.111', '0.1.114', true, all).map((n) => n.version)).toEqual(['0.1.114', '0.1.113', '0.1.112']);
    expect(entriesToShow('0.1.114', '0.1.114', true, all)).toEqual([]);
  });

  it('une note plus récente que la version installée n\'est pas montrée', () => {
    expect(entriesToShow('0.1.111', '0.1.113', true, all).map((n) => n.version)).toEqual(['0.1.113', '0.1.112']);
  });

  it('première installation : rien ; ancienne appli sans la fenêtre : les trois dernières', () => {
    expect(entriesToShow(null, '0.1.114', false, all)).toEqual([]);
    expect(entriesToShow(null, '0.1.114', true, all).map((n) => n.version)).toEqual(['0.1.114', '0.1.113', '0.1.112']);
  });
});
