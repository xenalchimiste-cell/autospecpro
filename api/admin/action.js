import { sql } from '../lib/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const adminId = decoded.userId;

    const { rows: adminRows } = await sql`SELECT user_type FROM users WHERE id = ${adminId}`;
    if (!adminRows.length || adminRows[0].user_type !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Admins only' });
    }

    const { action, targetUserId } = req.body;
    if (!action || !targetUserId) return res.status(400).json({ error: 'Action and targetUserId required' });

    if (action === 'verify') {
      await sql`UPDATE users SET is_verified = TRUE WHERE id = ${targetUserId}`;
      return res.status(200).json({ message: 'User verified successfully' });
    } 
    
    if (action === 'delete') {
      // Small safety: prevent admin from deleting themselves
      if (parseInt(targetUserId) === adminId) return res.status(400).json({ error: 'Cannot delete yourself' });
      
      await sql`DELETE FROM users WHERE id = ${targetUserId}`;
      return res.status(200).json({ message: 'User deleted successfully' });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Admin action error:', error);
    return res.status(401).json({ error: 'Invalid token or session expired' });
  }
}
