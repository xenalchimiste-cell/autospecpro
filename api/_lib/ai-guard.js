import { sql } from './db.js';
import { getUserIdFromRequest, isAdminUser } from './auth.js';

// ── ORIGINES AUTORISÉES ──
// Bloque l'usage de l'API IA depuis d'autres sites. Un script serveur peut
// falsifier l'en-tête Origin : la vraie protection reste le quota ci-dessous.
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

export function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (EXTRA_ORIGINS.includes(origin)) return true;
  return /^https:\/\/autospecpro(-[a-z0-9-]+)?\.vercel\.app$/.test(origin)
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// ── QUOTAS QUOTIDIENS ──
// anon = visiteur non connecté (compté par IP), free = compte gratuit,
// paid = Passionné/Pro (plafond de sécurité anti-abus, pas une limite commerciale).
export const AI_LIMITS = {
  fiche:   { anon: 3, free: 5,  paid: 300 },
  expert:  { anon: 5, free: 15, paid: 300 },
  extract: { anon: 3, free: 5,  paid: 100 },
};
// Plafond global par IP pour les non-payants : limite la création de comptes en masse.
const IP_DAILY_CAP = 100;

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS ai_usage (
      subject VARCHAR(80) NOT NULL,
      kind VARCHAR(20) NOT NULL,
      day DATE NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (subject, kind, day)
    )
  `;
  tableReady = true;
}

function getClientIp(req) {
  return req.headers['x-real-ip']
    || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

// Incrémente le compteur seulement si la limite n'est pas dépassée (atomique).
// Retourne le nouveau total, ou null si la limite est atteinte.
async function tryIncrement(subject, kind, limit) {
  const { rows } = await sql`
    INSERT INTO ai_usage (subject, kind, day, count)
    VALUES (${subject}, ${kind}, (now() AT TIME ZONE 'Europe/Paris')::date, 1)
    ON CONFLICT (subject, kind, day)
    DO UPDATE SET count = ai_usage.count + 1
    WHERE ai_usage.count < ${limit}
    RETURNING count
  `;
  return rows.length ? rows[0].count : null;
}

async function decrement(subject, kind) {
  await sql`
    UPDATE ai_usage SET count = GREATEST(count - 1, 0)
    WHERE subject = ${subject} AND kind = ${kind}
      AND day = (now() AT TIME ZONE 'Europe/Paris')::date
  `;
}

// Consomme une unité de quota IA pour la requête.
// Retourne { allowed, tier, limit, remaining, refund() }.
// refund() rend l'unité si l'appel IA échoue ensuite (l'utilisateur n'est pas pénalisé).
export async function consumeAiQuota(req, kind) {
  const limits = AI_LIMITS[kind];
  const noop = async () => {};
  try {
    await ensureTable();

    let tier = 'anon';
    const userId = getUserIdFromRequest(req);
    if (userId) {
      const { rows } = await sql`SELECT account_tier, user_type, email FROM users WHERE id = ${userId}`;
      if (rows.length) {
        if (isAdminUser(rows[0])) return { allowed: true, tier: 'admin', limit: null, remaining: null, refund: noop };
        tier = ['passionne', 'pro'].includes(rows[0].account_tier) ? 'paid' : 'free';
      }
    }

    const ip = getClientIp(req);
    const subject = tier === 'anon' ? `ip:${ip}` : `u:${userId}`;
    const limit = limits[tier];

    const used = await tryIncrement(subject, kind, limit);
    if (used === null) return { allowed: false, tier, limit, remaining: 0, refund: noop };

    if (tier !== 'paid') {
      const ipUsed = await tryIncrement(`ip:${ip}`, 'all', IP_DAILY_CAP);
      if (ipUsed === null) {
        await decrement(subject, kind);
        return { allowed: false, tier, limit, remaining: 0, refund: noop };
      }
    }

    return {
      allowed: true,
      tier,
      limit,
      remaining: limit - used,
      refund: async () => {
        try {
          await decrement(subject, kind);
          if (tier !== 'paid') await decrement(`ip:${ip}`, 'all');
        } catch (e) { console.error('AI quota refund error:', e); }
      },
    };
  } catch (err) {
    // Base indisponible : on laisse passer plutôt que de casser le site.
    console.error('AI quota check failed (fail-open):', err);
    return { allowed: true, tier: 'unknown', limit: null, remaining: null, refund: noop };
  }
}

export function quotaExceededBody(quota, kind) {
  const what = kind === 'expert' ? 'questions à l\'Expert IA' : kind === 'extract' ? 'analyses d\'annonce' : 'fiches';
  let error;
  if (quota.tier === 'anon') {
    error = `Vous avez utilisé vos ${quota.limit} ${what} gratuites du jour. Créez un compte gratuit pour en avoir plus, ou passez Passionné pour un accès illimité.`;
  } else if (quota.tier === 'free') {
    error = `Vous avez utilisé vos ${quota.limit} ${what} gratuites du jour. Passez Passionné pour un accès illimité.`;
  } else {
    error = `Limite quotidienne atteinte. Réessayez demain ou contactez le support.`;
  }
  return { error, code: 'QUOTA_EXCEEDED', tier: quota.tier, limit: quota.limit };
}
