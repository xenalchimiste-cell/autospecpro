import Stripe from 'stripe';
import { sql, initDb } from './_lib/db.js';
import jwt from 'jsonwebtoken';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide' });
  }

  const { tier } = req.body;
  if (!['passionne', 'pro'].includes(tier)) {
    return res.status(400).json({ error: 'Offre invalide' });
  }

  try {
    // URL host dynamique
    const host = req.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const domain = `${protocol}://${host}`;

    await initDb();

    // Récupérer l'utilisateur
    const { rows } = await sql`SELECT email, stripe_customer_id FROM users WHERE id = ${decoded.userId}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const user = rows[0];

    // Définition des produits
    // IMPORTANT: Remplacez ces prix par vos ID de prix réels Stripe (ex: price_1234abcd)
    const priceIds = {
      passionne: process.env.STRIPE_PRICE_PASSIONNE || 'price_passionne_placeholder', // ex: price_1xxxxxx
      pro: process.env.STRIPE_PRICE_PRO || 'price_pro_placeholder' // ex: price_2yyyyyy
    };

    const sessionConfig = {
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceIds[tier],
          quantity: 1,
        },
      ],
      success_url: `${domain}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${domain}/?payment=cancelled`,
      customer_email: user.stripe_customer_id ? undefined : user.email,
      customer: user.stripe_customer_id || undefined,
      client_reference_id: decoded.userId.toString(),
      metadata: {
        userId: decoded.userId.toString(),
        tier: tier
      }
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Erreur Stripe Checkout:', error);
    res.status(500).json({ error: 'Erreur Stripe: ' + error.message });
  }
}
