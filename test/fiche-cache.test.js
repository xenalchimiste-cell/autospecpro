import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Base simulée : on enregistre chaque requête pour vérifier ce qui part
// réellement vers Postgres, y compris le nombre de paramètres.
const calls = [];
let behaviour = () => ({ rows: [] });

mock.module('../api/_lib/db.js', {
  namedExports: {
    sql: async (strings, ...values) => {
      let text = '';
      for (let i = 0; i < strings.length; i++) {
        text += strings[i];
        if (i < values.length) text += '$' + (i + 1);
      }
      const norm = text.replace(/\s+/g, ' ').trim();
      calls.push({ text: norm, values });
      return behaviour(norm, values);
    },
  },
});

const { ficheCacheKey, readFiche, writeFiche } = await import('../api/_lib/fiche-cache.js');
const V = 1;

test('la clé est lisible et distingue deux véhicules', () => {
  const a = ficheCacheKey({ query: 'BMW M3 2023' }, V);
  const b = ficheCacheKey({ query: 'Audi RS4 2023' }, V);
  assert.notEqual(a, b);
  assert.match(a, /^bmw-m3-2023\|/);
  assert.ok(a.endsWith('|v1'));
});

test('casse, accents et espaces donnent la même clé', () => {
  assert.equal(
    ficheCacheKey({ query: '  Citroën   C4  ' }, V),
    ficheCacheKey({ query: 'citroen c4' }, V),
  );
});

test('carburant, préparation et données de carte grise changent la clé', () => {
  const base = ficheCacheKey({ query: 'Golf 7 GTI' }, V);
  assert.notEqual(base, ficheCacheKey({ query: 'Golf 7 GTI', carburant: 'Diesel' }, V));
  assert.notEqual(base, ficheCacheKey({ query: 'Golf 7 GTI', stage: 'Stage 2' }, V));
  assert.notEqual(base, ficheCacheKey({ query: 'Golf 7 GTI', tech: { kw: 180 } }, V));
  assert.notEqual(base, ficheCacheKey({ query: 'Golf 7 GTI', tech: { engine_code: 'CHHB' } }, V));
});

test('une version de prompt différente invalide la clé', () => {
  assert.notEqual(ficheCacheKey({ query: 'BMW M3' }, 1), ficheCacheKey({ query: 'BMW M3' }, 2));
});

test('une requête vide ne produit pas de clé', () => {
  assert.equal(ficheCacheKey({ query: ' ' }, V), null);
  assert.equal(ficheCacheKey({ query: 'a' }, V), null);
});

test('la date limite part en paramètre, pas en chaîne littérale', async () => {
  calls.length = 0;
  behaviour = () => ({ rows: [] });
  await readFiche('bmw-m3|-|-|-|-|v1', V);
  const select = calls.find(c => c.text.startsWith('SELECT'));
  assert.ok(select, 'aucun SELECT émis');
  assert.ok(!select.text.includes("interval '$"), "l'intervalle est interpolé en chaîne");
  assert.equal(select.values.length, 3);
  assert.ok(select.values[2] instanceof Date, 'la date limite doit être un paramètre Date');
});

test('une fiche en cache est renvoyée et son compteur incrémenté', async () => {
  calls.length = 0;
  behaviour = (text) => text.startsWith('SELECT') ? { rows: [{ content: '{"nom":"BMW M3"}' }] } : { rows: [] };
  const hit = await readFiche('bmw-m3|-|-|-|-|v1', V);
  assert.equal(hit, '{"nom":"BMW M3"}');
  await new Promise(r => setTimeout(r, 10));
  assert.ok(calls.some(c => c.text.startsWith('UPDATE fiche_cache SET hits')), 'compteur non incrémenté');
});

test("l'écriture fait un upsert sur la clé", async () => {
  calls.length = 0;
  behaviour = () => ({ rows: [] });
  await writeFiche('k|v1', 'BMW M3 2023', '{"nom":"x"}', 'openai/gpt-oss-120b', V);
  const ins = calls.find(c => c.text.startsWith('INSERT INTO fiche_cache'));
  assert.ok(ins, 'aucun INSERT émis');
  assert.match(ins.text, /ON CONFLICT \(cache_key\) DO UPDATE/);
  assert.equal(ins.values.length, 5);
});

test('une panne de base ne fait pas échouer la génération', async () => {
  behaviour = () => { throw new Error('connexion refusée'); };
  assert.equal(await readFiche('k|v1', V), null);
  await writeFiche('k|v1', 'q', 'c', 'm', V);  // ne doit pas lever
  behaviour = () => ({ rows: [] });
});
