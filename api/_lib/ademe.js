import { sql } from './db.js';
import { marqueCanonique, canonique, scoreModele } from './texte.js';

// ── BASE ADEME ──
// Données officielles françaises d'homologation (consommation, CO2, puissance,
// carburant), publiées sous licence ouverte sur data.gouv.fr. Ce sont
// précisément les chiffres où une erreur se voit — et ceux que la fiche
// annonce comme « données d'homologation constructeur ».
//
// Le fichier n'est pas interrogé à chaud : il est importé une fois dans
// Postgres par scripts/import-ademe.mjs. Ici, on ne fait que chercher.

let tablePrete = false;
export async function preparerTable() {
  if (tablePrete) return;
  await sql`
    CREATE TABLE IF NOT EXISTS ademe_vehicules (
      id SERIAL PRIMARY KEY,
      marque_cle VARCHAR(60) NOT NULL,
      modele_cle VARCHAR(160) NOT NULL,
      marque TEXT NOT NULL,
      modele TEXT NOT NULL,
      annee INTEGER,
      carburant TEXT,
      puissance_ch INTEGER,
      conso_mixte NUMERIC(5,2),
      conso_urbaine NUMERIC(5,2),
      conso_extra NUMERIC(5,2),
      co2 INTEGER,
      norme VARCHAR(12),
      source TEXT,
      importe_le TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS ademe_marque_idx ON ademe_vehicules (marque_cle)`;
  await sql`CREATE INDEX IF NOT EXISTS ademe_annee_idx ON ademe_vehicules (marque_cle, annee)`;
  tablePrete = true;
}

// La marque d'une requête est le premier mot reconnu ; le reste est le modèle.
// L'année, si elle est écrite, resserre la recherche.
function decouper(requete) {
  const mots = canonique(requete).split(' ').filter(Boolean);
  if (!mots.length) return null;
  const annee = mots.map(Number).find(n => n >= 1990 && n <= 2035) || null;
  const reste = mots.filter(m => String(Number(m)) !== m || Number(m) < 1990 || Number(m) > 2035);
  return { marque: marqueCanonique(reste[0] || ''), modele: reste.slice(1).join(' '), annee };
}

// Renvoie la meilleure correspondance, ou null. Exigeant à dessein : une
// mauvaise correspondance serait pire que pas de correspondance du tout,
// puisqu'elle serait présentée au modèle comme une donnée certifiée.
const SCORE_MINIMUM = 0.5;

export async function chercherAdeme(requete) {
  const d = decouper(requete);
  if (!d || !d.marque || !d.modele) return null;

  try {
    await preparerTable();
    const { rows } = d.annee
      ? await sql`SELECT * FROM ademe_vehicules WHERE marque_cle = ${d.marque}
                    AND (annee = ${d.annee} OR annee IS NULL) LIMIT 400`
      : await sql`SELECT * FROM ademe_vehicules WHERE marque_cle = ${d.marque} LIMIT 400`;
    if (!rows.length) return null;

    let meilleur = null, meilleurScore = 0;
    for (const r of rows) {
      const s = scoreModele(d.modele, r.modele);
      // À score égal, l'année la plus proche l'emporte.
      const bonus = d.annee && r.annee ? -Math.abs(r.annee - d.annee) / 1000 : 0;
      if (s + bonus > meilleurScore) { meilleurScore = s + bonus; meilleur = r; }
    }
    if (!meilleur || meilleurScore < SCORE_MINIMUM) return null;
    return { ...meilleur, score: Math.round(meilleurScore * 100) / 100 };
  } catch (err) {
    // Une base absente ou vide ne doit jamais empêcher de produire une fiche.
    console.warn('[ademe] recherche impossible :', err.message);
    return null;
  }
}

// Mise en forme pour le prompt : uniquement les champs réellement présents.
export function lignesCertifiees(r) {
  if (!r) return [];
  const l = [];
  const nb = (v) => (v === null || v === undefined ? null : Number(v));
  if (nb(r.puissance_ch)) l.push(`Puissance homologuée : ${r.puissance_ch} ch.`);
  if (nb(r.conso_mixte)) l.push(`Consommation mixte homologuée : ${r.conso_mixte} L/100 km${r.norme ? ` (${r.norme})` : ''}.`);
  if (nb(r.conso_urbaine)) l.push(`Consommation urbaine : ${r.conso_urbaine} L/100 km.`);
  if (nb(r.conso_extra)) l.push(`Consommation extra-urbaine : ${r.conso_extra} L/100 km.`);
  if (nb(r.co2)) l.push(`Émissions de CO2 : ${r.co2} g/km${r.norme ? ` (${r.norme})` : ''}.`);
  if (r.carburant) l.push(`Carburant homologué : ${r.carburant}.`);
  if (!l.length) return [];
  l.push(`Ces valeurs viennent de la base ADEME des véhicules commercialisés en France (${r.marque} ${r.modele}${r.annee ? `, ${r.annee}` : ''}). Elles sont OFFICIELLES : reprends-les telles quelles, ne les recalcule pas et ne les arrondis pas.`);
  return l;
}
