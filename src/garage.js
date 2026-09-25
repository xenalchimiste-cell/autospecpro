// ── GARAGE ──
// La voiture du showroom, en grand et modifiable pièce par pièce, avec un
// moteur qu'on démarre et qu'on fait monter en régime. Chargé à la demande
// par showPage('garage') : ni Three.js ni ce fichier ne pèsent sur les
// autres pages.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildCar, buildStage, habillerVoiture, lireVoitureAccueil, FINISHES } from './hero3d.js';
import {
  PEINTURES, FINITIONS, JANTES, COULEURS_JANTE, POUCES, ETRIERS, FEUX, CHROMES,
  AILERONS, KITS, HAUTEUR_CM, DEPORT_CM, MOTEURS, PREPAS, ECHAPPEMENTS, TRANSMISSIONS,
  CONFIG_DEFAUT, CLE_ACCUEIL, normaliserConfig, configAleatoire, moteurDe, performances,
} from './lib/garage.js';
import { creerMoteurSonore } from './garage-son.js';
import { environnementStudio, textureParticules, creerOmbreContact, creerComposition, HAUTE_QUALITE } from './rendu3d.js';

// Intensité des paillettes selon la finition : nulles sur le mat, à peine
// perceptibles sur le brillant, franches sur le métallisé et le nacré.
const PAILLETTES = { matte: 0, gloss: 0.04, metal: 0.28, nacre: 0.2 };

const CLE_STOCKAGE = 'autospec_garage';
const sansMouvement = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let cfg = lireConfig();
let racine = null;
let scene3d = null;
const son = creerMoteurSonore();
let dernierEtatMoteur = { regime: 0, etat: 'arret', rupteur: 1, ralenti: 0 };

function lireConfig() {
  try { return normaliserConfig(JSON.parse(localStorage.getItem(CLE_STOCKAGE))); } catch { return { ...CONFIG_DEFAUT }; }
}
function sauverConfig() {
  try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(cfg)); } catch { /* le garage marche sans */ }
}

const esc = (x) => String(x).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const nf = (n, d = 0) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

// ── PANNEAU ──
function segments(cle, liste, rendu = (o) => esc(o.label)) {
  return `<div class="garage-seg" role="group">${liste.map(o => {
    const val = o.id ?? o;
    return `<button type="button" class="garage-opt" data-cle="${cle}" data-val="${esc(val)}" aria-pressed="${String(cfg[cle]) === String(val)}">${rendu(o)}</button>`;
  }).join('')}</div>`;
}

function pastilles(cle, liste, valeur = (o) => o.id) {
  return `<div class="garage-pastilles" role="group">${liste.map(o =>
    `<button type="button" class="garage-pastille" style="--c:${o.hex}" data-cle="${cle}" data-val="${esc(valeur(o))}" aria-pressed="${cfg[cle] === valeur(o)}" aria-label="${esc(o.label)}" title="${esc(o.label)}"></button>`
  ).join('')}</div>`;
}

function reglage(cle, { min, max }, unite) {
  return `<div class="garage-reglage">
    <input type="range" min="${min}" max="${max}" step="1" value="${cfg[cle]}" data-cle="${cle}" aria-label="${cle === 'hauteur' ? 'Hauteur de caisse' : 'Élargissement des voies'}">
    <output data-sortie="${cle}">${cfg[cle] > 0 ? '+' : ''}${cfg[cle]} ${unite}</output>
  </div>`;
}

const bloc = (titre, contenu) => `<div class="garage-bloc"><div class="garage-bloc-titre">${titre}</div>${contenu}</div>`;

function panneaux() {
  return {
    peinture: bloc('Couleur', pastilles('peinture', PEINTURES, o => o.hex) +
        `<label class="garage-perso">Couleur libre <input type="color" value="${cfg.peinture}" data-cle="peinture"></label>`) +
      bloc('Finition', segments('finition', FINITIONS)),
    jantes: bloc('Modèle', segments('jante', JANTES)) +
      bloc('Taille', segments('pouces', POUCES, p => `${p}″`)) +
      bloc('Couleur des jantes', pastilles('couleurJante', COULEURS_JANTE)) +
      bloc('Étriers de frein', pastilles('etriers', ETRIERS)),
    carrosserie: bloc('Hauteur de caisse', reglage('hauteur', HAUTEUR_CM, 'cm')) +
      bloc('Élargissement des voies', reglage('deport', DEPORT_CM, 'cm')) +
      bloc('Aileron', segments('aileron', AILERONS)) +
      bloc('Kit carrosserie', segments('kit', KITS)) +
      bloc('Feux', segments('feux', FEUX)) +
      bloc('Chromes', segments('chromes', CHROMES)),
    moteur: bloc('Moteur', `<div class="garage-moteurs" role="group">${MOTEURS.map(m =>
        `<button type="button" class="garage-opt garage-moteur-opt" data-cle="moteur" data-val="${m.id}" aria-pressed="${cfg.moteur === m.id}">
          <strong>${esc(m.label)}</strong><span>${esc(m.detail)} · ${m.ch} ch</span>
        </button>`).join('')}</div>`) +
      bloc('Préparation', segments('prepa', PREPAS)) +
      bloc('Échappement', segments('echappement', ECHAPPEMENTS)) +
      bloc('Transmission', segments('transmission', TRANSMISSIONS)),
  };
}

