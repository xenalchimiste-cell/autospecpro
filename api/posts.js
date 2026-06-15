import { sql, initDb } from './_lib/db.js';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { awardPoints, POINT_ACTIONS } from './_lib/gamification.js';

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
    const { action } = req.query;
    if (action === 'comments') return await handleGetComments(req, res);
    return await handleGetPosts(req, res);
  } else if (req.method === 'POST') {
    const { action } = req.query;
    if (action === 'like') return await handleLikePost(req, res);
    if (action === 'comment') return await handleAddComment(req, res);
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
    // Fetch posts with likes, comments counts and author type
    const { rows: posts } = await sql`
      SELECT p.*, 
             CONCAT_WS(' ', u.first_name, u.last_name) as author_name,
             u.user_type,
             u.avatar_url as author_avatar_url,
             EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = ${userId}) as is_liked,
             (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes_count,
             (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comments_count
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
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

    // Send Notifications to all subscribers (non-blocking)
    if (VAPID_PRIVATE_KEY) {
      (async () => {
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
      })();
    }

    // Award XP for posting
    await awardPoints(userId, POINT_ACTIONS.POST);
    
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
      // Decrement points of post author
      const { rows: post } = await sql`SELECT user_id FROM posts WHERE id = ${postId}`;
      if (post[0]) await awardPoints(post[0].user_id, -POINT_ACTIONS.LIKE_RECEIVED);
      return res.status(200).json({ liked: false });
    } else {
      await sql`INSERT INTO post_likes (user_id, post_id) VALUES (${userId}, ${postId})`;
      // Increment points of post author
      const { rows: post } = await sql`SELECT user_id FROM posts WHERE id = ${postId}`;
      if (post[0]) await awardPoints(post[0].user_id, POINT_ACTIONS.LIKE_RECEIVED);
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

    // Delete related data first
    await sql`DELETE FROM post_likes WHERE post_id = ${postId}`;
    await sql`DELETE FROM post_comments WHERE post_id = ${postId}`;
    await sql`DELETE FROM posts WHERE id = ${postId}`;

    return res.status(200).json({ message: 'Post deleted successfully' });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token or server error' });
  }
}

async function handleGetComments(req, res) {
  const { postId } = req.query;
  if (!postId) return res.status(400).json({ error: 'Post ID is required' });

  try {
    const { rows: comments } = await sql`
      SELECT c.id, c.author_name, c.content, c.created_at, c.user_id, u.user_type, u.user_rank, u.avatar_url as author_avatar_url
      FROM post_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ${postId}
      ORDER BY c.created_at ASC
    `;
    return res.status(200).json(comments);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleAddComment(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const { postId, content } = req.body;
    if (!postId || !content) return res.status(400).json({ error: 'Post ID and content are required' });

    // Get author name
    const { rows: users } = await sql`SELECT first_name, last_name FROM users WHERE id = ${userId}`;
    const authorName = users[0].first_name + ' ' + (users[0].last_name || '');

    const { rows: newComment } = await sql`
      INSERT INTO post_comments (post_id, user_id, author_name, content)
      VALUES (${postId}, ${userId}, ${authorName}, ${content})
      RETURNING *
    `;
    // Award XP for commenting
    await awardPoints(userId, POINT_ACTIONS.COMMENT);

    return res.status(201).json(newComment[0]);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
