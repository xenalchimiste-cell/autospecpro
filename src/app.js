// ── STATE ──
let currentUser = null;
let currentTier = 'free';
let authToken = localStorage.getItem('autospec_token');
let currentSearch = '';

const API_BASE = ''; // Vercel handles local /api routes

// ── UTILS ──
function v(x) { return x || '—'; }
function showStatus(msg, duration = 3000) {
  const s = document.getElementById('status-msg');
  s.innerHTML = msg;
  s.style.display = 'block';
  setTimeout(() => { s.style.display = 'none'; }, duration);
}

// ── NAVIGATION ──
window.showPage = function(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + id);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.remove('active');
    if (t.innerText.toLowerCase().includes(id) || t.getAttribute('onclick')?.includes(`'${id}'`)) {
      t.classList.add('active');
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ── SEARCH LOGIC ──
window.doSearch = async function() {
  const input = document.getElementById('q-input');
  const q = input.value.trim();
  if (!q) return;

  const btn = document.querySelector('.btn-search');
  const results = document.getElementById('results-area');
  
  btn.innerText = 'Recherche...';
  btn.disabled = true;
  results.innerHTML = `<div style="text-align:center; padding:4rem;"><svg class="spinner-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg><p style="margin-top:1rem; color:var(--text3);">Interrogation des bases de données...</p></div>`;

  try {
    const res = await fetch(`/api/plate?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!res.ok) {
      results.innerHTML = `<div style="text-align:center; padding:4rem; background:var(--surface); border-radius:24px; border:1px solid var(--red); color:var(--red);">
        <h3>Échec de l'identification</h3>
        <p style="margin-top:0.5rem; color:var(--text3);">Désolé, aucune correspondance trouvée pour la plaque ${q}.</p>
      </div>`;
      return;
    }

    // Now get the technical specs (IA Call)
    const carPrompt = data.model;
    const carbu = document.getElementById('f-carbu').value;
    const stage = document.getElementById('f-stage').value;

    const chatRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: "Tu es un expert automobile. Retourne un JSON technique pour le véhicule donné. Ne réponds que par le JSON." },
          { role: 'user', content: `Détails techniques pour : ${carPrompt} (Carburant: ${carbu}, Stage: ${stage})` }
        ]
      })
    });

    const specsText = await chatRes.text();
    const specs = JSON.parse(specsText.match(/\{[\s\S]*\}/)[0]);
    
    renderCard(specs);

  } catch (err) {
    console.error(err);
    showStatus("Erreur technique lors de la recherche");
  } finally {
    btn.innerText = 'Identifier';
    btn.disabled = false;
  }
};

function renderCard(c) {
  const m = c.moteur || {}, p = c.performances || {}, co = c.consommation || {};
  const container = document.getElementById('results-area');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="car-title">${v(c.nom || c.modele)}</div>
          <div class="car-subtitle">
            <span>${v(c.annee)}</span> • <span>${v(c.carburant)}</span> • <span>${v(c.boite)}</span>
          </div>
        </div>
        <div style="background:var(--accent); color:#000; padding:6px 14px; border-radius:100px; font-weight:800; font-size:12px;">SPEC. CONFIRMÉES</div>
      </div>

      <div class="specs-grid">
        <div class="spec-item">
          <div class="spec-label">Puissance</div>
          <div class="spec-val">${v(m.puissance_ch)}</div>
          <div class="spec-unit">chevaux (ch)</div>
        </div>
        <div class="spec-item">
          <div class="spec-label">Couple</div>
          <div class="spec-val">${v(m.couple_nm)}</div>
          <div class="spec-unit">Newton-mètre (Nm)</div>
        </div>
        <div class="spec-item">
          <div class="spec-label">0-100 KM/H</div>
          <div class="spec-val">${v(p.zero_cent)}</div>
          <div class="spec-unit">secondes</div>
        </div>
        <div class="spec-item">
          <div class="spec-label">Vitesse Max</div>
          <div class="spec-val">${v(p.vitesse_max)}</div>
          <div class="spec-unit">km/h</div>
        </div>
      </div>

      <div class="detail-section">
        <div class="section-title">Motorisation & Transmission</div>
        <div class="kv-grid">
          <div class="kv-row"><span class="kv-k">Architecture</span><span class="kv-v">${v(m.type)}</span></div>
          <div class="kv-row"><span class="kv-k">Cylindrée</span><span class="kv-v">${v(m.cylindree)}</span></div>
          <div class="kv-row"><span class="kv-k">Suraiguisement</span><span class="kv-v">${v(m.alimentation)}</span></div>
          <div class="kv-row"><span class="kv-k">Transmission</span><span class="kv-v">${v(c.transmission || 'Propulsion')}</span></div>
        </div>
      </div>

      <div class="detail-section" style="background:rgba(255,255,255,0.02)">
        <div class="section-title">Consommation & Rejets</div>
        <div class="kv-grid">
          <div class="kv-row"><span class="kv-k">Mixte</span><span class="kv-v">${v(co.mixte)}L / 100km</span></div>
          <div class="kv-row"><span class="kv-k">Émissions CO₂</span><span class="kv-v">${v(co.co2)} g/km</span></div>
          <div class="kv-row"><span class="kv-k">Réservoir</span><span class="kv-v">${v(c.reservoir || '50')} L</span></div>
          <div class="kv-row"><span class="kv-k">Norme</span><span class="kv-v">Euro 6d</span></div>
        </div>
      </div>

      <div style="padding:2.5rem; text-align:center;">
        <button class="nav-tab active" onclick="window.print()" style="margin:0 auto;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>
          Exporter le rapport technique
        </button>
      </div>
    </div>
  `;
}

// ── INITIALIZATION ──
document.addEventListener('DOMContentLoaded', () => {
  // Clear loading
  console.log("AutoSpec Pro Initialized");
});
