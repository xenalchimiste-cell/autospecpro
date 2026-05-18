import { sql, initDb } from './_lib/db.js';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BENk7CYgAuJCfCv3-H0EJNQEs3VfyYVS7TcEe1ZfZZPxiXlBEOnpIN-d4yYOIRI62Hgn8brRg_ZmVUMODDqiTJ0";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:contact@autospec.pro', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

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

  let userId;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.userId;
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    // ─── GET ───────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { action, otherId } = req.query;

      if (action === 'search_users') {
        let query = req.query.q || '';
        if (query.startsWith('@')) query = query.substring(1);
        
        if (query.length < 1) return res.status(200).json([]);
        const searchStr = `%${query}%`;
        const { rows: users } = await sql`
          SELECT id, CONCAT_WS(' ', first_name, last_name) as name, pseudo, avatar_url, user_type
          FROM users 
          WHERE (first_name ILIKE ${searchStr} OR last_name ILIKE ${searchStr} OR pseudo ILIKE ${searchStr})
            AND id != ${userId}
          LIMIT 10
        `;
        return res.status(200).json(users);
      }

      if (action === 'list') {
        const { rows: conversations } = await sql`
          SELECT DISTINCT ON (other_id)
            other_id,
            CONCAT_WS(' ', u.first_name, u.last_name) as other_name,
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
        const { rows: chat } = await sql`
          SELECT m.*, u.first_name as sender_name
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          WHERE (sender_id = ${userId} AND receiver_id = ${otherId})
             OR (sender_id = ${otherId} AND receiver_id = ${userId})
          ORDER BY created_at ASC
        `;
        await sql`UPDATE messages SET is_read = true WHERE receiver_id = ${userId} AND sender_id = ${otherId}`;
        return res.status(200).json(chat);
      }
    }

    // ─── POST ──────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { receiverId, content } = req.body;
      if (!receiverId || !content) return res.status(400).json({ error: 'Missing data' });

      // 1. Save message
      const { rows: newMessage } = await sql`
        INSERT INTO messages (sender_id, receiver_id, content)
        VALUES (${userId}, ${receiverId}, ${content})
        RETURNING *
      `;

      // 2. Send Web Push notification to the receiver (non-blocking)
      if (VAPID_PRIVATE_KEY) {
        (async () => {
          try {
            const { rows: senderRows } = await sql`SELECT first_name, last_name FROM users WHERE id = ${userId}`;
            const senderName = senderRows.length > 0
              ? `${senderRows[0].first_name} ${senderRows[0].last_name}`
              : 'Quelqu\'un';

            const { rows: subs } = await sql`
              SELECT subscription FROM push_subscriptions WHERE user_id = ${receiverId}
            `;

            if (subs.length > 0) {
              const payload = JSON.stringify({
                title: `💬 ${senderName}`,
                body: content.length > 80 ? content.slice(0, 80) + '…' : content,
                url: '/'
              });
              await Promise.all(subs.map(async (row) => {
                try {
                  await webpush.sendNotification(row.subscription, payload);
                } catch (err) {
                  if (err.statusCode === 404 || err.statusCode === 410) {
                    await sql`DELETE FROM push_subscriptions WHERE subscription->>'endpoint' = ${row.subscription.endpoint}`;
                  }
                }
              }));
            }
          } catch (pushErr) {
            console.error('Push notification error:', pushErr);
          }
        })();
      }

      return res.status(201).json(newMessage[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (dbErr) {
    console.error('Database Error:', dbErr);
    return res.status(500).json({ error: 'Internal server error', details: dbErr.message });
  }
}
