import dotenv from 'dotenv';
dotenv.config();

import { sql, initDb } from './api/_lib/db.js';

async function migrate() {
  await initDb();
  console.log('Database initialized');
  
  const { rows: users } = await sql`SELECT id, first_name, last_name, pseudo FROM users WHERE pseudo IS NULL`;
  console.log(`Found ${users.length} users needing pseudo.`);
  
  for (const user of users) {
    let basePseudo = user.first_name ? user.first_name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'user';
    if (!basePseudo) basePseudo = 'user';
    const pseudo = `${basePseudo}_${user.id}`;
    
    await sql`UPDATE users SET pseudo = ${pseudo} WHERE id = ${user.id}`;
    console.log(`User ${user.id} pseudo set to @${pseudo}`);
  }
  
  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch(console.error);
