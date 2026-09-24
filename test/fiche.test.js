import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// src/lib/fiche.js est un script classique : on l'évalue tel quel, sans
// l'altérer pour les besoins du test — c'est exactement ce que fait le
// navigateur, et ses déclarations deviennent des propriétés du contexte.
const code = readFileSync(new URL('../src/lib/fiche.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(code, ctx);
const { normalizeCarQuery, canonicalQuery, sanitizeFiche, isEmptyFiche, hasVal, toNum } = ctx;

// ── NORMALISATION ──
test('les fautes de marque courantes sont corrigées', () => {
  assert.equal(normalizeCarQuery('wolkswagen golf 7 gti'), 'Volkswagen golf 7 gti');
  assert.equal(normalizeCarQuery('peugot 308 gt'), 'Peugeot 308 gt');
  assert.equal(normalizeCarQuery('porche 911 gt3'), 'Porsche 911 gt3');
  assert.equal(normalizeCarQuery('alpha romeo giulia'), 'Alfa Romeo giulia');
  assert.equal(normalizeCarQuery('mercedes c63 amg'), 'Mercedes-Benz c63 amg');
});

test('un chiffre collé au modèle est décollé', () => {
  assert.equal(normalizeCarQuery('golf7 gti'), 'golf 7 gti');
  assert.equal(normalizeCarQuery('tesla model3'), 'Tesla model 3');
  assert.equal(normalizeCarQuery('audi a3 2.0tdi'), 'Audi a3 2.0 tdi');
});

test('les noms courts gardent leur chiffre collé', () => {
  for (const q of ['BMW M3', 'Audi A3', 'BMW X5', 'Porsche 911 GT3', 'Audi Q5']) {
    assert.ok(normalizeCarQuery(q).includes(q.split(' ').pop()), `${q} a été coupé`);
  }
});

test('la clé canonique ignore casse, accents et espaces', () => {
  assert.equal(canonicalQuery('  BMW   M3  2023 '), canonicalQuery('bmw m3 2023'));
  assert.equal(canonicalQuery('Citroën C4'), canonicalQuery('citroen c4'));
  assert.notEqual(canonicalQuery('BMW M3'), canonicalQuery('BMW M4'));
});

// ── VALIDATION ──
const base = () => ({
  marque: 'Volkswagen', modele: 'Golf', finition: 'GTI',
  nom: '', annee_debut: '2013', annee_fin: '2017',
  moteur: { puissance_ch: '245 ch', puissance_kw: '999', couple_nm: '370 N·m' },
  performances: { zero_cent: '6,2 s', vitesse_max: '250 km/h' },
  chassis: { masse: '1 364 kg', coffre: '380 L' },
  carburant: { reservoir: '50 L', autonomie_estimee: '12' },
  tuning: { stage1: { puissance_ch: '310', gain_ch: '' }, stage2: { puissance_ch: '200', gain_ch: '-45' } },
});

test("l'unité est retirée des champs numériques", () => {
  const c = sanitizeFiche(base());
  assert.equal(c.moteur.puissance_ch, '245');
  assert.equal(c.moteur.couple_nm, '370');
  assert.equal(c.performances.vitesse_max, '250');
});

test('la virgule décimale et les milliers espacés sont compris', () => {
  const c = sanitizeFiche(base());
  assert.equal(c.performances.zero_cent, '6.2');
  assert.equal(c.chassis.masse, '1364', 'le séparateur de milliers doit être absorbé');
});

test('la puissance en kW est recalculée quand elle contredit les chevaux', () => {
  const c = sanitizeFiche(base());
  assert.equal(c.moteur.puissance_kw, '180');
});

test('une valeur physiquement impossible est effacée plutôt qu affichée', () => {
  const c = sanitizeFiche(base());
  assert.equal(c.carburant.autonomie_estimee, 'N/A', '12 km d autonomie est hors bornes');

  const absurde = sanitizeFiche({ moteur: { puissance_ch: '99999' }, performances: { zero_cent: '0.2' } });
  assert.equal(absurde.moteur.puissance_ch, 'N/A');
  assert.equal(absurde.performances.zero_cent, 'N/A');
});

test('un stage ne peut pas annoncer moins que la version d origine', () => {
  const c = sanitizeFiche(base());
  assert.equal(c.tuning.stage1.gain_ch, '65', 'le gain manquant est déduit');
  assert.equal(c.tuning.stage2.puissance_ch, 'N/A', '200 ch pour un stage 2 sur 245 ch de série');
});

test('un 0-100 incohérent avec le poids/puissance est signalé sans être effacé', () => {
  const c = sanitizeFiche({ moteur: { puissance_ch: '150' }, chassis: { masse: '1500' }, performances: { zero_cent: '2.1' } });
  assert.equal(c._alerts.length, 1);
  assert.equal(c.performances.zero_cent, '2.1', 'la valeur reste lisible, seule une alerte est ajoutée');
});

test('le nom et les années sont reconstruits si le modèle les oublie', () => {
  const c = sanitizeFiche(base());
  assert.equal(c.nom, 'Volkswagen Golf GTI');
  assert.equal(c.annee, '2013 – 2017');
});

test('une fiche cohérente ne déclenche aucune alerte', () => {
  const c = sanitizeFiche({
    nom: 'Renault Clio', moteur: { puissance_ch: '100' },
    chassis: { masse: '1150' }, performances: { zero_cent: '11.8' },
  });
  // Le tableau naît dans le contexte vm : on compare son contenu, pas son prototype.
  assert.equal(c._alerts.length, 0);
});

// ── FICHE VIDE ──
test('les fiches inexploitables sont détectées', () => {
  assert.equal(isEmptyFiche({ error: 'NOT_A_CAR' }), true);
  assert.equal(isEmptyFiche({ nom: 'N/A', moteur: {} }), true);
  assert.equal(isEmptyFiche({ nom: 'BMW M3', moteur: {} }), true, 'un nom sans aucune spec ne suffit pas');
  assert.equal(isEmptyFiche(sanitizeFiche(base())), false);
});

test('hasVal rejette les valeurs de remplissage', () => {
  for (const v of [null, undefined, '', '  ', 'N/A', 'n/a', '—', 'inconnu']) {
    assert.equal(hasVal(v), false, `${JSON.stringify(v)} devrait être rejeté`);
  }
  assert.equal(hasVal('0'), true);
  assert.equal(toNum('1 364 kg'), 1364);
});

// ── ANNONCE D'OUVERTURE ──
test('la marque est séparée du modèle pour l\'annonce', () => {
  assert.deepEqual({ ...ctx.brandAndModel('bmw m3 competition 2023') }, { brand: 'BMW', model: 'm3 competition 2023' });
  assert.deepEqual({ ...ctx.brandAndModel('vw golf 7 gti') }, { brand: 'Volkswagen', model: 'golf 7 gti' });
  assert.deepEqual({ ...ctx.brandAndModel('alpha romeo giulia qv') }, { brand: 'Alfa Romeo', model: 'giulia qv' });
});

test('une marque inconnue laisse la requête entière comme modèle', () => {
  const r = ctx.brandAndModel('caterham seven 620');
  assert.equal(r.brand, 'Caterham');
  const s = ctx.brandAndModel('quelque chose 2020');
  assert.equal(s.brand, '');
  assert.equal(s.model, 'quelque chose 2020');
});
