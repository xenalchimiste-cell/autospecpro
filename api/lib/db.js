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
        user_type VARCHAR(20) DEFAULT 'individual', -- 'individual' or 'enterprise'
        referral_code VARCHAR(50) UNIQUE,
        referred_by_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('Database initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

export default sql;
