import { sql } from './_lib/db.js';
import { getUserIdFromRequest, requireAdmin } from './_lib/auth.js';
import { isAllowedOrigin } from './_lib/ai-guard.js';

// ── SIGNALEMENTS D'ERREUR SUR UNE FICHE ──
// La fiche affiche un niveau de confiance, mais rien ne permettait de savoir
// où le modèle se trompe réellement. Ces signalements donnent la liste des
// véhicules à corriger, classée par nombre de remontées.

const DAILY_CAP_PER_IP = 10;
const FIELDS = [
  'puissance', 'couple', 'performances', 'consommation', 'masse',
  'dimensions', 'transmission', 'entretien', 'tuning', 'identification', 'autre',
];

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS fiche_reports (
      id SERIAL PRIMARY KEY,
      query TEXT NOT NULL,
      field VARCHAR(40) NOT NULL,
      expected_value TEXT,
      comment TEXT,
      user_id INTEGER,
      ip VARCHAR(80),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await sql`ALTER TABLE fiche_reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE`;
  await sql`CREATE INDEX IF NOT EXISTS fiche_reports_query_idx ON fiche_reports (query)`;
  tableReady = true;
}

function clientIp(req) {
  return req.headers['x-real-ip']
    || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: 'Origine non autorisée.' });
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');

  // ── Lecture et traitement : réservés aux administrateurs ──
  if (req.method === 'GET') return await listReports(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if ((req.body || {}).action === 'resolve') return await resolveReports(req, res);

  const body = req.body || {};
  const query = String(body.query || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const field = FIELDS.includes(body.field) ? body.field : null;
  if (query.length < 2 || !field) return res.status(400).json({ error: 'Signalement incomplet.' });

  const expected = String(body.expected || '').trim().slice(0, 200) || null;
  const comment = String(body.comment || '').trim().slice(0, 500) || null;
  const ip = clientIp(req);

  try {
    await ensureTable();

    // Plafond quotidien par IP : un signalement doit rester un signal, pas un
    // canal d'inondation de la base.
    const { rows: [{ count }] } = await sql`
      SELECT COUNT(*)::int AS count FROM fiche_reports
      WHERE ip = ${ip} AND created_at > now() - interval '1 day'
    `;
    if (count >= DAILY_CAP_PER_IP) {
      return res.status(429).json({ error: 'Trop de signalements aujourd\'hui. Réessayez demain.' });
    }

    // getUserIdFromRequest est synchrone et renvoie null si le jeton manque
    // ou n'est pas valide : un visiteur non connecté peut signaler aussi.
    let userId = null;
    try { userId = getUserIdFromRequest(req); } catch (_) { userId = null; }
    await sql`
      INSERT INTO fiche_reports (query, field, expected_value, comment, user_id, ip)
      VALUES (${query}, ${field}, ${expected}, ${comment}, ${userId || null}, ${ip})
    `;
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[report] échec :', err.message);
    return res.status(500).json({ error: 'Signalement non enregistré. Réessayez plus tard.' });
  }
}

// ── Vue administrateur ──
// Les signalements ne valent que si on peut les lire : cette vue regroupe par
// véhicule, classe par nombre de remontées, et met de côté ce qui est traité.
async function listReports(req, res) {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  try {
    await ensureTable();
    const resolved = req.query.resolved === '1';
    const { rows } = resolved
      ? await sql`
          SELECT query, COUNT(*)::int AS total,
                 string_agg(DISTINCT field, ', ') AS fields,
                 MAX(created_at) AS last_at,
                 MAX(resolved_at) AS resolved_at
          FROM fiche_reports WHERE resolved_at IS NOT NULL
          GROUP BY query ORDER BY MAX(resolved_at) DESC LIMIT 100`
      : await sql`
          SELECT query, COUNT(*)::int AS total,
                 string_agg(DISTINCT field, ', ') AS fields,
                 string_agg(expected_value, ' · ') AS suggestions,
                 MAX(created_at) AS last_at,
                 NULL::timestamptz AS resolved_at
          FROM fiche_reports WHERE resolved_at IS NULL
          GROUP BY query ORDER BY COUNT(*) DESC, MAX(created_at) DESC LIMIT 100`;

    const { rows: [totaux] } = await sql`
      SELECT COUNT(*) FILTER (WHERE resolved_at IS NULL)::int AS ouverts,
             COUNT(DISTINCT query) FILTER (WHERE resolved_at IS NULL)::int AS vehicules
      FROM fiche_reports`;

    return res.status(200).json({
      reports: rows.map(r => ({ ...r, suggestions: (r.suggestions || '').slice(0, 300) })),
      totals: totaux,
    });
  } catch (err) {
    console.error('[report] lecture impossible :', err.message);
    return res.status(500).json({ error: 'Lecture des signalements impossible.' });
  }
}

// Marquer traité : la fiche a été corrigée, ou le signalement était infondé.
async function resolveReports(req, res) {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const query = String((req.body || {}).query || '').trim().slice(0, 160);
  if (!query) return res.status(400).json({ error: 'Véhicule manquant.' });

  try {
    await ensureTable();
    const { rows } = await sql`
      UPDATE fiche_reports SET resolved_at = CURRENT_TIMESTAMP
      WHERE query = ${query} AND resolved_at IS NULL
      RETURNING id`;
    return res.status(200).json({ ok: true, traites: rows.length });
  } catch (err) {
    console.error('[report] traitement impossible :', err.message);
    return res.status(500).json({ error: 'Mise à jour impossible.' });
  }
}
