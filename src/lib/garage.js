// ═══════════════════════════════════════════
//  AUTOSPEC — GARAGE : CATALOGUE ET RÈGLES
//
//  Tout ce que le garage propose (peintures, jantes, moteurs…) et la façon
//  dont une configuration se traduit en chiffres. Aucune dépendance à
//  Three.js ni au DOM : src/garage.js s'occupe de l'affichage et du son,
//  test/garage.test.js vérifie ce fichier seul.
// ═══════════════════════════════════════════

export const PEINTURES = [
  { id: 'nardo',   label: 'Gris Nardo',      hex: '#8a8d8f' },
  { id: 'noir',    label: 'Noir',            hex: '#0c0c11' },
  { id: 'blanc',   label: 'Blanc',           hex: '#e7e6e2' },
  { id: 'argent',  label: 'Argent',          hex: '#a9acb2' },
  { id: 'rouge',   label: 'Rouge course',    hex: '#b3121f' },
  { id: 'orange',  label: 'Orange',          hex: '#e2561b' },
  { id: 'jaune',   label: 'Jaune',           hex: '#f2c200' },
  { id: 'vert',    label: 'Vert anglais',    hex: '#1f4d33' },
  { id: 'acide',   label: 'Vert acide',      hex: '#8fd12b' },
  { id: 'bleu',    label: 'Bleu électrique', hex: '#1e5bd8' },
  { id: 'nuit',    label: 'Bleu nuit',       hex: '#1b2d55' },
  { id: 'violet',  label: 'Violet',          hex: '#5b2a86' },
];

export const FINITIONS = [
  { id: 'gloss', label: 'Brillant' },
  { id: 'metal', label: 'Métallisé' },
  { id: 'matte', label: 'Mat' },
  { id: 'nacre', label: 'Nacré' },
];

export const JANTES = [
  { id: 'origine',     label: "Multibranches d'origine" },
  { id: 'cinq',        label: '5 branches' },
  { id: 'double',      label: 'Branches doubles' },
  { id: 'croisillons', label: 'Croisillons' },
  { id: 'turbine',     label: 'Turbine' },
];

export const COULEURS_JANTE = [
  { id: 'argent',   label: 'Argent',   hex: '#cfd0d6', metal: 1,   rugosite: 0.2 },
  { id: 'gunmetal', label: 'Gunmetal', hex: '#4a4c52', metal: 0.9, rugosite: 0.3 },
  { id: 'noir',     label: 'Noir',     hex: '#141417', metal: 0.6, rugosite: 0.35 },
  { id: 'bronze',   label: 'Bronze',   hex: '#8c6a3c', metal: 0.9, rugosite: 0.3 },
  { id: 'or',       label: 'Or',       hex: '#c9a54a', metal: 1,   rugosite: 0.25 },
  { id: 'blanc',    label: 'Blanc',    hex: '#e9e9e6', metal: 0.2, rugosite: 0.35 },
];

export const POUCES = [18, 19, 20, 21, 22];

export const ETRIERS = [
  { id: 'gris',  label: 'Gris',  hex: '#6c6d74' },
  { id: 'rouge', label: 'Rouge', hex: '#c4121f' },
  { id: 'jaune', label: 'Jaune', hex: '#e9b90e' },
  { id: 'bleu',  label: 'Bleu',  hex: '#1f4fa8' },
  { id: 'vert',  label: 'Vert',  hex: '#2f8f3a' },
  { id: 'noir',  label: 'Noir',  hex: '#1a1a1d' },
];

export const FEUX = [
  { id: 'blanc', label: 'LED blanches', hex: '#f2f7ff' },
  { id: 'xenon', label: 'Xénon bleuté', hex: '#bcd4ff' },
  { id: 'jaune', label: 'Jaunes',       hex: '#ffd45a' },
];

export const CHROMES = [
  { id: 'chrome', label: 'Chrome' },
  { id: 'noir',   label: 'Pack noir' },
];

