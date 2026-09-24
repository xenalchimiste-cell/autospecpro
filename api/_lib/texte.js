// Normalisation partagée par l'import ADEME et la recherche de fiche.
// Les deux DOIVENT produire la même forme, sinon rien ne se retrouve :
// « Citroën C4 » importé et « citroen c4 » cherché doivent donner la même clé.

export function canonique(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Les marques s'écrivent de vingt façons dans les fichiers publics :
// « MERCEDES-BENZ », « MERCEDES BENZ », « MERCEDES ». On les ramène à une forme.
const ALIAS_MARQUES = {
  'mercedes benz': 'mercedes', 'mercedes amg': 'mercedes', 'amg': 'mercedes',
  'vw': 'volkswagen', 'volkswagen vw': 'volkswagen',
  'bmw i': 'bmw', 'bmw m': 'bmw',
  'ds automobiles': 'ds', 'citroen ds': 'ds',
  'land rover': 'landrover', 'range rover': 'landrover',
  'alfa romeo': 'alfaromeo',
  'rolls royce': 'rollsroyce',
  'aston martin': 'astonmartin',
  'mini bmw': 'mini', 'bmw mini': 'mini',
  'renault alpine': 'alpine',
  'vauxhall': 'opel',
};

export function marqueCanonique(str) {
  const c = canonique(str);
  return ALIAS_MARQUES[c] || c.replace(/\s+/g, '');
}

// Un modèle se compare par ses mots significatifs. « SERIE 3 320D » et
// « 320d » doivent pouvoir se rapprocher, d'où la comparaison par jetons
// plutôt que par égalité de chaîne.
const MOTS_VIDES = new Set(['serie', 'series', 'classe', 'class', 'the', 'new', 'nouvelle', 'nouveau']);

export function jetonsModele(str) {
  return canonique(str).split(' ').filter(m => m && !MOTS_VIDES.has(m));
}

// Score de rapprochement entre deux modèles, de 0 à 1. Exigeant par
// construction : mieux vaut ne rien trouver qu'associer la mauvaise voiture.
export function scoreModele(cherche, candidat) {
  const a = jetonsModele(cherche), b = jetonsModele(candidat);
  if (!a.length || !b.length) return 0;
  const communs = a.filter(m => b.includes(m));
  if (!communs.length) return 0;
  // Un seul mot commun ne suffit que s'il est distinctif (pas un chiffre seul).
  if (communs.length === 1 && /^\d+$/.test(communs[0]) && a.length > 1) return 0;
  return communs.length / Math.max(a.length, b.length);
}
