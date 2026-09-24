#!/usr/bin/env node
// ── IMPORT DE LA BASE ADEME ──
//
//   node scripts/import-ademe.mjs <url-ou-fichier.csv> [--remplacer]
//
// Le jeu de données « Émissions de CO2 et de polluants des véhicules
// commercialisés en France » est publié sur data.gouv.fr par l'ADEME, sous
// licence ouverte. Récupérez le lien du fichier CSV de l'année voulue et
// passez-le en argument ; relancez le script par année.
//
// Les en-têtes de ce fichier CHANGENT d'une année à l'autre (« puiss_max »,
// « Puissance maximale (kW) », « puissance_maximale »…). Le script ne suppose
// donc aucun nom fixe : il rapproche chaque colonne d'un rôle et IMPRIME sa
// lecture avant d'écrire quoi que ce soit. Si une colonne essentielle n'est
// pas reconnue, il s'arrête plutôt que d'importer des colonnes vides.

import { readFileSync } from 'node:fs';
import { marqueCanonique, canonique } from '../api/_lib/texte.js';

const arg = process.argv[2];
const REMPLACER = process.argv.includes('--remplacer');
if (!arg) {
  console.error('Usage : node scripts/import-ademe.mjs <url-ou-fichier.csv> [--remplacer]');
  process.exit(1);
}
if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL manquante. Récupérez-la dans Vercel → Storage, puis :');
  console.error('  POSTGRES_URL="postgres://…" node scripts/import-ademe.mjs <url>');
  process.exit(1);
}

// Rôles recherchés, par ordre de préférence des indices trouvés dans l'en-tête.
const ROLES = {
  marque:       [/^marque$/, /marque/, /^lib_mrq/, /brand|make/],
  // dscom = désignation commerciale, le nom du modèle dans les fichiers ADEME.
  modele:       [/^dscom$/, /^modele/, /^mod[eè]le/, /designation|denomination/, /modele.*dossier|dossier/, /^model$/],
  // cod_cbr = code carburant (ES, GO, EH…), traduit plus bas.
  carburant:    [/^cod_cbr$/, /^(type_?)?carburant/, /energ|fuel/],
  puissance_kw: [/puiss.*max.*kw|puiss_max$/, /^puiss/, /power.*kw/],
  puissance_ch: [/puiss.*ch\b|puissance.*chevaux/],
  conso_mixte:  [/conso.*mixte|conso_mixte|^conso_mixte/, /mixte.*l.*100/],
  conso_urb:    [/conso.*urb(?!.*extra)|conso_urb/],
  conso_exurb:  [/conso.*ex.*urb|conso_exurb/],
  co2:          [/^co2$/, /co2.*g.*km/, /co2/],
  annee:        [/^annee$/, /^year$/, /millesime/],
  norme:        [/norme|protocole|wltp|nedc/],
};

function lireEntetes(entetes) {
  const pris = new Set();
  const plan = {};
  for (const [role, motifs] of Object.entries(ROLES)) {
    for (const motif of motifs) {
      const i = entetes.findIndex((h, idx) => !pris.has(idx) && motif.test(canonique(h).replace(/\s+/g, '_')));
      if (i !== -1) { plan[role] = i; pris.add(i); break; }
    }
  }
  return plan;
}

// Analyseur CSV tolérant : séparateur deviné, guillemets gérés.
function decouperLigne(ligne, sep) {
  const cells = []; let cur = '', dans = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') { if (dans && ligne[i + 1] === '"') { cur += '"'; i++; } else dans = !dans; }
    else if (c === sep && !dans) { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  return cells.map(s => s.trim());
}

// Les fichiers ADEME codent le carburant : ES pour essence, GO pour gazole…
// Affiché tel quel, « GO » ne dirait rien à personne.
const CARBURANTS = {
  es: 'Essence', go: 'Diesel', ee: 'Hybride rechargeable essence',
  eh: 'Hybride essence', gh: 'Hybride diesel', el: 'Électrique',
  gn: 'Gaz naturel', gp: 'GPL', ff: 'Superéthanol E85', eg: 'Essence-GPL',
  em: 'Essence-gaz naturel', pe: 'Hybride rechargeable essence', ne: 'Non renseigné',
};
const libelleCarburant = (v) => {
  if (!v) return null;
  const c = canonique(v);
  return CARBURANTS[c] || (c.length <= 3 ? null : v);
};

const nombre = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s| /g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

async function charger(source) {
  if (/^https?:\/\//.test(source)) {
    console.log('Téléchargement…');
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${source}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return decoder(buf);
  }
  return decoder(readFileSync(source));
}

// Les fichiers ADEME sont souvent en Windows-1252 : lus en UTF-8, les accents
// deviennent des losanges et « Citroën » ne se retrouve plus.
function decoder(buf) {
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('�')) return utf8;
  console.log('Accents illisibles en UTF-8 → relecture en Windows-1252.');
  return new TextDecoder('windows-1252').decode(buf);
}

