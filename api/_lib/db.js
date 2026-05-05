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
  let queryText = '';
  for (let i = 0; i < strings.length; i++) {
    queryText += strings[i];
    if (i < values.length) {
      queryText += '$' + (i + 1);
    }
  }
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
      
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pseudo VARCHAR(50) UNIQUE`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS siret VARCHAR(14)`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS proof_url TEXT`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_tier VARCHAR(20) DEFAULT 'free'`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram VARCHAR(100)`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(100)`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS garage TEXT`);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS reviews (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          author_name VARCHAR(255) NOT NULL,
          rating INTEGER CHECK (rating >= 1 AND rating <= 5),
          comment TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS posts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          author_name VARCHAR(255) NOT NULL,
          image_url TEXT NOT NULL,
          description TEXT,
          likes_count INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS post_likes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          post_id INTEGER REFERENCES posts(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, post_id)
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS post_comments (
          id SERIAL PRIMARY KEY,
          post_id INTEGER REFERENCES posts(id),
          user_id INTEGER REFERENCES users(id),
          author_name VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_rank VARCHAR(50) DEFAULT 'Novice'`);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          sender_id INTEGER REFERENCES users(id),
          receiver_id INTEGER REFERENCES users(id),
          content TEXT NOT NULL,
          is_read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS follows (
          id SERIAL PRIMARY KEY,
          follower_id INTEGER REFERENCES users(id),
          following_id INTEGER REFERENCES users(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(follower_id, following_id)
        );
      `);
      
      console.log('Database connected and initialized with pg driver');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database connection error:', error);
  }
}

export default sql;
