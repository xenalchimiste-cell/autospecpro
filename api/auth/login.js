import { sql } from '../_lib/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // 1. Find user
    const { rows } = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];

    // Promotion Admin forcée pour le propriétaire
    if (user.email.toLowerCase() === 'andreasgiacomello23@gmail.com' && user.user_type !== 'admin') {
      await sql`UPDATE users SET user_type = 'admin' WHERE id = ${user.id}`;
      user.user_type = 'admin';
    }

    // 2. Check password (if not a oauth user with null password)
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Please use Google Login for this account' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // 3. Generate JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // 4. Return user info (omit password)
    delete user.password_hash;
    
    res.status(200).json({
      message: 'Login successful',
      token,
      user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
}
