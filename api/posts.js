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
    return await handleGetPosts(req, res);
  } else if (req.method === 'POST') {
    const { action } = req.query;
    if (action === 'like') return await handleLikePost(req, res);
    return await handleCreatePost(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGetPosts(req, res) {
  const authHeader = req.headers.authorization;
  let userId = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
    } catch (e) {}
  }

  try {
    // Fetch posts with a check if the current user liked them
    const { rows: posts } = await sql`
      SELECT p.*, 
             (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes_count,
             EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = ${userId}) as is_liked
      FROM posts p
      ORDER BY p.created_at DESC
      LIMIT 50
    `;
    return res.status(200).json(posts);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleCreatePost(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const { image_url, description } = req.body;
    if (!image_url) return res.status(400).json({ error: 'Image URL is required' });

    // Get author name
    const { rows: users } = await sql`SELECT first_name, last_name FROM users WHERE id = ${userId}`;
    const authorName = users[0].first_name + ' ' + (users[0].last_name || '');

    const { rows: newPost } = await sql`
      INSERT INTO posts (user_id, author_name, image_url, description)
      VALUES (${userId}, ${authorName}, ${image_url}, ${description})
      RETURNING *
    `;
    return res.status(201).json(newPost[0]);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function handleLikePost(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;
    const { postId } = req.body;

    // Toggle like
    const { rows: existing } = await sql`SELECT id FROM post_likes WHERE user_id = ${userId} AND post_id = ${postId}`;
    
    if (existing.length > 0) {
      await sql`DELETE FROM post_likes WHERE user_id = ${userId} AND post_id = ${postId}`;
      return res.status(200).json({ liked: false });
    } else {
      await sql`INSERT INTO post_likes (user_id, post_id) VALUES (${userId}, ${postId})`;
      return res.status(200).json({ liked: true });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
