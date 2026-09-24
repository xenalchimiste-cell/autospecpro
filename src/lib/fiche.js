// ═══════════════════════════════════════════
//  AUTOSPEC — NORMALISATION & VALIDATION DES FICHES
//
//  Ces fonctions décident de ce que l'utilisateur lit : quelle voiture est
//  réellement cherchée, et quelles valeurs méritent d'être affichées. Elles
//  sont isolées ici pour être couvertes par `npm test` — app.js, chargé
//  ensuite, les appelle comme avant puisqu'elles restent globales.
// ═══════════════════════════════════════════

// ── NORMALISATION DES REQUÊTES ──
// Deux personnes qui cherchent la même voiture doivent obtenir la même fiche :
// on corrige les fautes de marque les plus courantes et on uniformise
// espaces/casse/accents avant d'appeler l'IA et de calculer la clé de cache.
function deaccent(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const BRAND_ALIASES = {
  vw: 'Volkswagen', volkswagen: 'Volkswagen', wolkswagen: 'Volkswagen', volskwagen: 'Volkswagen', volswagen: 'Volkswagen', wolswagen: 'Volkswagen',
  mercedes: 'Mercedes-Benz', 'mercedes benz': 'Mercedes-Benz', mercedez: 'Mercedes-Benz', merco: 'Mercedes-Benz', mercedes_benz: 'Mercedes-Benz', benz: 'Mercedes-Benz',
  bmw: 'BMW', bm: 'BMW', bmv: 'BMW',
  audi: 'Audi', audy: 'Audi', audii: 'Audi',
  peugeot: 'Peugeot', peugot: 'Peugeot', peugeo: 'Peugeot', pegeot: 'Peugeot', peujot: 'Peugeot',
  renault: 'Renault', renaud: 'Renault', reno: 'Renault', renault_sport: 'Renault',
  citroen: 'Citroën', citroene: 'Citroën', citroin: 'Citroën',
  ds: 'DS Automobiles',
  porsche: 'Porsche', porche: 'Porsche', porsh: 'Porsche', porshe: 'Porsche', porsche_ag: 'Porsche',
  ferrari: 'Ferrari', ferrarie: 'Ferrari', ferari: 'Ferrari',
  lamborghini: 'Lamborghini', lambo: 'Lamborghini', lamborgini: 'Lamborghini', lamborghinie: 'Lamborghini',
  'alfa romeo': 'Alfa Romeo', 'alpha romeo': 'Alfa Romeo', alfa: 'Alfa Romeo', alfaromeo: 'Alfa Romeo',
  toyota: 'Toyota', toyot: 'Toyota', toyata: 'Toyota',
  nissan: 'Nissan', nisan: 'Nissan',
  hyundai: 'Hyundai', hyunday: 'Hyundai', hundai: 'Hyundai', hyundaï: 'Hyundai',
  kia: 'Kia', skoda: 'Skoda', seat: 'Seat', cupra: 'Cupra', opel: 'Opel', ford: 'Ford', fiat: 'Fiat', mini: 'Mini',
  'land rover': 'Land Rover', landrover: 'Land Rover', 'range rover': 'Land Rover Range Rover',
  jaguar: 'Jaguar', volvo: 'Volvo', tesla: 'Tesla', telsa: 'Tesla', dacia: 'Dacia',
  suzuki: 'Suzuki', subaru: 'Subaru', mazda: 'Mazda', honda: 'Honda', hondaa: 'Honda',
  mitsubishi: 'Mitsubishi', mitsubichi: 'Mitsubishi',
  chevrolet: 'Chevrolet', chevy: 'Chevrolet', jeep: 'Jeep', abarth: 'Abarth',
  maserati: 'Maserati', maseratti: 'Maserati', bentley: 'Bentley',
  'rolls royce': 'Rolls-Royce', 'aston martin': 'Aston Martin', mclaren: 'McLaren', 'mc laren': 'McLaren',
  bugatti: 'Bugatti', koenigsegg: 'Koenigsegg', pagani: 'Pagani', alpine: 'Alpine', smart: 'Smart',
  lexus: 'Lexus', infiniti: 'Infiniti', genesis: 'Genesis', polestar: 'Polestar', mg: 'MG', byd: 'BYD',
  lancia: 'Lancia', saab: 'Saab', ssangyong: 'SsangYong', isuzu: 'Isuzu', lotus: 'Lotus', caterham: 'Caterham',
};

const BRAND_LOOKUP = (() => {
  const map = new Map();
  for (const [k, val] of Object.entries(BRAND_ALIASES)) {
    map.set(deaccent(k).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(), val);
  }
  return map;
})();

// "golf7 gti" → "Volkswagen ..." n'est pas deviné : on corrige seulement
// ce qui est sûr (marque connue, chiffre collé au modèle, espaces parasites).
function normalizeCarQuery(raw) {
  let q = String(raw || '').replace(/[«»"'`_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return '';
  // Chiffre collé : "golf7" → "golf 7", "2.0tdi" → "2.0 tdi".
  // On épargne les noms courts type A3, M3, X5, GT3 où le chiffre fait partie du nom.
  q = q.replace(/([A-Za-zÀ-ÿ]{3,})(\d)/g, '$1 $2').replace(/(\d)([A-Za-zÀ-ÿ]{2,})/g, '$1 $2');

  const words = q.split(' ').filter(Boolean);
  const keys = words.map(w => deaccent(w).toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const brand = BRAND_LOOKUP.get(keys.slice(0, n).join(' '));
    if (brand) return [brand, ...words.slice(n)].join(' ').trim();
  }
  return q;
}

// Sépare la marque du reste, pour l'annonce qui ouvre la fiche : on sait
// quelle marque afficher dès la frappe, sans attendre la réponse du modèle.
function brandAndModel(raw) {
  const q = normalizeCarQuery(raw);
  if (!q) return { brand: '', model: '' };
  const words = q.split(' ').filter(Boolean);
  const keys = words.map(w => deaccent(w).toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const brand = BRAND_LOOKUP.get(keys.slice(0, n).join(' '));
    // La marque canonique peut compter plus de mots que l'entrée ("vw" →
    // "Volkswagen") : on retire ce qui a été consommé côté entrée, pas côté sortie.
    if (brand) return { brand, model: words.slice(n).join(' ') };
  }
  return { brand: '', model: q };
}

// Forme canonique (insensible casse/accents) : sert de clé de cache stable.
function canonicalQuery(raw) {
  return deaccent(normalizeCarQuery(raw)).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ── VALIDATION DES DONNÉES RENVOYÉES PAR L'IA ──
// L'IA reste faillible : on refuse d'afficher un chiffre physiquement impossible
// (mieux vaut « — » qu'une valeur fausse) et on signale les incohérences.
const SPEC_RANGES = {
  'moteur.puissance_ch': [15, 2500],
  'moteur.puissance_kw': [10, 1900],
  'moteur.couple_nm': [20, 3500],
  'performances.zero_cent': [1.5, 40],
  'performances.zero_deux_cent': [4, 150],
  'performances.vitesse_max': [40, 550],
  'chassis.masse': [300, 4500],
  'chassis.coffre': [0, 4000],
  'carburant.reservoir': [5, 200],
  'carburant.autonomie_estimee': [30, 2500],
  'carburant.indice_octane': [80, 120],
};
const STAGE_RANGES = { puissance_ch: [15, 3500], couple_nm: [20, 5000], gain_ch: [0, 2500], gain_nm: [0, 4000] };
const RANGE_RE = /^\s*\d+(?:[.,]\d+)?\s*(?:[-–—]|à|a)\s*\d+(?:[.,]\d+)?\s*$/;

function toNum(val) {
  if (val === 0) return 0;
  if (!val) return null;
  const s = String(val)
    .replace(/ /g, ' ')
    // Les milliers peuvent arriver séparés par une espace ordinaire, une
    // insécable ou l'insécable étroite que produit toLocaleString('fr-FR').
    .replace(/(\d)[\s\u202f\u00a0](?=\d{3}\b)/g, '$1')
    .replace(/(\d),(\d)/g, '$1.$2');
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}
function setPath(obj, path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((o, k) => (o[k] && typeof o[k] === 'object' ? o[k] : (o[k] = {})), obj);
  parent[last] = val;
}

// Champ numérique : on ne garde que le nombre (l'unité est déjà dans le gabarit),
// et on supprime la valeur si elle sort des bornes physiques du champ.
function cleanNumericField(obj, path, [min, max]) {
  const raw = getPath(obj, path);
  if (raw === undefined || raw === null || raw === '') return;
  if (/^n\/?a$/i.test(String(raw).trim())) { setPath(obj, path, 'N/A'); return; }
  if (RANGE_RE.test(String(raw))) return; // fourchette assumée : on la laisse telle quelle
  const n = toNum(raw);
  if (n === null || n < min || n > max) { setPath(obj, path, 'N/A'); return; }
  setPath(obj, path, String(Number.isInteger(n) ? n : +n.toFixed(1)));
}

function hasVal(x) {
  const s = String(x == null ? '' : x).trim();
  return s !== '' && s !== '—' && !/^n\/?a$/i.test(s) && !/^(inconnu|non communiqué|non communique)$/i.test(s);
}

// Nettoie la fiche en place et renvoie la liste des incohérences détectées.
function sanitizeFiche(car) {
  const alerts = [];
  if (!car || typeof car !== 'object') return car;

  for (const [path, range] of Object.entries(SPEC_RANGES)) cleanNumericField(car, path, range);
  for (const key of ['stage1', 'stage2', 'stage3']) {
    if (car.tuning && car.tuning[key]) {
      for (const [f, range] of Object.entries(STAGE_RANGES)) cleanNumericField(car.tuning[key], f, range);
    }
  }

  // Puissance ch ↔ kW : une seule des deux fait foi, on recalcule l'autre.
  const m = car.moteur || (car.moteur = {});
  const ch = toNum(hasVal(m.puissance_ch) ? m.puissance_ch : null);
  const kw = toNum(hasVal(m.puissance_kw) ? m.puissance_kw : null);
  if (ch && (!kw || Math.abs(kw - ch * 0.7355) / (ch * 0.7355) > 0.12)) {
    m.puissance_kw = String(Math.round(ch * 0.7355));
  } else if (!ch && kw) {
    m.puissance_ch = String(Math.round(kw / 0.7355));
  }

  // Nom d'affichage : reconstruit depuis l'identification si l'IA l'a laissé vide.
  if (!hasVal(car.nom)) {
    const built = [car.marque, car.modele, car.finition].filter(hasVal).join(' ').trim();
    if (built) car.nom = built;
  }
  if (!hasVal(car.annee)) {
    const years = [car.annee_debut, car.annee_fin].filter(hasVal).join(' – ');
    if (years) car.annee = years;
  }

  // Filet de sécurité grossier : un 0–100 totalement hors rapport poids/puissance
  // trahit un mélange de finitions (ex. chiffres de la version Competition).
  const mass = toNum(hasVal(car.chassis?.masse) ? car.chassis.masse : null);
  const zc = toNum(hasVal(car.performances?.zero_cent) ? car.performances.zero_cent : null);
  const chFinal = toNum(hasVal(m.puissance_ch) ? m.puissance_ch : null);
  if (mass && zc && chFinal) {
    const expected = 0.9 * (mass / chFinal) + 1.0;
    if (zc < expected * 0.5 || zc > expected * 2) {
      alerts.push("Le 0–100 km/h annoncé colle mal au rapport poids/puissance : vérifiez la finition exacte.");
    }
  }

  // Un stage ne peut pas faire moins que la version d'origine.
  for (const key of ['stage1', 'stage2', 'stage3']) {
    const st = car.tuning?.[key];
    if (!st || !chFinal) continue;
    const stCh = toNum(hasVal(st.puissance_ch) ? st.puissance_ch : null);
    if (stCh && stCh < chFinal) { st.puissance_ch = 'N/A'; st.gain_ch = 'N/A'; }
    else if (stCh && !hasVal(st.gain_ch)) st.gain_ch = String(Math.round(stCh - chFinal));
  }

  car._alerts = alerts;
  return car;
}

// Fiche vide / hors-sujet : l'IA n'a identifié aucun véhicule exploitable.
function isEmptyFiche(car) {
  if (!car || car.error === 'NOT_A_CAR') return true;
  const named = hasVal(car.nom) || hasVal(car.marque) || hasVal(car.modele);
  const speced = hasVal(car.moteur?.puissance_ch) || hasVal(car.moteur?.cylindree) || hasVal(car.chassis?.masse);
  return !named || !speced;
}
