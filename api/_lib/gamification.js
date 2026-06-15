import { sql } from './db.js';

export const RANKS = [
  { name: 'Novice', minPoints: 0 },
  { name: 'Amateur', minPoints: 50 },
  { name: 'Passionné', minPoints: 200 },
  { name: 'Expert', minPoints: 500 },
  { name: 'Légendaire', minPoints: 1000 },
];

export const POINT_ACTIONS = {
  POST: 10,
  COMMENT: 5,
  LIKE_RECEIVED: 2,
  FOLLOW_RECEIVED: 3,
};

export const REWARD_CATALOG = {
  themes: [
    { id: 'default', name: 'Classique', description: 'Le thème par défaut d\'AutoSpec', minPoints: 0, icon: '🌑' },
    { id: 'midnight', name: 'Minuit', description: 'Bleu profond et accents argentés', minPoints: 50, icon: '🌙' },
    { id: 'racing', name: 'Piste', description: 'Rouge course et carbone', minPoints: 200, icon: '🏁' },
    { id: 'gold', name: 'Or Prestige', description: 'Luxe doré réservé aux experts', minPoints: 500, icon: '✨' },
    { id: 'neon', name: 'Néon', description: 'Cyberpunk violet et cyan', minPoints: 1000, icon: '💜' },
  ],
  banners: [
    { id: 'none', name: 'Aucune', description: 'Pas de bannière', minPoints: 0, icon: '⬜' },
    { id: 'speed', name: 'Vitesse', description: 'Lignes de vitesse dynamiques', minPoints: 50, icon: '💨' },
    { id: 'sunset', name: 'Coucher de soleil', description: 'Dégradé orange et violet', minPoints: 200, icon: '🌅' },
    { id: 'carbon', name: 'Carbone', description: 'Texture fibre de carbone', minPoints: 500, icon: '🔲' },
    { id: 'aurora', name: 'Aurore', description: 'Aurore boréale animée', minPoints: 1000, icon: '🌌' },
  ],
  frames: [
    { id: 'none', name: 'Aucun', description: 'Pas de cadre spécial', minPoints: 0, icon: '⭕' },
    { id: 'bronze', name: 'Bronze', description: 'Cadre bronze élégant', minPoints: 50, icon: '🥉' },
    { id: 'silver', name: 'Argent', description: 'Cadre argenté brillant', minPoints: 200, icon: '🥈' },
    { id: 'gold', name: 'Or', description: 'Cadre doré animé', minPoints: 500, icon: '🥇' },
    { id: 'diamond', name: 'Diamant', description: 'Cadre diamant scintillant', minPoints: 1000, icon: '💎' },
  ],
};

export function calculateRank(points) {
  let rank = RANKS[0].name;
  for (const r of RANKS) {
    if (points >= r.minPoints) rank = r.name;
  }
  return rank;
}

export function getProgress(points) {
  const rank = calculateRank(points);
  const currentRankIdx = RANKS.findIndex(r => r.name === rank);
  const nextRank = RANKS[currentRankIdx + 1] || null;
  const currentMin = RANKS[currentRankIdx].minPoints;
  const nextMin = nextRank ? nextRank.minPoints : currentMin + 500;
  const progressInTier = points - currentMin;
  const tierRange = nextMin - currentMin;
  const percent = nextRank ? Math.min(100, (progressInTier / tierRange) * 100) : 100;

  return {
    rank,
    points,
    nextRank: nextRank?.name || null,
    nextThreshold: nextRank?.minPoints || null,
    percent,
    pointsToNext: nextRank ? nextMin - points : 0,
  };
}

export function isItemUnlocked(points, itemId, category) {
  const item = REWARD_CATALOG[category]?.find(i => i.id === itemId);
  if (!item) return false;
  return points >= item.minPoints;
}

export function getUnlockedItems(points) {
  const result = {};
  for (const [category, items] of Object.entries(REWARD_CATALOG)) {
    result[category] = items.map(item => ({
      ...item,
      unlocked: points >= item.minPoints,
    }));
  }
  return result;
}

export function validateCustomization(points, { profileTheme, profileBanner, avatarFrame }) {
  const errors = [];
  if (profileTheme && !isItemUnlocked(points, profileTheme, 'themes')) {
    errors.push(`Thème "${profileTheme}" non débloqué`);
  }
  if (profileBanner && !isItemUnlocked(points, profileBanner, 'banners')) {
    errors.push(`Bannière "${profileBanner}" non débloquée`);
  }
  if (avatarFrame && !isItemUnlocked(points, avatarFrame, 'frames')) {
    errors.push(`Cadre "${avatarFrame}" non débloqué`);
  }
  return errors;
}

export async function awardPoints(userId, amount) {
  const { rows } = await sql`
    UPDATE users SET points = GREATEST(0, points + ${amount})
    WHERE id = ${userId}
    RETURNING id, points, user_rank
  `;
  if (!rows[0]) return null;

  const newRank = calculateRank(rows[0].points);
  if (rows[0].user_rank !== newRank) {
    const { rows: updated } = await sql`
      UPDATE users SET user_rank = ${newRank} WHERE id = ${userId}
      RETURNING points, user_rank
    `;
    return updated[0];
  }
  return { points: rows[0].points, user_rank: rows[0].user_rank };
}

export async function syncUserRank(userId) {
  const { rows } = await sql`SELECT points, user_rank FROM users WHERE id = ${userId}`;
  if (!rows[0]) return null;
  const newRank = calculateRank(rows[0].points);
  if (rows[0].user_rank !== newRank) {
    await sql`UPDATE users SET user_rank = ${newRank} WHERE id = ${userId}`;
    return newRank;
  }
  return rows[0].user_rank;
}

export function getGamificationPayload(user) {
  const points = user.points || 0;
  return {
    progress: getProgress(points),
    catalog: REWARD_CATALOG,
    unlocked: getUnlockedItems(points),
    equipped: {
      theme: user.profile_theme || 'default',
      banner: user.profile_banner || 'none',
      frame: user.avatar_frame || 'none',
    },
    pointActions: POINT_ACTIONS,
  };
}
