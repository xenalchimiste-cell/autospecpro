import { createPool, sql } from '@vercel/postgres';

// On exporte notre wrapper sql pour maintenir la compatibilité avec le reste du code
export { sql };

export async function initDb() {
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
        company_name VARCHAR(255),
        siret VARCHAR(14),
        proof_url TEXT,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Add new columns if they don't exist yet
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS siret VARCHAR(14)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS proof_url TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`;
    
    console.log('Database initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

export default sql;
