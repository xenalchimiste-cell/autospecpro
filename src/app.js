// ── GLOBALS ──
const TIERS = { FREE: 'free', PASSIONNE: 'passionne', PRO: 'pro' };
let currentTier = localStorage.getItem('autospec_tier') || TIERS.FREE;

let carA = null, carB = null;
window.carCache = window.carCache || {};
const GROQ_URL = '/api/chat';
const MODEL = 'llama-3.1-8b-instant';

// ── SEARCH LOGIC ──
let searchMode = 'car';
function setSearchMode(m) {
  if (m === 'plate' && !checkAccess('passionne')) {
    showPage('plans');
    return;
  }
  searchMode = m;
  const input = document.getElementById('q1');
  const container = document.getElementById('search-container');
  const icon = document.getElementById('search-icon');
  
  document.getElementById('mode-car').classList.toggle('active', m === 'car');
  document.getElementById('mode-plate').classList.toggle('active', m === 'plate');
  
  if (m === 'plate') {
    input.placeholder = "AA-123-AA";
    container.classList.add('plate-mode');
    icon.innerHTML = '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M7 12h.01"/><path d="M17 12h.01"/>';
  } else {
    input.placeholder = "ex: BMW M3 2023, Peugeot 308 2022…";
    container.classList.remove('plate-mode');
    icon.innerHTML = '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>';
  }
}

// Auto-format plaque
window.addEventListener('DOMContentLoaded', () => {
  const q1 = document.getElementById('q1');
  if (q1) {
    q1.addEventListener('input', function(e) {
      if (searchMode !== 'plate') return;
      let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val.length > 7) val = val.slice(0, 7);
      
      let formatted = val;
      if (val.length > 2 && val.length <= 5) {
        formatted = val.slice(0, 2) + '-' + val.slice(2);
      } else if (val.length > 5) {
        formatted = val.slice(0, 2) + '-' + val.slice(2, 5) + '-' + val.slice(5);
      }
      e.target.value = formatted;
    });
  }
});

function showPage(id, btn, fromDrawer=false){
  // Check access if needed
  if (id !== 'plans') {
    const targetTab = btn || document.querySelector(`.nav-tab[onclick*="'${id}'"]`);
    if (targetTab) {
      const required = targetTab.getAttribute('data-at');
      if (required && !checkAccess(required)) {
        id = 'plans'; // Redirect to plans if locked
      }
    }
  }

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');

  // Nav desktop
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  // Nav drawer
  document.querySelectorAll('.drawer-tab').forEach(t=>t.classList.remove('active'));

  // Activer le bon tab dans les deux navs
  const drawerTab = document.getElementById('dtab-'+id);
  if(drawerTab) drawerTab.classList.add('active');

  if(btn){
    if(btn.classList.contains('nav-tab') || btn.classList.contains('drawer-tab')){
      btn.classList.add('active');
    }
    // Si vient de la nav desktop, activer aussi dans la nav desktop
    if(!fromDrawer) btn.classList.add('active');
  }

  // Sync nav desktop
  document.querySelectorAll('.nav-tab').forEach(t=>{
    if(t.getAttribute('onclick') && t.getAttribute('onclick').includes("'"+id+"'")) t.classList.add('active');
  });

  if(fromDrawer) closeDrawer();
}

function toggleDrawer(){
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  const hamburger = document.getElementById('hamburger');
  const isOpen = drawer.classList.contains('open');
  if(isOpen){ closeDrawer(); } else { openDrawer(); }
}

function openDrawer(){
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  const hamburger = document.getElementById('hamburger');
  overlay.style.display = 'block';
  requestAnimationFrame(()=>{
    overlay.classList.add('open');
    drawer.classList.add('open');
    hamburger.classList.add('open');
  });
  document.body.style.overflow = 'hidden';
}

function closeDrawer(){
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  const hamburger = document.getElementById('hamburger');
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  hamburger.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(()=>{ overlay.style.display='none'; }, 300);
}

// ── TIERS LOGIC ──
function checkAccess(requiredTier) {
  const levels = { 'free': 0, 'passionne': 1, 'pro': 2 };
  return levels[currentTier] >= levels[requiredTier];
}

function selectTier(tier) {
  currentTier = tier;
  localStorage.setItem('autospec_tier', tier);
  updateUIForTier();
  showPage('plans'); // Refresh the page view
  
  // Petite notification de succès
  const btn = document.querySelector(`#tier-${tier} .p-btn`);
  const originalText = btn.innerText;
  btn.innerText = "Plan activé !";
  btn.style.background = "var(--green)";
  setTimeout(() => {
    btn.innerText = originalText;
    btn.style.background = "";
  }, 2000);
}

