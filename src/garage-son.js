// ── GARAGE : SON MOTEUR ──
// Le son est synthétisé en direct avec la Web Audio API, sans aucun
// enregistrement. Un moteur 4 temps allume chacun de ses cylindres une fois
// tous les deux tours : on construit donc une onde dont la fondamentale est
// le cycle complet (régime / 120 Hz) et dont les harmoniques dominantes
// tombent sur la fréquence d'allumage (cyl × cycle). Les harmoniques
// intermédiaires donnent le caractère — c'est le « glouglou » d'un V8 à
// vilebrequin croisé, presque absent d'un 6 en ligne.

const ECHAPPEMENT = {
  origine: { drive: 1.6, coupure: 450,  ouverture: 1600, souffle: 0.12, volume: 0.55, petarades: 0 },
  sport:   { drive: 3.2, coupure: 700,  ouverture: 3200, souffle: 0.2,  volume: 0.72, petarades: 0.45 },
  racing:  { drive: 6,   coupure: 1000, ouverture: 6200, souffle: 0.3,  volume: 0.85, petarades: 1 },
};

// Pseudo-aléatoire stable : un même moteur sonne toujours pareil.
function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function spectre(ctx, moteur) {
  const N = 64;
  const reel = new Float32Array(N + 1), imag = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) {
    const allumage = k % moteur.cyl === 0 ? 1 / Math.pow(k / moteur.cyl, 0.75) : 0;
    const caractere = moteur.irregularite * (0.4 + hash(k + moteur.cyl * 7)) * Math.exp(-k / (moteur.cyl * 2.5));
    const a = allumage + caractere;
    const phase = hash(k * 3.1 + moteur.cyl) * Math.PI * 2;
    reel[k] = a * Math.cos(phase);
    imag[k] = a * Math.sin(phase);
  }
  return ctx.createPeriodicWave(reel, imag);
}

function courbeSaturation(drive) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return c;
}

