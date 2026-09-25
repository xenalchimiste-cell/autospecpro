// ── SHOWROOM 3D (page d'accueil) ──
// Berline premium stylisée (inspirée d'une grande berline allemande, sans logo),
// entièrement générée en code : la carrosserie et l'habitacle sont des surfaces
// « lissées » faites de sections superellipses le long de l'axe de la voiture ;
// calandre, optiques, vitrages et chromes sont des panneaux et tubes plaqués dessus.
// Chargé à la demande par index.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COULEURS_JANTE, ETRIERS, FEUX, CLE_ACCUEIL, normaliserConfig } from './lib/garage.js';

const HALF_L = 2.47;          // demi-longueur (m)
const AXLE_X = 1.48;          // position des essieux (empattement ~2,96 m)
const WHEEL_Y = 0.35;         // rayon / hauteur du centre des roues
const WHEEL_Z = 0.8;          // demi-voie
const CAR_SCALE = 0.9;        // mise à l'échelle dans le showroom

// Finitions de peinture sélectionnables (data-finish sur les pastilles).
// `iridescence` vaut 0 partout sauf sur le nacré, pour que le fondu entre
// deux finitions (garage) passe aussi par cette propriété.
export const FINISHES = {
  matte: { metalness: 0.45, roughness: 0.52, clearcoat: 0.12, clearcoatRoughness: 0.5, iridescence: 0 },
  gloss: { metalness: 0.3, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0 },
  metal: { metalness: 0.85, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0 },
  nacre: { metalness: 0.4, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 1 },
};

// ── Outils géométriques ──

// Interpolation Catmull-Rom 1D sur des points [x, y] triés par x.
function spline(points, x) {
  const last = points.length - 1;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[last][0]) return points[last][1];
  let i = 0;
  while (x > points[i + 1][0]) i++;
  const p0 = points[Math.max(i - 1, 0)][1];
  const p1 = points[i][1];
  const p2 = points[i + 1][1];
  const p3 = points[Math.min(i + 2, last)][1];
  const t = (x - points[i][0]) / (points[i + 1][0] - points[i][0]);
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Dimensions de la section à l'abscisse x : centre/demi-hauteur/demi-largeur.
function section(cfg, x) {
  const u = (2 * (x - cfg.x0)) / (cfg.x1 - cfg.x0) - 1;
  const a = Math.abs(u);
  const envY = Math.pow(Math.max(0, 1 - Math.pow(a, cfg.endY)), 1 / cfg.endY);
  const envZ = Math.pow(Math.max(0, 1 - Math.pow(a, cfg.endZ)), 1 / cfg.endZ);
  const yt = cfg.top(x), yb = cfg.bottom(x);
  return { yc: (yt + yb) / 2, hy: ((yt - yb) / 2) * envY, hz: cfg.halfWidth(x) * envZ };
}

function loftGeometry(cfg) {
  const { slices, ring, boxiness: n, tumble } = cfg;
  const positions = new Float32Array((slices + 1) * ring * 3);
  // Coordonnées de texture (longueur, tour de section) : elles servent aux
  // paillettes de la peinture dans le garage.
  const uvs = new Float32Array((slices + 1) * ring * 2);
  let k = 0, q = 0;
  for (let i = 0; i <= slices; i++) {
    const x = cfg.x0 + (cfg.x1 - cfg.x0) * (i / slices);
    const { yc, hy, hz } = section(cfg, x);
    for (let j = 0; j < ring; j++) {
      const ang = (j / ring) * Math.PI * 2;
      const c = Math.cos(ang), s = Math.sin(ang);
      let z = hz * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const y = yc + hy * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      if (s > 0) z *= 1 - tumble * s; // flancs qui rentrent vers le haut
      positions[k++] = x; positions[k++] = y; positions[k++] = z;
      uvs[q++] = (i / slices) * 2; uvs[q++] = j / ring;
    }
  }
  const indices = [];
  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + j, d = (i + 1) * ring + ((j + 1) % ring);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Le point (y, z) est-il dans la section à l'abscisse x ?
function insideSection(cfg, x, y, z) {
  const { yc, hy, hz } = section(cfg, x);
  if (hy <= 1e-4 || hz <= 1e-4) return false;
  const n = cfg.boxiness;
  const ny = (y - yc) / hy;
  if (Math.abs(ny) > 1) return false;
  const s = ny > 0 ? Math.pow(ny, n / 2) : 0;
  const nz = z / (hz * (1 - cfg.tumble * s));
  return Math.pow(Math.abs(nz), n) + Math.pow(Math.abs(ny), n) <= 1;
}

// Abscisse de la surface avant (dir = 1) ou arrière (dir = -1) à la hauteur y / largeur z.
function endSurfaceX(cfg, y, z, dir) {
  const end = dir > 0 ? cfg.x1 : cfg.x0;
  let lo = end - dir * 1.2, hi = end;
  for (let x = end; Math.abs(x - end) < 1.2; x -= dir * 0.01) {
    if (insideSection(cfg, x, y, z)) { lo = x; hi = x + dir * 0.01; break; }
  }
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (insideSection(cfg, mid, y, z)) lo = mid; else hi = mid;
  }
  return lo;
}

