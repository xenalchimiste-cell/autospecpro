import { sql } from '../lib/db.js';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'ID Token is required' });
  }

  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Google Client ID not configured on server' });
  }

  try {
    // 1. Verify Google token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, given_name, family_name, sub: googleId } = payload;

    // 2. Check if user exists
    let { rows } = await sql`SELECT * FROM users WHERE email = ${email}`;
    let user;

    if (rows.length === 0) {
      // Create new user (Social signup)
      const myReferralCode = Math.random().toString(36).substring(2, 9).toUpperCase();
      const { rows: newUser } = await sql`
        INSERT INTO users (email, first_name, last_name, user_type, referral_code)
        VALUES (${email}, ${family_name}, ${given_name}, 'individual', ${myReferralCode})
        RETURNING id, email, first_name, last_name, user_type, referral_code
      `;
      user = newUser[0];
    } else {
      user = rows[0];
    }

    // 3. Generate JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      message: 'Google login successful',
      token,
      user
    });
  } catch (error) {
    console.error('Google Auth error:', error);
    res.status(401).json({ error: 'Invalid Google token' });
  }
}
