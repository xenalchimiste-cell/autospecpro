// ── SHOWROOM 3D (page d'accueil) ──
// Voiture de sport stylisée entièrement générée en code (aucun modèle externe) :
// la carrosserie et l'habitacle sont des surfaces « lissées » faites de sections
// superellipses le long de l'axe de la voiture. Chargé à la demande par index.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const HALF_L = 2.25;          // demi-longueur de la voiture (m)
const AXLE_X = 1.35;          // position des essieux
const WHEEL_Y = 0.35;         // hauteur du centre des roues
const WHEEL_Z = 0.8;          // voie (demi)

export const PAINTS = [
  { name: 'Or', color: '#c9a043' },
  { name: 'Noir', color: '#111118' },
  { name: 'Rouge', color: '#a8101f' },
  { name: 'Bleu', color: '#1d4aa0' },
  { name: 'Blanc', color: '#e6e4de' },
];

// ── Géométrie ──

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
  let k = 0;
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

// Point de la surface avant (dir = 1) ou arrière (dir = -1) à la hauteur y / largeur z.
function endSurfaceX(cfg, y, z, dir) {
  // On avance depuis le bout de la voiture jusqu'à entrer dans la carrosserie…
  const end = dir > 0 ? cfg.x1 : cfg.x0;
  let lo = end - dir * 1.2, hi = end;
  for (let x = end; Math.abs(x - end) < 1.2; x -= dir * 0.01) {
    if (insideSection(cfg, x, y, z)) { lo = x; hi = x + dir * 0.01; break; }
  }
  // …puis on affine la frontière par dichotomie.
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (insideSection(cfg, mid, y, z)) lo = mid; else hi = mid;
  }
  return lo;
}

// Point de la surface latérale à l'abscisse x et la hauteur y.
function sideSurfaceZ(cfg, x, y) {
  let lo = 0, hi = cfg.halfWidth(x) + 0.1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (insideSection(cfg, x, y, mid)) lo = mid; else hi = mid;
  }
  return lo;
}

// Bande lumineuse (tube) plaquée sur l'avant ou l'arrière de la carrosserie.
function endStrip(cfg, dir, samples, radius, material) {
  const pts = samples.map(([y, z]) => new THREE.Vector3(endSurfaceX(cfg, y, z, dir) + dir * radius * 0.6, y, z));
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 48, radius, 10, false), material);
}

const BODY = {
  x0: -HALF_L, x1: HALF_L, slices: 200, ring: 72,
  boxiness: 3.6, tumble: 0.16, endY: 9, endZ: 3.4,
  top: (x) => {
    let y = spline([[-2.25, 0.6], [-2.05, 0.8], [-1.7, 0.84], [-1.0, 0.8], [0, 0.77], [0.8, 0.73], [1.4, 0.68], [1.95, 0.58], [2.25, 0.46]], x);
    for (const cx of [-AXLE_X, AXLE_X]) y += 0.09 * Math.exp(-Math.pow((x - cx) / 0.5, 2)); // ailes musclées
    return y;
  },
  bottom: (x) => {
    // Passages de roue : la caisse remonte en arc au-dessus de chaque roue.
    let y = 0.21;
    for (const cx of [-AXLE_X, AXLE_X]) {
      const dx = x - cx, r = 0.5;
      if (Math.abs(dx) < r) y = Math.max(y, 0.21 + Math.sqrt(r * r - dx * dx));
    }
    return y;
  },
  halfWidth: (x) => {
    let w = 0.9 - 0.05 * Math.pow(Math.max(0, x / HALF_L), 2);
    for (const cx of [-AXLE_X, AXLE_X]) w += 0.05 * Math.exp(-Math.pow((x - cx) / 0.55, 2)); // ailes galbées
    return w;
  },
};

const CABIN = {
  x0: -1.85, x1: 1.0, slices: 140, ring: 56,
  boxiness: 3.4, tumble: 0.42, endY: 10, endZ: 2.6,
  top: (x) => spline([[-1.85, 0.8], [-1.35, 0.93], [-0.8, 1.1], [-0.3, 1.17], [0.1, 1.15], [0.55, 0.98], [1.0, 0.76]], x),
  bottom: () => 0.68,
  halfWidth: () => 0.66,
};

function makeWheel(mats) {
  const wheel = new THREE.Group();
  const spin = new THREE.Group();
  wheel.add(spin);

  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.09, 20, 56), mats.tire);
  tire.scale.z = 1.35;
  spin.add(tire);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.2, 48, 1, true), mats.rimInner);
  barrel.rotation.x = Math.PI / 2;
  spin.add(barrel);

  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.012, 8, 56), mats.rim);
  lip.position.z = 0.1;
  spin.add(lip);

  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.036, 0.025), mats.rim);
    const a = (i / 5) * Math.PI * 2;
    spoke.position.set(Math.cos(a) * 0.105, Math.sin(a) * 0.105, 0.085);
    spoke.rotation.z = a;
    spin.add(spoke);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 24), mats.rim);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.09;
  spin.add(cap);

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 40), mats.disc);
  disc.rotation.x = Math.PI / 2;
  disc.position.z = 0.02;
  spin.add(disc);

  // L'étrier ne tourne pas avec la roue.
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.06), mats.caliper);
  caliper.position.set(-0.14, 0.06, 0.045);
  caliper.rotation.z = 0.4;
  wheel.add(caliper);

  return { wheel, spin };
}

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

