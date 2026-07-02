import jwt from 'jsonwebtoken';
import { sql } from './db.js';

// Source unique de vérité pour le secret JWT et l'email admin — évite la
// duplication du fallback `'super-secret-key'` dans chaque fonction API.
export const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
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
