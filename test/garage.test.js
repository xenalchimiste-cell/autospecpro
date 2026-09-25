import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_DEFAUT, MOTEURS, PREPAS, PEINTURES, JANTES, POUCES, HAUTEUR_CM, DEPORT_CM,
  normaliserConfig, configAleatoire, performances,
} from '../src/lib/garage.js';

function graine(n) {
  return () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
}

// ── CONFIGURATION ──
test('une configuration vide ou corrompue retombe sur celle d\'origine', () => {
  assert.deepEqual(normaliserConfig(null), { ...CONFIG_DEFAUT });
  assert.deepEqual(normaliserConfig('n\'importe quoi'), { ...CONFIG_DEFAUT });
  const cfg = normaliserConfig({ moteur: 'w16', jante: '<img>', peinture: 'red', pouces: 30, hauteur: 'bas' });
  assert.equal(cfg.moteur, CONFIG_DEFAUT.moteur);
  assert.equal(cfg.jante, CONFIG_DEFAUT.jante);
  assert.equal(cfg.peinture, CONFIG_DEFAUT.peinture);
  assert.equal(cfg.pouces, CONFIG_DEFAUT.pouces);
  assert.equal(cfg.hauteur, CONFIG_DEFAUT.hauteur);
});

test('les valeurs valides sont conservées, les réglages bornés', () => {
  const cfg = normaliserConfig({ moteur: 'v12', jante: 'turbine', peinture: '#B3121F', pouces: '21', hauteur: -40, deport: 99 });
  assert.equal(cfg.moteur, 'v12');
  assert.equal(cfg.jante, 'turbine');
  assert.equal(cfg.peinture, '#b3121f');
  assert.equal(cfg.pouces, 21);
  assert.equal(cfg.hauteur, HAUTEUR_CM.min);
  assert.equal(cfg.deport, DEPORT_CM.max);
});

test('une configuration aléatoire est toujours valide', () => {
  for (let s = 1; s <= 50; s++) {
    const cfg = configAleatoire(graine(s));
    assert.deepEqual(normaliserConfig(cfg), cfg, `graine ${s}`);
  }
});

test('les catalogues n\'ont pas d\'identifiant en double', () => {
  for (const liste of [MOTEURS, PREPAS, PEINTURES, JANTES]) {
    const ids = liste.map(o => o.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.ok(POUCES.includes(CONFIG_DEFAUT.pouces));
});

// ── PERFORMANCES ──
test('les performances d\'origine sont plausibles pour chaque moteur', () => {
  for (const m of MOTEURS) {
    const p = performances({ ...CONFIG_DEFAUT, moteur: m.id });
    assert.equal(p.ch, m.ch);
    assert.ok(p.t100 > 2 && p.t100 < 9, `${m.id} : 0-100 en ${p.t100} s`);
    assert.ok(p.vmax > 180 && p.vmax <= 500, `${m.id} : ${p.vmax} km/h`);
  }
});

test('même formule que le simulateur', () => {
  // updateSim() avec 380 ch, 1750 kg, propulsion (0.90).
  const ratio = 1750 / 380;
  const attendu = Math.round((ratio * 0.70 + 1.55 / Math.sqrt(0.90)) * 10) / 10;
  assert.equal(performances({ ...CONFIG_DEFAUT, moteur: 'l6', transmission: 'propulsion' }).t100, attendu);
});

test('une préparation gagne plus sur un turbo que sur un atmosphérique', () => {
  const gain = (moteur) => performances({ ...CONFIG_DEFAUT, moteur, prepa: 's3' }).ch / MOTEURS.find(m => m.id === moteur).ch;
  assert.ok(gain('l6') > gain('v8'));
  const stock = performances({ ...CONFIG_DEFAUT, moteur: 'l6' });
  const s2 = performances({ ...CONFIG_DEFAUT, moteur: 'l6', prepa: 's2' });
  assert.ok(s2.ch > stock.ch && s2.t100 < stock.t100);
});

test('l\'intégrale est plus rapide de 0 à 100 que la traction', () => {
  const int = performances({ ...CONFIG_DEFAUT, transmission: 'integrale' });
  const tra = performances({ ...CONFIG_DEFAUT, transmission: 'traction' });
  assert.ok(int.t100 < tra.t100);
});
