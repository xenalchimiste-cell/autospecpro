// ── RENDU « STUDIO » DU GARAGE ──
// Ce qui fait passer la voiture de maquette à photo de configurateur :
//  • un studio photo en guise d'environnement : plafonnier et longues
//    bandes lumineuses dont les reflets dessinent les volumes de la caisse ;
//  • une ombre de contact, calculée par le dessous, qui pose la voiture au sol ;
//  • une occlusion ambiante (GTAO) qui assombrit creux, passages de roue et
//    jointures, et un léger halo sur les phares ;
//  • des paillettes sous le vernis pour les teintes métallisées et nacrées.
// L'occlusion ambiante est réservée aux appareils qui peuvent se la permettre.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

// Écran tactile ou petit processeur : on garde le studio et l'ombre, on
// renonce à l'occlusion ambiante, de loin la passe la plus coûteuse.
export const HAUTE_QUALITE = !window.matchMedia('(pointer: coarse)').matches && (navigator.hardwareConcurrency || 4) >= 4;

// ── STUDIO ──
function panneau(scene, l, h, intensite, position, regard) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(intensite), side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(l, h), mat);
  m.position.set(...position);
  m.lookAt(...regard);
  scene.add(m);
}

export function environnementStudio(renderer) {
  const studio = new THREE.Scene();
  // Murs gris clair et sol plus sombre : la ligne d'horizon qui se reflète
  // sur le bas de caisse est ce qui fait lire la courbure des flancs.
  const murs = new THREE.Mesh(
    new THREE.BoxGeometry(24, 12, 24),
    new THREE.MeshBasicMaterial({ color: 0x6a6a66, side: THREE.BackSide })
  );
  murs.position.y = 5;
  studio.add(murs);
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshBasicMaterial({ color: 0x262626 }));
  sol.rotation.x = -Math.PI / 2;
  sol.position.y = -0.99;
  studio.add(sol);

  panneau(studio, 9, 4, 7, [0, 9, 0], [0, 0, 0]);          // plafonnier
  panneau(studio, 16, 0.7, 12, [0, 3.2, 8], [0, 2.4, 0]);   // bande latérale droite
  panneau(studio, 16, 0.7, 12, [0, 3.2, -8], [0, 2.4, 0]);  // bande latérale gauche
  panneau(studio, 5, 3, 3, [10, 3, 0], [0, 1, 0]);          // face avant
  panneau(studio, 5, 3, 2, [-10, 3, 0], [0, 1, 0]);         // face arrière
  panneau(studio, 3, 6, 2.5, [6, 4, 7], [0, 1, 0]);         // lumière d'appoint en trois-quarts

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(studio, 0.02).texture;
  pmrem.dispose();
  studio.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

// ── PAILLETTES ──
// Carte de normales bruitée : chaque pixel est une paillette orientée au
// hasard. Seule la couche de base la reçoit, le vernis reste lisse.
export function textureParticules() {
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    img.data[i * 4] = 128 + (Math.random() * 2 - 1) * 90;
    img.data[i * 4 + 1] = 128 + (Math.random() * 2 - 1) * 90;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

// ── OMBRE DE CONTACT ──
// Une caméra orthographique regarde la voiture par en dessous et n'en garde
// que la profondeur : plus une pièce est proche du sol, plus son ombre est
// dense. Deux passes de flou la rendent douce. Méthode de l'exemple
// « webgl_shadow_contact » de Three.js.
export function creerOmbreContact(renderer, scene, { largeur = 6.2, profondeur = 3.2, hauteur = 1.4, resolution = 512, opacite = 0.85, flou = 2.2 } = {}) {
  const groupe = new THREE.Group();
  groupe.position.y = 0.002;
  const rt = new THREE.WebGLRenderTarget(resolution, resolution);
  rt.texture.generateMipmaps = false;
  const rtFlou = new THREE.WebGLRenderTarget(resolution, resolution);
  rtFlou.texture.generateMipmaps = false;

  const geo = new THREE.PlaneGeometry(largeur, profondeur).rotateX(Math.PI / 2);
  const plan = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: rt.texture, opacity: opacite, transparent: true, depthWrite: false }));
  plan.renderOrder = 1;
  plan.scale.y = -1;
  groupe.add(plan);
  const planFlou = new THREE.Mesh(geo);
  planFlou.visible = false;
  groupe.add(planFlou);

  const camera = new THREE.OrthographicCamera(-largeur / 2, largeur / 2, profondeur / 2, -profondeur / 2, 0, hauteur);
  camera.rotation.x = Math.PI / 2;
  groupe.add(camera);

  const profondeurMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  profondeurMat.userData.obscurite = { value: 1.4 };
  profondeurMat.onBeforeCompile = (shader) => {
    shader.uniforms.obscurite = profondeurMat.userData.obscurite;
    shader.fragmentShader = 'uniform float obscurite;\n' + shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * obscurite );'
    );
  };
  profondeurMat.depthTest = false;
  profondeurMat.depthWrite = false;

  const flouH = new THREE.ShaderMaterial(HorizontalBlurShader); flouH.depthTest = false;
  const flouV = new THREE.ShaderMaterial(VerticalBlurShader); flouV.depthTest = false;

  function flouter(quantite) {
    planFlou.visible = true;
    planFlou.material = flouH;
    flouH.uniforms.tDiffuse.value = rt.texture;
    flouH.uniforms.h.value = quantite / 256;
    renderer.setRenderTarget(rtFlou);
    renderer.render(planFlou, camera);
    planFlou.material = flouV;
    flouV.uniforms.tDiffuse.value = rtFlou.texture;
    flouV.uniforms.v.value = quantite / 256;
    renderer.setRenderTarget(rt);
    renderer.render(planFlou, camera);
    planFlou.visible = false;
  }

  // `masquer` : ce qui ne doit pas projeter d'ombre (le sol du studio).
  function maj(masquer = []) {
    const fond = scene.background;
    const alpha = renderer.getClearAlpha();
    const visibles = masquer.map(o => o.visible);
    scene.background = null;
    masquer.forEach(o => { o.visible = false; });
    plan.visible = false;
    renderer.setClearAlpha(0);
    scene.overrideMaterial = profondeurMat;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    flouter(flou);
    flouter(flou * 0.4);
    renderer.setRenderTarget(null);
    renderer.setClearAlpha(alpha);
    masquer.forEach((o, i) => { o.visible = visibles[i]; });
    plan.visible = true;
    scene.background = fond;
  }

  return { groupe, maj };
}

// ── POST-TRAITEMENT ──
export function creerComposition(renderer, scene, camera) {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  let gtao = null;
  if (HAUTE_QUALITE) {
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
  }
  // Seuil très haut : seuls les phares, poussés au-delà, débordent. Plus
  // bas, les reflets du studio sur le toit noyaient la voiture dans un voile.
  const halo = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.3, 2.5);
  composer.addPass(halo);
  composer.addPass(new OutputPass());

  return {
    rendre: (dt) => composer.render(dt),
    taille(l, h, ratio) {
      composer.setPixelRatio(ratio);
      composer.setSize(l, h);
    },
  };
}
