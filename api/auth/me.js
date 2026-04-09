import { sql } from '../lib/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await sql`SELECT id, email, first_name, last_name, user_type, referral_code, referred_by_id FROM users WHERE id = ${decoded.userId}`;
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      user: rows[0]
    });
  } catch (error) {
    console.error('Session error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
