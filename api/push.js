import webpush from 'web-push';
import { sql } from './_lib/db.js';
import jwt from 'jsonwebtoken';

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
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action } = req.query;

  try {
    if (action === 'subscribe') return await handleSubscribe(req, res);
    if (action === 'send') return await handleSend(req, res);

    return res.status(404).json({ error: 'Action not found' });
  } catch (error) {
    console.error(`Push Action [${action}] Error:`, error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

async function handleSubscribe(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing token' });

  const token = authHeader.split(' ')[1];
  let userId;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  // Ensure table has the correct schema (using ALTER just in case)
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      subscription JSONB NOT NULL,
      endpoint TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  // Migration: ensure endpoint column exists if table was created earlier without it
  try {
    await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS endpoint TEXT UNIQUE`;
  } catch (e) {
    // Column might already exist or table doesn't exist yet
  }

  try {
    const endpoint = subscription.endpoint;
    await sql`
      INSERT INTO push_subscriptions (user_id, subscription, endpoint)
      VALUES (${userId}, ${JSON.stringify(subscription)}, ${endpoint})
      ON CONFLICT (endpoint) DO UPDATE SET 
        user_id = ${userId}, 
        subscription = ${JSON.stringify(subscription)}
    `;
    return res.status(200).json({ message: 'Subscription saved successfully' });
  } catch (err) {
    console.error('DB Insert Error:', err);
    return res.status(500).json({ error: 'Database error', details: err.message });
  }
}

async function handleSend(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'VAPID_PRIVATE_KEY non configurée sur Vercel. Ajoutez-la dans Settings > Environment Variables.' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing token' });

  const token = authHeader.split(' ')[1];
  let userId;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { rows: users } = await sql`SELECT user_type FROM users WHERE id = ${userId}`;
  if (users.length === 0 || users[0].user_type !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  const { title, message, url } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message required' });

  // Create table if not exists before querying
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      subscription JSONB NOT NULL,
      endpoint TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const { rows: subs } = await sql`SELECT subscription FROM push_subscriptions`;
  if (subs.length === 0) return res.status(200).json({ message: 'Aucun utilisateur abonné aux notifications pour le moment.' });

  const payload = JSON.stringify({ title, body: message, url: url || '/' });
  let successCount = 0, failCount = 0;

  await Promise.all(subs.map(async (row) => {
    try {
      await webpush.sendNotification(row.subscription, payload);
      successCount++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await sql`DELETE FROM push_subscriptions WHERE subscription->>'endpoint' = ${row.subscription.endpoint}`;
      }
      failCount++;
    }
  }));

  return res.status(200).json({ message: 'Notifications envoyées', success: successCount, failed: failCount });
}