const texte = await charger(arg);
const lignes = texte.split(/\r?\n/).filter(l => l.trim());
if (lignes.length < 2) { console.error('Fichier vide ou illisible.'); process.exit(1); }

const sep = [';', ',', '\t'].sort((a, b) =>
  decouperLigne(lignes[0], b).length - decouperLigne(lignes[0], a).length)[0];
const entetes = decouperLigne(lignes[0], sep);
const plan = lireEntetes(entetes);

console.log(`\n${lignes.length - 1} lignes, séparateur « ${sep} », ${entetes.length} colonnes.`);
console.log('\nLecture des colonnes :');
for (const role of Object.keys(ROLES)) {
  const i = plan[role];
  console.log(`  ${role.padEnd(13)} ${i === undefined ? '— non trouvée' : `« ${entetes[i]} »`}`);
}

const manquantes = ['marque', 'modele'].filter(r => plan[r] === undefined);
if (manquantes.length) {
  console.error(`\nColonnes essentielles introuvables : ${manquantes.join(', ')}.`);
  console.error('En-têtes du fichier :\n  ' + entetes.join('\n  '));
  console.error('\nAjoutez le motif correspondant dans ROLES, puis relancez.');
  process.exit(1);
}
if (plan.conso_mixte === undefined && plan.co2 === undefined) {
  console.error('\nNi consommation ni CO2 : ce fichier n\'apporterait rien. Arrêt.');
  process.exit(1);
}

const anneeDefaut = nombre((arg.match(/(20\d{2})/) || [])[1]);
const vus = new Set();
const lots = [];
let ignorees = 0;

for (let i = 1; i < lignes.length; i++) {
  const c = decouperLigne(lignes[i], sep);
  const marque = c[plan.marque], modele = c[plan.modele];
  if (!marque || !modele) { ignorees++; continue; }

  const kw = plan.puissance_kw !== undefined ? nombre(c[plan.puissance_kw]) : null;
  const ch = plan.puissance_ch !== undefined ? nombre(c[plan.puissance_ch])
           : (kw ? Math.round(kw / 0.7355) : null);
  const annee = plan.annee !== undefined ? nombre(c[plan.annee]) : anneeDefaut;

  // Une même voiture apparaît des dizaines de fois (finitions, boîtes).
  // On ne garde qu'une ligne par marque+modèle+année+carburant.
  const cle = [marqueCanonique(marque), canonique(modele), annee, canonique(c[plan.carburant] || '')].join('|');
  if (vus.has(cle)) continue;
  vus.add(cle);

  lots.push({
    marque_cle: marqueCanonique(marque),
    modele_cle: canonique(modele).slice(0, 160),
    marque: marque.slice(0, 80),
    modele: modele.slice(0, 160),
    annee: annee && annee > 1990 && annee < 2036 ? Math.round(annee) : null,
    carburant: plan.carburant !== undefined ? libelleCarburant(c[plan.carburant]) : null,
    puissance_ch: ch && ch > 10 && ch < 2500 ? Math.round(ch) : null,
    conso_mixte: plan.conso_mixte !== undefined ? nombre(c[plan.conso_mixte]) : null,
    conso_urbaine: plan.conso_urb !== undefined ? nombre(c[plan.conso_urb]) : null,
    conso_extra: plan.conso_exurb !== undefined ? nombre(c[plan.conso_exurb]) : null,
    co2: plan.co2 !== undefined ? nombre(c[plan.co2]) : null,
    norme: plan.norme !== undefined ? (c[plan.norme] || null) : (annee >= 2018 ? 'WLTP' : 'NEDC'),
    source: 'ADEME data.gouv.fr',
  });
}

console.log(`\n${lots.length} véhicules distincts retenus (${ignorees} lignes sans marque ou modèle ignorées).`);
console.log('Exemple :', JSON.stringify(lots[0], null, 1));

const { sql } = await import('../api/_lib/db.js');
const { preparerTable } = await import('../api/_lib/ademe.js');
await preparerTable();

if (REMPLACER) {
  console.log('\nVidage de la table…');
  await sql`DELETE FROM ademe_vehicules`;
}

let ecrits = 0;
for (const v of lots) {
  await sql`
    INSERT INTO ademe_vehicules
      (marque_cle, modele_cle, marque, modele, annee, carburant, puissance_ch,
       conso_mixte, conso_urbaine, conso_extra, co2, norme, source)
    VALUES (${v.marque_cle}, ${v.modele_cle}, ${v.marque}, ${v.modele}, ${v.annee},
            ${v.carburant}, ${v.puissance_ch}, ${v.conso_mixte}, ${v.conso_urbaine},
            ${v.conso_extra}, ${v.co2}, ${v.norme}, ${v.source})
  `;
  if (++ecrits % 500 === 0) process.stdout.write(`\r  ${ecrits}/${lots.length}`);
}
console.log(`\r  ${ecrits}/${lots.length} — import terminé.`);
process.exit(0);
