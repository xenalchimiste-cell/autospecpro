import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Le plan Vercel Hobby plafonne à douze fonctions serverless. Ajouter un
// treizième fichier dans api/ fait échouer le build — et Vercel continue
// alors de servir l'ancien déploiement SANS rien signaler côté site. Ça nous
// a coûté une heure : deux lots de travail poussés mais jamais en ligne.
// Ce test rend la limite visible avant le push plutôt qu'après.
const PLAFOND = 12;

test(`api/ ne dépasse pas ${PLAFOND} fonctions serverless`, () => {
  const fns = readdirSync(new URL('../api/', import.meta.url))
    .filter(f => f.endsWith('.js'));
  assert.ok(
    fns.length <= PLAFOND,
    `${fns.length} fonctions dans api/ — le plan Hobby en autorise ${PLAFOND}.\n` +
    `Le build échouera en silence. Repliez la nouvelle route dans un routeur\n` +
    `existant (voir api/chat.js et ses ?action=) plutôt que d'ajouter un fichier.\n` +
    `Fichiers : ${fns.join(', ')}`
  );
});

test('les routes repliées gardent leur URL publique', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = vercel.rewrites.map(r => r.source);
  // /api/report n'a pas de fichier : il ne vit que par cette réécriture.
  assert.ok(sources.includes('/api/report'),
    'la réécriture /api/report a disparu : le signalement d\'erreur ne répondra plus');
  for (const r of vercel.rewrites) {
    assert.match(r.destination, /^\/api\/[a-z-]+\.js(\?|$)/,
      `destination inattendue : ${r.destination}`);
  }
});