export const AILERONS = [
  { id: 'aucun',   label: 'Aucun' },
  { id: 'becquet', label: 'Becquet' },
  { id: 'gt',      label: 'Aileron GT' },
];

export const KITS = [
  { id: 'origine', label: "D'origine" },
  { id: 'sport',   label: 'Kit sport (lame, bas de caisse, diffuseur)' },
];

export const HAUTEUR_CM = { min: -6, max: 3 };
export const DEPORT_CM = { min: 0, max: 5 };

// Caractère sonore : `cyl` fixe la fréquence d'allumage, `irregularite` la
// part de « glouglou » (le vilebrequin croisé d'un V8 en a beaucoup, un 6 en
// ligne presque pas), `montee` le temps pour passer du ralenti au rupteur à vide.
export const MOTEURS = [
  { id: 'l4t',  label: '4 cylindres turbo', detail: '2.0 L turbo',       ch: 245, nm: 370, masse: -80,  ralenti: 850, rupteur: 6800,  cyl: 4,  turbo: true,  irregularite: 0.18, montee: 1.3 },
  { id: 'l6',   label: '6 en ligne',        detail: '3.0 L biturbo',     ch: 380, nm: 500, masse: 0,    ralenti: 750, rupteur: 7200,  cyl: 6,  turbo: true,  irregularite: 0.06, montee: 1.2 },
  { id: 'v8',   label: 'V8',                detail: '5.0 L atmosphérique', ch: 460, nm: 540, masse: 60,  ralenti: 700, rupteur: 7500,  cyl: 8,  turbo: false, irregularite: 0.55, montee: 1.1 },
  { id: 'v10',  label: 'V10',               detail: '5.2 L atmosphérique', ch: 610, nm: 560, masse: 80,  ralenti: 900, rupteur: 8700,  cyl: 10, turbo: false, irregularite: 0.25, montee: 0.9 },
  { id: 'v12',  label: 'V12',               detail: '6.5 L atmosphérique', ch: 780, nm: 720, masse: 120, ralenti: 950, rupteur: 9000,  cyl: 12, turbo: false, irregularite: 0.05, montee: 1.0 },
  { id: 'elec', label: 'Électrique',        detail: 'Bimoteur',          ch: 500, nm: 750, masse: 350,  ralenti: 0,   rupteur: 16000, cyl: 0,  turbo: false, irregularite: 0,    montee: 1.5 },
];

// Une reprogrammation rapporte beaucoup plus sur un turbo (on monte la
// pression) que sur un atmosphérique.
export const PREPAS = [
  { id: 'stock', label: "D'origine", gain: { turbo: 1,    atmo: 1,    elec: 1 } },
  { id: 's1',    label: 'Stage 1',   gain: { turbo: 1.2,  atmo: 1.05, elec: 1.1 } },
  { id: 's2',    label: 'Stage 2',   gain: { turbo: 1.35, atmo: 1.1,  elec: 1.2 } },
  { id: 's3',    label: 'Stage 3',   gain: { turbo: 1.55, atmo: 1.2,  elec: 1.3 } },
];

export const ECHAPPEMENTS = [
  { id: 'origine', label: "D'origine" },
  { id: 'sport',   label: 'Sport' },
  { id: 'racing',  label: 'Racing' },
];

// Mêmes coefficients que le simulateur (select #sl-tr), pour que les deux
// outils donnent les mêmes temps à configuration égale.
export const TRANSMISSIONS = [
  { id: 'integrale',  label: 'Intégrale',  eff: 0.95 },
  { id: 'propulsion', label: 'Propulsion', eff: 0.90 },
  { id: 'traction',   label: 'Traction',   eff: 0.88 },
];

export const MASSE_BASE = 1750;

// Clé du stockage où le garage dépose la voiture « mise à l'accueil ».
export const CLE_ACCUEIL = 'autospec_voiture_accueil';

