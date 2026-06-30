import { sql, initDb } from './_lib/db.js';
import jwt from 'jsonwebtoken';
import { awardPoints, POINT_ACTIONS } from './_lib/gamification.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
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
        SELECT id, first_name, last_name, pseudo, avatar_url, bio, instagram, location, garage,
               user_rank, user_type, points, profile_theme, profile_banner, avatar_frame,
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
      
      // Fetch user playlists
      const { rows: playlists } = await sql`
        SELECT * FROM playlists WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 20
      `;
      
      return res.status(200).json({ user: users[0], posts, playlists });
    }

    if (action === 'reviews') {
      try {
        const { rows } = await sql`SELECT id, author_name, rating, comment, created_at FROM reviews ORDER BY created_at DESC LIMIT 50`;
        return res.status(200).json(rows);
      } catch (error) {
        console.error('Fetch reviews error:', error);
        return res.status(500).json({ error: 'Failed to fetch reviews' });
      }
    }
  }

  if (req.method === 'DELETE') {
    const { action } = req.query;
    if (action === 'reviews') {
      if (!currentUserId) return res.status(401).json({ error: 'Authentication required' });
      
      try {
        const { rows: users } = await sql`SELECT user_type FROM users WHERE id = ${currentUserId}`;
        if (users.length === 0 || users[0].user_type !== 'admin') {
          return res.status(403).json({ error: 'Forbidden: Admins only' });
        }
  
        const { id } = req.query;
        await sql`DELETE FROM reviews WHERE id = ${id}`;
        return res.status(200).json({ message: 'Review deleted' });
      } catch (error) {
        return res.status(500).json({ error: 'Server error' });
      }
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
        await awardPoints(targetId, POINT_ACTIONS.FOLLOW_RECEIVED);
        return res.status(200).json({ following: true });
      }
    }

    if (action === 'reviews') {
      const { rating, comment } = req.body;
      if (!rating || !comment) return res.status(400).json({ error: 'Rating and comment are required' });
  
      try {
        // Get user name
        const { rows: users } = await sql`SELECT first_name, last_name FROM users WHERE id = ${currentUserId}`;
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        
        const author_name = `${users[0].first_name}${users[0].last_name ? ' ' + users[0].last_name.charAt(0) + '.' : ''}`;
  
        await sql`
          INSERT INTO reviews (user_id, author_name, rating, comment)
          VALUES (${currentUserId}, ${author_name}, ${rating}, ${comment})
        `;
  
        return res.status(201).json({ message: 'Review added successfully', author_name });
      } catch (error) {
        console.error('Post review error:', error);
        return res.status(500).json({ error: 'Failed to save review' });
      }
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
