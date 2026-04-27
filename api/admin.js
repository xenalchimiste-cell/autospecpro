import { sql } from './_lib/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. Verify Admin JWT
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const { rows: userRows } = await sql`SELECT user_type, email FROM users WHERE id = ${userId}`;
    if (!userRows.length) return res.status(403).json({ error: 'User not found' });
    
    const user = userRows[0];
    const userEmail = (user.email || '').toLowerCase().trim();
    const isAdmin = user.user_type === 'admin' || userEmail === 'andreasgiacomello23@gmail.com';
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Access denied: Admins only' });
    }

    // ----- GET: Fetch Dashboard Data -----
    if (req.method === 'GET') {
      const { rows: users } = await sql`SELECT id, email, first_name, last_name, user_type, account_tier, company_name, siret, proof_url, is_verified, created_at FROM users ORDER BY created_at DESC`;
      
      const stats = {
        totalUsers: users.length,
        totalPros: users.filter(u => u.user_type === 'enterprise' || u.user_type === 'pro').length,
        pendingPros: users.filter(u => (u.user_type === 'enterprise' || u.user_type === 'pro') && !u.is_verified).length
      };

      const { rows: referrals } = await sql`
        SELECT u.id, u.first_name, u.last_name, u.referral_code, COUNT(f.id) as count
        FROM users u
        LEFT JOIN users f ON f.referred_by_id = u.id
        WHERE u.referral_code IS NOT NULL
        GROUP BY u.id, u.first_name, u.last_name, u.referral_code
        HAVING COUNT(f.id) > 0
        ORDER BY count DESC
      `;

      return res.status(200).json({ users, stats, referrals });
    }

    // ----- POST: Perform Admin Action -----
    if (req.method === 'POST') {
      const { action, targetUserId } = req.body;
      if (!action || !targetUserId) return res.status(400).json({ error: 'Action and targetUserId required' });

      if (action === 'verify') {
        await sql`UPDATE users SET is_verified = TRUE WHERE id = ${targetUserId}`;
        return res.status(200).json({ message: 'User verified successfully' });
      } 

      if (action === 'grant_pro') {
        await sql`UPDATE users SET account_tier = 'pro', user_type = 'pro', is_verified = TRUE WHERE id = ${targetUserId}`;
        return res.status(200).json({ message: 'User granted Pro access successfully' });
      }
      
      if (action === 'delete') {
        if (parseInt(targetUserId) === userId) return res.status(400).json({ error: 'Cannot delete yourself' });
        await sql`DELETE FROM users WHERE id = ${targetUserId}`;
        return res.status(200).json({ message: 'User deleted successfully' });
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(401).json({ error: 'Invalid token or session expired' });
  }
}