// Largeur de la surface latérale à l'abscisse x et la hauteur y.
function sideSurfaceZ(cfg, x, y) {
  let lo = 0, hi = cfg.halfWidth(x) + 0.1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (insideSection(cfg, x, y, mid)) lo = mid; else hi = mid;
  }
  return lo;
}

// Hauteur de la surface supérieure à l'abscisse x et la largeur z.
function topSurfaceY(cfg, x, z) {
  const { yc, hy } = section(cfg, x);
  let lo = yc, hi = yc + hy + 0.05;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (insideSection(cfg, x, mid, z)) lo = mid; else hi = mid;
  }
  return lo;
}

// Panneau plaqué sur la carrosserie : pointAt(u, v) avec u, v ∈ [0, 1].
function surfacePanel(pointAt, cols, rows, material) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      const p = pointAt(j / cols, i / rows);
      pos.push(p.x, p.y, p.z);
      uv.push(j / cols, i / rows);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// Contour d'un panneau (pour les cadres chromés).
function panelOutline(pointAt, steps = 16) {
  const pts = [];
  for (let i = 0; i < steps; i++) pts.push(pointAt(i / steps, 1));
  for (let i = 0; i < steps; i++) pts.push(pointAt(1, 1 - i / steps));
  for (let i = 0; i < steps; i++) pts.push(pointAt(1 - i / steps, 0));
  for (let i = 0; i < steps; i++) pts.push(pointAt(0, i / steps));
  return pts;
}

function tube(points, radius, material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 3), radius, 8, closed), material);
}

const lerp = (a, b, t) => a + (b - a) * t;

// ── Formes ──

const BODY = {
  x0: -HALF_L, x1: HALF_L, slices: 220, ring: 72,
  boxiness: 3.8, tumble: 0.14, endY: 12, endZ: 3.2,
  top: (x) => {
    let y = spline([[-2.47, 0.68], [-2.3, 0.9], [-2.0, 0.98], [-1.5, 1.0], [-0.8, 0.975], [0, 0.96], [0.9, 0.94], [1.5, 0.885], [2.0, 0.82], [2.3, 0.76], [2.47, 0.66]], x);
    for (const cx of [-AXLE_X, AXLE_X]) y += 0.035 * Math.exp(-Math.pow((x - cx) / 0.5, 2));
    return y;
  },
  bottom: (x) => {
    // Passages de roue : la caisse remonte en arc au-dessus de chaque roue.
    let y = 0.17;
    for (const cx of [-AXLE_X, AXLE_X]) {
      const dx = x - cx, r = 0.56;
      if (Math.abs(dx) < r) y = Math.max(y, 0.17 + Math.sqrt(r * r - dx * dx));
    }
    return y;
  },
  halfWidth: (x) => {
    let w = 0.93 - 0.04 * Math.pow(Math.max(0, x / HALF_L), 2) - 0.03 * Math.pow(Math.max(0, -x / HALF_L), 2);
    for (const cx of [-AXLE_X, AXLE_X]) w += 0.025 * Math.exp(-Math.pow((x - cx) / 0.55, 2));
    return w;
  },
};

const CABIN = {
  x0: -1.9, x1: 1.15, slices: 160, ring: 64,
  boxiness: 3.6, tumble: 0.3, endY: 12, endZ: 4,
  top: (x) => spline([[-1.9, 0.99], [-1.6, 1.12], [-1.2, 1.35], [-0.7, 1.44], [-0.1, 1.46], [0.35, 1.41], [0.75, 1.2], [1.15, 0.95]], x),
  bottom: () => 0.86,
  halfWidth: () => 0.8,
};

// ── Textures ──

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Calandre « à pois » chromés.
function grilleTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 400;
  const g = c.getContext('2d');
  g.fillStyle = '#050507';
  g.fillRect(0, 0, c.width, c.height);
  const step = 30;
  for (let row = 0, y = step / 2; y < c.height; row++, y += step * 0.87) {
    for (let x = (row % 2 ? step : step / 2); x < c.width; x += step) {
      const grad = g.createRadialGradient(x - 3, y - 3, 1, x, y, 9);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#9a9aa2');
      grad.addColorStop(1, '#2a2a30');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ── Roues ──

// Rayon extérieur du pneu : il ne change pas avec la taille de jante, c'est
// le flanc qui s'amincit quand la jante grandit — comme en vrai.
const TIRE_OUTER = 0.351;

// Branche de jante : une barre qui part du moyeu vers le bord.
function branche(spin, mat, angle, { rayon, longueur, largeur, epaisseur = 0.024, z = 0.085, inclinaison = 0 }) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(longueur, largeur, epaisseur), mat);
  b.position.set(Math.cos(angle) * rayon, Math.sin(angle) * rayon, z);
  b.rotation.z = angle + inclinaison;
  spin.add(b);
}

