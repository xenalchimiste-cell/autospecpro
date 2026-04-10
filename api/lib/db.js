import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export const sql = async (strings, ...values) => {
  const queryText = strings.reduce((acc, curr, i) => acc + curr + (i < values.length ? '$' + (i + 1) : ''), '');
  const { rows } = await pool.query(queryText, values);
  return { rows };
};

export async function initDb() {
  // Cette fonction peut être appelée pour s'assurer que les tables existent
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

    // Add new columns if they don't exist yet (for existing DBs)
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
