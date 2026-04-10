import { sql } from '../lib/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Verify Admin JWT
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const { rows: userRows } = await sql`SELECT user_type FROM users WHERE id = ${userId}`;
    if (!userRows.length || userRows[0].user_type !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Admins only' });
    }

    // 2. Fetch Dashboard Data
    const { rows: users } = await sql`SELECT id, email, first_name, last_name, user_type, company_name, siret, proof_url, is_verified, created_at FROM users ORDER BY created_at DESC`;
    
    // Stats
    const stats = {
      totalUsers: users.length,
      totalPros: users.filter(u => u.user_type === 'enterprise' || u.user_type === 'pro').length,
      pendingPros: users.filter(u => (u.user_type === 'enterprise' || u.user_type === 'pro') && !u.is_verified).length
    };

    // Referrals
    const { rows: referrals } = await sql`
      SELECT u.id, u.first_name, u.last_name, u.referral_code, COUNT(f.id) as count
      FROM users u
      LEFT JOIN users f ON f.referred_by_id = u.id
      WHERE u.referral_code IS NOT NULL
      GROUP BY u.id, u.first_name, u.last_name, u.referral_code
      HAVING COUNT(f.id) > 0
      ORDER BY count DESC
    `;

    return res.status(200).json({
      users,
      stats,
      referrals
    });

  } catch (error) {
    console.error('Admin data error:', error);
    return res.status(401).json({ error: 'Invalid token or session expired' });
  }
}