function makeWheel(mats, design = 'origine', pouces = 19) {
  const wheel = new THREE.Group();
  const spin = new THREE.Group();
  wheel.add(spin);

  const rimR = 0.226 * pouces / 19;
  const k = rimR / 0.226;
  const flanc = (TIRE_OUTER - rimR) / 2 + 0.004;

  const tire = new THREE.Mesh(new THREE.TorusGeometry(TIRE_OUTER - flanc, flanc, 20, 64), mats.tire);
  tire.scale.z = 0.066 * 1.6 / flanc;
  spin.add(tire);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, 0.2, 56, 1, true), mats.rimDark);
  barrel.rotation.x = Math.PI / 2;
  spin.add(barrel);

  const face = new THREE.Mesh(new THREE.CircleGeometry(rimR, 56), mats.rimDark);
  face.position.z = 0.02;
  spin.add(face);

  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR, design === 'croisillons' ? 0.018 : 0.011, 8, 64), mats.chrome);
  lip.position.z = 0.1;
  spin.add(lip);

  const J = mats.jante;
  if (design === 'cinq') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      branche(spin, J, a, { rayon: rimR * 0.52, longueur: rimR * 0.92, largeur: 0.05 * k, epaisseur: 0.03 });
    }
  } else if (design === 'double') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      for (const d of [-0.11, 0.11]) branche(spin, J, a + d, { rayon: rimR * 0.52, longueur: rimR * 0.9, largeur: 0.02 * k });
    }
  } else if (design === 'croisillons') {
    // Jante « nid d'abeille » : deux rangs de barres croisées et un bord large.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      for (const inc of [0.55, -0.55]) branche(spin, J, a, { rayon: rimR * 0.62, longueur: rimR * 0.62, largeur: 0.012 * k, epaisseur: 0.02, inclinaison: inc });
    }
    const anneau = new THREE.Mesh(new THREE.TorusGeometry(rimR * 0.33, 0.01, 8, 40), J);
    anneau.position.z = 0.085;
    spin.add(anneau);
  } else if (design === 'turbine') {
    // Disque plein et ailettes inclinées, façon jante aérodynamique.
    const disque = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.94, 56), J);
    disque.position.z = 0.075;
    spin.add(disque);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      branche(spin, mats.rimDark, a, { rayon: rimR * 0.62, longueur: rimR * 0.5, largeur: 0.012 * k, epaisseur: 0.012, z: 0.08, inclinaison: 0.9 });
    }
  } else {
    // D'origine : multibranches fines légèrement vrillées.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      branche(spin, J, a, { rayon: 0.118 * k, longueur: 0.2 * k, largeur: 0.024, epaisseur: 0.022, inclinaison: 0.08 });
    }
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * k, 0.055 * k, 0.04, 32), J);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.09;
  spin.add(hub);

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.19 * k, 0.19 * k, 0.02, 40), mats.disc);
  disc.rotation.x = Math.PI / 2;
  spin.add(disc);

  // L'étrier ne tourne pas avec la roue.
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.08 * k, 0.17 * k, 0.06), mats.caliper);
  caliper.position.set(-0.16 * k, 0.06 * k, 0.03);
  caliper.rotation.z = 0.4;
  wheel.add(caliper);

  return { wheel, spin };
}

// Pose les quatre roues sur la voiture. `deport` élargit la voie (en mètres).
export function monterRoues(car, mats, { jante = 'origine', pouces = 19, deport = 0 } = {}) {
  const wheels = [], spinners = [];
  for (const x of [-AXLE_X, AXLE_X]) {
    for (const side of [1, -1]) {
      const { wheel, spin } = makeWheel(mats, jante, pouces);
      wheel.position.set(x, WHEEL_Y, side * (WHEEL_Z + deport));
      if (side < 0) wheel.scale.z = -1; // jante tournée vers l'extérieur
      car.add(wheel);
      wheels.push(wheel);
      spinners.push(spin);
    }
  }
  return { wheels, spinners };
}

// ── Voiture ──

