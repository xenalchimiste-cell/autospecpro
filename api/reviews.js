import { sql, initDb } from './_lib/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  await initDb();

  if (req.method === 'GET') {
    try {
      const { rows } = await sql`SELECT id, author_name, rating, comment, created_at FROM reviews ORDER BY created_at DESC LIMIT 50`;
      return res.status(200).json(rows);
    } catch (error) {
      console.error('Fetch reviews error:', error);
      return res.status(500).json({ error: 'Failed to fetch reviews' });
    }
  }

  if (req.method === 'DELETE') {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authentication required' });

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.userId;
      
      const { rows: users } = await sql`SELECT user_type FROM users WHERE id = ${userId}`;
      if (users.length === 0 || users[0].user_type !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admins only' });
      }

      const { id } = req.query;
      await sql`DELETE FROM reviews WHERE id = ${id}`;
      return res.status(200).json({ message: 'Review deleted' });
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token or server error' });
    }
  }

  if (req.method === 'POST') {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authentication required' });

    const token = authHeader.split(' ')[1];
    let userId;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { rating, comment } = req.body;
    if (!rating || !comment) return res.status(400).json({ error: 'Rating and comment are required' });

    try {
      // Get user name
      const { rows: users } = await sql`SELECT first_name, last_name FROM users WHERE id = ${userId}`;
      if (users.length === 0) return res.status(404).json({ error: 'User not found' });
      
      const author_name = `${users[0].first_name} ${users[0].last_name.charAt(0)}.`;

      await sql`
        INSERT INTO reviews (user_id, author_name, rating, comment)
        VALUES (${userId}, ${author_name}, ${rating}, ${comment})
      `;

      return res.status(201).json({ message: 'Review added successfully', author_name });
    } catch (error) {
      console.error('Post review error:', error);
      return res.status(500).json({ error: 'Failed to save review' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
