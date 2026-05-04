import { sql, initDb } from './_lib/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  await initDb();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    if (req.method === 'GET') {
      const { action, otherId } = req.query;
      
      if (action === 'list') {
        // Get list of conversations
        const { rows: conversations } = await sql`
          SELECT DISTINCT ON (other_id)
            other_id,
            u.first_name || ' ' || u.last_name as other_name,
            u.avatar_url as other_avatar,
            m.content as last_message,
            m.created_at as last_date,
            m.is_read
          FROM (
            SELECT sender_id as other_id, id, content, created_at, is_read FROM messages WHERE receiver_id = ${userId}
            UNION ALL
            SELECT receiver_id as other_id, id, content, created_at, true as is_read FROM messages WHERE sender_id = ${userId}
          ) m
          JOIN users u ON m.other_id = u.id
          ORDER BY other_id, m.created_at DESC
        `;
        return res.status(200).json(conversations);
      }
      
      if (action === 'chat' && otherId) {
        // Get messages between two users
        const { rows: chat } = await sql`
          SELECT m.*, u.first_name as sender_name
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          WHERE (sender_id = ${userId} AND receiver_id = ${otherId})
             OR (sender_id = ${otherId} AND receiver_id = ${userId})
          ORDER BY created_at ASC
        `;
        // Mark as read
        await sql`UPDATE messages SET is_read = true WHERE receiver_id = ${userId} AND sender_id = ${otherId}`;
        return res.status(200).json(chat);
      }
    }

    if (req.method === 'POST') {
      const { receiverId, content } = req.body;
      if (!receiverId || !content) return res.status(400).json({ error: 'Missing data' });

      const { rows: newMessage } = await sql`
        INSERT INTO messages (sender_id, receiver_id, content)
        VALUES (${userId}, ${receiverId}, ${content})
        RETURNING *
      `;
      return res.status(201).json(newMessage[0]);
    }

  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
