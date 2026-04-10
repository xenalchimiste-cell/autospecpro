import { OAuth2Client } from 'google-auth-library';
import { sql } from '../_lib/db.js';
import jwt from 'jsonwebtoken';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'ID Token required' });

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, given_name, family_name, picture } = payload;

    // 1. Check if user exists
    const { rows: existingUsers } = await sql`SELECT * FROM users WHERE email = ${email}`;
    let user;

    if (existingUsers.length > 0) {
      user = existingUsers[0];
    } else {
      // 2. Create new user (Social registration)
      const referralCode = Math.random().toString(36).substring(2, 9).toUpperCase();
      const { rows: newUser } = await sql`
        INSERT INTO users (email, first_name, last_name, user_type, referral_code)
        VALUES (${email}, ${given_name}, ${family_name}, 'individual', ${referralCode})
        RETURNING *
      `;
      user = newUser[0];
    }

    // Promotion Admin forcée pour le propriétaire
    if (user.email.toLowerCase() === 'andreasgiacomello23@gmail.com' && user.user_type !== 'admin') {
      await sql`UPDATE users SET user_type = 'admin' WHERE id = ${user.id}`;
      user.user_type = 'admin';
    }

    // 3. Generate JWT for our app
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      message: 'Login successful',
      token,
      user
    });
  } catch (error) {
    console.error('Google verify error:', error);
    res.status(401).json({ error: 'Invalid Google token' });
  }
}