export function buildCar(paint, envMap) {
  // La carrosserie vit dans son propre groupe : le garage la monte ou la
  // descend (hauteur de caisse) sans toucher aux roues.
  const car = new THREE.Group();
  const body = new THREE.Group();
  car.add(body);

  const mats = {
    paint,
    // Environnement explicite atténué : sinon le studio se reflète trop et les vitres paraissent grises.
    glass: new THREE.MeshPhysicalMaterial({ color: 0x020204, metalness: 0, roughness: 0.06, envMap, envMapIntensity: 0.35 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x08080b, metalness: 0.3, roughness: 0.35, clearcoat: 0.8, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 1, roughness: 0.12 }),
    grille: new THREE.MeshStandardMaterial({ map: grilleTexture(), metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }),
    tire: new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.88, metalness: 0 }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x1c1c22, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide }),
    machined: new THREE.MeshStandardMaterial({ color: 0xcfd0d6, metalness: 1, roughness: 0.2 }),
    jante: new THREE.MeshStandardMaterial({ color: 0xcfd0d6, metalness: 1, roughness: 0.2, side: THREE.DoubleSide }),
    carbone: new THREE.MeshPhysicalMaterial({ color: 0x141418, metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide }),
    disc: new THREE.MeshStandardMaterial({ color: 0x55555c, metalness: 0.9, roughness: 0.35 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0x6c6d74, metalness: 0.7, roughness: 0.35 }),
    led: new THREE.MeshBasicMaterial({ color: 0xf2f7ff, toneMapped: false }),
    tail: new THREE.MeshBasicMaterial({ color: 0xd0101f, toneMapped: false, side: THREE.DoubleSide }),
    tailLed: new THREE.MeshBasicMaterial({ color: 0xff3040, toneMapped: false }),
  };

  body.add(new THREE.Mesh(loftGeometry(BODY), mats.paint));
  body.add(new THREE.Mesh(loftGeometry(CABIN), mats.glass));

  const front = (y, z, off = 0.008) => new THREE.Vector3(endSurfaceX(BODY, y, z, 1) + off, y, z);
  const rear = (y, z, off = 0.008) => new THREE.Vector3(endSurfaceX(BODY, y, z, -1) - off, y, z);

  // ── Habitacle : toit et montants couleur carrosserie, vitres cerclées de chrome ──
  const ROOF_INSET = 0.07;
  body.add(surfacePanel((u, v) => {
    const x = lerp(-1.3, 0.45, u);
    const zEdge = sideSurfaceZ(CABIN, x, CABIN.top(x) - ROOF_INSET);
    const z = (2 * v - 1) * zEdge;
    return new THREE.Vector3(x, topSurfaceY(CABIN, x, z) + 0.005, z);
  }, 40, 16, mats.paint));

  for (const side of [1, -1]) {
    const onCabin = (x, y, off = 0) => new THREE.Vector3(x, y, side * (sideSurfaceZ(CABIN, x, y) + off));

    // Arête de toit qui descend en montants A (avant) et C (arrière).
    const rail = [];
    for (let i = 0; i <= 40; i++) {
      const x = lerp(-1.74, 1.04, i / 40);
      rail.push(onCabin(x, Math.max(CABIN.top(x) - ROOF_INSET, 0.99)));
    }
    body.add(tube(rail, 0.045, mats.paint));

    // Ceinture de caisse couleur carrosserie sous les vitres.
    const belt = [];
    for (let i = 0; i <= 30; i++) {
      const x = lerp(-1.86, 1.12, i / 30);
      belt.push(onCabin(x, 0.94));
    }
    body.add(tube(belt, 0.075, mats.paint));

    // Montant B.
    const bx = -0.28;
    body.add(tube([onCabin(bx, 1.02), onCabin(bx, 1.2), onCabin(bx, CABIN.top(bx) - ROOF_INSET)], 0.035, mats.paint));

    // Entourage chromé des vitres latérales.
    const winTop = (x) => CABIN.top(x) - 0.115;
    const loop = [];
    for (let i = 0; i <= 24; i++) {
      const x = lerp(0.86, -1.56, i / 24);
      loop.push(onCabin(x, Math.max(winTop(x), 1.035), 0.012));
    }
    for (let i = 1; i < 12; i++) loop.push(onCabin(lerp(-1.56, 0.86, i / 12), 1.035, 0.012));
    body.add(tube(loop, 0.011, mats.chrome, true));

    // Rétroviseur.
    const mirror = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mats.paint);
    shell.scale.set(0.1, 0.07, 0.13);
    mirror.add(shell);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.12), mats.black);
    arm.position.set(0.02, -0.05, -side * 0.09);
    mirror.add(arm);
    mirror.position.set(0.82, 1.06, side * (sideSurfaceZ(CABIN, 0.82, 1.0) + 0.15));
    body.add(mirror);

    // Poignées de porte.
    for (const hx of [0.32, -0.78]) {
      const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.11, 4, 12), mats.chrome);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(hx, 0.9, side * (sideSurfaceZ(BODY, hx, 0.9) + 0.008));
      body.add(handle);
    }

    // Jonc chromé de bas de caisse.
    const sill = [];
    for (let i = 0; i <= 12; i++) {
      const x = lerp(-0.9, 0.9, i / 12);
      sill.push(new THREE.Vector3(x, 0.26, side * (sideSurfaceZ(BODY, x, 0.26) + 0.008)));
    }
    body.add(tube(sill, 0.018, mats.chrome));
  }

  // ── Face avant ──
  const grilleAt = (u, v) => {
    const y = lerp(0.41, 0.66, v);
    const corner = Math.min((y - 0.41) / 0.06, (0.66 - y) / 0.06, 1);
    const hw = (0.4 + (0.66 - y) * 0.24) * (0.88 + 0.12 * Math.sin((corner * Math.PI) / 2));
    return front(y, (2 * u - 1) * hw);
  };
  body.add(surfacePanel(grilleAt, 32, 12, mats.grille));
  body.add(tube(panelOutline((u, v) => {
    const p = grilleAt(u, v);
    p.x += 0.01;
    return p;
  }), 0.02, mats.chrome, true));

  for (const side of [1, -1]) {
    // Optique : boîtier sombre effilé + ligne LED supérieure + deux projecteurs.
    const lampAt = (u, v, off = 0.01) => {
      const yc = 0.66 + 0.07 * u;
      const hh = 0.06 * (1 - 0.4 * u);
      return front(yc + (2 * v - 1) * hh, side * lerp(0.48, 0.76, u), off);
    };
    body.add(surfacePanel(lampAt, 20, 4, mats.black));
    const ledLine = [];
    for (let i = 0; i <= 14; i++) ledLine.push(lampAt(i / 14, 0.85, 0.02));
    body.add(tube(ledLine, 0.01, mats.led));
    for (const u of [0.22, 0.45]) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), mats.led);
      bulb.position.copy(lampAt(u, 0.35, 0.02));
      body.add(bulb);
    }

    // Prises d'air latérales cerclées de chrome.
    const intakeAt = (u, v) => {
      const y = lerp(0.21, 0.35, v);
      const hw = 0.11 + (0.35 - y) * 0.15;
      return front(y, side * (0.6 + (2 * u - 1) * hw));
    };
    body.add(surfacePanel(intakeAt, 12, 6, mats.black));
    body.add(tube(panelOutline((u, v) => {
      const p = intakeAt(u, v);
      p.x += 0.008;
      return p;
    }, 8), 0.013, mats.chrome, true));
  }

  // Prise d'air centrale basse et lame chromée.
  body.add(surfacePanel((u, v) => front(lerp(0.22, 0.33, v), (2 * u - 1) * 0.36), 12, 4, mats.black));
  const blade = [];
  for (let i = 0; i <= 16; i++) blade.push(front(0.19, lerp(-0.74, 0.74, i / 16), 0.012));
  body.add(tube(blade, 0.012, mats.chrome));

  // ── Face arrière ──
  for (const side of [1, -1]) {
    const tailAt = (u, v, off = 0.008) => {
      const yc = 0.86 - 0.025 * u;
      const hh = 0.04 * (1 - 0.35 * u);
      return rear(yc + (2 * v - 1) * hh, side * lerp(0.36, 0.78, u), off);
    };
    body.add(surfacePanel(tailAt, 20, 4, mats.tail));
    const line = [];
    for (let i = 0; i <= 14; i++) line.push(tailAt(i / 14, 0.9, 0.016));
    body.add(tube(line, 0.008, mats.tailLed));

    // Embouts d'échappement chromés intégrés au diffuseur.
    const exhaustAt = (u, v) => rear(lerp(0.25, 0.31, v), side * lerp(0.46, 0.66, u), 0.012);
    body.add(tube(panelOutline(exhaustAt, 6), 0.011, mats.chrome, true));
  }
  const trim = [];
  for (let i = 0; i <= 10; i++) trim.push(rear(0.86, lerp(-0.36, 0.36, i / 10), 0.012));
  body.add(tube(trim, 0.012, mats.chrome));
  body.add(surfacePanel((u, v) => rear(lerp(0.2, 0.34, v), (2 * u - 1) * 0.78), 16, 4, mats.black));

  // Pare-boue : sans eux, on voyait le sol à travers les passages de roue.
  // Plastique mat, arc un peu raccourci pour que ses extrémités restent
  // cachées derrière la carrosserie.
  const plastique = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  for (const x of [-AXLE_X, AXLE_X]) {
    for (const side of [1, -1]) {
      const pareBoue = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.34, 32, 1, true, -Math.PI / 2 + 0.2, Math.PI - 0.4), plastique);
      pareBoue.rotation.x = -Math.PI / 2; // demi-cylindre tourné vers le haut
      pareBoue.position.set(x, 0.17, side * 0.66);
      body.add(pareBoue);
      // Fond du passage de roue, côté intérieur : on ne voit plus à travers.
      const fond = new THREE.Mesh(new THREE.CircleGeometry(0.53, 32, 0, Math.PI), plastique);
      fond.position.set(x, 0.17, side * 0.49);
      body.add(fond);
    }
  }

  // ── Roues ──
  const { wheels, spinners } = monterRoues(car, mats);

  car.scale.setScalar(CAR_SCALE);
  return { car, body, wheels, spinners, mats };
}

