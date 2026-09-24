import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonique, marqueCanonique, jetonsModele, scoreModele } from '../api/_lib/texte.js';

// L'import et la recherche doivent produire la MÊME forme, sinon une voiture
// importée ne se retrouve jamais. Ces tests verrouillent cet accord.
test('import et recherche s\'accordent sur la marque', () => {
  const memes = [
    ['MERCEDES-BENZ', 'mercedes benz'], ['MERCEDES', 'Mercedes-Benz'],
    ['CITROËN', 'citroen'], ['VW', 'Volkswagen'],
    ['LAND ROVER', 'land-rover'], ['ALFA ROMEO', 'alfa romeo'],
  ];
  for (const [a, b] of memes) {
    assert.equal(marqueCanonique(a), marqueCanonique(b), `${a} ≠ ${b}`);
  }
  assert.notEqual(marqueCanonique('BMW'), marqueCanonique('Mini'));
});

test('les mots de remplissage ne comptent pas dans le modèle', () => {
  assert.deepEqual(jetonsModele('SERIE 3 320D'), ['3', '320d']);
  assert.deepEqual(jetonsModele('Classe A 180'), ['a', '180']);
});

test('un modèle se retrouve malgré la casse et la ponctuation', () => {
  assert.equal(scoreModele('M3 Competition', 'M3 COMPETITION'), 1);
  assert.ok(scoreModele('C4 1.2 PureTech 130', 'C4 1.2 PURETECH 130') > 0.9);
  assert.ok(scoreModele('320d', 'SERIE 3 320D') >= 0.5);
});

test('deux voitures différentes ne se confondent pas', () => {
  // Le seuil de la recherche est 0,5 : ces couples doivent rester dessous.
  assert.ok(scoreModele('M3', 'M5') < 0.5, 'M3 et M5');
  assert.ok(scoreModele('Clio', 'Captur') < 0.5, 'Clio et Captur');
  assert.ok(scoreModele('A3', 'A4') < 0.5, 'A3 et A4');
  assert.ok(scoreModele('308', '3008') < 0.5, 'Peugeot 308 et 3008');
});

test('un chiffre seul ne suffit pas à rapprocher deux modèles', () => {
  // « 3 » commun entre « Serie 3 » et « Mazda 3 » ne doit rien déclencher.
  assert.equal(scoreModele('Serie 3 320d', 'Mazda 3 Skyactiv'), 0);
});

test('les accents survivent à la normalisation', () => {
  assert.equal(canonique('Citroën ë-C4'), 'citroen e c4');
  assert.equal(canonique('Škoda Superb'), 'skoda superb');
});