function updateUIForTier() {
  const badgeColors = { 'free': 'var(--text3)', 'passionne': 'var(--accent)', 'pro': 'var(--purple)' };
  const badgeLabels = { 'free': 'GRATUIT', 'passionne': 'PASSIONNÉ', 'pro': 'PRO' };
  
  const badge = document.getElementById('current-tier-badge');
  if (badge) {
    badge.innerText = badgeLabels[currentTier];
    badge.style.border = `1px solid ${badgeColors[currentTier]}`;
    badge.style.color = badgeColors[currentTier];
  }

  // Cards state
  document.querySelectorAll('.pricing-card').forEach(c => {
    c.classList.remove('active');
    const cbtn = c.querySelector('.p-btn');
    if (c.id === 'tier-' + currentTier) {
       c.classList.add('active');
       if(cbtn) cbtn.innerText = "Votre Plan Actuel";
    } else {
       if(cbtn) {
         const tierVal = c.id.replace('tier-', '');
         cbtn.innerText = tierVal === 'free' ? 'Rester en Gratuit' : 'Choisir ' + tierVal.charAt(0).toUpperCase() + tierVal.slice(1);
       }
    }
  });

  // Nav tab locks
  document.querySelectorAll('.nav-tab, .drawer-tab').forEach(t => {
    const req = t.getAttribute('data-at');
    if (req && !checkAccess(req)) {
      t.classList.add('locked');
    } else {
      t.classList.remove('locked');
    }
  });

  // Lock specific UI elements
  // 1. Module plaque
  const plateBtn = document.getElementById('mode-plate');
  if (plateBtn) {
    if (!checkAccess('passionne')) {
      plateBtn.classList.add('locked-feature');
      plateBtn.style.opacity = '0.5';
    } else {
      plateBtn.classList.remove('locked-feature');
      plateBtn.style.opacity = '1';
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  updateUIForTier();
});

// ── API ──
function getCache(key) {
  try {
    const cached = localStorage.getItem('autospec_v3_' + key);
    if (!cached) return null;
    const { data, expiry } = JSON.parse(cached);
    if (Date.now() > expiry) {
      localStorage.removeItem('autospec_v3_' + key);
      return null;
    }
    return data;
  } catch (e) { return null; }
}

function setCache(key, data) {
  try {
    const expiry = Date.now() + (1000 * 60 * 60 * 24 * 7); // 7 jours
    localStorage.setItem('autospec_v3_' + key, JSON.stringify({ data, expiry }));
  } catch (e) {}
}

async function callGroq(userPrompt, systemPrompt=''){
  const cacheKey = btoa(userPrompt + systemPrompt).slice(0, 32);
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const sys = systemPrompt || "Expert technique automobile. RIGUEUR ABSOLUE sur les données STOCK (constructeur) : n'invente rien, utilise 'N/A' si inconnu. En revanche, pour la section 'tuning' (Stages 1, 2, 3), fournis des ESTIMATIONS REPRÉSENTATIVES des gains habituels pour ce moteur précis (puissance, couple, prix). Réponse UNIQUEMENT JSON brut.";

  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userPrompt }
        ]
      })

    });
  } catch(networkErr) {
    throw new Error('Impossible de joindre le serveur — vérifiez votre connexion.');
  }

  const text = await res.text();
  if (!text || text.trim() === '') {
  throw new Error(`Réponse vide du serveur (HTTP ${res.status}). Vérifiez que la fonction /api/chat est bien déployée sur Vercel.`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch(_) {
    throw new Error(`Réponse invalide du serveur : ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    const errorMsg = (data && data.error) ? (typeof data.error === 'string' ? data.error : data.error.message) : `Erreur serveur HTTP ${res.status}`;
    throw new Error(errorMsg || `Erreur serveur HTTP ${res.status}`);
  }
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('Réponse inattendue de l\'API — aucun contenu retourné.');
  }

  const raw = data.choices[0].message.content.replace(/```[\w]*\n?/g,'').replace(/```/g,'').trim();
  setCache(cacheKey, raw);
  return raw;
}

const JSON_STRUCTURE = `{"nom":"","annee":"","type":"","pays":"","energie":"","prix":"","moteur":{"type":"","cylindree":"","puissance_ch":"","puissance_kw":"","couple_nm":"","regime_puissance":"","regime_couple":"","alimentation":""},"transmission":{"boite":"","entrainement":"","differentiel":""},"performances":{"zero_cent":"","vitesse_max":"","zero_deux_cent":""},"consommation":{"mixte":"","urbaine":"","autoroute":"","co2":""},"chassis":{"longueur":"","largeur":"","hauteur":"","empattement":"","masse":"","coffre":""},"suspensions":{"avant":"","arriere":"","freins_avant":"","freins_arriere":""},"pneus":{"avant":"","arriere":""},"carburant":{"type":"","indice_octane":"","reservoir":"","autonomie_estimee":""},"tuning":{"remarque_generale":"","stage1":{"puissance_ch":"","couple_nm":"","gain_ch":"","gain_nm":"","prix_estime":"","fiabilite":""},"stage2":{"puissance_ch":"","couple_nm":"","gain_ch":"","gain_nm":"","prix_estime":"","fiabilite":""},"stage3":{"puissance_ch":"","couple_nm":"","gain_ch":"","gain_nm":"","prix_estime":"","fiabilite":""}},"entretien":{"huile_viscosite":"","huile_norme":"","frequence_vidange":"","distribution":"","points_vigilance":[]},"anecdote":""}`;

const CAR_PROMPT = (q) => `Fiche précise pour: "${q}". Remplis ce JSON technique complet (sois ultra-rigoureux sur les puissances et moteurs): ${JSON_STRUCTURE}`;

function badge(e){
  if(!e)return'';const l=e.toLowerCase();
  if(l.includes('electr'))return`<span class="badge badge-e">⚡ ${e}</span>`;
  if(l.includes('hybride'))return`<span class="badge badge-h">🔋 ${e}</span>`;
  return`<span class="badge badge-g">${e}</span>`;
}
function v(x){return x||'—';}

function ficheTab(cardId, tab){
  document.querySelectorAll('#'+cardId+' .fiche-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#'+cardId+' .fiche-panel').forEach(p=>p.classList.remove('active'));
  document.querySelector('#'+cardId+' .fiche-tab[data-tab="'+tab+'"]').classList.add('active');
  document.querySelector('#'+cardId+' .fiche-panel[data-panel="'+tab+'"]').classList.add('active');
}

function stageColor(n){ return n===1?'s1':n===2?'s2':'s3'; }
function fiabiliteIcon(f){
  if(!f) return '⚪';
  const l = f.toLowerCase();
  if(l.includes('excell')) return '🟢';
  if(l.includes('bonne')) return '🟢';
  if(l.includes('correct')) return '🟡';
  return '🔴';
}

function renderCard(c){
  const m=c.moteur||{},p=c.performances||{},co=c.consommation||{};
  const dim=c.chassis||{},tr=c.transmission||{},su=c.suspensions||{},pn=c.pneus||{};
  const fuel=c.carburant||{}, tun=c.tuning||{}, ent=c.entretien||{};
  const cardId = 'card-'+Math.random().toString(36).slice(2,7);
  window.carCache[cardId] = c;

  // ── PANEL SPECS ──
  const panelSpecs = `
  <div class="hero-grid">
    <div class="hero-item"><div class="h-label">Puissance</div><div class="h-val">${v(m.puissance_ch)}</div><div class="h-unit">ch · ${v(m.puissance_kw)} kW</div></div>
    <div class="hero-item"><div class="h-label">Couple</div><div class="h-val">${v(m.couple_nm)}</div><div class="h-unit">N·m</div></div>
    <div class="hero-item"><div class="h-label">0–100 km/h</div><div class="h-val">${v(p.zero_cent)}</div><div class="h-unit">secondes</div></div>
    <div class="hero-item"><div class="h-label">Vitesse max</div><div class="h-val">${v(p.vitesse_max)}</div><div class="h-unit">km/h</div></div>
    <div class="hero-item"><div class="h-label">Conso. mixte</div><div class="h-val">${v(co.mixte)}</div><div class="h-unit">CO₂ ${v(co.co2)}</div></div>
    <div class="hero-item"><div class="h-label">Masse</div><div class="h-val">${v(dim.masse)}</div><div class="h-unit">kg</div></div>
  </div>
  <div class="section"><div class="sec-title">Motorisation</div><div class="kv">
    <div class="kv-row"><span class="kv-k">Type</span><span class="kv-v">${v(m.type)}</span></div>
    <div class="kv-row"><span class="kv-k">Cylindrée</span><span class="kv-v">${v(m.cylindree)}</span></div>
    <div class="kv-row"><span class="kv-k">Régime puissance</span><span class="kv-v">${v(m.regime_puissance)}</span></div>
    <div class="kv-row"><span class="kv-k">Régime couple</span><span class="kv-v">${v(m.regime_couple)}</span></div>
    <div class="kv-row"><span class="kv-k">Alimentation</span><span class="kv-v">${v(m.alimentation)}</span></div>
    <div class="kv-row"><span class="kv-k">0–200 km/h</span><span class="kv-v">${v(p.zero_deux_cent)}</span></div>
  </div></div>
  <div class="section"><div class="sec-title">Transmission & châssis</div><div class="kv">
    <div class="kv-row"><span class="kv-k">Boîte</span><span class="kv-v">${v(tr.boite)}</span></div>
    <div class="kv-row"><span class="kv-k">Roues motrices</span><span class="kv-v">${v(tr.entrainement)}</span></div>
    <div class="kv-row"><span class="kv-k">Différentiel</span><span class="kv-v">${v(tr.differentiel)}</span></div>
    <div class="kv-row"><span class="kv-k">Susp. avant</span><span class="kv-v">${v(su.avant)}</span></div>
    <div class="kv-row"><span class="kv-k">Susp. arrière</span><span class="kv-v">${v(su.arriere)}</span></div>
    <div class="kv-row"><span class="kv-k">Freins AV/AR</span><span class="kv-v">${v(su.freins_avant)} / ${v(su.freins_arriere)}</span></div>
  </div></div>
  <div class="section"><div class="sec-title">Dimensions & pneus</div><div class="kv">
    <div class="kv-row"><span class="kv-k">L × l × h</span><span class="kv-v">${v(dim.longueur)} × ${v(dim.largeur)} × ${v(dim.hauteur)}</span></div>
    <div class="kv-row"><span class="kv-k">Empattement</span><span class="kv-v">${v(dim.empattement)}</span></div>
    <div class="kv-row"><span class="kv-k">Coffre</span><span class="kv-v">${v(dim.coffre)}</span></div>
    <div class="kv-row"><span class="kv-k">Pneus AV/AR</span><span class="kv-v">${v(pn.avant)} / ${v(pn.arriere)}</span></div>
  </div></div>
  <div class="section"><div class="sec-title">Consommation</div><div class="kv">
    <div class="kv-row"><span class="kv-k">Mixte</span><span class="kv-v">${v(co.mixte)}</span></div>
    <div class="kv-row"><span class="kv-k">Urbaine</span><span class="kv-v">${v(co.urbaine)}</span></div>
    <div class="kv-row"><span class="kv-k">Autoroute</span><span class="kv-v">${v(co.autoroute)}</span></div>
    <div class="kv-row"><span class="kv-k">CO₂</span><span class="kv-v">${v(co.co2)}</span></div>
  </div></div>
  ${c.anecdote?`<div class="anecdote">💡 ${c.anecdote}</div>`:''}`;

  // ── PANEL STAGE ──
  const stages = [
    {key:'stage1',n:1,label:'Stage 1'},
    {key:'stage2',n:2,label:'Stage 2'},
    {key:'stage3',n:3,label:'Stage 3'},
  ];
  const stageCards = stages.map(s=>{
    const st = tun[s.key]||{};
    const sc = stageColor(s.n);
    return `<div class="stage-card">
      <div class="stage-card-head ${sc}">
        <span class="stage-label ${sc}">${s.label}</span>
        <span class="stage-gain ${sc}">${v(st.gain_ch)} ch / ${v(st.gain_nm)} N·m</span>
      </div>
      <div class="stage-card-body">
        <div class="stage-stat-row"><span class="stage-stat-k">Puissance</span><span class="stage-stat-v">${v(st.puissance_ch)} ch</span></div>
        <div class="stage-stat-row"><span class="stage-stat-k">Couple</span><span class="stage-stat-v">${v(st.couple_nm)} N·m</span></div>
        <div class="stage-stat-row"><span class="stage-stat-k">Prix estimé</span><span class="stage-stat-v">${v(st.prix_estime)}</span></div>
      </div>
      <div class="stage-fiabilite">${fiabiliteIcon(st.fiabilite)} <span style="color:var(--text2)">${v(st.fiabilite)}</span></div>
    </div>`;
  }).join('');

  const panelStage = `
  ${tun.remarque_generale?`<div class="stage-remarque">⚙️ ${tun.remarque_generale}</div>`:''}
  <div class="stage-grid">${stageCards}</div>
  <div class="footer-note">Estimations indicatives — résultats variables selon le préparateur.</div>`;

  // ── PANEL CARBURANT ──
  const panelFuel = `
  <div class="fuel-hero">
    <div class="fuel-item"><div class="fuel-icon">⛽</div><div class="fuel-label">Type</div><div class="fuel-val">${v(fuel.type)}</div></div>
    <div class="fuel-item"><div class="fuel-icon">🔢</div><div class="fuel-label">Indice d'octane</div><div class="fuel-val">${v(fuel.indice_octane)}</div></div>
    <div class="fuel-item"><div class="fuel-icon">🪣</div><div class="fuel-label">Réservoir</div><div class="fuel-val">${v(fuel.reservoir)}</div><div class="fuel-sub">litres</div></div>
    <div class="fuel-item"><div class="fuel-icon">🛣</div><div class="fuel-label">Autonomie est.</div><div class="fuel-val">${v(fuel.autonomie_estimee)}</div><div class="fuel-sub">km</div></div>
  </div>
  <div class="section"><div class="sec-title">Consommation détaillée</div><div class="kv">
    <div class="kv-row"><span class="kv-k">Mixte</span><span class="kv-v">${v(co.mixte)}</span></div>
    <div class="kv-row"><span class="kv-k">Urbaine</span><span class="kv-v">${v(co.urbaine)}</span></div>
    <div class="kv-row"><span class="kv-k">Autoroute</span><span class="kv-v">${v(co.autoroute)}</span></div>
    <div class="kv-row"><span class="kv-k">CO₂</span><span class="kv-v">${v(co.co2)}</span></div>
  </div></div>
  ${fuel.remarque?`<div class="fuel-remarque">💡 ${fuel.remarque}</div>`:''}`;

  // ── PANEL ENTRETIEN ──
  const vigItems = (ent.points_vigilance||[]).map(pt => `<li>${pt}</li>`).join('');
  const panelEntretien = `
  <div class="fuel-hero" style="background:rgba(212,168,67,0.05); border:1px solid rgba(212,168,67,0.1); margin-top:0;">
    <div class="fuel-item"><div class="fuel-icon">🛢️</div><div class="fuel-label">Huile Moteur</div><div class="fuel-val" style="font-size:16px;">${v(ent.huile_viscosite)}</div><div class="fuel-sub">${v(ent.huile_norme)}</div></div>
    <div class="fuel-item"><div class="fuel-icon">📅</div><div class="fuel-label">Vidange</div><div class="fuel-val" style="font-size:16px;">${v(ent.frequence_vidange)}</div></div>
    <div class="fuel-item"><div class="fuel-icon">⚙️</div><div class="fuel-label">Distribution</div><div class="fuel-val" style="font-size:14px; line-height:1.2;">${v(ent.distribution)}</div></div>
  </div>
  <div class="section"><div class="sec-title">Préconisations Maintenance</div><div class="kv">
    <div class="kv-row"><span class="kv-k">Maintenance</span><span class="kv-v">Voir points de vigilance ci-dessous</span></div>
  </div></div>
  ${vigItems ? `
  <div class="section" style="background:rgba(231,76,60,0.05); border-radius:12px; padding:1.25rem;">
    <div class="sec-title" style="color:#e74c3c; display:flex; align-items:center; gap:8px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      Points de Vigilance
    </div>
    <ul style="color:var(--text2); font-size:13px; padding-left:1.5rem; margin-top:0.5rem; line-height:1.6;">${vigItems}</ul>
  </div>` : ''}
  <div class="footer-note" style="margin-top:1rem;">Données basées sur les périodicités constructeur standard.</div>`;

  return`<div class="card fade" id="${cardId}">
  <div class="card-head">
    <div class="car-name">${v(c.nom)} ${badge(c.energie)}</div>
    <div class="car-sub">${v(c.annee)} · ${v(c.type)} · ${v(c.pays)} · ${v(c.prix)}</div>
  </div>
  <div class="fiche-tabs">
    <button class="fiche-tab active" data-tab="specs" onclick="ficheTab('${cardId}','specs')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
      Specs
    </button>
    <button class="fiche-tab" data-tab="stage" onclick="ficheTab('${cardId}','stage')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      Stage
    </button>
    <button class="fiche-tab" data-tab="carburant" onclick="ficheTab('${cardId}','carburant')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 22V8l9-6 9 6v14"/><path d="M10 22V12h4v10"/></svg>
      Carburant
    </button>
    <button class="fiche-tab" data-tab="entretien" onclick="ficheTab('${cardId}','entretien')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      Entretien
    </button>
  </div>
  <div class="fiche-panel active" data-panel="specs">${panelSpecs}</div>
  <div class="fiche-panel" data-panel="stage">${panelStage}</div>
  <div class="fiche-panel" data-panel="carburant">${panelFuel}</div>
  <div class="fiche-panel" data-panel="entretien">${panelEntretien}</div>
  <button id="btn-cert-${cardId}" onclick="openCertificat('${cardId}')" style="display: flex; justify-content: center; align-items: center; gap: 8px; margin: 1.5rem 2rem; padding: 1rem; background: rgba(91, 191, 133, 0.1); border: 1px solid var(--green); color: var(--green); border-radius: 10px; width: calc(100% - 4rem); cursor: pointer; text-decoration: none; font-weight: 600; font-family: inherit; transition: all 0.2s; font-size: 14px;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
    Télécharger la fiche client (PDF)
  </button>
  <div class="footer-note">Données générées par IA — à titre indicatif.</div>
</div>`;
}

// ── FILTRES ──
function updateFilterChips(){
  const carb = document.getElementById('f-carburant').value;
  const stage = document.getElementById('f-stage').value;
  const active = document.getElementById('filter-active');
  const chips = document.getElementById('filter-active-chips');

  // Style des selects actifs
  document.getElementById('f-carburant').classList.toggle('active', !!carb);
  document.getElementById('f-stage').classList.toggle('active', !!stage);

  if(!carb && !stage){ active.style.display='none'; return; }
  active.style.display='flex';
  let html = '';
  if(carb) html += `<span class="filter-active-chip">⛽ ${carb}</span>`;
  if(stage) html += `<span class="filter-active-chip">⚡ ${stage}</span>`;
  chips.innerHTML = html;
}

function resetFilters(){
  document.getElementById('f-carburant').value = '';
  document.getElementById('f-stage').value = '';
  updateFilterChips();
}

function getFilteredPromptFor(q, carb, stage, tech = {}){
  let ctx = `Véhicule: "${q}".`;
  if(tech.kw) ctx += ` Puissance exacte: ${tech.kw} kW.`;
  if(tech.engine_code) ctx += ` Code moteur constructeur: ${tech.engine_code}.`;
  if(carb) ctx += ` Carburant: ${carb}.`;
  if(stage) ctx += ` Préparation: ${stage}.`;
  return `${ctx} Remplis ce JSON technique complet. 1) Pour les données d'origine (STOCK), sois ultra-rigoureux et utilise 'N/A' si incertain. 2) Pour la section 'tuning' (Stages), fournis des estimations réalistes basées sur les gains classiques pour ce moteur : ${JSON_STRUCTURE}`;
}

function getFilteredPrompt(q){
  const carb = document.getElementById('f-carburant').value;
  const stage = document.getElementById('f-stage').value;
  return getFilteredPromptFor(q, carb, stage);
}

// ── FICHE ──
function qf(t){document.getElementById('q1').value=t;searchFiche();}
async function searchFiche() {
  const q = document.getElementById('q1').value.trim();
  if (!q) return;

  const stage = document.getElementById('f-stage').value;
  const carb = document.getElementById('f-carburant').value;
  const out = document.getElementById('out-fiche');
  // ── SÉQUENCE DE LOADER ──
  const statusMessages = {
    car: [
      "Analyse des spécifications techniques...",
      "Consultation de la base de données Groq IA...",
      "Calcul des rapports poids/puissance...",
      "Compilation des données de maintenance..."
    ],
    plate: [
      "Connexion sécurisée aux bases de données Moovelub...",
      "Analyse technique de la motorisation (Earlweb)...",
      "Détection des spécifications constructeur...",
      "Calcul des correspondances SIV secondaires...",
      "Finalisation de l'identification technique..."
    ]
  };

  const setStatus = (msg) => {
    const el = document.getElementById('load-status');
    if(el) el.innerHTML = msg;
  };

  // Affichage du loader initial
  out.innerHTML = `<div class="loading"><div class="spin"></div><span id="load-status">${searchMode === 'plate' ? 'Initialisation de l\'identification...' : 'Analyse AutoSpec en cours...'}</span></div>`;

  try {
    let finalModel = q;
    let techData = {};

    // SI MODE PLAQUE : On identifie d'abord le modèle
    if (searchMode === 'plate') {
      console.log(`[AutoSpec] Recherche par plaque lancée : ${q}`);
      let msgIdx = 0;
      const msgInterval = setInterval(() => {
        if (msgIdx < statusMessages.plate.length) {
          setStatus(statusMessages.plate[msgIdx++]);
        }
      }, 700);

      try {
        // En local (file://), les fonctions Vercel ne sont pas disponibles.
        // On détecte l'environnement et on utilise l'URL absolue si disponible.
        const isLocal = window.location.protocol === 'file:';
        const apiBase = isLocal ? 'https://autospecpro.vercel.app' : '';
        const plateRes = await fetch(`${apiBase}/api/plate?q=${encodeURIComponent(q)}`);
        const plateData = await plateRes.json();
        
        clearInterval(msgInterval);
        
        if (!plateRes.ok) {
          if (plateData.error === 'identification_failed') {
            if (plateData.diagnostics) console.warn("[AutoSpec Diagnostics]", plateData.diagnostics);
            out.innerHTML = `
              <div class="card" style="border-color:var(--border); text-align:center; padding:2rem;">
                <div style="font-size:40px; margin-bottom:1rem;">🛰️</div>
                <div style="font-weight:bold; color:var(--text); margin-bottom:0.5rem;">Échec de l'identification automatique</div>
                <div style="color:var(--text3); font-size:13px; margin-bottom:1.5rem;">Désolé, nos capteurs n'ont pas trouvé de correspondance pour la plaque <strong>${q}</strong>.</div>
                <p style="font-size:12px; color:var(--text2); margin-bottom:1.5rem;">Essayez de saisir le modèle manuellement (ex: BMW M3 2023).</p>
                <button class="btn btn-primary" onclick="setSearchMode('car'); document.getElementById('q1').value=''; document.getElementById('q1').focus();" style="width:auto; padding: 0.5rem 1.5rem;">Passer en recherche manuelle</button>
              </div>
            `;
            return;
          }
          throw new Error(plateData.error || 'Erreur lors de l\'identification');
        }
        
        finalModel = plateData.model;
        techData = plateData.tech || {};
        setStatus(`✅ Véhicule identifié : ${finalModel}`);
        await new Promise(r => setTimeout(r, 600)); // Pause pour lecture
        setStatus("Génération de la fiche technique haute fidélité...");
      } catch (err) {
        clearInterval(msgInterval);
        console.error("[AutoSpec] Erreur identification:", err);
        throw err;
      }
    } else {
      // Simulation légère pour la recherche manuelle pour garder le feeling "expert"
      setTimeout(() => setStatus(statusMessages.car[0]), 400);
      setTimeout(() => setStatus(statusMessages.car[1]), 900);
    }

    const raw = await callGroq(getFilteredPromptFor(finalModel, carb, stage, techData));
    const car = JSON.parse(raw);
    
    const html = renderCard(car);
    out.innerHTML = html;

    if (stage) {
      const cardEl = out.querySelector('.card');
      if (cardEl) ficheTab(cardEl.id, 'stage');
    } else if (carb) {
      const cardEl = out.querySelector('.card');
      if (cardEl) ficheTab(cardEl.id, 'carburant');
    }
  } catch (e) {
    out.innerHTML = `<div class="card"><div class="err">❌ ${e.message}</div></div>`;
  }
}

// ── COMPARATEUR ──
function presetCompare(a,b){
  document.getElementById('qA').value=a;
  document.getElementById('qB').value=b;
  searchCompare();
}
async function searchCompare(){
  const qA=document.getElementById('qA').value.trim();
  const qB=document.getElementById('qB').value.trim();
  if(!qA||!qB)return;

  const carbA = document.getElementById('cA-carburant').value;
  const stageA = document.getElementById('cA-stage').value;
  const carbB = document.getElementById('cB-carburant').value;
  const stageB = document.getElementById('cB-stage').value;

  const out=document.getElementById('out-compare');

  // Label contextuel
  const labelA = [qA, carbA, stageA].filter(Boolean).join(' · ');
  const labelB = [qB, carbB, stageB].filter(Boolean).join(' · ');
  out.innerHTML=`<div class="loading"><div class="spin"></div>Comparaison de ${labelA} vs ${labelB}…</div>`;

  try{
    const [rA,rB]=await Promise.all([
      callGroq(getFilteredPromptFor(qA, carbA, stageA)),
      callGroq(getFilteredPromptFor(qB, carbB, stageB))
    ]);
    carA=JSON.parse(rA); carB=JSON.parse(rB);
    // Ajoute un badge de filtre dans le nom si stage ou carburant sélectionné
    if(stageA) carA._filterLabel = stageA;
    if(stageB) carB._filterLabel = stageB;
    if(carbA) carA._carbLabel = carbA;
    if(carbB) carB._carbLabel = carbB;
    out.innerHTML=renderCompare(carA,carB);
    requestAnimationFrame(()=>drawRadar(carA,carB));
  }catch(e){out.innerHTML=`<div class="card"><div class="err">❌ ${e.message}</div></div>`;}
}

function cmpNum(a,b,inverse=false){
  const na=parseFloat(a), nb=parseFloat(b);
  if(isNaN(na)||isNaN(nb))return['',''];
  if(na===nb)return['',''];
  const aWins = inverse ? na<nb : na>nb;
  return aWins?['win','lose']:['lose','win'];
}

function renderCompare(A,B){
  const mA=A.moteur||{},mB=B.moteur||{};
  const pA=A.performances||{},pB=B.performances||{};
  const coA=A.consommation||{},coB=B.consommation||{};
  const dA=A.chassis||{},dB=B.chassis||{};

  const rows=[
    {label:'Puissance (ch)',a:v(mA.puissance_ch),b:v(mB.puissance_ch),cmp:cmpNum(mA.puissance_ch,mB.puissance_ch)},
    {label:'Couple (N·m)',a:v(mA.couple_nm),b:v(mB.couple_nm),cmp:cmpNum(mA.couple_nm,mB.couple_nm)},
    {label:'0–100 km/h',a:v(pA.zero_cent),b:v(pB.zero_cent),cmp:cmpNum(pA.zero_cent,pB.zero_cent,true)},
    {label:'Vitesse max',a:v(pA.vitesse_max),b:v(pB.vitesse_max),cmp:cmpNum(pA.vitesse_max,pB.vitesse_max)},
    {label:'Masse (kg)',a:v(dA.masse),b:v(dB.masse),cmp:cmpNum(dA.masse,dB.masse,true)},
    {label:'Conso. mixte',a:v(coA.mixte),b:v(coB.mixte),cmp:cmpNum(coA.mixte,coB.mixte,true)},
    {label:'CO₂ (g/km)',a:v(coA.co2),b:v(coB.co2),cmp:cmpNum(coA.co2,coB.co2,true)},
    {label:'Coffre (L)',a:v(dA.coffre),b:v(dB.coffre),cmp:cmpNum(dA.coffre,dB.coffre)},
  ];

  let rowsHTML='';
  rows.forEach(r=>{
    rowsHTML+=`
    <div class="cmp-cell ${r.cmp[0]}" style="border-right:1px solid var(--border)">${r.a}</div>
    <div class="cmp-cell label">${r.label}</div>
    <div class="cmp-cell ${r.cmp[1]}">${r.b}</div>`;
  });

  return`<div class="card fade" style="overflow:hidden">
  <div class="compare-grid" style="display:grid;grid-template-columns:1fr 160px 1fr;">
    <div class="cmp-head" style="border-right:1px solid var(--border)">
      <h3>${v(A.nom)}</h3>
      <p>${v(A.annee)} · ${v(A.type)} · ${badge(A.energie)}${A._filterLabel?` <span class="badge" style="background:rgba(155,127,232,.15);color:var(--purple);border:1px solid rgba(155,127,232,.25)">⚡ ${A._filterLabel}</span>`:''}</p>
    </div>
    <div class="cmp-head" style="background:var(--bg3);display:flex;align-items:center;justify-content:center;border-right:1px solid var(--border)">
      <span style="font-size:13px;font-weight:600;color:var(--text3);">VS</span>
    </div>
    <div class="cmp-head">
      <h3>${v(B.nom)}</h3>
      <p>${v(B.annee)} · ${v(B.type)} · ${badge(B.energie)}${B._filterLabel?` <span class="badge" style="background:rgba(155,127,232,.15);color:var(--purple);border:1px solid rgba(155,127,232,.25)">⚡ ${B._filterLabel}</span>`:''}</p>
    </div>
    ${rowsHTML}
    <div class="cmp-cell" style="border-right:1px solid var(--border);font-size:12px;color:var(--text3);">${v(A.moteur?.boite||A.transmission?.boite)}</div>
    <div class="cmp-cell label">Boîte</div>
    <div class="cmp-cell" style="font-size:12px;color:var(--text3);">${v(B.moteur?.boite||B.transmission?.boite)}</div>
    <div class="cmp-cell" style="border-right:1px solid var(--border);font-size:12px;color:var(--text3);">${v(A.transmission?.entrainement)}</div>
    <div class="cmp-cell label">Roues motrices</div>
    <div class="cmp-cell" style="font-size:12px;color:var(--text3);">${v(B.transmission?.entrainement)}</div>
  </div>
  <div style="padding:1.5rem 2rem;border-top:1px solid var(--border);background:var(--bg2);">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);font-weight:500;margin-bottom:1rem;">Radar comparatif</div>
    <div style="display:flex;align-items:center;gap:1.5rem;margin-bottom:.75rem;flex-wrap:wrap;">
      <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--accent2);"><span style="display:inline-block;width:12px;height:3px;background:#d4a843;border-radius:2px;"></span>${v(A.nom)}</span>
      <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--blue);"><span style="display:inline-block;width:12px;height:3px;background:#5b9bd5;border-radius:2px;"></span>${v(B.nom)}</span>
    </div>
    <canvas id="radarChart" style="width:100%;max-width:420px;height:280px;display:block;margin:0 auto;"></canvas>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--border)">
    ${A.anecdote?`<div class="anecdote" style="border-right:1px solid var(--border)">💡 ${A.anecdote}</div>`:'<div></div>'}
    ${B.anecdote?`<div class="anecdote">💡 ${B.anecdote}</div>`:'<div></div>'}
  </div>
  <div class="footer-note" style="color:var(--green)">🏆 Valeurs en vert = meilleure dans la catégorie</div>
</div>`;
}

// ── ANIMATION CHIFFRES ──
const _animTargets = {};
function animateValue(id, toVal, decimals=0, suffix='', duration=520){
  if(_animTargets[id] !== undefined) cancelAnimationFrame(_animTargets[id]);
  const el = document.getElementById(id);
  if(!el) return;
  const fromStr = el.dataset.rawVal || '0';
  const from = parseFloat(fromStr) || 0;
  const to = parseFloat(toVal);
  const start = performance.now();
  function step(now){
    const p = Math.min((now-start)/duration, 1);
    const ease = p<0.5 ? 2*p*p : -1+(4-2*p)*p;
    const cur = from + (to-from)*ease;
    el.textContent = (decimals>0 ? cur.toFixed(decimals) : Math.round(cur).toLocaleString('fr-FR')) + suffix;
    if(p<1) _animTargets[id] = requestAnimationFrame(step);
    else { el.dataset.rawVal = to; }
  }
  _animTargets[id] = requestAnimationFrame(step);
}

// ── RADAR CHART ──
function drawRadar(A, B){
  const canvas = document.getElementById('radarChart');
  if(!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(canvas.offsetWidth || 360, 360);
  canvas.width = size * dpr;
  canvas.height = 280 * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = '280px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = size, H = 280;
  ctx.clearRect(0,0,W,H);

  const cx = W/2, cy = H/2 + 10;
  const R = Math.min(W, H) * 0.38;

  const mA=A.moteur||{}, mB=B.moteur||{};
  const pA=A.performances||{}, pB=B.performances||{};
  const coA=A.consommation||{}, coB=B.consommation||{};
  const dAc=A.chassis||{}, dBc=B.chassis||{};

  // Axes: [label, valA, valB, max, inverse]
  const axes = [
    { label:'Puissance',  vA: parseFloat(mA.puissance_ch)||0,  vB: parseFloat(mB.puissance_ch)||0,  max:800,  inv:false },
    { label:'Couple',     vA: parseFloat(mA.couple_nm)||0,     vB: parseFloat(mB.couple_nm)||0,     max:1200, inv:false },
    { label:'Vitesse max',vA: parseFloat(pA.vitesse_max)||0,   vB: parseFloat(pB.vitesse_max)||0,   max:350,  inv:false },
    { label:'Légèreté',   vA: parseFloat(dAc.masse)||2000,     vB: parseFloat(dBc.masse)||2000,     max:2000, inv:true  },
    { label:'Sobriété',   vA: parseFloat(coA.mixte)||15,       vB: parseFloat(coB.mixte)||15,       max:20,   inv:true  },
    { label:'Accéléra.',  vA: parseFloat(pA.zero_cent)||15,    vB: parseFloat(pB.zero_cent)||15,    max:15,   inv:true  },
  ];

  const n = axes.length;
  const angleStep = (2*Math.PI) / n;
  const startAngle = -Math.PI/2;

  function getScore(axis, val){
    if(axis.inv) return Math.max(0, Math.min(1, 1 - (val / axis.max)));
    return Math.max(0, Math.min(1, val / axis.max));
  }

  function axisPoint(i, r){
    const a = startAngle + i * angleStep;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  // Rings
  [0.25, 0.5, 0.75, 1].forEach(t => {
    ctx.beginPath();
    for(let i=0;i<n;i++){
      const p = axisPoint(i, R*t);
      i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = t===1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Spokes
  axes.forEach((_,i) => {
    const p = axisPoint(i, R);
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(p.x,p.y);
    ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1; ctx.stroke();
  });

  // Draw polygon for a dataset
  function drawPoly(scores, color, fillAlpha){
    ctx.beginPath();
    scores.forEach((s,i)=>{
      const p = axisPoint(i, R*s);
      i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y);
    });
    ctx.closePath();
    ctx.fillStyle = color.replace('1)', fillAlpha+')');
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const scoresA = axes.map(ax => getScore(ax, ax.vA));
  const scoresB = axes.map(ax => getScore(ax, ax.vB));

  // Animate radar draw
  let prog = 0;
  const dur = 700;
  const t0 = performance.now();
  function frame(now){
    const p = Math.min((now-t0)/dur, 1);
    const ease = p<0.5 ? 2*p*p : -1+(4-2*p)*p;
    ctx.clearRect(0,0,W,H);

    // Rings
    [0.25,0.5,0.75,1].forEach(t=>{
      ctx.beginPath();
      for(let i=0;i<n;i++){const pt=axisPoint(i,R*t);i===0?ctx.moveTo(pt.x,pt.y):ctx.lineTo(pt.x,pt.y);}
      ctx.closePath();
      ctx.strokeStyle=t===1?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.05)';ctx.lineWidth=1;ctx.stroke();
    });
    axes.forEach((_,i)=>{const pt=axisPoint(i,R);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(pt.x,pt.y);ctx.strokeStyle='rgba(255,255,255,0.07)';ctx.lineWidth=1;ctx.stroke();});

    const animA = scoresA.map(s=>s*ease);
    const animB = scoresB.map(s=>s*ease);
    drawPoly(animB, 'rgba(91,155,213,1)', '0.15');
    drawPoly(animA, 'rgba(212,168,67,1)', '0.18');

    // Dots
    [animA,animB].forEach((sc,di)=>{
      sc.forEach((s,i)=>{
        const pt=axisPoint(i,R*s);
        ctx.beginPath();ctx.arc(pt.x,pt.y,3.5,0,Math.PI*2);
        ctx.fillStyle=di===0?'#d4a843':'#5b9bd5';ctx.fill();
      });
    });

    // Labels
    ctx.font = `11px 'DM Sans', sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    axes.forEach((ax,i)=>{
      const pt = axisPoint(i, R+22);
      ctx.fillStyle='rgba(138,134,128,0.85)';
      ctx.fillText(ax.label, pt.x, pt.y);
    });

    if(p<1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function updateSim(){
  const ch=+document.getElementById('sl-ch').value;
  const nm=+document.getElementById('sl-nm').value;
  const kg=+document.getElementById('sl-kg').value;
  const eff=+document.getElementById('sl-tr').value;
  const trLabel={'0.95':'Intégrale (xDrive…)','0.90':'Propulsion','0.88':'Traction'};

  animateValue('sv-ch', ch, 0, ' ch');
  animateValue('sv-nm', nm, 0, ' N·m');
  animateValue('sv-kg', kg, 0, ' kg');
  document.getElementById('sv-tr').textContent=trLabel[document.getElementById('sl-tr').value];

  const kw=Math.round(ch*0.7355);
  const pw=(kg/ch).toFixed(1);
  const ratio = kg/ch;
  
  // Formule empirique améliorée : Traction + (Poids/Puissance)
  const t100 = (ratio * 0.70 + 1.55 / Math.sqrt(eff)).toFixed(1);
  // Le 0-200 dépend plus du rapport poids/puissance que de la traction
  const t200 = (parseFloat(t100) * (2.0 + ratio * 0.45)).toFixed(1);
  // Vmax limitée par l'aérodynamisme (P puissance 1/3)
  const vmax = Math.min(Math.round((40 * Math.pow(ch, 0.33) - (kg/250)) * eff), 500);

  animateValue('sim-0100-num', parseFloat(t100), 1, ' s');
  animateValue('sim-kw-num', kw, 0, ' kW');
  animateValue('sim-pw-num', parseFloat(pw), 1, ' kg/ch');
  animateValue('sim-vmax-num', vmax, 0, ' km/h');
  animateValue('sim-0200-num', parseFloat(t200), 1, ' s');

  const pct = Math.max(0, Math.min(100, (12 - parseFloat(t100)) / 10 * 100));
  document.getElementById('sim-bar').style.width = pct+'%';

  drawChart(ch, kg, eff);
}

function drawChart(ch, kg, eff){
  const canvas = document.getElementById('simChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 600;
  const H = 200;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0,0,W,H);

  const PAD = { top: 24, right: 20, bottom: 36, left: 48 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const speeds = [];
  for(let s=0;s<=250;s+=5) speeds.push(s);
  const pts = speeds.map(s=>({
    s,
    t: s===0 ? 0 : (ratio * 0.70 + 1.55 / Math.sqrt(eff)) * Math.pow(s/100, 1.2 + ratio * 0.05)
  }));
  const maxT = Math.max(...pts.map(p=>p.t));
  const niceMaxT = Math.ceil(maxT / 5) * 5 || 5;

  const toX = s => PAD.left + (s/250)*cW;
  const toY = t => PAD.top + cH - (t/niceMaxT)*cH;

  // Background subtle gradient
  const bgGrad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top+cH);
  bgGrad.addColorStop(0,'rgba(255,255,255,0.02)');
  bgGrad.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(PAD.left, PAD.top, cW, cH);

  // Grid lines Y
  ctx.setLineDash([3,4]);
  ctx.strokeStyle='rgba(255,255,255,0.06)';
  ctx.lineWidth=1;
  const ySteps = 5;
  for(let i=0;i<=ySteps;i++){
    const y = PAD.top + (i/ySteps)*cH;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left+cW, y); ctx.stroke();
    // Y labels
    const val = niceMaxT - (i/ySteps)*niceMaxT;
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(138,134,128,0.7)';
    ctx.font=`10px 'DM Sans', sans-serif`;
    ctx.textAlign='right';
    ctx.fillText(val.toFixed(0)+'s', PAD.left-6, y+3.5);
    ctx.setLineDash([3,4]);
  }
  ctx.setLineDash([]);

  // Grid lines X (subtle)
  ctx.strokeStyle='rgba(255,255,255,0.04)';
  [0,50,100,150,200,250].forEach(s=>{
    const x = toX(s);
    ctx.beginPath(); ctx.moveTo(x,PAD.top); ctx.lineTo(x,PAD.top+cH); ctx.stroke();
  });

  // Axes
  ctx.strokeStyle='rgba(255,255,255,0.1)';
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top+cH);
  ctx.lineTo(PAD.left+cW, PAD.top+cH);
  ctx.stroke();

  // Fill under curve
  const fillGrad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top+cH);
  fillGrad.addColorStop(0,'rgba(212,168,67,0.22)');
  fillGrad.addColorStop(1,'rgba(212,168,67,0.01)');
  ctx.beginPath();
  ctx.moveTo(toX(pts[0].s), toY(pts[0].t));
  pts.forEach(p => ctx.lineTo(toX(p.s), toY(p.t)));
  ctx.lineTo(toX(250), PAD.top+cH);
  ctx.lineTo(toX(0), PAD.top+cH);
  ctx.closePath();
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Curve
  ctx.beginPath();
  ctx.strokeStyle='#d4a843';
  ctx.lineWidth=2.5;
  ctx.lineJoin='round';
  pts.forEach((p,i)=>{
    i===0 ? ctx.moveTo(toX(p.s),toY(p.t)) : ctx.lineTo(toX(p.s),toY(p.t));
  });
  ctx.stroke();

  // Highlight dot at 100 km/h
  const p100 = pts.find(p=>p.s===100);
  if(p100){
    const cx2=toX(100), cy2=toY(p100.t);
    ctx.beginPath();
    ctx.arc(cx2,cy2,4,0,Math.PI*2);
    ctx.fillStyle='#f0c96a';
    ctx.fill();
    ctx.fillStyle='rgba(240,201,106,0.85)';
    ctx.font=`bold 10px 'DM Mono', monospace`;
    ctx.textAlign='center';
    ctx.fillText(p100.t.toFixed(1)+'s', cx2, cy2-10);
  }

  // X axis labels
  ctx.fillStyle='rgba(74,71,68,0.9)';
  ctx.font=`10px 'DM Sans', sans-serif`;
  ctx.textAlign='center';
  [0,50,100,150,200,250].forEach(s=>{
    ctx.fillText(s, toX(s), H-8);
  });

  // Axis titles
  ctx.fillStyle='rgba(138,134,128,0.5)';
  ctx.font=`9px 'DM Sans', sans-serif`;
  ctx.textAlign='center';
  ctx.fillText('Vitesse (km/h)', PAD.left + cW/2, H-1);
  ctx.save();
  ctx.translate(10, PAD.top + cH/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillText('Temps (s)', 0, 0);
  ctx.restore();
}

// ── ENTRETIEN ──
const entData={
  citadine:{vidange:150,filtres:80,pneus:250,freins:180,revision:200,courroie:0,carburant_conso:6,nom:"Citadine"},
  berline:{vidange:200,filtres:100,pneus:350,freins:250,revision:300,courroie:400,carburant_conso:7.5,nom:"Berline"},
  suv:{vidange:220,filtres:110,pneus:500,freins:350,revision:350,courroie:450,carburant_conso:9,nom:"SUV"},
  sport:{vidange:280,filtres:150,pneus:900,freins:600,revision:600,courroie:600,carburant_conso:11,nom:"Sport"},
  supersport:{vidange:400,filtres:200,pneus:2500,freins:1800,revision:2000,courroie:1200,carburant_conso:16,nom:"Supersport"},
  electrique:{vidange:0,filtres:50,pneus:400,freins:150,revision:200,courroie:0,carburant_conso:18,nom:"Électrique",kwh:true},
};

function updateEntretien(){
  const type=document.getElementById('ent-type').value;
  const km=+document.getElementById('ent-km').value;
  const age=+document.getElementById('ent-age').value;
  const fuelPrice=+document.getElementById('ent-fuel').value;

  document.getElementById('ent-km-val').textContent=(km/1000).toFixed(0)+' 000';
  document.getElementById('ent-age-val').textContent=age;
  document.getElementById('ent-fuel-val').textContent=fuelPrice.toFixed(2);

  const d=entData[type];
  const ageMult=1+age*0.04;
  const carburant = d.kwh
    ? (km/100)*d.carburant_conso*0.20
    : (km/100)*d.carburant_conso*fuelPrice;

  const items=[
    {icon:'🛢',name:'Vidange huile',price:Math.round(d.vidange*ageMult),freq:'/ an'},
    {icon:'🔧',name:'Filtres (air, habitacle…)',price:Math.round(d.filtres),freq:'/ an'},
    {icon:'🛞',name:'Pneumatiques (prorata)',price:Math.round((d.pneus/3)*ageMult),freq:'/ an'},
    {icon:'🔴',name:'Freins (plaquettes/disques)',price:Math.round((d.freins/2)*ageMult),freq:'/ an'},
    {icon:'📋',name:'Révision générale',price:Math.round(d.revision*ageMult),freq:'/ an'},
    ...(d.courroie>0?[{icon:'⚙️',name:'Courroie distribution',price:Math.round(d.courroie/5),freq:'/ an (prorata)'}]:[]),
    {icon:d.kwh?'⚡':'⛽',name:d.kwh?'Électricité':'Carburant',price:Math.round(carburant),freq:'/ an'},
  ];

  const total=items.reduce((s,i)=>s+i.price,0);
  document.getElementById('cost-grid').innerHTML=items.map(i=>`
    <div class="cost-card">
      <div class="cost-icon">${i.icon}</div>
      <div class="cost-name">${i.name}</div>
      <div class="cost-price">${i.price.toLocaleString('fr-FR')} €</div>
      <div class="cost-freq">${i.freq}</div>
    </div>`).join('');
  document.getElementById('cost-total-val').textContent=total.toLocaleString('fr-FR')+' €';
}

// ── CONVERTISSEUR ──
const convDefs={
  puissance:{
    label:'Puissance',
    from:{label:'Chevaux (ch / CV)',unit:'ch'},
    conversions:[
      {label:'Kilowatts (kW)',unit:'kW',fn:x=>x*0.7355},
      {label:'Horsepower US (hp)',unit:'hp',fn:x=>x*0.9863},
      {label:'Watts (W)',unit:'W',fn:x=>x*735.5},
      {label:'Ft·lbf/s',unit:'ft·lbf/s',fn:x=>x*542.5},
    ]
  },
  couple:{
    label:'Couple',
    from:{label:'Newton-mètre (N·m)',unit:'N·m'},
    conversions:[
      {label:'Kilogramme-force·mètre (kgf·m)',unit:'kgf·m',fn:x=>x*0.10197},
      {label:'Pound-foot (lb·ft)',unit:'lb·ft',fn:x=>x*0.7376},
      {label:'Pound-inch (lb·in)',unit:'lb·in',fn:x=>x*8.851},
      {label:'Joule (J)',unit:'J',fn:x=>x},
    ]
  },
  vitesse:{
    label:'Vitesse',
    from:{label:'km/h',unit:'km/h'},
    conversions:[
      {label:'Mètres/seconde (m/s)',unit:'m/s',fn:x=>x/3.6},
      {label:'Miles/heure (mph)',unit:'mph',fn:x=>x*0.6214},
      {label:'Nœuds (kt)',unit:'kt',fn:x=>x*0.5400},
      {label:'Pieds/seconde (ft/s)',unit:'ft/s',fn:x=>x*0.9113},
    ]
  },
  conso:{
    label:'Consommation',
    from:{label:'Litres/100km (L/100km)',unit:'L/100km'},
    conversions:[
      {label:'km/L',unit:'km/L',fn:x=>100/x},
      {label:'Miles per gallon US (mpg)',unit:'mpg US',fn:x=>235.2/x},
      {label:'Miles per gallon UK (mpg)',unit:'mpg UK',fn:x=>282.5/x},
      {label:'L/mile',unit:'L/mile',fn:x=>x*1.609/100},
    ]
  },
  masse:{
    label:'Masse',
    from:{label:'Kilogrammes (kg)',unit:'kg'},
    conversions:[
      {label:'Livres (lb)',unit:'lb',fn:x=>x*2.2046},
      {label:'Tonnes (t)',unit:'t',fn:x=>x/1000},
      {label:'Grammes (g)',unit:'g',fn:x=>x*1000},
      {label:'Onces (oz)',unit:'oz',fn:x=>x*35.274},
    ]
  },
  pression:{
    label:'Pression pneus',
    from:{label:'Bar',unit:'bar'},
    conversions:[
      {label:'PSI (lb/in²)',unit:'PSI',fn:x=>x*14.504},
      {label:'kPa',unit:'kPa',fn:x=>x*100},
      {label:'Atmosphères (atm)',unit:'atm',fn:x=>x*0.9869},
      {label:'mmHg',unit:'mmHg',fn:x=>x*750.06},
    ]
  },
};

let currentConvTab='puissance';
function setConvTab(id,btn){
  currentConvTab=id;
  document.querySelectorAll('.conv-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  renderConv(1);
}

function renderConv(val){
  const def=convDefs[currentConvTab];
  const out=document.getElementById('conv-area');
  out.innerHTML=`
  <div class="conv-box">
    <div class="conv-side">
      <label>${def.from.label}</label>
      <input class="conv-input" id="conv-in" type="number" value="${val}" oninput="renderConv(this.value)" min="0"/>
      <span class="conv-unit">${def.from.unit}</span>
    </div>
    <div class="conv-arrow">→</div>
    <div class="conv-side">
      <label>Résultats</label>
      <div style="font-size:13px;color:var(--text2);margin-top:.25rem;">${def.conversions.length} unités disponibles</div>
    </div>
  </div>
  <div class="conv-result-grid">${def.conversions.map(c=>{
    const num=c.fn(parseFloat(val)||0);
    const disp=num<0.001?num.toExponential(3):num<10?num.toFixed(4):num<1000?num.toFixed(2):Math.round(num).toLocaleString('fr-FR');
    return`<div class="conv-result-card">
      <div class="conv-result-lbl">${c.label}</div>
      <div class="conv-result-val">${disp} <span style="font-size:12px;color:var(--text3)">${c.unit}</span></div>
    </div>`;
  }).join('')}</div>`;
}

// ── INIT ──
updateSim();
updateEntretien();
renderConv(1);

// ── FICHE CLIENT PDF ──
let currentCertCardId = null;

function closePerso() {
  document.getElementById('perso-overlay').classList.remove('open');
  // Reset bouton search si besoin
  if(currentCertCardId){
     const btn = document.getElementById('btn-cert-' + currentCertCardId);
     if(btn) btn.style.pointerEvents = 'auto';
  }
}

function openCertificat(cardId) {
  if (!checkAccess('passionne')) {
    showPage('plans');
    return;
  }
  currentCertCardId = cardId;
  const c = window.carCache[cardId];
  if(!c) return;
  
  // Ouvre la modale de perso
  document.getElementById('perso-overlay').classList.add('open');
  document.getElementById('p-client').focus();
}

function finalizeProDossier() {
  const cardId = currentCertCardId;
  const c = window.carCache[cardId];
  const clientName = document.getElementById('p-client').value || 'Dossier Technique';
  const kmValue = document.getElementById('p-km').value || 'Non renseigné';
  const vinValue = document.getElementById('p-vin').value || 'N/A';
  
  closePerso();
  
  const btn = document.getElementById('btn-cert-' + cardId);
  const oldHtml = btn.innerHTML;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border:2px solid var(--green);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></div> Génération...';
  btn.style.pointerEvents = 'none';

  // Construction complète du template A4
  const element = document.createElement('div');
  element.innerHTML = `
    <div style="width: 794px; background: #ffffff; color: #1a1a1a; padding: 40px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; box-sizing: border-box;">
      <!-- En-tête -->
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #5bbf85; padding-bottom: 20px; margin-bottom: 30px;">
        <div>
          <div style="font-family: 'DM Serif Display', serif; font-size: 32px; font-weight: bold; color: #1a1a1a;">AutoSpec <span style="color:#5bbf85;">Pro</span></div>
          <div style="font-size: 14px; color: #666; margin-top: 5px;">Rapport d'Expertise Automobile</div>
        </div>
        <div style="text-align: right; font-size: 12px; color: #666;">
          <div style="font-weight: bold; color: #1a1a1a; font-size: 14px; margin-bottom: 4px; text-transform: uppercase;">CLIENT : ${clientName}</div>
          <div>Édité le : ${new Date().toLocaleDateString('fr-FR')}</div>
          <div>Réf dossier : AS-${Math.floor(Math.random()*90000)+10000}</div>
        </div>
      </div>

      <!-- État du Véhicule & Identité -->
      <div style="display: flex; gap: 20px; margin-bottom: 30px;">
        <div style="flex: 2; background: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 5px solid #5bbf85;">
          <div style="font-size: 28px; font-weight: bold; margin-bottom: 5px;">${v(c.nom)} ${v(c.annee)}</div>
          <div style="font-size: 16px; color: #555;">${v(c.type)} • ${v(c.energie)} • ${v(c.pays)}</div>
          <div style="font-size: 12px; color: #999; margin-top: 8px;">Véhicule analysé par le moteur AutoSpec Pro</div>
        </div>
        <div style="flex: 1; background: #fdfdfd; padding: 25px; border-radius: 8px; border: 1px solid #eee; display: flex; flex-direction: column; justify-content: center;">
          <div style="font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 5px;">Kilométrage</div>
          <div style="font-size: 18px; font-weight: bold; color: #1a1a1a;">${kmValue}</div>
          <div style="font-size: 11px; color: #888; text-transform: uppercase; margin-top: 15px; margin-bottom: 5px;">Numéro VIN</div>
          <div style="font-size: 14px; color: #444; font-family: monospace;">${vinValue}</div>
        </div>
      </div>

      <!-- Données Techniques GRID -->
      <div style="display: flex; gap: 30px; margin-bottom: 30px;">
        
        <!-- Colonne 1 -->
        <div style="flex: 1;">
          <div style="font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Motorisation</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 30px;">
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Architecture</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.moteur?.type)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Cylindrée</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.moteur?.cylindree)}</td></tr>
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Puissance max</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.moteur?.puissance_ch)} ch @ ${v(c.moteur?.regime_puissance)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Couple max</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.moteur?.couple_nm)} @ ${v(c.moteur?.regime_couple)}</td></tr>
            <tr><td style="padding:8px 0; color:#555;">Alimentation</td><td style="padding:8px 0; font-weight:bold; text-align:right;">${v(c.moteur?.alimentation)}</td></tr>
          </table>

          <div style="font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Consommation & Autonomie</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Mixte</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.consommation?.mixte)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Émissions CO₂</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.consommation?.co2)}</td></tr>
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Réservoir</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.carburant?.reservoir)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555;">Autonomie ext.</td><td style="padding:8px 0; font-weight:bold; text-align:right;">${v(c.carburant?.autonomie_estimee)}</td></tr>
          </table>
        </div>

        <!-- Colonne 2 -->
        <div style="flex: 1;">
          <div style="font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Performances & Transmission</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 30px;">
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Vitesse max</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.performances?.vitesse_max)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">0 à 100 km/h</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.performances?.zero_cent)}</td></tr>
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Boîte</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.transmission?.boite)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555;">Motricité</td><td style="padding:8px 0; font-weight:bold; text-align:right;">${v(c.transmission?.entrainement)}</td></tr>
          </table>

          <div style="font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Châssis & Dimensions</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">L x l x h</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.chassis?.longueur)} x ${v(c.chassis?.largeur)} x ${v(c.chassis?.hauteur)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Empattement</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.chassis?.empattement)}</td></tr>
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Masse à vide</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.chassis?.masse)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Volume coffre</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.chassis?.coffre)}</td></tr>
            <tr><td style="padding:8px 0; color:#555;">Pneus (AV/AR)</td><td style="padding:8px 0; font-weight:bold; text-align:right;">${v(c.pneus?.avant)} / ${v(c.pneus?.arriere)}</td></tr>
          </table>
        </div>

      </div>

      <!-- Bloc Expertise & Maintenance -->
      <div style="margin-top: 30px; border-top: 2px solid #1a1a1a; padding-top: 20px;">
        <div style="font-size: 20px; font-weight: bold; color: #1a1a1a; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px;">
           🛠️ Expertise Maintenance & Vigilance
        </div>
        <div style="display: flex; gap: 30px; margin-bottom: 25px;">
          <div style="flex: 1; background: #f9f9f9; padding: 15px; border-radius: 8px;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; color: #444;">PRÉCONISATIONS HUILE</div>
            <div style="font-size: 16px; font-weight: bold; color: #1a1a1a;">${v(c.entretien?.huile_viscosite)}</div>
            <div style="font-size: 12px; color: #666; margin-top: 4px;">Norme : ${v(c.entretien?.huile_norme)}</div>
          </div>
          <div style="flex: 1; background: #f9f9f9; padding: 15px; border-radius: 8px;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; color: #444;">PÉRIODICITÉ VIDANGE</div>
            <div style="font-size: 16px; font-weight: bold; color: #1a1a1a;">${v(c.entretien?.frequence_vidange)}</div>
          </div>
          <div style="flex: 1; background: #f9f9f9; padding: 15px; border-radius: 8px;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; color: #444;">DISTRIBUTION</div>
            <div style="font-size: 15px; font-weight: bold; color: #1a1a1a;">${v(c.entretien?.distribution)}</div>
          </div>
        </div>

        <div style="background: rgba(231, 76, 60, 0.03); border: 1px solid rgba(231, 76, 60, 0.2); padding: 20px; border-radius: 8px;">
          <div style="font-weight: bold; color: #e74c3c; margin-bottom: 10px; font-size: 14px; display:flex; align-items:center; gap:8px;">
            ⚠️ POINTS DE VIGILANCE TECHNIQUE
          </div>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #444; line-height: 1.6;">
            ${(c.entretien?.points_vigilance||[]).map(pt => `<li>${pt}</li>`).join('')}
          </ul>
        </div>
      </div>

      <!-- Sceau de validation -->
      <div style="margin-top: 40px; text-align: left; padding: 20px; background: rgba(91, 191, 133, 0.05); border-radius: 8px; border: 1px solid rgba(91, 191, 133, 0.3);">
        <div style="font-weight: bold; color: #5bbf85; margin-bottom: 5px; font-size: 14px; display:flex; align-items:center; gap:8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          ÉTAT : DOCUMENT CERTIFIÉ CONFORME
        </div>
        <div style="font-size: 12px; color: #666; line-height: 1.5;">
          Les données techniques intégrées dans ce rapport ont été agrégées par les algorithmes d'analyse intelligence artificielle AutoSpec. Bien que croisées pour maximiser l'exactitude, elles sont fournies à titre indicatif et ne remplacent pas un certificat de conformité constructeur officiel.
        </div>
      </div>
    </div>
  `;

  // Redirection vers une nouvelle fenêtre pour affichage/impression native
  const newWin = window.open('', '_blank');
  if(!newWin) {
    btn.innerHTML = '❌ Fenêtre bloquée';
    setTimeout(() => { btn.innerHTML = oldHtml; btn.style.pointerEvents = 'auto'; }, 3000);
    return;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>AutoSpec - Dossier Expert ${v(c.nom)}</title>
      <style>
        body { margin: 0; padding: 40px 20px; background: #f0f0f0; display: flex; justify-content: center; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
        .page { background: #ffffff; width: 100%; max-width: 794px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden; }
        @media print {
          body { background: #ffffff; padding: 0; display: block; }
          .page { box-shadow: none; border-radius: 0; max-width: 100%; width: 100%; }
        }
      </style>
    </head>
    <body>
      <div class="page">${element.innerHTML}</div>
      <script>setTimeout(() => window.print(), 800);<\/script>
    </body>
    </html>
  `;
  
  newWin.document.write(htmlContent);
  newWin.document.close();

  // Restaure le bouton principal
  setTimeout(() => {
    btn.innerHTML = oldHtml;
    btn.style.pointerEvents = 'auto';
  }, 300);
}