const ONGLETS = [['peinture', 'Peinture'], ['jantes', 'Jantes'], ['carrosserie', 'Carrosserie'], ['moteur', 'Moteur']];
let ongletActif = 'peinture';

function rendrePanneau() {
  const p = panneaux();
  racine.querySelector('.garage-onglets').innerHTML = ONGLETS.map(([id, label]) =>
    `<button type="button" role="tab" class="garage-onglet" data-onglet="${id}" aria-selected="${id === ongletActif}">${label}</button>`).join('');
  racine.querySelector('.garage-contenu').innerHTML = p[ongletActif];
}

function rendreStats() {
  const p = performances(cfg);
  const m = moteurDe(cfg);
  racine.querySelector('.garage-stats').innerHTML = [
    ['Puissance', `${nf(p.ch)} ch`],
    ['Couple', `${nf(p.nm)} N·m`],
    ['Masse', `${nf(p.kg)} kg`],
    ['0 – 100 km/h', `${nf(p.t100, 1)} s`],
    ['Vitesse max', `${nf(p.vmax)} km/h`],
  ].map(([l, v]) => `<div class="garage-stat"><div class="garage-stat-val">${v}</div><div class="garage-stat-lbl">${l}</div></div>`).join('');
  racine.querySelector('.garage-moteur-nom').textContent = `${m.label} · ${m.detail}`;
}