export const CONFIG_DEFAUT = Object.freeze({
  peinture: '#3c3d42', finition: 'matte',
  jante: 'origine', couleurJante: 'argent', pouces: 19, etriers: 'gris',
  feux: 'blanc', chromes: 'chrome',
  hauteur: 0, deport: 0, aileron: 'aucun', kit: 'origine',
  moteur: 'l6', prepa: 'stock', echappement: 'origine', transmission: 'propulsion',
});

const parId = (liste, id) => liste.find(o => o.id === id);
const ids = (liste) => liste.map(o => o.id);

// Les choix à liste fermée : clé de configuration → catalogue.
const CHOIX = {
  finition: FINITIONS, jante: JANTES, couleurJante: COULEURS_JANTE, etriers: ETRIERS,
  feux: FEUX, chromes: CHROMES, aileron: AILERONS, kit: KITS,
  moteur: MOTEURS, prepa: PREPAS, echappement: ECHAPPEMENTS, transmission: TRANSMISSIONS,
};

const borne = (n, { min, max }) => Math.max(min, Math.min(max, Math.round(n)));

// Une configuration relue du stockage ou d'un lien partagé n'est pas fiable :
// toute valeur inconnue retombe sur celle d'origine.
export function normaliserConfig(brut) {
  const src = brut && typeof brut === 'object' ? brut : {};
  const cfg = { ...CONFIG_DEFAUT };
  for (const [cle, liste] of Object.entries(CHOIX)) {
    if (ids(liste).includes(src[cle])) cfg[cle] = src[cle];
  }
  if (typeof src.peinture === 'string' && /^#[0-9a-f]{6}$/i.test(src.peinture)) cfg.peinture = src.peinture.toLowerCase();
  if (POUCES.includes(Number(src.pouces))) cfg.pouces = Number(src.pouces);
  if (Number.isFinite(Number(src.hauteur))) cfg.hauteur = borne(Number(src.hauteur), HAUTEUR_CM);
  if (Number.isFinite(Number(src.deport))) cfg.deport = borne(Number(src.deport), DEPORT_CM);
  return cfg;
}

export function configAleatoire(rng = Math.random) {
  const un = (liste) => liste[Math.floor(rng() * liste.length)];
  const cfg = { peinture: un(PEINTURES).hex, pouces: un(POUCES) };
  for (const [cle, liste] of Object.entries(CHOIX)) cfg[cle] = un(liste).id;
  cfg.hauteur = HAUTEUR_CM.min + Math.floor(rng() * (HAUTEUR_CM.max - HAUTEUR_CM.min + 1));
  cfg.deport = DEPORT_CM.min + Math.floor(rng() * (DEPORT_CM.max - DEPORT_CM.min + 1));
  return normaliserConfig(cfg);
}

export function familleMoteur(moteur) {
  if (moteur.cyl === 0) return 'elec';
  return moteur.turbo ? 'turbo' : 'atmo';
}

export function moteurDe(cfg) {
  return parId(MOTEURS, cfg.moteur) || parId(MOTEURS, CONFIG_DEFAUT.moteur);
}

// Chiffres affichés sous la voiture. Les formules du 0-100 et de la vitesse
// maximale sont celles de updateSim() dans app.js.
export function performances(cfg) {
  const m = moteurDe(cfg);
  const prepa = parId(PREPAS, cfg.prepa) || PREPAS[0];
  const eff = (parId(TRANSMISSIONS, cfg.transmission) || TRANSMISSIONS[1]).eff;
  const gain = prepa.gain[familleMoteur(m)];
  const ch = Math.round(m.ch * gain);
  const nm = Math.round(m.nm * gain);
  // Aileron GT et kit sport : quelques kilos de carbone.
  const kg = MASSE_BASE + m.masse + (cfg.aileron === 'gt' ? 8 : 0) + (cfg.kit === 'sport' ? 6 : 0);
  const ratio = kg / ch;
  const t100 = Math.round((ratio * 0.70 + 1.55 / Math.sqrt(eff)) * 10) / 10;
  const vmax = Math.min(Math.round((40 * Math.pow(ch, 0.33) - kg / 250) * eff), 500);
  return { ch, nm, kg, t100, vmax, rupteur: m.rupteur };
}
