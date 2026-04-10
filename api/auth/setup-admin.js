import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  // Uniquement accessible en GET pour que l'utilisateur puisse le taper dans son navigateur
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { email, key } = req.query;

  // Sécurité minimale pour éviter que n'importe qui ne devienne admin
  const SECRET_KEY = "autospec_admin_2026"; 

  if (!email || key !== SECRET_KEY) {
    return res.status(403).json({ error: 'Accès refusé. Clé de configuration invalide.' });
  }

  try {
    // 1. Essayer une recherche insensible à la casse
    const result = await sql`
      UPDATE users 
      SET user_type = 'admin' 
      WHERE LOWER(email) = LOWER(${email})
      RETURNING id, email, user_type
    `;

    if (result.count === 0) {
      // Diagnostic : lister les emails existants pour aider l'utilisateur
      const { rows: allUsers } = await sql`SELECT email FROM users LIMIT 5`;
      const emailList = allUsers.map(u => u.email).join(', ');
      
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé.', 
        suggestion: `Vérifiez l'orthographe exacte. Emails en base : ${emailList || 'aucun utilisateur trouvé'}` 
      });
    }

    return res.status(200).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #2ecc71;">✅ Succès !</h1>
        <p>L'utilisateur <strong>${email}</strong> est maintenant <strong>Administrateur</strong>.</p>
        <p>Vous pouvez maintenant fermer cette page et vous reconnecter sur le site pour voir l'onglet Admin.</p>
        <p style="color: #e67e22; font-size: 12px; margin-top: 30px;">Note : Je supprimerai ce fichier de configuration temporaire par mesure de sécurité une fois que vous aurez fini.</p>
      </div>
    `);
  } catch (error) {
    console.error('Setup error:', error);
    return res.status(500).json({ error: 'Erreur lors de la promotion admin : ' + error.message });
  }
}
