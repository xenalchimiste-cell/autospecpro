import { sql, initDb } from './_lib/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  // CORS Headers
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  await initDb();

  if (req.method === 'GET') {
    try {
      const { rows: messages } = await sql`
        SELECT c.*, u.user_type, u.user_rank, u.avatar_url 
        FROM chat_messages c
        LEFT JOIN users u ON c.user_id = u.id
        ORDER BY c.created_at DESC
        LIMIT 50
      `;
      // Return chronologically (oldest first among the last 50)
      return res.status(200).json(messages.reverse());
    } catch (err) {
      console.error("Chat GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  } else if (req.method === 'POST') {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.userId;

      const { content } = req.body;
      if (!content || !content.trim()) return res.status(400).json({ error: 'Message empty' });

      // Get author name
      const { rows: users } = await sql`SELECT first_name, last_name FROM users WHERE id = ${userId}`;
      const authorName = users[0].first_name + ' ' + (users[0].last_name || '');

      const { rows: newMessage } = await sql`
        INSERT INTO chat_messages (user_id, author_name, content)
        VALUES (${userId}, ${authorName}, ${content.trim()})
        RETURNING *
      `;

      const msg = newMessage[0];
      
      const { rows: fullMsg } = await sql`
        SELECT c.*, u.user_type, u.user_rank, u.avatar_url 
        FROM chat_messages c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ${msg.id}
      `;

      return res.status(201).json(fullMsg[0]);
    } catch (err) {
      console.error("Chat POST error:", err);
      return res.status(401).json({ error: 'Invalid token or server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}