// ── Pièces du garage ──
// Construites à part pour être remplacées à chaque changement. Elles se
// posent sur la carrosserie grâce aux mêmes fonctions de surface que les
// optiques et les chromes.
function barre(l, h, e, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(l, h, e), mat);
}

export function piecesGarage(mats, { aileron = 'aucun', kit = 'origine', echappement = 'origine' } = {}) {
  const g = new THREE.Group();

  if (aileron === 'becquet') {
    const x = -2.22;
    const y = BODY.top(x);
    const lame = barre(0.14, 0.022, 2 * sideSurfaceZ(BODY, x, y - 0.03) - 0.04, mats.paint);
    lame.position.set(x - 0.02, y + 0.02, 0);
    lame.rotation.z = -0.28;
    g.add(lame);
  } else if (aileron === 'gt') {
    const x = -1.98;
    const y = BODY.top(x);
    const haut = y + 0.3;
    for (const z of [-0.36, 0.36]) {
      const pied = barre(0.1, haut - y, 0.018, mats.carbone);
      pied.position.set(x, (y + haut) / 2, z);
      g.add(pied);
    }
    const aile = barre(0.34, 0.022, 1.72, mats.carbone);
    aile.position.set(x - 0.05, haut, 0);
    aile.rotation.z = -0.14;
    g.add(aile);
    for (const z of [-0.87, 0.87]) {
      const joue = barre(0.4, 0.15, 0.014, mats.carbone);
      joue.position.set(x - 0.05, haut - 0.03, z);
      g.add(joue);
    }
  }

  if (kit === 'sport') {
    const lame = barre(0.18, 0.018, 1.62, mats.carbone);
    lame.position.set(endSurfaceX(BODY, 0.19, 0, 1) - 0.06, 0.16, 0);
    g.add(lame);
    for (const side of [1, -1]) {
      const jupe = barre(1.78, 0.05, 0.03, mats.carbone);
      jupe.position.set(0, 0.2, side * (sideSurfaceZ(BODY, 0, 0.22) + 0.012));
      g.add(jupe);
    }
    // Diffuseur : ailettes glissées sous le pare-chocs, qui dépassent à peine.
    for (const z of [-0.42, -0.21, 0, 0.21, 0.42]) {
      const ailette = barre(0.3, 0.07, 0.012, mats.carbone);
      ailette.position.set(endSurfaceX(BODY, 0.3, z, -1) + 0.1, 0.15, z);
      g.add(ailette);
    }
  }

  // Embouts ronds : quatre en sport, deux gros au centre en racing.
  const embouts = echappement === 'sport'
    ? [[0.5, 0.26, 0.04], [0.61, 0.26, 0.04], [-0.5, 0.26, 0.04], [-0.61, 0.26, 0.04]]
    : echappement === 'racing' ? [[0.12, 0.24, 0.058], [-0.12, 0.24, 0.058]] : [];
  for (const [z, y, r] of embouts) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 0.14, 28, 1, true), mats.chrome);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(endSurfaceX(BODY, y, z, -1) - 0.02, y, z);
    g.add(tube);
    const fond = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 24), mats.black);
    fond.rotation.y = -Math.PI / 2;
    fond.position.set(tube.position.x + 0.02, y, z);
    g.add(fond);
  }
  return g;
}

