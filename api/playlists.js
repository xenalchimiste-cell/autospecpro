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
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  await initDb();

  if (req.method === 'GET') {
    const { action } = req.query;
    if (action === 'comments') return await handleGetComments(req, res);
    return await handleGetPlaylists(req, res);
  } else if (req.method === 'POST') {
    const { action } = req.query;
    if (action === 'like') return await handleLikePlaylist(req, res);
    if (action === 'comment') return await handleAddComment(req, res);
    return await handleCreatePlaylist(req, res);
  } else if (req.method === 'DELETE') {
    return await handleDeletePlaylist(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGetPlaylists(req, res) {
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
    const { rows: playlists } = await sql`
      SELECT p.*, 
             u.user_type,
             u.user_rank,
             u.avatar_url as author_avatar_url,
             EXISTS(SELECT 1 FROM playlist_likes WHERE playlist_id = p.id AND user_id = ${userId}) as is_liked,
             (SELECT COUNT(*) FROM playlist_likes WHERE playlist_id = p.id) as likes_count,
             (SELECT COUNT(*) FROM playlist_comments WHERE playlist_id = p.id) as comments_count
      FROM playlists p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 50
    `;
    return res.status(200).json(playlists);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleCreatePlaylist(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const { title, theme, playlist_url, description } = req.body;
    if (!title || !theme || !playlist_url) return res.status(400).json({ error: 'Missing required fields' });

    // Get author name
    const { rows: users } = await sql`SELECT first_name, last_name FROM users WHERE id = ${userId}`;
    const authorName = users[0].first_name + ' ' + (users[0].last_name || '');

    const { rows: newPlaylist } = await sql`
      INSERT INTO playlists (user_id, author_name, title, theme, playlist_url, description)
      VALUES (${userId}, ${authorName}, ${title}, ${theme}, ${playlist_url}, ${description})
      RETURNING *
    `;

    // Send Notifications to all subscribers (non-blocking)
    if (VAPID_PRIVATE_KEY) {
      (async () => {
        try {
          const { rows: subs } = await sql`SELECT subscription FROM push_subscriptions`;
          const payload = JSON.stringify({
            title: 'Nouvelle Vibe ! 🎵',
            body: `${authorName} a partagé une nouvelle playlist : ${title}`,
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

    // Award XP for posting a playlist
    await awardPoints(userId, POINT_ACTIONS.POST);
    
    return res.status(201).json(newPlaylist[0]);
  } catch (err) {
    console.error("Playlist creation error:", err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}

async function handleLikePlaylist(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;
    const { playlistId } = req.body;

    const { rows: existing } = await sql`SELECT id FROM playlist_likes WHERE user_id = ${userId} AND playlist_id = ${playlistId}`;
    
    if (existing.length > 0) {
      await sql`DELETE FROM playlist_likes WHERE user_id = ${userId} AND playlist_id = ${playlistId}`;
      const { rows: playlist } = await sql`SELECT user_id FROM playlists WHERE id = ${playlistId}`;
      if (playlist[0]) await awardPoints(playlist[0].user_id, -POINT_ACTIONS.LIKE_RECEIVED);
      return res.status(200).json({ liked: false });
    } else {
      await sql`INSERT INTO playlist_likes (user_id, playlist_id) VALUES (${userId}, ${playlistId})`;
      const { rows: playlist } = await sql`SELECT user_id FROM playlists WHERE id = ${playlistId}`;
      if (playlist[0]) await awardPoints(playlist[0].user_id, POINT_ACTIONS.LIKE_RECEIVED);
      return res.status(200).json({ liked: true });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function handleDeletePlaylist(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const { rows: users } = await sql`SELECT user_type FROM users WHERE id = ${userId}`;
    if (!users[0] || users[0].user_type !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const { playlistId } = req.body;
    if (!playlistId) return res.status(400).json({ error: 'Playlist ID is required' });

    await sql`DELETE FROM playlist_likes WHERE playlist_id = ${playlistId}`;
    await sql`DELETE FROM playlist_comments WHERE playlist_id = ${playlistId}`;
    await sql`DELETE FROM playlists WHERE id = ${playlistId}`;

    return res.status(200).json({ message: 'Playlist deleted successfully' });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token or server error' });
  }
}

async function handleGetComments(req, res) {
  const { playlistId } = req.query;
  if (!playlistId) return res.status(400).json({ error: 'Playlist ID is required' });

  try {
    const { rows: comments } = await sql`
      SELECT c.id, c.author_name, c.content, c.created_at, c.user_id, u.user_type, u.user_rank, u.avatar_url as author_avatar_url
      FROM playlist_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.playlist_id = ${playlistId}
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

    const { playlistId, content } = req.body;
    if (!playlistId || !content) return res.status(400).json({ error: 'Playlist ID and content are required' });

    const { rows: users } = await sql`SELECT first_name, last_name FROM users WHERE id = ${userId}`;
    const authorName = users[0].first_name + ' ' + (users[0].last_name || '');

    const { rows: newComment } = await sql`
      INSERT INTO playlist_comments (playlist_id, user_id, author_name, content)
      VALUES (${playlistId}, ${userId}, ${authorName}, ${content})
      RETURNING *
    `;
    
    await awardPoints(userId, POINT_ACTIONS.COMMENT);

    return res.status(201).json(newComment[0]);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
