import { sql, deleteUserCascade } from './_lib/db.js';
import { requireAdmin } from './_lib/auth.js';
import { awardPoints, POINT_ACTIONS } from './_lib/gamification.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = await requireAdmin(req, res);
  if (!userId) return; // requireAdmin a déjà envoyé la réponse d'erreur

  try {
    // ----- GET: Fetch Dashboard Data -----
    if (req.method === 'GET') {
      const { rows: users } = await sql`SELECT id, email, first_name, last_name, user_type, account_tier, company_name, siret, proof_url, is_verified, created_at FROM users ORDER BY created_at DESC`;

      const stats = {
        totalUsers: users.length,
        totalPros: users.filter(u => u.user_type === 'enterprise' || u.user_type === 'pro').length,
        pendingPros: users.filter(u => (u.user_type === 'enterprise' || u.user_type === 'pro') && !u.is_verified).length
      };

      const { rows: referrals } = await sql`
        SELECT u.id, u.first_name, u.last_name, u.referral_code, COUNT(f.id) as count
        FROM users u
        LEFT JOIN users f ON f.referred_by_id = u.id
        WHERE u.referral_code IS NOT NULL
        GROUP BY u.id, u.first_name, u.last_name, u.referral_code
        HAVING COUNT(f.id) > 0
        ORDER BY count DESC
      `;

      return res.status(200).json({ users, stats, referrals });
    }

    // ----- POST: Perform Admin Action -----
    if (req.method === 'POST') {
      const { action, targetUserId } = req.body;
      if (!action || !targetUserId) return res.status(400).json({ error: 'Action and targetUserId required' });

      if (action === 'verify') {
        await sql`UPDATE users SET is_verified = TRUE WHERE id = ${targetUserId}`;
        return res.status(200).json({ message: 'User verified successfully' });
      }

      if (action === 'grant_pro') {
        // Récompense en XP le parrain si c'est la première conversion payante du filleul
        const { rows: beforeRows } = await sql`SELECT account_tier, referred_by_id FROM users WHERE id = ${targetUserId}`;
        const wasFree = !beforeRows[0] || !beforeRows[0].account_tier || beforeRows[0].account_tier === 'free';

        await sql`UPDATE users SET account_tier = 'pro', user_type = 'pro', is_verified = TRUE WHERE id = ${targetUserId}`;

        if (wasFree && beforeRows[0]?.referred_by_id) {
          await awardPoints(beforeRows[0].referred_by_id, POINT_ACTIONS.REFERRAL_CONVERTED);
        }

        return res.status(200).json({ message: 'User granted Pro access successfully' });
      }

      if (action === 'delete') {
        if (parseInt(targetUserId) === userId) return res.status(400).json({ error: 'Cannot delete yourself' });
        // Nettoie toutes les données liées avant de supprimer l'utilisateur
        // (posts, likes, commentaires, messages, follows, avis...) pour éviter
        // une erreur de contrainte de clé étrangère.
        await deleteUserCascade(targetUserId);
        return res.status(200).json({ message: 'User deleted successfully' });
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