// ── Habillage ──
// Applique une configuration du garage à une voiture déjà construite. Le
// garage et le showroom de l'accueil passent tous deux par ici : la voiture
// « mise à l'accueil » est donc exactement celle qu'on a préparée.
// Peinture et hauteur de caisse restent à l'appelant, qui les anime en fondu.
// `v` = { car, body, mats, wheels, spinners, pieces } ; `cles` limite le
// travail aux réglages qui ont changé.
function jeter(objet) {
  objet?.traverse?.((o) => { if (o.geometry) o.geometry.dispose(); });
}

export function habillerVoiture(v, cfg, { cles = null, intensiteFeux = 1 } = {}) {
  const a = (...k) => !cles || k.some(x => cles.includes(x));
  const { mats } = v;
  if (a('jante', 'pouces', 'deport')) {
    for (const w of v.wheels) { v.car.remove(w); jeter(w); }
    const r = monterRoues(v.car, mats, { jante: cfg.jante, pouces: cfg.pouces, deport: cfg.deport / 100 });
    v.wheels = r.wheels;
    v.spinners = r.spinners;
  }
  if (a('couleurJante')) {
    const c = COULEURS_JANTE.find(x => x.id === cfg.couleurJante);
    mats.jante.color.set(c.hex); mats.jante.metalness = c.metal; mats.jante.roughness = c.rugosite;
  }
  if (a('etriers')) mats.caliper.color.set(ETRIERS.find(x => x.id === cfg.etriers).hex);
  if (a('feux')) mats.led.color.set(FEUX.find(x => x.id === cfg.feux).hex).multiplyScalar(intensiteFeux);
  if (a('chromes')) {
    const noir = cfg.chromes === 'noir';
    mats.chrome.color.set(noir ? 0x17171b : 0xe8e8ee);
    mats.chrome.metalness = noir ? 0.6 : 1;
    mats.chrome.roughness = noir ? 0.28 : 0.12;
  }
  if (a('aileron', 'kit', 'echappement')) {
    if (v.pieces) { v.body.remove(v.pieces); jeter(v.pieces); }
    v.pieces = piecesGarage(mats, cfg);
    v.body.add(v.pieces);
  }
  return v;
}

