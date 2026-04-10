import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        user_type VARCHAR(20) DEFAULT 'individual',
        referral_code VARCHAR(50) UNIQUE,
        referred_by_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    res.status(200).json({ message: 'Database initialized successfully! Table "users" is ready.' });
  } catch (error) {
    console.error('Init error:', error);
    res.status(500).json({ error: error.message });
  }
}
