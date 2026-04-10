import { sql } from '../_lib/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await sql`SELECT * FROM users WHERE id = ${decoded.userId}`;
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    delete user.password_hash;

    res.status(200).json({
      user: user
    });
  } catch (error) {
    console.error('Session error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
