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
  let currentUserId = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      currentUserId = decoded.userId;
    } catch (e) {}
  }

  if (req.method === 'GET') {
    const { action, userId } = req.query;

    if (action === 'profile' && userId) {
      // Fetch public profile info
      const { rows: users } = await sql`
        SELECT id, first_name, last_name, avatar_url, bio, instagram, location, garage, user_rank, points,
               (SELECT COUNT(*) FROM follows WHERE following_id = ${userId}) as followers_count,
               (SELECT COUNT(*) FROM follows WHERE follower_id = ${userId}) as following_count,
               EXISTS(SELECT 1 FROM follows WHERE follower_id = ${currentUserId} AND following_id = ${userId}) as is_following
        FROM users WHERE id = ${userId}
      `;
      
      if (users.length === 0) return res.status(404).json({ error: 'User not found' });
      
      // Fetch user posts
      const { rows: posts } = await sql`
        SELECT * FROM posts WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 20
      `;
      
      return res.status(200).json({ user: users[0], posts });
    }
  }

  if (req.method === 'POST') {
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });
    const { action, targetId } = req.body;

    if (action === 'follow' && targetId) {
      if (currentUserId == targetId) return res.status(400).json({ error: "Cannot follow yourself" });
      
      const { rows: existing } = await sql`SELECT id FROM follows WHERE follower_id = ${currentUserId} AND following_id = ${targetId}`;
      
      if (existing.length > 0) {
        await sql`DELETE FROM follows WHERE follower_id = ${currentUserId} AND following_id = ${targetId}`;
        return res.status(200).json({ following: false });
      } else {
        await sql`INSERT INTO follows (follower_id, following_id) VALUES (${currentUserId}, ${targetId})`;
        return res.status(200).json({ following: true });
      }
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