function bruitBlanc(ctx, secondes) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secondes), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function creerMoteurSonore() {
  let ctx = null, sortie = null, volumeGeneral = 0.6;
  let chaine = null;          // nœuds du moteur en cours
  let moteur = null, echap = ECHAPPEMENT.origine;
  let etat = 'arret';         // arret | demarrage | marche | extinction
  let regime = 0, gaz = 0, gazLisse = 0, pression = 0;
  let tDemarrage = 0, coupureRupteur = 0;
  let boucle = null, ecouteurs = new Set();

  function contexte() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      sortie = ctx.createGain();
      sortie.gain.value = volumeGeneral;
      comp.connect(sortie).connect(ctx.destination);
      sortie.entree = comp;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function construireChaine() {
    const c = contexte();
    const t = c.currentTime;
    const n = {};
    const electrique = moteur.cyl === 0;

    n.filtre = c.createBiquadFilter();
    n.filtre.type = 'lowpass';
    n.filtre.Q.value = 0.9;
    n.sat = c.createWaveShaper();
    n.sat.curve = courbeSaturation(electrique ? 1 : echap.drive);
    n.sat.oversample = '2x';
    n.niveau = c.createGain();
    n.niveau.gain.value = 0;
    n.sat.connect(n.filtre).connect(n.niveau).connect(sortie.entree);

    if (electrique) {
      // Sifflement du moteur électrique et de son réducteur.
      n.osc = c.createOscillator(); n.osc.type = 'sine';
      n.osc2 = c.createOscillator(); n.osc2.type = 'triangle';
      n.g2 = c.createGain(); n.g2.gain.value = 0.25;
      n.osc.connect(n.sat);
      n.osc2.connect(n.g2).connect(n.sat);
      n.osc.start(t); n.osc2.start(t);
    } else {
      n.osc = c.createOscillator();
      n.osc.setPeriodicWave(spectre(c, moteur));
      n.gMoteur = c.createGain(); n.gMoteur.gain.value = 0.5;
      n.osc.connect(n.gMoteur).connect(n.sat);
      n.osc.start(t);
    }

    // Souffle d'admission et d'échappement, qui grossit avec les gaz.
    n.bruit = c.createBufferSource();
    n.bruit.buffer = bruitBlanc(c, 2);
    n.bruit.loop = true;
    n.bande = c.createBiquadFilter(); n.bande.type = 'bandpass'; n.bande.Q.value = 0.8;
    n.gBruit = c.createGain(); n.gBruit.gain.value = 0;
    n.bruit.connect(n.bande).connect(n.gBruit).connect(n.sat);
    n.bruit.start(t);

    if (moteur.turbo) {
      n.turbo = c.createOscillator(); n.turbo.type = 'sine';
      n.gTurbo = c.createGain(); n.gTurbo.gain.value = 0;
      n.turbo.connect(n.gTurbo).connect(sortie.entree);
      n.turbo.start(t);
    }
    return n;
  }

  function detruireChaine() {
    if (!chaine) return;
    const n = chaine;
    chaine = null;
    const t = ctx.currentTime;
    n.niveau.gain.cancelScheduledValues(t);
    n.niveau.gain.setTargetAtTime(0, t, 0.05);
    if (n.gTurbo) n.gTurbo.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      for (const s of [n.osc, n.osc2, n.bruit, n.turbo]) { try { s?.stop(); } catch { /* déjà arrêté */ } }
      for (const x of Object.values(n)) { try { x.disconnect?.(); } catch { /* rien */ } }
    }, 400);
  }

  // Bref souffle filtré : décharge du turbo ou pétarade.
  function rafale(frequence, duree, volume, type = 'bandpass') {
    const c = ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = bruitBlanc(c, duree + 0.05);
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = frequence; f.Q.value = type === 'bandpass' ? 1.2 : 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duree);
    src.connect(f).connect(g).connect(sortie.entree);
    src.start(t); src.stop(t + duree + 0.05);
  }

  function petarades() {
    const n = Math.round(3 + echap.petarades * 6);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (!ctx || etat !== 'marche' || gaz) return;
        if (Math.random() < 0.75) rafale(500 + Math.random() * 900, 0.03 + Math.random() * 0.05, 0.5 * echap.petarades);
      }, 40 + i * (60 + Math.random() * 90));
    }
  }

  function tic() {
    const dt = 1 / 60;
    const m = moteur;
    const plage = m.rupteur - m.ralenti;
    const avant = gazLisse;
    gazLisse += (gaz - gazLisse) * 0.25;

    if (etat === 'demarrage') {
      const t = (performance.now() - tDemarrage) / 1000;
      if (m.cyl === 0) { etat = 'marche'; }
      else if (t < 0.7) regime = 180 + 70 * Math.sin(t * 38);
      else { etat = 'marche'; regime = m.ralenti * 1.9; }
    } else if (etat === 'marche') {
      if (gaz && coupureRupteur <= 0) {
        regime += (plage / m.montee) * dt * (0.6 + 0.4 * (1 - regime / m.rupteur));
        if (regime >= m.rupteur) { regime = m.rupteur - plage * 0.06; coupureRupteur = 0.07; }
      } else {
        regime -= (plage / (m.montee * 2.4)) * dt;
        regime = Math.max(m.ralenti, regime);
      }
      coupureRupteur -= dt;
      // Lâcher de pédale : décharge du turbo et pétarades.
      if (avant > 0.5 && gaz === 0) {
        if (m.turbo && pression > 0.4) rafale(2400, 0.35, 0.25 * pression, 'highpass');
        if (echap.petarades && regime > m.rupteur * 0.45 && m.cyl) petarades();
      }
    } else if (etat === 'extinction') {
      regime *= 0.9;
      if (regime < 60) { etat = 'arret'; regime = 0; detruireChaine(); arreterBoucle(); }
    }

    pression += ((gaz && regime > m.rupteur * 0.3 ? 1 : 0) - pression) * (gaz ? 0.04 : 0.12);

    if (chaine && etat !== 'arret') {
      const c = ctx, t = c.currentTime, n = chaine;
      const r = regime / m.rupteur;
      const coupe = coupureRupteur > 0;
      if (m.cyl === 0) {
        n.osc.frequency.setTargetAtTime(60 + regime * 0.11, t, 0.03);
        n.osc2.frequency.setTargetAtTime(60 + regime * 0.33, t, 0.03);
        n.filtre.frequency.setTargetAtTime(1200 + 5000 * r, t, 0.05);
        n.niveau.gain.setTargetAtTime(regime > 30 ? 0.05 + 0.25 * r * (0.5 + gazLisse) : 0, t, 0.05);
      } else {
        const cycle = Math.max(regime, 1) / 120;
        n.osc.frequency.setTargetAtTime(cycle, t, 0.015);
        n.filtre.frequency.setTargetAtTime(echap.coupure + echap.ouverture * (0.25 + 0.75 * gazLisse) * (0.3 + r), t, 0.03);
        n.bande.frequency.setTargetAtTime(cycle * m.cyl * 2, t, 0.03);
        n.gBruit.gain.setTargetAtTime(echap.souffle * (0.2 + gazLisse) * (0.3 + r), t, 0.03);
        const base = etat === 'demarrage' ? 0.35 : 0.3 + 0.5 * gazLisse + 0.2 * r;
        n.niveau.gain.setTargetAtTime(coupe ? base * 0.25 : base * echap.volume, t, coupe ? 0.005 : 0.03);
        if (n.turbo) {
          n.turbo.frequency.setTargetAtTime(1800 + regime * 0.9, t, 0.05);
          n.gTurbo.gain.setTargetAtTime(0.018 * pression, t, 0.08);
        }
      }
    }
    for (const f of ecouteurs) f({ regime, etat, rupteur: m.rupteur, ralenti: m.ralenti });
  }

  function lancerBoucle() { if (!boucle) boucle = setInterval(tic, 1000 / 60); }
  function arreterBoucle() {
    clearInterval(boucle); boucle = null;
    for (const f of ecouteurs) f({ regime: 0, etat: 'arret', rupteur: moteur?.rupteur || 1, ralenti: 0 });
  }

  return {
    // Changer de moteur ou d'échappement moteur tournant le redémarre.
    configurer(nouveauMoteur, echappement) {
      const change = moteur && (moteur.id !== nouveauMoteur.id);
      const echapChange = echap !== (ECHAPPEMENT[echappement] || ECHAPPEMENT.origine);
      moteur = nouveauMoteur;
      echap = ECHAPPEMENT[echappement] || ECHAPPEMENT.origine;
      if ((change || echapChange) && chaine && etat !== 'arret') {
        detruireChaine();
        chaine = construireChaine();
        etat = 'demarrage'; tDemarrage = performance.now(); regime = 0;
      }
    },
    demarrer() {
      if (!moteur || etat === 'marche' || etat === 'demarrage') return;
      contexte();
      if (chaine) detruireChaine();
      chaine = construireChaine();
      etat = 'demarrage'; tDemarrage = performance.now(); regime = 0; gaz = 0;
      if (moteur.cyl === 0) rafale(1800, 0.25, 0.15);
      lancerBoucle();
    },
    couper() {
      if (etat === 'arret' || etat === 'extinction') return;
      gaz = 0;
      etat = 'extinction';
      if (moteur.cyl === 0) regime = Math.min(regime, 200);
    },
    accelerer(actif) { gaz = actif && etat !== 'arret' && etat !== 'extinction' ? 1 : 0; },
    volume(v) {
      volumeGeneral = v;
      if (sortie) sortie.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    },
    enMarche: () => etat === 'marche' || etat === 'demarrage',
    ecouter(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); },
    // Arrêt immédiat, sans extinction progressive (on quitte la page).
    arreterTout() {
      gaz = 0;
      if (chaine) detruireChaine();
      etat = 'arret'; regime = 0;
      arreterBoucle();
      if (ctx && ctx.state === 'running') ctx.suspend();
    },
  };
}