// Voiture choisie dans le garage pour l'accueil, ou null.
export function lireVoitureAccueil() {
  try {
    const brut = localStorage.getItem(CLE_ACCUEIL);
    return brut ? normaliserConfig(JSON.parse(brut)) : null;
  } catch { return null; }
}

// ── Showroom ──

export function buildStage() {
  const stage = new THREE.Group();

  // Le showroom lit les mêmes jetons que la feuille de style : --stage-light
  // dit si la scène est posée sur du clair, --accent donne la couleur de
  // l'anneau. Sans cela, l'ombre noire à 95 %, le sol brun et le halo doré —
  // pensés pour un fond nocturne — faisaient une tache sur du papier.
  const css = getComputedStyle(document.documentElement);
  const clair = css.getPropertyValue('--stage-light').trim() === '1';
  const accent = css.getPropertyValue('--accent').trim() || '#d4a843';
  const rgb = (hex) => {
    const h = hex.replace('#', '').trim();
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) || 0).join(',');
  };
  const accentRgb = rgb(accent);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 96),
    // Sol non éclairé : un matériau PBR renvoyait l'éclairage studio en reflet gris à angle rasant.
    new THREE.MeshBasicMaterial({
      map: radialTexture(clair
        ? [[0, '#e9e9e3'], [0.35, '#efefe9'], [0.7, '#f6f6f2'], [1, '#fbfbf8']]
        : [[0, '#5a4520'], [0.35, '#2e2413'], [0.7, '#0c0b0e'], [1, '#08080d']]),
      transparent: true,
      alphaMap: radialTexture([[0, '#ffffff'], [0.62, '#ffffff'], [1, '#000000']]),
    })
  );
  floor.rotation.x = -Math.PI / 2;
  stage.add(floor);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.9, 2.7),
    new THREE.MeshBasicMaterial({
      // Sur du papier, une ombre portée reste discrète : 26 % au lieu de 95 %.
      map: radialTexture(clair
        ? [[0, 'rgba(0,0,0,0.26)'], [0.5, 'rgba(0,0,0,0.15)'], [1, 'rgba(0,0,0,0)']]
        : [[0, 'rgba(0,0,0,0.95)'], [0.5, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  stage.add(shadow);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.02, 3.06, 160),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: clair ? 0.55 : 0.85, toneMapped: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  stage.add(ring);

  // Le halo additif n'a de sens que sur fond sombre : additionner de la
  // lumière à du blanc ne produit rien de visible.
  if (!clair) {
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 160),
      new THREE.MeshBasicMaterial({
        map: radialTexture([[0, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,0)'], [0.84, `rgba(${accentRgb},0.16)`], [1, 'rgba(0,0,0,0)']]),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.004;
    stage.add(halo);
  }

  return { stage, ring, shadow };
}

// ── Montage ──

export function mountHero3D(container) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  // Même tone mapping que le garage : la voiture « mise à l'accueil » doit
  // garder sa teinte (ACES délavait les jaunes et virait les rouges).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'hero-3d-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 7, 3);
  scene.add(key);
  const cssRoot = getComputedStyle(document.documentElement);
  const scLight = cssRoot.getPropertyValue('--stage-light').trim() === '1';
  const rimColor = new THREE.Color(cssRoot.getPropertyValue('--accent2').trim() || '#f0c96a');
  const rim = new THREE.DirectionalLight(rimColor, scLight ? 1.1 : 2.2);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  const firstSwatch = container.querySelector('[data-paint]');
  const perso = lireVoitureAccueil();
  const startColor = perso ? perso.peinture : (firstSwatch ? firstSwatch.dataset.paint : '#3c3d42');
  const startFinish = { ...(perso ? FINISHES[perso.finition] : FINISHES[firstSwatch?.dataset.finish]) || FINISHES.matte };
  // DoubleSide : la peinture sert aussi aux panneaux plaqués (toit), dont l'orientation varie.
  const paint = new THREE.MeshPhysicalMaterial({ color: startColor, side: THREE.DoubleSide, ...startFinish });
  const targetColor = new THREE.Color(startColor);
  const targetFinish = { ...startFinish };

  const voiture = buildCar(paint, scene.environment);
  const { car } = voiture;
  voiture.pieces = null;
  let hauteurCible = 0;
  const { stage, ring } = buildStage();
  scene.add(stage, car);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 0.55, 0);
  // Départ légèrement en arrière du profil : l'auto-rotation passe ensuite par le profil puis le trois-quarts avant.
  const finalDir = new THREE.Vector3(-0.25, 0.2, 1).normalize();
  let camDistance = 9;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7;
  controls.minPolarAngle = 0.95;
  controls.maxPolarAngle = 1.45;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 1.1;
  // Laisse le défilement vertical de la page fonctionner au doigt sur le canvas.
  renderer.domElement.style.touchAction = 'pan-y';

  const hint = container.querySelector('.hero-3d-hint');
  controls.addEventListener('start', () => hint && hint.classList.add('hidden'));

  // Sélecteur de couleur / finition
  const pastilles = container.querySelectorAll('[data-paint]');
  pastilles.forEach((btn) => {
    btn.addEventListener('click', () => {
      targetColor.set(btn.dataset.paint);
      Object.assign(targetFinish, FINISHES[btn.dataset.finish] || FINISHES.gloss);
      pastilles.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  // Voiture du garage : habillage complet, ou retour à celle d'origine.
  // Le garage prévient par un événement quand on y clique sur « Mettre à
  // l'accueil » : pas besoin de recharger la page.
  const retour = container.querySelector('.hero-3d-origine');
  function porter(cfg) {
    const base = cfg || normaliserConfig(null);
    habillerVoiture(voiture, base);
    hauteurCible = base.hauteur / 100;
    if (cfg) {
      targetColor.set(cfg.peinture);
      Object.assign(targetFinish, FINISHES[cfg.finition] || FINISHES.gloss);
      pastilles.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.paint === cfg.peinture)));
    } else if (firstSwatch) {
      firstSwatch.click();
    }
    if (retour) retour.hidden = !cfg;
  }
  porter(perso);
  voiture.body.position.y = hauteurCible;
  window.addEventListener('autospec:voiture-accueil', (e) => porter(e.detail));
  retour?.addEventListener('click', () => {
    try { localStorage.removeItem(CLE_ACCUEIL); } catch { /* rien à retirer */ }
    porter(null);
  });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Recule la caméra sur les formats étroits pour garder la voiture entière.
    const aspect = w / h;
    camDistance = aspect < 1.25 ? 11 : aspect < 1.6 ? 9.2 : aspect < 2.2 ? 8.1 : 7.1;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // Arrivée caméra : léger travelling avant à l'apparition.
  const introStart = performance.now();
  const INTRO_MS = reducedMotion ? 0 : 1600;
  camera.position.copy(target).addScaledVector(finalDir, camDistance * 1.6);
  controls.enabled = false;

  const clock = new THREE.Clock();
  let visible = false;
  let rafId = null;
  let firstFrame = true;

  function frame(now) {
    rafId = null;
    const dt = Math.min(clock.getDelta(), 0.05);

    const p = INTRO_MS ? Math.min((now - introStart) / INTRO_MS, 1) : 1;
    if (p < 1) {
      const ease = 1 - Math.pow(1 - p, 3);
      const orbit = (1 - ease) * 0.9;
      const dir = finalDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
      camera.position.copy(target).addScaledVector(dir, camDistance * (1.6 - 0.6 * ease));
      camera.lookAt(target);
    } else {
      if (!controls.enabled) controls.enabled = true;
      // Garde la distance voulue (changement de format pendant la rotation).
      const offset = camera.position.clone().sub(target);
      offset.setLength(THREE.MathUtils.damp(offset.length(), camDistance, 6, dt));
      camera.position.copy(target).add(offset);
      controls.update(dt);
    }

    const k = 1 - Math.exp(-dt * 5);
    paint.color.lerp(targetColor, k);
    voiture.body.position.y += (hauteurCible - voiture.body.position.y) * k;
    for (const prop of Object.keys(targetFinish)) paint[prop] = lerp(paint[prop], targetFinish[prop], k);

    if (!reducedMotion) {
      for (const s of voiture.spinners) s.rotation.z -= dt * 2.2;
      ring.material.opacity = 0.65 + 0.2 * Math.sin(now / 900);
    }

    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      container.classList.add('ready');
    }
    if (visible && !document.hidden) rafId = requestAnimationFrame(frame);
  }

  function setRunning() {
    const shouldRun = visible && !document.hidden;
    if (shouldRun && rafId === null) {
      clock.getDelta();
      rafId = requestAnimationFrame(frame);
    } else if (!shouldRun && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // Ne calcule rien quand le showroom est hors écran, sur une autre page ou dans un onglet caché.
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    setRunning();
  }).observe(container);
  document.addEventListener('visibilitychange', setRunning);
}
