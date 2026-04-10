import { initDb } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    await initDb();
    res.status(200).json({ message: 'Database initialized successfully! All tables and columns are ready.' });
  } catch (error) {
    console.error('Init error:', error);
    res.status(500).json({ error: error.message });
  }
}
