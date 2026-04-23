// ── CORE ENGINE ──
const API_BASE = ''; 
let currentTask = null;

// ── UTILS ──
const v = (x) => x || '---';

window.showPage = (id) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + id);
  if (target) target.classList.add('active');

  document.querySelectorAll('.tab, .m-tab').forEach(t => {
    t.classList.remove('active');
    if (t.innerText?.toLowerCase().includes(id) || t.getAttribute('onclick')?.includes(`'${id}'`)) {
      t.classList.add('active');
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.doSearch = async () => {
  const input = document.getElementById('vrm-input');
  const q = input.value.trim();
  if (!q) return;

  const btn = document.querySelector('.search-btn');
  const engine = document.getElementById('results-engine');
  
  btn.innerText = 'WAIT...';
  btn.disabled = true;
  engine.innerHTML = `
    <div class="loading-view">
      <div class="spinner"></div>
      <p style="font-family:var(--font-mono); font-size:11px; opacity:0.5; letter-spacing:0.1em;">SCANNING EXTERNAL DOMAINS // BYPASSING SECURITY</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/plate?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!res.ok) {
      engine.innerHTML = `
        <div class="grid-item" style="border:1px solid rgba(255,0,0,0.2); color:#ff4d4d; padding:3rem; text-align:center;">
          <p style="font-family:var(--font-mono); font-size:12px;">[ERROR] TARGET NOT FOUND IN PRIMARY OR SECONDARY DATABASES</p>
          <p style="font-size:11px; opacity:0.6; margin-top:10px;">ID: ${q.toUpperCase()}</p>
        </div>
      `;
      return;
    }

    // IA SPEC FETCH
    engine.innerHTML = `
      <div class="loading-view">
        <div class="spinner"></div>
        <p style="font-family:var(--font-mono); font-size:11px; opacity:0.5; letter-spacing:0.1em;">IDENTIFIED: ${data.model.toUpperCase()}</p>
        <p style="font-family:var(--font-mono); font-size:11px; opacity:0.5; letter-spacing:0.1em; margin-top:4px;">RETRIEVING SCHEMATICS VIA CLOUD-AI...</p>
      </div>
    `;

    const chatRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: "Tu es un expert automobile. Retourne un JSON technique. Pas de texte." },
          { role: 'user', content: `Fiche technique : ${data.model}` }
        ]
      })
    });

    const specs = await chatRes.json();
    renderDashboard(specs);

  } catch (err) {
    console.error(err);
    engine.innerHTML = `<p style="color:red; font-family:var(--font-mono); text-align:center;">CRITICAL SYSTEM FAILURE: ${err.message}</p>`;
  } finally {
    btn.innerText = 'ANALYSER';
    btn.disabled = false;
  }
};

function renderDashboard(c) {
  const m = c.moteur || {}, p = c.performances || {}, co = c.consommation || {};
  const engine = document.getElementById('results-engine');

  engine.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="car-name">${v(c.nom || c.modele).toUpperCase()}</div>
        <div class="car-meta">VERIFIED SCHEMATIC // ${v(c.annee)} // ${v(c.carburant).toUpperCase()}</div>
      </div>

      <div class="specs-rail">
        <div class="spec-box">
          <div class="spec-label">Output</div>
          <div class="spec-val">${v(m.puissance_ch)} HP</div>
          <div class="spec-sub">${v(m.puissance_kw)} KW</div>
        </div>
        <div class="spec-box">
          <div class="spec-label">Torque</div>
          <div class="spec-val">${v(m.couple_nm)} NM</div>
          <div class="spec-sub">RPM RANGE: ${v(m.regime_couple)}</div>
        </div>
        <div class="spec-box">
          <div class="spec-label">0-100</div>
          <div class="spec-val">${v(p.zero_cent)}s</div>
          <div class="spec-sub">ACCELERATION</div>
        </div>
        <div class="spec-box">
          <div class="spec-label">Max Vel.</div>
          <div class="spec-val">${v(p.vitesse_max)} KMH</div>
          <div class="spec-sub">TOP SPEED</div>
        </div>
      </div>

      <div class="content-grid">
        <div class="grid-item">
          <div class="section-head">Engine Specifications</div>
          <div class="data-row"><span class="data-key">Topology</span><span class="data-val">${v(m.type)}</span></div>
          <div class="data-row"><span class="data-key">Displacement</span><span class="data-val">${v(m.cylindree)}</span></div>
          <div class="data-row"><span class="data-key">Induction</span><span class="data-val">${v(m.alimentation)}</span></div>
          <div class="data-row"><span class="data-key">Drive Type</span><span class="data-val">${v(c.transmission || 'AWD')}</span></div>
          <div class="data-row"><span class="data-key">Gearbox</span><span class="data-val">${v(c.boite || 'DSG')}</span></div>
        </div>
        <div class="grid-item">
          <div class="section-head">Efficiency</div>
          <div class="data-row"><span class="data-key">Combined</span><span class="data-val">${v(co.mixte)} L</span></div>
          <div class="data-row"><span class="data-key">CO2 Mass</span><span class="data-val">${v(co.co2)} G</span></div>
          <div class="data-row"><span class="data-key">Fuel Cap.</span><span class="data-val">${v(c.reservoir || '55')} L</span></div>
        </div>
      </div>

      <div style="padding:1.5rem; background:rgba(255,255,255,0.02); display:flex; justify-content:center; gap:10px;">
        <button class="tab" onclick="window.print()" style="border:1px solid var(--border); border-radius:4px;">GENERATE PDF REPORT</button>
        <button class="tab active" onclick="showPage('compare')" style="border-radius:4px;">RUN COMPARISON</button>
      </div>
    </div>
  `;
}

// FORMAT AUTO PLAQUE
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('vrm-input');
  if(input) {
    input.addEventListener('input', (e) => {
      let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val.length > 7) val = val.slice(0, 7);
      e.target.value = val;
    });
  }
});
