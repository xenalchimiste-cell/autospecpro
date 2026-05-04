import { sql, initDb } from './_lib/db.js';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BENk7CYgAuJCfCv3-H0EJNQEs3VfyYVS7TcEe1ZfZZPxiXlBEOnpIN-d4yYOIRI62Hgn8brRg_ZmVUMODDqiTJ0";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:contact@autospec.pro',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

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
  } else if (req.method === 'DELETE') {
    return await handleDeletePost(req, res);
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

    // Send Notifications to all subscribers
    if (VAPID_PRIVATE_KEY) {
      try {
        const { rows: subs } = await sql`SELECT subscription FROM push_subscriptions`;
        const payload = JSON.stringify({
          title: 'Nouveau bolide ! 🏎️',
          body: `${authorName} a partagé sa voiture dans la communauté.`,
          url: '/#page-community'
        });

        await Promise.all(subs.map(async (row) => {
          try {
            await webpush.sendNotification(row.subscription, payload);
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await sql`DELETE FROM push_subscriptions WHERE endpoint = ${row.subscription.endpoint}`;
            }
          }
        }));
      } catch (err) { console.error("Push Error:", err); }
    }

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

async function handleDeletePost(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // Check if admin
    const { rows: users } = await sql`SELECT user_type FROM users WHERE id = ${userId}`;
    if (!users[0] || users[0].user_type !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const { postId } = req.body;
    if (!postId) return res.status(400).json({ error: 'Post ID is required' });

    // Delete likes first
    await sql`DELETE FROM post_likes WHERE post_id = ${postId}`;
    await sql`DELETE FROM posts WHERE id = ${postId}`;

    return res.status(200).json({ message: 'Post deleted successfully' });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token or server error' });
  }
}
