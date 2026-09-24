import { sql } from './db.js';

// ── CACHE PARTAGÉ DES FICHES TECHNIQUES ──
// Le cache vivait uniquement dans le localStorage de chaque navigateur : deux
// personnes cherchant « BMW M3 2023 » déclenchaient deux générations, payées
// deux fois, et pouvaient recevoir deux fiches différentes. En stockant la
// réponse ici, tout le monde voit la même fiche — c'est ce qui rend la
// fiabilité vérifiable — et les modèles populaires répondent instantanément.

// Durée de validité : les caractéristiques d'un véhicule déjà commercialisé
// ne bougent plus. On conserve tout de même une péremption pour que les
// corrections du modèle finissent par se propager.
const MAX_AGE_DAYS = 60;

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS fiche_cache (
      cache_key VARCHAR(160) PRIMARY KEY,
      query TEXT NOT NULL,
      content TEXT NOT NULL,
      model VARCHAR(60),
      prompt_version INTEGER NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;
  tableReady = true;
}

function canonical(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// La clé porte la requête en clair : on peut lire la table et comprendre ce
// qu'elle contient, et deux véhicules différents ne peuvent pas se retrouver
// sur la même entrée par collision de hash.
export function ficheCacheKey({ query, carburant = '', stage = '', tech = {} }, promptVersion) {
  const q = canonical(query);
  if (q.length < 2) return null;
  const kw = Number(tech?.kw);
  const parts = [
    q.slice(0, 90).replace(/ /g, '-'),
    canonical(carburant).slice(0, 12) || '-',
    canonical(stage).replace(/ /g, '') || '-',
    kw > 0 && kw < 2000 ? String(Math.round(kw)) : '-',
    canonical(tech?.engine_code).replace(/ /g, '').slice(0, 20) || '-',
    'v' + promptVersion,
  ];
  return parts.join('|').slice(0, 160);
}

// Une panne de base ne doit jamais empêcher de générer une fiche :
// lecture et écriture échouent en silence et on repart vers le modèle.
export async function readFiche(cacheKey, promptVersion) {
  if (!cacheKey) return null;
  try {
    await ensureTable();
    // La date limite est calculée ici : dans un gabarit balisé, `${...}` devient
    // un paramètre `$1`, donc `interval '$1 days'` ne serait qu'une chaîne.
    const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86400000);
    const { rows } = await sql`
      SELECT content FROM fiche_cache
      WHERE cache_key = ${cacheKey}
        AND prompt_version = ${promptVersion}
        AND created_at > ${cutoff}
    `;
    if (!rows.length) return null;
    sql`UPDATE fiche_cache SET hits = hits + 1 WHERE cache_key = ${cacheKey}`.catch(() => {});
    return rows[0].content;
  } catch (err) {
    console.warn('[fiche-cache] lecture impossible :', err.message);
    return null;
  }
}

export async function writeFiche(cacheKey, query, content, model, promptVersion) {
  if (!cacheKey || !content) return;
  try {
    await ensureTable();
    await sql`
      INSERT INTO fiche_cache (cache_key, query, content, model, prompt_version)
      VALUES (${cacheKey}, ${String(query).slice(0, 200)}, ${content}, ${model}, ${promptVersion})
      ON CONFLICT (cache_key) DO UPDATE
        SET content = EXCLUDED.content,
            model = EXCLUDED.model,
            prompt_version = EXCLUDED.prompt_version,
            created_at = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    console.warn('[fiche-cache] écriture impossible :', err.message);
  }
}
