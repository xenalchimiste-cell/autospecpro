import Stripe from 'stripe';
import { sql } from './_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Vercel config to parse raw body (required for Stripe signature verification)
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper stream to buffer
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const sig = req.headers['stripe-signature'];
  const buf = await buffer(req);
  
  let event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const customerId = session.customer;
        const tier = session.metadata.tier;

        if (userId && tier) {
          await sql`UPDATE users SET account_tier = ${tier}, stripe_customer_id = ${customerId} WHERE id = ${userId}`;
          console.log(`[Stripe Webhook] User ${userId} upgraded to ${tier}`);
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        await sql`UPDATE users SET account_tier = 'free' WHERE stripe_customer_id = ${customerId}`;
        console.log(`[Stripe Webhook] Customer ${customerId} subscription cancelled, reverted to free.`);
        break;
      }
      // Vous pouvez gérer ici d'autres événements (ex: payment_failed)
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Erreur interne lors du traitement du Webhook' });
  }
}
