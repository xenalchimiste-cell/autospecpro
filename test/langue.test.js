import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// On extrait le détecteur de api/chat.js pour le tester tel qu'il y est écrit.
const src = readFileSync(new URL('../api/chat.js', import.meta.url), 'utf8');
const bloc = src.slice(src.indexOf('const TERMES_ANGLAIS'), src.indexOf('function isFailedGeneration'));
const ctx = vm.createContext({ console });
vm.runInContext(bloc, ctx);
const { valeursEnAnglais } = ctx;
const j = (o) => JSON.stringify(o);

test('les tournures anglaises courantes sont attrapées', () => {
  const cas = [
    { transmission: { entrainement: 'Rear-wheel drive' } },
    { moteur: { type: 'Inline-6 twin-turbo' } },
    { transmission: { boite: '8-speed automatic' } },
    { suspensions: { avant: 'MacPherson strut' } },
    { entretien: { distribution: 'Timing chain' } },
    { carburant: { type: 'Petrol' } },
    { type: 'Hatchback' },
    { moteur: { alimentation: 'Naturally aspirated' } },
  ];
  for (const c of cas) assert.ok(valeursEnAnglais(j(c)), `non détecté : ${j(c)}`);
});

test('une fiche correctement en français ne déclenche rien', () => {
  const ok = {
    marque: 'BMW', modele: 'M3', type: 'Berline',
    moteur: { type: '6 cylindres en ligne biturbo', alimentation: 'Biturbo', puissance_ch: '510' },
    transmission: { entrainement: 'Propulsion', boite: 'Boîte automatique à 8 rapports' },
    suspensions: { avant: 'Jambes McPherson', arriere: 'Multibras', freins_avant: 'Disques ventilés' },
    entretien: { distribution: 'Chaîne de distribution', points_vigilance: ['Consommation d\'huile'] },
    carburant: { type: 'Essence SP98' },
  };
  assert.equal(valeursEnAnglais(j(ok)), null);
});

test('les noms propres anglais ne sont pas des fautes', () => {
  const ok = {
    transmission: { entrainement: 'Intégrale xDrive', differentiel: 'Active M Differential' },
    moteur: { type: '6 cylindres en ligne', code: 'S58B30T0' },
    finition: 'Competition', nom: 'Volkswagen Golf GTI Clubsport',
  };
  assert.equal(valeursEnAnglais(j(ok)), null, 'xDrive, Competition ou Clubsport ne doivent pas alerter');
});

test('les clés du gabarit ne comptent pas comme des valeurs', () => {
  // zero_cent, puissance_ch… sont des noms de champs, pas du texte affiché.
  assert.equal(valeursEnAnglais(j({ performances: { zero_cent: '3.9', top_speed_unused: '250' } })), null);
});

test('un JSON illisible ne fait pas planter le contrôle', () => {
  assert.equal(valeursEnAnglais('{pas du json'), null);
  assert.equal(valeursEnAnglais(null), null);
});
