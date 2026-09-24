import { sql } from './_lib/db.js';
import { getUserIdFromRequest } from './_lib/auth.js';
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

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

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
