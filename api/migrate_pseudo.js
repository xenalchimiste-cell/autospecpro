import { sql, initDb } from './_lib/db.js';

export default async function handler(req, res) {
  try {
    await initDb();
    const { rows: users } = await sql`SELECT id, first_name, last_name, pseudo FROM users WHERE pseudo IS NULL`;
    
    let migrated = [];
    for (const user of users) {
      let basePseudo = user.first_name ? user.first_name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'user';
      if (!basePseudo) basePseudo = 'user';
      const pseudo = `${basePseudo}_${user.id}`;
      
      await sql`UPDATE users SET pseudo = ${pseudo} WHERE id = ${user.id}`;
      migrated.push({ id: user.id, pseudo });
    }
    
    res.status(200).json({ success: true, count: users.length, migrated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
