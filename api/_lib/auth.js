import jwt from 'jsonwebtoken';
import { sql } from './db.js';

// Source unique de vérité pour le secret JWT et l'email admin.
//
// Le repli valait `'super-secret-key'`, une chaîne présente en clair dans le
// dépôt : si la variable d'environnement manquait en production, n'importe qui
// pouvait signer un jeton pour n'importe quel compte, admin compris. On refuse
// désormais de démarrer plutôt que de tourner ouvert en silence.
const DEV_SECRET = 'dev-only-insecure-secret';

function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      "JWT_SECRET est absente ou trop courte (16 caractères minimum). " +
      "Définissez-la dans les variables d'environnement avant de déployer : " +
      "sans elle, les jetons d'authentification seraient forgeables."
    );
  }
  console.warn("[auth] JWT_SECRET absente : repli de développement utilisé. Ne jamais déployer ainsi.");
  return DEV_SECRET;
}

export const JWT_SECRET = resolveJwtSecret();
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'andreasgiacomello23@gmail.com').toLowerCase().trim();

export function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Extrait et vérifie le userId depuis le header Authorization.
// Retourne null si absent/invalide (usage : routes à auth optionnelle).
export function getUserIdFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const decoded = verifyToken(authHeader.split(' ')[1]);
  return decoded ? decoded.userId : null;
}

// Exige un token valide ; répond 401 et retourne null si absent/invalide.
export function requireAuth(req, res) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return userId;
}

export function isAdminUser(user) {
  if (!user) return false;
  return user.user_type === 'admin' || (user.email || '').toLowerCase().trim() === ADMIN_EMAIL;
}

// Exige un admin authentifié ; répond 401/403 et retourne null sinon.
export async function requireAdmin(req, res) {
  const userId = requireAuth(req, res);
  if (!userId) return null;

  const { rows } = await sql`SELECT id, user_type, email FROM users WHERE id = ${userId}`;
  if (!rows.length) {
    res.status(403).json({ error: 'User not found' });
    return null;
  }
  if (!isAdminUser(rows[0])) {
    res.status(403).json({ error: 'Forbidden: Admins only' });
    return null;
  }
  return userId;
}
