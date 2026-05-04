import webpush from 'web-push';
import { sql } from '../_lib/db.js';
import jwt from 'jsonwebtoken';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BENk7CYgAuJCfCv3-H0EJNQEs3VfyYVS7TcEe1ZfZZPxiXlBEOnpIN-d4yYOIRI62Hgn8brRg_ZmVUMODDqiTJ0";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY; // "k2DEg8B95H94A154R51BlgVdtiJ3R_ki48iTkixk4GI"
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:contact@autospec.pro',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (!VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID_PRIVATE_KEY non configurée sur Vercel' });
  }

  // Vérification de l'admin
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

  try {
    const { rows: users } = await sql`SELECT user_type FROM users WHERE id = ${userId}`;
    if (users.length === 0 || users[0].user_type !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }

    const { title, message, url } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Title and message required' });

    // Récupérer toutes les subscriptions
    const { rows: subs } = await sql`SELECT subscription FROM push_subscriptions`;
    
    if (subs.length === 0) {
      return res.status(200).json({ message: 'Aucun utilisateur abonné aux notifications.' });
    }

    const payload = JSON.stringify({
      title: title,
      body: message,
      url: url || '/'
    });

    let successCount = 0;
    let failCount = 0;

    await Promise.all(subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload);
        successCount++;
      } catch (err) {
        console.error('Erreur envoi notification:', err);
        if (err.statusCode === 404 || err.statusCode === 410) {
          // L'abonnement a expiré ou n'est plus valide
          await sql`DELETE FROM push_subscriptions WHERE subscription->>'endpoint' = ${row.subscription.endpoint}`;
        }
        failCount++;
      }
    }));

    return res.status(200).json({ 
      message: 'Notifications envoyées', 
      success: successCount, 
      failed: failCount 
    });

  } catch (error) {
    console.error('Error sending push notifications:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