function buildCar(paint) {
  const car = new THREE.Group();

  const mats = {
    paint,
    glass: new THREE.MeshPhysicalMaterial({ color: 0x07070c, metalness: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x0b0b10, metalness: 0.3, roughness: 0.45, clearcoat: 0.6 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.85, metalness: 0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 1, roughness: 0.22 }),
    rimInner: new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.8, roughness: 0.5, side: THREE.DoubleSide }),
    disc: new THREE.MeshStandardMaterial({ color: 0x55555c, metalness: 0.9, roughness: 0.35 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xd4a843, metalness: 0.4, roughness: 0.35 }),
    headlight: new THREE.MeshBasicMaterial({ color: 0xeaf4ff, toneMapped: false }),
    taillight: new THREE.MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false }),
  };

  car.add(new THREE.Mesh(loftGeometry(BODY), mats.paint));
  car.add(new THREE.Mesh(loftGeometry(CABIN), mats.glass));

  // Feux avant : deux fines signatures LED qui remontent vers l'extérieur.
  for (const side of [1, -1]) {
    const samples = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      samples.push([0.44 + 0.06 * t * t, side * (0.3 + 0.36 * t)]);
    }
    car.add(endStrip(BODY, 1, samples, 0.018, mats.headlight));
  }

  // Bandeau arrière traversant.
  const tail = [];
  for (let i = 0; i <= 16; i++) {
    const z = -0.7 + (1.4 * i) / 16;
    tail.push([0.7 - 0.03 * Math.pow(Math.abs(z) / 0.7, 2), z]);
  }
  car.add(endStrip(BODY, -1, tail, 0.02, mats.taillight));

  // Prise d'air avant et diffuseur arrière.
  const intake = [];
  for (let i = 0; i <= 12; i++) intake.push([0.3, -0.55 + (1.1 * i) / 12]);
  car.add(endStrip(BODY, 1, intake, 0.05, mats.black));
  const diffuser = [];
  for (let i = 0; i <= 12; i++) diffuser.push([0.32, -0.6 + (1.2 * i) / 12]);
  car.add(endStrip(BODY, -1, diffuser, 0.055, mats.black));

  // Bas de caisse noirs entre les roues : affinent visuellement la silhouette.
  for (const side of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const x = -0.84 + (1.68 * i) / 10;
      pts.push(new THREE.Vector3(x, 0.27, side * (sideSurfaceZ(BODY, x, 0.27) + 0.01)));
    }
    const sill = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.05, 10, false), mats.black);
    sill.scale.y = 0.7;
    sill.position.y = 0.08;
    car.add(sill);
  }

  const spinners = [];
  for (const x of [-AXLE_X, AXLE_X]) {
    for (const side of [1, -1]) {
      const { wheel, spin } = makeWheel(mats);
      wheel.position.set(x, WHEEL_Y, side * WHEEL_Z);
      if (side < 0) wheel.scale.z = -1; // jante tournée vers l'extérieur
      car.add(wheel);
      spinners.push(spin);
    }
  }

  return { car, spinners };
}

function buildStage() {
  const stage = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 96),
    // Sol non éclairé : un matériau PBR renvoyait l'éclairage studio en reflet gris à angle rasant.
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, '#5a4520'], [0.35, '#2e2413'], [0.7, '#0c0b0e'], [1, '#08080d']]),
      transparent: true,
      alphaMap: radialTexture([[0, '#ffffff'], [0.62, '#ffffff'], [1, '#000000']]),
    })
  );
  floor.rotation.x = -Math.PI / 2;
  stage.add(floor);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 2.6),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(0,0,0,0.95)'], [0.5, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  stage.add(shadow);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.02, 3.06, 160),
    new THREE.MeshBasicMaterial({ color: 0xf0c96a, transparent: true, opacity: 0.85, toneMapped: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  stage.add(ring);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 160),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,0)'], [0.84, 'rgba(212,168,67,0.16)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.004;
  stage.add(halo);

  return { stage, ring };
}

// ── Montage ──

export function mountHero3D(container) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'hero-3d-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 7, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xf0c96a, 2.2);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  const paint = new THREE.MeshPhysicalMaterial({
    color: PAINTS[0].color, metalness: 0.6, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.03,
  });
  const targetColor = new THREE.Color(PAINTS[0].color);

  const { car, spinners } = buildCar(paint);
  const { stage, ring } = buildStage();
  scene.add(stage, car);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 0.5, 0);
  const finalDir = new THREE.Vector3(0.45, 0.24, 1).normalize(); // trois-quarts avant
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

  // Sélecteur de couleur
  container.querySelectorAll('[data-paint]').forEach((btn) => {
    btn.addEventListener('click', () => {
      targetColor.set(btn.dataset.paint);
      container.querySelectorAll('[data-paint]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Recule la caméra sur les formats étroits pour garder la voiture entière.
    const aspect = w / h;
    camDistance = aspect < 1.25 ? 10.5 : aspect < 1.6 ? 8.6 : aspect < 2.2 ? 7.6 : 6.6;
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
      if (!controls.enabled) {
        controls.enabled = true;
      }
      // Garde la distance voulue (changement de format pendant la rotation).
      const offset = camera.position.clone().sub(target);
      offset.setLength(THREE.MathUtils.damp(offset.length(), camDistance, 6, dt));
      camera.position.copy(target).add(offset);
      controls.update(dt);
    }

    paint.color.lerp(targetColor, 1 - Math.exp(-dt * 5));
    if (!reducedMotion) {
      for (const s of spinners) s.rotation.z -= dt * 2.2;
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