// ── COMPTE-TOURS ──
// Arc de 240°, une graduation par millier de tours, zone rouge au-delà de 90 % du rupteur.
const ARC = { debut: -210, fin: 30 };
function angleRegime(regime, max) {
  return ARC.debut + (ARC.fin - ARC.debut) * Math.min(1, Math.max(0, regime / max));
}
function point(angle, r) {
  const a = (angle * Math.PI) / 180;
  return [60 + r * Math.cos(a), 60 + r * Math.sin(a)];
}
function rendreCompteTours() {
  const m = moteurDe(cfg);
  const pas = m.rupteur > 10000 ? 2000 : 1000;
  const max = Math.ceil(m.rupteur / pas) * pas;
  const arc = (a0, a1, r) => {
    const [x0, y0] = point(a0, r), [x1, y1] = point(a1, r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  let grad = '';
  for (let v = 0; v <= max; v += pas) {
    const a = angleRegime(v, max);
    const [x0, y0] = point(a, 48), [x1, y1] = point(a, 54), [xt, yt] = point(a, 39);
    grad += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" class="ct-grad"/>`;
    grad += `<text x="${xt}" y="${yt}" class="ct-num">${v / 1000}</text>`;
  }
  racine.querySelector('.garage-compte-tours').innerHTML = `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <path d="${arc(ARC.debut, ARC.fin, 54)}" class="ct-arc"/>
      <path d="${arc(angleRegime(m.rupteur * 0.9, max), angleRegime(m.rupteur, max), 54)}" class="ct-rouge"/>
      ${grad}
      <line x1="60" y1="60" x2="60" y2="14" class="ct-aiguille" id="ct-aiguille" style="transform: rotate(${angleRegime(0, max) + 90}deg)"/>
      <circle cx="60" cy="60" r="4" class="ct-centre"/>
    </svg>
    <div class="ct-lecture"><span id="ct-regime">0</span><small>tr/min</small></div>`;
  racine.querySelector('.garage-compte-tours').dataset.max = max;
}
function majCompteTours({ regime, etat }) {
  const zone = racine?.querySelector('.garage-compte-tours');
  if (!zone) return;
  const max = Number(zone.dataset.max) || 8000;
  const aiguille = document.getElementById('ct-aiguille');
  if (aiguille) aiguille.style.transform = `rotate(${angleRegime(regime, max) + 90}deg)`;
  const lecture = document.getElementById('ct-regime');
  if (lecture) lecture.textContent = nf(Math.round(regime / 50) * 50);
  zone.classList.toggle('au-rupteur', regime >= moteurDe(cfg).rupteur * 0.9);
  const btn = racine.querySelector('[data-action="contact"]');
  const allume = etat === 'marche' || etat === 'demarrage';
  if (btn && btn.dataset.allume !== String(allume)) {
    btn.dataset.allume = String(allume);
    btn.textContent = allume ? 'Couper le moteur' : 'Démarrer';
    racine.querySelector('[data-action="gaz"]').disabled = !allume;
  }
}

// ── SCÈNE 3D ──
function monterScene(conteneur) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HAUTE_QUALITE ? 1.75 : 1.5));
  // Tone mapping « neutre » : il respecte les teintes de carrosserie là où
  // ACES fait virer les rouges à l'orange et les jaunes au blanc.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'garage-canvas';
  conteneur.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const fond = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fbfbf8';
  scene.background = fondCompense(fond);
  scene.environment = environnementStudio(renderer);
  // Le studio éclaire presque tout ; une lumière directe garde un peu de relief.
  const cle = new THREE.DirectionalLight(0xffffff, 0.7);
  cle.position.set(4, 7, 3);
  scene.add(cle);

  const fin = FINISHES[cfg.finition] || FINISHES.gloss;
  const paint = new THREE.MeshPhysicalMaterial({ color: cfg.peinture, side: THREE.DoubleSide, ...fin, normalMap: textureParticules() });
  paint.normalScale.setScalar(PAILLETTES[cfg.finition] ?? 0);
  const { car, body, wheels, mats } = buildCar(paint, scene.environment);
  mats.glass.envMapIntensity = 0.9;
  // Le métal poli ne fait que refléter : face aux murs sombres du studio,
  // les jantes argent sortaient gris anthracite.
  mats.jante.envMapIntensity = 1.8;
  mats.chrome.envMapIntensity = 1.5;
  // Les feux sont les seules surfaces assez lumineuses pour déclencher le halo.
  mats.tail.color.multiplyScalar(1.8);
  mats.tailLed.color.multiplyScalar(2.2);
  const { stage, shadow } = buildStage();
  shadow.visible = false; // remplacée par l'ombre de contact
  const ombre = creerOmbreContact(renderer, scene);
  scene.add(stage, car, ombre.groupe);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(-5.2, 2.2, 6.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.55, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4.8;
  controls.maxDistance = 12;
  controls.minPolarAngle = 0.6;
  controls.maxPolarAngle = 1.5;
  controls.autoRotate = !sansMouvement;
  controls.autoRotateSpeed = 0.8;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  const s = {
    renderer, scene, camera, controls, car, body, wheels, mats, paint,
    pieces: null,
    // Nombre d'images pendant lesquelles recalculer l'ombre : elle ne bouge
    // qu'après un changement (hauteur, roues, pièces), pas à chaque image.
    ombreSale: 90,
    couleurCible: new THREE.Color(cfg.peinture),
    finitionCible: { ...fin },
    hauteurCible: 0,
    rafId: null, visible: false, horloge: new THREE.Clock(),
  };

  const composition = creerComposition(renderer, scene, camera);

  function redimensionner() {
    const w = conteneur.clientWidth, h = conteneur.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composition.taille(w, h, renderer.getPixelRatio());
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(redimensionner).observe(conteneur);
  redimensionner();

  function image(now) {
    s.rafId = null;
    const dt = Math.min(s.horloge.getDelta(), 0.05);
    const k = 1 - Math.exp(-dt * 6);
    paint.color.lerp(s.couleurCible, k);
    for (const p of Object.keys(s.finitionCible)) paint[p] += (s.finitionCible[p] - paint[p]) * k;

    // Hauteur de caisse, plus les vibrations du moteur et le couple qui
    // fait pencher la caisse quand on accélère.
    const { regime, etat, rupteur } = dernierEtatMoteur;
    const tourne = etat === 'marche' || etat === 'demarrage';
    const r = regime / rupteur;
    const vibre = tourne && !sansMouvement && moteurDe(cfg).cyl ? Math.sin(now / 16) * 0.0012 * (1 - r * 0.5) : 0;
    const roulis = tourne && !sansMouvement ? -0.014 * r : 0;
    body.position.y += (s.hauteurCible - body.position.y) * k;
    body.rotation.x += (roulis - body.rotation.x) * k;
    body.position.y += vibre;

    controls.update(dt);
    if (s.ombreSale > 0) { ombre.maj([stage]); s.ombreSale--; }
    composition.rendre(dt);
    body.position.y -= vibre;
    conteneur.classList.add('ready');
    if (s.visible && !document.hidden) s.rafId = requestAnimationFrame(image);
  }
  s.relancer = () => {
    const doit = s.visible && !document.hidden;
    if (doit && s.rafId === null) { s.horloge.getDelta(); s.rafId = requestAnimationFrame(image); }
    else if (!doit && s.rafId !== null) { cancelAnimationFrame(s.rafId); s.rafId = null; }
  };
  new IntersectionObserver((e) => { s.visible = e.some(x => x.isIntersecting); s.relancer(); }).observe(conteneur);
  document.addEventListener('visibilitychange', s.relancer);
  return s;
}

// Le fond de la scène passe par le tone mapping, qui comprime les teintes
// claires : le blanc cassé de la page ressortait gris. On inverse la courbe
// « Neutral » de Three.js pour que le fond rendu tombe pile sur celui de la
// page. Valable pour une couleur claire et presque neutre, ce qu'est --bg.
function fondCompense(css) {
  const c = new THREE.Color(css); // linéaire
  const cible = Math.max(c.r, c.g, c.b);
  const debut = 0.76, d = 1 - debut;
  if (cible <= debut) return c;
  const pic = d * d / (1 - cible) - d + debut;
  return c.multiplyScalar(pic / cible);
}

// Applique la configuration à la scène. `cles` limite le travail aux pièces
// qui ont changé : reconstruire les roues à chaque changement de peinture
// serait du gaspillage.
function appliquer(cles = null) {
  const s = scene3d;
  const tout = !cles;
  const a = (...k) => tout || k.some(x => cles.includes(x));
  if (!s) return;
  const { mats } = s;

  if (a('peinture')) s.couleurCible.set(cfg.peinture);
  if (a('finition')) {
    Object.assign(s.finitionCible, FINISHES[cfg.finition] || FINISHES.gloss);
    s.paint.normalScale.setScalar(PAILLETTES[cfg.finition] ?? 0);
  }
  habillerVoiture(s, cfg, { cles, intensiteFeux: 4 });
  if (a('hauteur')) s.hauteurCible = cfg.hauteur / 100;
  if (a('moteur', 'echappement')) son.configurer(moteurDe(cfg), cfg.echappement);
  if (a('hauteur', 'jante', 'pouces', 'deport', 'aileron', 'kit')) s.ombreSale = 90;
}

function changer(cle, valeur) {
  const brut = { ...cfg, [cle]: valeur };
  const avant = cfg;
  cfg = normaliserConfig(brut);
  const changees = Object.keys(cfg).filter(k => cfg[k] !== avant[k]);
  if (!changees.length) return;
  appliquer(changees);
  sauverConfig();
  // Mise à jour ciblée des boutons, sans reconstruire le panneau (le
  // curseur en cours de glissement perdrait le focus).
  racine.querySelectorAll('[data-cle][aria-pressed]').forEach(b => {
    b.setAttribute('aria-pressed', String(String(cfg[b.dataset.cle]) === b.dataset.val));
  });
  for (const k of ['hauteur', 'deport']) {
    const o = racine.querySelector(`[data-sortie="${k}"]`);
    if (o) o.textContent = `${cfg[k] > 0 ? '+' : ''}${cfg[k]} cm`;
  }
  const perso = racine.querySelector('input[type="color"]');
  if (perso && cle !== 'peinture') perso.value = cfg.peinture;
  if (changees.includes('moteur')) rendreCompteTours();
  rendreStats();
  majBoutonAccueil();
}

// La voiture préparée devient celle du showroom de l'accueil. Le showroom,
// s'il est déjà affiché, se met à jour tout de suite grâce à l'événement.
function mettreAccueil() {
  try { localStorage.setItem(CLE_ACCUEIL, JSON.stringify(cfg)); } catch {
    window.showToast?.("Impossible d'enregistrer : le stockage du navigateur est bloqué.", 'error');
    return;
  }
  window.dispatchEvent(new CustomEvent('autospec:voiture-accueil', { detail: { ...cfg } }));
  majBoutonAccueil();
  window.showToast?.("Votre voiture est maintenant sur la page d'accueil.", 'success');
}

// Le bouton dit si la voiture affichée est déjà celle de l'accueil.
function majBoutonAccueil() {
  const b = racine?.querySelector('[data-action="accueil"]');
  if (!b) return;
  const accueil = lireVoitureAccueil();
  const deja = accueil && Object.keys(cfg).every(k => cfg[k] === accueil[k]);
  b.textContent = deja ? "Sur l'accueil ✓" : "Mettre à l'accueil";
  b.classList.toggle('est-accueil', !!deja);
}

function toutReappliquer() {
  appliquer();
  rendrePanneau();
  rendreStats();
  rendreCompteTours();
  sauverConfig();
  majBoutonAccueil();
}

// ── MONTAGE ──
function construireInterface(el) {
  el.innerHTML = `
    <div class="garage-scene" id="garage-scene">
      <span class="garage-astuce">Glissez pour tourner · pincez ou molette pour zoomer</span>
    </div>
    <div class="garage-cote">
      <div class="garage-onglets" role="tablist" aria-label="Personnalisation"></div>
      <div class="garage-contenu" role="tabpanel"></div>
      <div class="garage-actions">
        <button type="button" class="btn btn-primary garage-accueil" data-action="accueil">Mettre à l'accueil</button>
        <button type="button" class="btn btn-outline" data-action="aleatoire">Configuration aléatoire</button>
        <button type="button" class="btn btn-outline" data-action="origine">Revenir à l'origine</button>
      </div>
    </div>
    <div class="garage-banc">
      <div class="garage-compte-tours"></div>
      <div class="garage-commandes">
        <div class="garage-moteur-nom"></div>
        <div class="garage-boutons">
          <button type="button" class="btn btn-primary" data-action="contact" data-allume="false">Démarrer</button>
          <button type="button" class="btn btn-secondary garage-gaz" data-action="gaz" disabled>Accélérer <small>maintenir · espace</small></button>
        </div>
        <label class="garage-volume">Volume <input type="range" min="0" max="100" value="60" data-action="volume"></label>
        <p class="garage-note">Son synthétisé en direct selon le moteur et l'échappement choisis. Sur iPhone, désactivez le mode silencieux.</p>
      </div>
      <div class="garage-stats"></div>
    </div>`;
}

function brancherEvenements(el) {
  el.addEventListener('click', (e) => {
    const onglet = e.target.closest('[data-onglet]');
    if (onglet) { ongletActif = onglet.dataset.onglet; rendrePanneau(); return; }
    const opt = e.target.closest('button[data-cle]');
    if (opt) {
      const v = opt.dataset.val;
      changer(opt.dataset.cle, opt.dataset.cle === 'pouces' ? Number(v) : v);
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'contact') son.enMarche() ? son.couper() : son.demarrer();
    else if (action === 'accueil') mettreAccueil();
    else if (action === 'aleatoire') { cfg = configAleatoire(); toutReappliquer(); }
    else if (action === 'origine') { cfg = { ...CONFIG_DEFAUT }; toutReappliquer(); }
  });

  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.action === 'volume') { son.volume(Number(t.value) / 100); return; }
    if (t.matches('input[type="range"][data-cle]')) changer(t.dataset.cle, Number(t.value));
    else if (t.matches('input[type="color"][data-cle]')) changer('peinture', t.value);
  });

  // Accélérateur : maintenu à la souris, au doigt ou avec la barre d'espace.
  const gaz = el.querySelector('[data-action="gaz"]');
  const appuyer = (e) => { e.preventDefault(); gaz.setPointerCapture?.(e.pointerId); gaz.classList.add('appuye'); son.accelerer(true); };
  const relacher = () => { gaz.classList.remove('appuye'); son.accelerer(false); };
  gaz.addEventListener('pointerdown', appuyer);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) gaz.addEventListener(ev, relacher);
  gaz.addEventListener('contextmenu', (e) => e.preventDefault());

  const actif = () => document.getElementById('page-garage')?.classList.contains('active');
  document.addEventListener('keydown', (e) => {
    if (!actif() || e.repeat || e.target.closest?.('input, textarea, select')) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      if (!son.enMarche()) return;
      e.preventDefault(); gaz.classList.add('appuye'); son.accelerer(true);
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') relacher();
  });
  window.addEventListener('blur', relacher);
}

export function ouvrirGarage() {
  if (racine) { scene3d?.relancer(); return; }
  racine = document.getElementById('garage-app');
  if (!racine) return;
  construireInterface(racine);
  brancherEvenements(racine);
  scene3d = monterScene(racine.querySelector('#garage-scene'));
  son.ecouter((etat) => { dernierEtatMoteur = etat; majCompteTours(etat); });
  toutReappliquer();
}

export function quitterGarage() {
  son.arreterTout();
}
