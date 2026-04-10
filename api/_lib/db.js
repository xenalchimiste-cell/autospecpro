import pg from 'pg';
const { Pool } = pg;

// On utilise le driver standard PG pour une compatibilité maximale
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false // Requis pour Neon/Vercel Postgres
  }
});

export const sql = async (strings, ...values) => {
  // Adaptation du format template literal au format pg ($1, $2...)
  const queryText = strings.reduce((acc, curr, i) => acc + curr + (i < values.length ? '$' + (i + 1) : ''), '');
  const { rows } = await pool.query(queryText, values);
  return { rows };
};

export async function initDb() {
  try {
    const client = await pool.connect();
    try {
      await client.query(`
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
      `);
      
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS siret VARCHAR(14)`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS proof_url TEXT`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`);
      
      console.log('Database connected and initialized with pg driver');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database connection error:', error);
  }
}

export default sql;
