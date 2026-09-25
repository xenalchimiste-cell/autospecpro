console.log("AutoSpec Pro v1.5.0 Loaded");
// ── GLOBALS ──
// En local (file:// ou serveur statique `npm run dev`), les fonctions /api
// Vercel n'existent pas : on interroge directement l'API de production.
const isLocal = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = isLocal ? 'https://autospecpro.vercel.app' : '';

const TIERS = { FREE: 'free', PASSIONNE: 'passionne', PRO: 'pro' };
let currentTier = localStorage.getItem('autospec_tier') || TIERS.FREE;
let currentUser = null;
let gamificationData = null;
let activeRewardsTab = 'themes';
let authToken = localStorage.getItem('autospec_token');

let carA = null, carB = null;
window.carCache = window.carCache || {};
const GROQ_URL = API_BASE + '/api/chat?action=ai';

// ── PREMIUM UI UTILS ──
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  if (type === 'success') icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
  if (type === 'error') icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 500);
  }, 4000);
};

// ── AUTH LOGIC ──
function getDiscountMultiplier() {
  let m = 1.0;
  if (!currentUser) return m;
  if (currentUser.user_type === 'enterprise') m -= 0.30;
  if (currentUser.referred_by_id) m -= 0.15;
  return Math.max(0.1, m); // Minimum 10% du prix au cas où
}

function formatPrice(basePrice) {
  const m = getDiscountMultiplier();
  if (m === 1.0) return `${basePrice}€`;
  const discounted = Math.round(basePrice * m);
  return `<span style="text-decoration:line-through; font-size:0.6em; opacity:0.6; margin-right:4px;">${basePrice}€</span>${discounted}€`;
}

// ── SEARCH LOGIC ──
let searchMode = 'car';
function setSearchMode(m) {
  searchMode = m;
  const input = document.getElementById('q1');
  const container = document.getElementById('search-row-text');
  const vinContainer = document.getElementById('search-row-vin');
  const ocrContainer = document.getElementById('search-row-ocr');
  const icon = document.getElementById('search-icon');

  document.getElementById('mode-car').classList.toggle('active', m === 'car');
  document.getElementById('mode-vin').classList.toggle('active', m === 'vin');
  document.getElementById('mode-ocr').classList.toggle('active', m === 'ocr');

  container.style.display = m === 'car' ? 'flex' : 'none';
  vinContainer.style.display = m === 'vin' ? 'flex' : 'none';
  if (ocrContainer) ocrContainer.style.display = m === 'ocr' ? 'flex' : 'none';

  if (m === 'ocr') loadTesseract().catch(() => {}); // préchargement dès l'ouverture de l'onglet Photo

  if (m === 'car') {
    input.placeholder = "ex: BMW M3 2023, Peugeot 308 2022…";
    icon.innerHTML = '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>';
  }
}

async function searchVin() {
  const vin = document.getElementById('vin-input').value.trim().toUpperCase();
  if (!vin) return;

  if (vin.length !== 17) {
    document.getElementById('out-fiche').innerHTML = `<div class="err">Le VIN doit contenir exactement 17 caractères (vous en avez saisi ${vin.length}).</div>`;
    return;
  }

  document.getElementById('out-fiche').innerHTML = `<div class="loading"><div class="spin"></div>Interrogation de la base NHTSA...</div>`;

  try {
    const res = await fetch(`${API_BASE}/api/plate?vin=${encodeURIComponent(vin)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'VIN invalide ou introuvable');

    // Switch back to car mode and trigger full spec sheet
    setSearchMode('car');
    document.getElementById('q1').value = data.model;
    document.getElementById('vin-input').value = '';
    await searchFiche();

  } catch (err) {
    document.getElementById('out-fiche').innerHTML = `<div class="err">${ico('alerte')} ${err.message}</div>`;
  }
}

async function handleAdScan() {
  const adText = document.getElementById('ad-input').value.trim();
  const statusDiv = document.getElementById('ad-status');
  
  if (!adText) {
    statusDiv.style.display = 'block';
    statusDiv.style.color = 'var(--red)';
    statusDiv.innerHTML = "Veuillez coller le texte d'une annonce d'abord.";
    return;
  }

  statusDiv.style.display = 'block';
  statusDiv.style.color = 'var(--text)';
  statusDiv.innerHTML = '<span style="display:inline-block; animation:spin 1s linear infinite;">⏳</span> Analyse du texte en cours...';

  try {
    const res = await fetch(`${API_BASE}/api/extract-ad`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ adText })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'analyse');

    if (data.model) {
      statusDiv.innerHTML = `<span style="color:var(--green);">Véhicule détecté : ${esc(data.model)}. Génération de la fiche...</span>`;
      setTimeout(() => {
        setSearchMode('car');
        document.getElementById('q1').value = data.model;
        document.getElementById('ad-input').value = '';
        statusDiv.style.display = 'none';
        searchFiche();
      }, 800);
    }
  } catch (err) {
    console.error(err);
    statusDiv.style.color = 'var(--red)';
    statusDiv.innerHTML = `Erreur: ${esc(err.message)}`;
  }
}

// ── AUTH UI FUNCTIONS ──
function openAuthModal() {
  initRememberedInfo();
  setAuthMode('login'); // Forcer le mode connexion par défaut
  document.getElementById('auth-modal').style.display = 'flex';
  // Le bouton Google ne peut être dimensionné qu'une fois la modale visible :
  // tant qu'elle est masquée, son conteneur mesure zéro.
  dessinerBoutonGoogle();
}
function closeAuthModal() { document.getElementById('auth-modal').style.display = 'none'; }

function saveRememberedInfo(email, password, checked) {
  if (checked) {
    localStorage.setItem('as_rem_e', btoa(email));
    // Pour des raisons de sécurité, le mot de passe n'est plus stocké
  } else {
    localStorage.removeItem('as_rem_e');
    localStorage.removeItem('as_rem_p'); // Nettoyer l'ancienne clé si présente
  }
}

function initRememberedInfo() {
  const remE = localStorage.getItem('as_rem_e');
  if (remE) {
    try {
      const e = atob(remE);
      // Login form
      const lForm = document.getElementById('login-form');
      if (lForm.querySelector('[name="email"]')) {
        lForm.querySelector('[name="email"]').value = e;
      }
      if (lForm.querySelector('[name="rememberMe"]')) {
        lForm.querySelector('[name="rememberMe"]').checked = true;
      }
      
      // Register form: On garde la checkbox
      const rForm = document.getElementById('register-form');
      if (rForm.querySelector('[name="rememberMe"]')) {
        rForm.querySelector('[name="rememberMe"]').checked = true;
      }
    } catch(err) { console.error('RememberMe decode failed:', err); }
  }
}

function setAuthMode(m) {
  const isLogin = m === 'login';
  document.getElementById('login-form').style.display = isLogin ? 'flex' : 'none';
  document.getElementById('register-form').style.display = isLogin ? 'none' : 'flex';
  document.getElementById('toggle-login').classList.toggle('active', isLogin);
  document.getElementById('toggle-register').classList.toggle('active', !isLogin);
}

let siretVerified = false;
let siretDebounce = null;

function handleSiretInput(input) {
  // Format: XXX XXX XXX XXXXX
  let digits = input.value.replace(/[^0-9]/g, '');
  if (digits.length > 14) digits = digits.slice(0, 14);
  input.value = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{1,5})?/, (_, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(' ')
  );

  const status = document.getElementById('siret-status');
  siretVerified = false;

  if (digits.length < 14) {
    status.style.display = 'none';
    return;
  }

  // Show loading
  status.style.display = 'flex';
  status.style.background = 'var(--bg3)';
  status.style.border = '1px solid var(--border2)';
  status.style.color = 'var(--text2)';
  status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin_pay 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Vérification SIRET en cours...`;

  clearTimeout(siretDebounce);
  siretDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/verify-siret?siret=${digits}`);
      const data = await res.json();

      if (res.ok && data.valid) {
        siretVerified = true;
        status.style.background = 'rgba(91,191,133,0.08)';
        status.style.border = '1px solid rgba(91,191,133,0.3)';
        status.style.color = 'var(--green)';
        status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> <span>Entreprise trouvée : <strong>${data.company}</strong></span>`;
        // Auto-fill company name if the field is empty
        const companyField = document.querySelector('input[name="companyName"]');
        if (companyField && !companyField.value.trim()) {
          companyField.value = data.company;
        }
      } else {
        siretVerified = false;
        status.style.background = 'rgba(224,90,78,0.08)';
        status.style.border = '1px solid rgba(224,90,78,0.3)';
        status.style.color = 'var(--red)';
        status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> ${data.error || 'SIRET introuvable dans le registre officiel'}`;
      }
    } catch (err) {
      siretVerified = false;
      status.style.background = 'rgba(224,90,78,0.08)';
      status.style.border = '1px solid rgba(224,90,78,0.3)';
      status.style.color = 'var(--red)';
      status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Erreur lors de la vérification`;
    }
  }, 600);
}

function toggleEnterpriseFields(radio) {
  const section = document.getElementById('enterprise-fields');
  const companyName = section.querySelector('input[name="companyName"]');
  const siret = section.querySelector('input[name="siret"]');
  const isEnt = radio.value === 'enterprise';
  
  if (isEnt) {
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '0';
    companyName.required = true;
    siret.required = true;
  } else {
    section.style.display = 'none';
    companyName.required = false;
    siret.required = false;
    companyName.value = '';
    siret.value = '';
  }
}

window.handleRegister = async function(e) {
  e.preventDefault();
  console.log("Inscription lancée...");
  
  const form = document.getElementById('register-form');
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  const btn = form.querySelector('.auth-submit-btn');

  // Remember Me logic
  saveRememberedInfo(data.email, data.password, data.rememberMe === 'on' || data.rememberMe === true);

  if (data.userType === 'enterprise' && !siretVerified) {
    alert("Veuillez renseigner un numéro SIRET valide et attendre sa vérification.");
    return;
  }

  const oldHtml = btn.innerHTML;
  btn.innerHTML = `<svg class="spinner-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin_pay 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Traitement...`;
  btn.style.pointerEvents = 'none';

  try {
    let proofUrl = null;
    
    // Handle File Upload for Enterprise
    if (data.userType === 'enterprise') {
      const fileInput = document.getElementById('proof-file-input');
      const file = fileInput.files[0];
      if (!file) {
        alert("Veuillez uploader un justificatif (K-bis, carte pro...) pour votre entreprise.");
        btn.innerHTML = oldHtml;
        btn.style.pointerEvents = 'auto';
        return;
      }

      btn.innerHTML = `<span>Upload du justificatif...</span>`;
      const uploadRes = await fetch(`${API_BASE}/api/upload-proof?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,
      });

      if (!uploadRes.ok) throw new Error("Échec de l'upload du justificatif.");
      const blob = await uploadRes.json();
      proofUrl = blob.url;
    }

    btn.innerHTML = `<span>Création du compte...</span>`;
    const res = await fetch(API_BASE + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, proofUrl })
    });

    const result = await res.json();
    if (res.ok) {
      completeAuth(result.token, result.user);
    } else {
      const msg = result.error + (result.details ? ' : ' + result.details : '');
      showToast(msg || 'Erreur serveur', 'error');
      btn.innerHTML = oldHtml;
      btn.style.pointerEvents = 'auto';
    }
  } catch (err) {
    console.error('Registration error:', err);
    alert('Erreur technique : ' + err.message);
    btn.innerHTML = oldHtml;
    btn.style.pointerEvents = 'auto';
  }
}

window.handleLogin = async function(e) {
  e.preventDefault();
  const form = document.getElementById('login-form');
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  // Remember Me logic
  saveRememberedInfo(data.email, data.password, data.rememberMe === 'on' || data.rememberMe === true);

  try {
    const res = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (res.ok) {
      completeAuth(result.token, result.user);
    } else {
      showToast(result.error || 'Erreur serveur', 'error');
    }
  } catch (err) {
    console.error('Fetch error:', err);
    alert('Erreur technique (network/JSON): ' + err.message);
  }
}

function completeAuth(token, user) {
  authToken = token;
  currentUser = user;
  
  if (user && user.account_tier) {
    currentTier = user.account_tier;
  } else {
    currentTier = 'free';
  }
  localStorage.setItem('autospec_tier', currentTier);
  localStorage.setItem('autospec_token', token);

  updateNav();
  updateUIForTier();
  updateQuotaInfo(null); // le quota dépend du compte : réaffiché à la prochaine fiche
  closeAuthModal();
  startMessagePolling();
  requestNotificationPermission();
}

function handleLogout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('autospec_token');
  stopMessagePolling();
  updateNav();
  updateUIForTier();
  updateQuotaInfo(null);
}

function updateNav() {
  const area = document.getElementById('user-nav-area');
  if (!area) return;

  if (!currentUser) {
    area.innerHTML = `<button class="btn btn-outline btn-connect" onclick="openAuthModal()">Connexion</button>`;
    document.querySelectorAll('.subnav-admin').forEach(el => el.hidden = true);
    return;
  }

  const fn = currentUser.first_name || 'Vous';
  const tierLabels = { free: 'Gratuit', passionne: 'Passionné', pro: 'Pro' };
  const userEmail = (currentUser.email || '').toLowerCase().trim();
  const isAdmin = currentUser.user_type === 'admin' || userEmail === 'andreasgiacomello23@gmail.com';

  const notifSupported = 'Notification' in window && 'serviceWorker' in navigator;
  const notifGranted = notifSupported && Notification.permission === 'granted';
  const notifRow = !notifSupported ? ''
    : notifGranted
      ? `<div class="acct-row acct-row-static">Notifications activées</div>`
      : `<button class="acct-row" onclick="requestNotificationPermission()">Activer les notifications</button>`;

  // Un seul point d'entrée vers tout ce qui n'est pas une destination :
  // compte, abonnement, messages, notifications, admin, déconnexion.
  area.innerHTML = `
    ${currentTier !== 'pro' ? `<button class="btn-upgrade" onclick="showPage('plans')">Passer Pro</button>` : ''}
    <div class="acct-wrap">
      <button class="acct-trigger" id="acct-trigger" data-group="compte" aria-haspopup="menu" aria-expanded="false" onclick="toggleAcctMenu(event)">
        ${getUserAvatarHtml(currentUser)}
        <span class="acct-name">${esc(fn)}</span>
        <svg class="acct-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="nav-dot" id="msg-dot" style="display:none;"></span>
      </button>
      <div class="acct-menu" id="acct-menu" role="menu">
        <div class="acct-head">
          <span class="acct-head-name">${esc(fn)}</span>
          <span class="acct-tier acct-tier-${currentTier}">${tierLabels[currentTier] || 'Gratuit'}</span>
        </div>
        <button class="acct-row" onclick="showPage('account')">Mon compte</button>
        <button class="acct-row" onclick="showPage('plans')">Abonnement</button>
        <button class="acct-row" onclick="showPage('messages')">Messages<span class="nav-badge acct-badge" id="msg-badge-nav"></span></button>
        ${notifRow}
        ${isAdmin ? `<button class="acct-row acct-row-admin" onclick="showPage('admin')">Admin</button>` : ''}
        <div class="acct-sep"></div>
        <div class="acct-row acct-row-static">Code parrain <strong>${esc(currentUser.referral_code || '—')}</strong></div>
        <button class="acct-row acct-row-out" onclick="handleLogout()">Se déconnecter</button>
      </div>
    </div>`;

  document.querySelectorAll('.subnav-admin').forEach(el => el.hidden = !isAdmin);

  if (notifGranted) {
    navigator.serviceWorker.ready.then(reg => subscribeUserToPush(reg)).catch(() => {});
  }
}

// Google rend son bouton dans un iframe de largeur fixe : à 380 px il
// débordait d'un écran de 390 px une fois les marges retirées. On mesure le
// conteneur au moment du rendu, dans les bornes acceptées par l'API.
let _largeurGoogleRendue = 0;
function dessinerBoutonGoogle() {
  const conteneur = document.getElementById('google-signin-btn');
  if (!conteneur || typeof google === 'undefined' || !google.accounts) return;
  const dispo = conteneur.clientWidth || (window.innerWidth - 56);
  const largeur = Math.round(Math.min(380, Math.max(200, dispo)));
  if (largeur === _largeurGoogleRendue) return;   // rien à refaire
  _largeurGoogleRendue = largeur;
  conteneur.innerHTML = '';
  google.accounts.id.renderButton(conteneur, {
    theme: 'outline', size: 'large', width: String(largeur),
    text: 'continue_with', shape: 'pill',
  });
}

function initializeGoogleAuth() {
  if (typeof google === 'undefined') {
    setTimeout(initializeGoogleAuth, 100);
    return;
  }
  google.accounts.id.initialize({
    client_id: "548892582580-mh5isg91gtg86hjn7rb11vd5e8dton4f.apps.googleusercontent.com",
    callback: handleGoogleCredential
  });
  dessinerBoutonGoogle();
}

async function handleGoogleCredential(response) {
  try {
    const res = await fetch(API_BASE + '/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: response.credential })
    });
    const result = await res.json();
    if (res.ok) {
      completeAuth(result.token, result.user);
    } else {
      const msg = result.details ? `${result.error} : ${result.details}` : (result.error || 'Erreur lors de la connexion Google');
      alert(msg);
    }
  } catch (err) {
    console.error('Google Auth Error:', err);
    alert('Erreur technique : ' + err.message);
  }
}

// ════════════════════ REVIEWS SYSTEM ════════════════════
let currentRating = 0;

window.openReviewModal = function() {
  if (!authToken) {
    alert("Veuillez vous connecter pour laisser un avis.");
    openAuthModal('login');
    return;
  }
  document.getElementById('review-modal').style.display = 'flex';
  setRating(0);
  document.getElementById('review-comment').value = '';
};

window.closeReviewModal = function() {
  document.getElementById('review-modal').style.display = 'none';
};

window.setRating = function(val) {
  currentRating = val;
  const stars = document.querySelectorAll('.star-btn');
  stars.forEach((s, idx) => {
    if (idx < val) s.classList.add('active');
    else s.classList.remove('active');
  });
};

window.submitReview = async function() {
  const comment = document.getElementById('review-comment').value.trim();
  if (!currentRating) return alert("Veuillez sélectionner une note.");
  if (!comment) return alert("Veuillez écrire un petit commentaire.");

  try {
    const res = await fetch(API_BASE + '/api/reviews', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ rating: currentRating, comment })
    });
    const data = await res.json();
    if (res.ok) {
      alert("Merci ! Votre avis a été publié.");
      closeReviewModal();
      fetchReviews(); // Refresh list
    } else {
      alert(data.error || "Erreur lors de la publication.");
    }
  } catch (err) {
    alert("Erreur technique : " + err.message);
  }
};

window.fetchReviews = async function() {
  try {
    const res = await fetch(API_BASE + '/api/reviews');
    const reviews = await res.json();
    const container = document.getElementById('reviews-marquee-inner');
    
    if (reviews.length === 0) {
      container.innerHTML = '<div class="review-card"><p class="review-text">Aucun avis pour le moment. Soyez le premier !</p></div>';
      return;
    }

    const renderReview = (r) => `
      <div class="review-card">
        <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
        <p class="review-text">"${r.comment}"</p>
        <div class="review-author">— ${r.author_name}</div>
      </div>
    `;

    // Duplicate for infinite scroll effect
    const html = reviews.map(renderReview).join('');
    container.innerHTML = html + html; 
  } catch (err) {
    console.error('Fetch reviews error:', err);
  }
};

// Session check on load
window.addEventListener('DOMContentLoaded', async () => {
  initializeGoogleAuth();
  registerServiceWorker();
  fetchReviews();
  
  // Custom Callback Handler pour le retour Stripe
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('payment') === 'success') {
    alert("🎉 Paiement réussi ! Votre compte a été mis à jour.");
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('payment') === 'cancelled') {
    alert("Paiement annulé.");
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (authToken) {
    try {
      const res = await fetch(API_BASE + '/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
      if (res.ok) {
        const result = await res.json();
        currentUser = result.user;
        if (result.gamification) gamificationData = result.gamification;
        
        if (currentUser && currentUser.account_tier) {
          currentTier = currentUser.account_tier;
        } else {
          currentTier = 'free';
        }
        localStorage.setItem('autospec_tier', currentTier);

        updateNav();
        updateUIForTier();
        startMessagePolling();
      } else {
        handleLogout();
      }
    } catch (e) { handleLogout(); }
  }
});

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

// ── NAVIGATION ──
// Une seule table décrit toute l'arborescence : trois destinations principales
// (chercher une voiture, calculer, échanger) et un espace compte. Tout le reste
// vit un niveau en dessous, dans le sélecteur de section de sa destination.
const PAGES = {
  fiche:        { group: 'fiche',      label: 'Fiche technique' },
  compare:      { group: 'outils',     label: 'Comparateur',       tier: 'passionne' },
  sim:          { group: 'outils',     label: 'Simulateur',        tier: 'passionne' },
  entretien:    { group: 'outils',     label: "Coût d'entretien",  tier: 'pro' },
  community:    { group: 'communaute', label: 'Fil' },
  messages:     { group: 'communaute', label: 'Messages' },
  quiz:         { group: 'communaute', label: 'Quiz' },
  'user-profile': { group: 'communaute', label: 'Profil' },
  account:      { group: 'compte',     label: 'Mon compte' },
  plans:        { group: 'compte',     label: 'Abonnement' },
  admin:        { group: 'compte',     label: 'Admin' },
};
// Destination de repli quand on clique sur un groupe depuis la navigation.
const GROUP_HOME = { fiche: 'fiche', outils: 'compare', communaute: 'community', compte: 'account' };

function showPage(id, btn, fromDrawer=false, source='nav'){
  // Un clic sur une destination principale ouvre sa première section.
  if (GROUP_HOME[id] && !PAGES[id]) id = GROUP_HOME[id];

  // Sans compte, « Mon compte » n'a rien à montrer : on demande la connexion.
  if (id === 'account' && !currentUser) { openAuthModal(); return; }

  // Contrôle d'accès : la table fait foi, plus les attributs du bouton cliqué.
  const needed = PAGES[id]?.tier;
  if (needed && !checkAccess(needed)) {
    showToast(`« ${PAGES[id].label} » fait partie de l'offre ${needed === 'pro' ? 'Pro' : 'Passionné'}.`, 'info');
    id = 'plans';
  }

  document.querySelectorAll('.page.active').forEach(p=>p.classList.remove('active'));
  const page = document.getElementById('page-'+id);
  if (page) {
    page.classList.add('active');
    // Saut instantané : un scroll animé depuis le bas d'une autre page donne une impression de lenteur.
    window.scrollTo(0, 0);
    // Les rafraîchissements automatiques ne tournent que sur la page qui les affiche.
    if (id !== 'messages' && chatInterval) { clearInterval(chatInterval); chatInterval = null; }
    if (id !== 'community') stopChatPolling();
    if (id === 'account') updateAccountPage();
    if (id === 'messages') {
      fetchConversations();
      document.querySelectorAll('#msg-dot').forEach(el => el.style.display = 'none');
    }
    if (id === 'community') {
      fetchCommunityPosts();
      localStorage.setItem('last_comm_visit', Date.now().toString());
      document.querySelectorAll('#comm-badge, #comm-dot').forEach(el => el.style.display = 'none');

      if (Notification.permission === 'default') {
        setTimeout(requestNotificationPermission, 2000);
      }
    }
  }

  // Synchronisation des trois niveaux : destination principale (haut + barre du
  // bas), section active dans le sélecteur, et entrées de l'espace compte.
  const group = PAGES[id]?.group || id;
  document.querySelectorAll('.nav-tab, .bnav-item, .subnav-item, .acct-trigger').forEach(t => {
    t.classList.remove('active');
    t.removeAttribute('aria-current');
  });
  document.querySelectorAll(`.nav-tab[data-group="${group}"], .bnav-item[data-group="${group}"], .acct-trigger[data-group="${group}"]`)
    .forEach(t => { t.classList.add('active'); t.setAttribute('aria-current', 'page'); });
  document.querySelectorAll(`.subnav-item[data-page="${id}"]`)
    .forEach(t => { t.classList.add('active'); t.setAttribute('aria-current', 'page'); });

  // « Partager ma caisse » n'a de sens que sur le fil : partout ailleurs
  // ce bouton flottant ne faisait que recouvrir le contenu.
  document.body.classList.toggle('show-fab', id === 'community');

  closeAcctMenu();
  if(fromDrawer) closeDrawer();
  if (id === 'admin') loadAdminData();
  // Le quiz vit dans src/jeux.js ; quitter la page arrête son chrono.
  if (id === 'quiz') window.quizOuvrir?.(); else window.quizQuitter?.();
}

// ── MENU COMPTE ──
// L'avatar déclenchait handleLogout() : un clic de curiosité déconnectait.
function toggleAcctMenu(e) {
  e?.stopPropagation();
  const menu = document.getElementById('acct-menu');
  if (!menu) return;
  const open = menu.classList.toggle('open');
  document.getElementById('acct-trigger')?.setAttribute('aria-expanded', String(open));
}
function closeAcctMenu() {
  document.getElementById('acct-menu')?.classList.remove('open');
  document.getElementById('acct-trigger')?.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', e => {
  if (!e.target.closest?.('.acct-wrap')) closeAcctMenu();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAcctMenu(); });

// ── FERMETURE DES MODALES AU CLAVIER ──
// Chaque modale se fermait au clic sur son fond, mais rien ne permettait d'en
// sortir au clavier : on se retrouvait piégé derrière un voile.
const MODAL_CLOSERS = {
  'auth-modal': () => closeAuthModal(),
  'payment-modal': () => closePaymentModal(),
  'review-modal': () => closeReviewModal(),
  'postModal': () => closePostModal(),
  'playlistModal': () => closePlaylistModal(),
  'playlistDetailModal': () => closePlaylistDetail(),
  'postDetailModal': () => closePostDetail(),
};

function topmostOpenModal() {
  let best = null, bestZ = -1;
  for (const id of Object.keys(MODAL_CLOSERS)) {
    const el = document.getElementById(id);
    if (!el || getComputedStyle(el).display === 'none') continue;
    const z = Number(getComputedStyle(el).zIndex) || 0;
    if (z >= bestZ) { best = id; bestZ = z; }
  }
  return best;
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const id = topmostOpenModal();
  if (!id) return;
  e.preventDefault();
  try { MODAL_CLOSERS[id](); } catch (err) { console.warn('[modale] fermeture impossible :', err.message); }
});

function toggleDrawer(){ /* le tiroir a été remplacé par le menu compte */ }
function closeDrawer(){ /* idem : conservé pour les appels existants */ }

// ── TIERS LOGIC ──
function isCurrentUserAdmin() {
  if (!currentUser) return false;
  const userEmail = (currentUser.email || '').toLowerCase().trim();
  return currentUser.user_type === 'admin' || userEmail === 'andreasgiacomello23@gmail.com';
}

function checkAccess(requiredTier) {
  if (isCurrentUserAdmin()) return true;
  const levels = { 'free': 0, 'passionne': 1, 'pro': 2 };
  return levels[currentTier] >= levels[requiredTier];
}

let pendingPaymentTier = null;

window.selectTier = function(tier) {
  if (tier === 'free') {
    currentTier = tier;
    localStorage.setItem('autospec_tier', tier);
    updateUIForTier();
    showPage('plans');
  } else {
    window.openPaymentModal(tier);
  }
}

window.openPaymentModal = function(tier) {
  if (!currentUser) {
    alert("Veuillez vous connecter pour souscrire à une offre.");
    openAuthModal();
    return;
  }
  pendingPaymentTier = tier;
  const modal = document.getElementById('payment-modal');
  const planName = document.getElementById('pay-plan-name');
  const planPrice = document.getElementById('pay-plan-price');
  const btnPrice = document.getElementById('pay-btn-price');
  const featuresList = document.getElementById('pay-features');

  if (tier === 'passionne') {
    planName.innerHTML = 'Autospec <em style="color:var(--accent);">Passionné</em>';
    planPrice.innerHTML = '9€';
    btnPrice.innerHTML = '9€';
    featuresList.innerHTML = `
      <div class="payment-feature-item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Recherche par Plaque (Illimité)</div>
      <div class="payment-feature-item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Radar Comparatif 360°</div>
      <div class="payment-feature-item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Simulateur de Performances</div>
    `;
  } else if (tier === 'pro') {
    planName.innerHTML = 'Autospec <em style="color:var(--purple);">Pro</em>';
    planPrice.innerHTML = '29€';
    btnPrice.innerHTML = '29€';
    featuresList.innerHTML = `
      <div class="payment-feature-item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Accès Intégral (Tous modules)</div>
      <div class="payment-feature-item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Fiche Entretien & Préconisations</div>
      <div class="payment-feature-item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Export Dossier Expert (VIN + KM)</div>
    `;
  }

  // Reset button state
  const btn = document.getElementById('pay-btn-submit');
  btn.classList.remove('loading', 'success');
  const finalPrice = (tier === 'passionne') ? '9€' : '29€';
  btn.innerHTML = `S'abonner pour <span id="pay-btn-price">${finalPrice}</span>`;
  
  modal.style.display = 'flex';
}

window.closePaymentModal = function() {
  document.getElementById('payment-modal').style.display = 'none';
  pendingPaymentTier = null;
}

window.processPayment = async function(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('pay-btn-submit');
  
  // Loading state
  btn.classList.add('loading');
  btn.innerHTML = `<svg class="spinner-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> <span>Connexion à Stripe...</span>`;

  try {
    const res = await fetch(API_BASE + '/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken
      },
      body: JSON.stringify({ tier: pendingPaymentTier })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'initialisation du paiement');

    // Redirection vers le portail Stripe Checkout
    window.location.href = data.url;

  } catch (err) {
    console.error('Payment error:', err);
    alert('Erreur: ' + err.message);
    btn.classList.remove('loading');
    btn.innerHTML = `Aller au paiement sécurisé <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
  }
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
  const basePrices = { 'free': 0, 'passionne': 9, 'pro': 29 };
  document.querySelectorAll('.pricing-card').forEach(c => {
    c.classList.remove('active');
    const tierVal = c.id.replace('tier-', '');
    const cbtn = c.querySelector('.p-btn');
    const cprice = c.querySelector('.p-price');
    
    // Update dynamic price
    if (cprice && basePrices[tierVal] !== undefined) {
      const small = cprice.querySelector('small');
      const suffix = small ? small.outerHTML : '';
      cprice.innerHTML = formatPrice(basePrices[tierVal]) + suffix;
    }

    if (c.id === 'tier-' + currentTier) {
       c.classList.add('active');
       if(cbtn) cbtn.innerText = "Votre Plan Actuel";
    } else {
       if(cbtn) {
         cbtn.innerText = tierVal === 'free' ? 'Rester en Gratuit' : 'Choisir ' + tierVal.charAt(0).toUpperCase() + tierVal.slice(1);
       }
    }
  });

  // Sections verrouillées : le badge de palier n'apparaît que si l'accès manque.
  document.querySelectorAll('.subnav-item[data-tier]').forEach(t => {
    t.classList.toggle('locked', !checkAccess(t.getAttribute('data-tier')));
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
// v7 : le prompt impose désormais le français aux valeurs → les fiches
// mises en cache par la version précédente ne doivent plus être servies.
const CACHE_PREFIX = 'autospec_v7_';
const memCache = new Map();
const inflight = new Map();

try {
  Object.keys(localStorage)
    .filter(k => /^autospec_v[3456]_/.test(k))
    .forEach(k => localStorage.removeItem(k));
} catch (e) {}

function getCache(key) {
  if (memCache.has(key)) return memCache.get(key);
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return null;
    const { data, expiry } = JSON.parse(cached);
    if (Date.now() > expiry) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    memCache.set(key, data);
    return data;
  } catch (e) { return null; }
}

function setCache(key, data) {
  memCache.set(key, data);
  try {
    const expiry = Date.now() + (1000 * 60 * 60 * 24 * 7); // 7 jours
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, expiry }));
  } catch (e) {}
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function authHeaders(extra = {}) {
  return authToken ? { ...extra, 'Authorization': 'Bearer ' + authToken } : extra;
}

// Appel générique au proxy IA. Lève une erreur avec `code = 'QUOTA_EXCEEDED'`
// quand le quota gratuit du jour est atteint.
async function postAi(body) {
  let res;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30000);
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      signal: ctrl.signal,
      body: JSON.stringify(body)
    });
  } catch(networkErr) {
    throw new Error(networkErr.name === 'AbortError'
      ? 'Le serveur met trop de temps à répondre — réessayez.'
      : 'Impossible de joindre le serveur — vérifiez votre connexion.');
  } finally {
    clearTimeout(timeout);
  }

  let data;
  try {
    data = await res.json();
  } catch(_) {
    throw new Error(`Réponse invalide du serveur (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : data?.error?.message;
    const err = new Error(msg || `Erreur serveur HTTP ${res.status}`);
    err.code = data?.code;
    err.tier = data?.tier;
    throw err;
  }
  return data;
}

// Les fonctions de normalisation et de validation vivent dans
// src/lib/fiche.js, chargé avant ce fichier (voir index.html).

// Fiche technique IA (avec cache local et partage des requêtes identiques en cours).
function fetchFiche(rawQuery, carburant = '', stage = '', tech = {}) {
  const query = normalizeCarQuery(rawQuery);
  const params = { query, carburant, stage, tech };
  // La clé porte la requête canonique en clair : deux voitures différentes ne
  // peuvent plus se retrouver sur la même entrée à cause d'une collision de hash.
  const slug = canonicalQuery(rawQuery).replace(/\s+/g, '-').slice(0, 48);
  const cacheKey = slug + '-' + hashCode(JSON.stringify(params));
  const cached = getCache(cacheKey);
  if (cached) return Promise.resolve(cached);

  // Même requête déjà en cours (double clic, comparateur A = B…) : on la partage.
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);
  const p = (async () => {
    const data = await postAi({ kind: 'fiche', ...params });
    if (data.quota) updateQuotaInfo(data.quota);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Réponse inattendue de l\'API — aucun contenu retourné.');
    const raw = content.replace(/```[\w]*\n?/g,'').replace(/```/g,'').trim();
    let objet;
    try {
      objet = JSON.parse(raw);
    } catch (_) {
      throw new Error('Réponse IA incomplète — relancez la recherche.');
    }
    // La provenance vient du serveur, pas du modèle : on la rattache ici pour
    // qu'elle traverse le cache avec la fiche.
    if (Array.isArray(data.sources) && data.sources.length) {
      objet._sources = data.sources;
      return JSON.stringify(objet);
    }
    // On ne met en cache que les JSON valides (sinon une fiche cassée resterait 7 jours).
    setCache(cacheKey, raw);
    return raw;
  })().finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, p);
  return p;
}

// ── QUOTA GRATUIT ──
function updateQuotaInfo(quota) {
  const el = document.getElementById('quota-info');
  if (!el) return;
  const limited = quota && (quota.tier === 'anon' || quota.tier === 'free') && quota.remaining != null;
  el.hidden = !limited;
  if (!limited) return;
  const n = quota.remaining;
  el.classList.toggle('quota-low', n <= 1);
  el.innerHTML = n > 0
    ? `<strong>${n}</strong> fiche${n > 1 ? 's' : ''} gratuite${n > 1 ? 's' : ''} restante${n > 1 ? 's' : ''} aujourd'hui · <a href="#" onclick="showPage('plans'); return false;">Illimité avec Passionné</a>`
    : `Plus de fiches gratuites aujourd'hui · <a href="#" onclick="showPage('plans'); return false;">Passer en illimité</a>`;
}

function quotaCard(err) {
  const anon = err.tier === 'anon';
  return `<div class="card quota-card">
    <div class="quota-card-icon">⏳</div>
    <div class="quota-card-title">Limite gratuite atteinte</div>
    <div class="quota-card-text">${esc(err.message)}</div>
    <div class="quota-card-actions">
      ${anon ? `<button class="btn btn-outline" onclick="openAuthModal()">Créer un compte gratuit</button>` : ''}
      <button class="btn btn-primary" onclick="showPage('plans')">Voir les offres</button>
    </div>
  </div>`;
}

function badge(e){
  if(!e)return'';const l=String(e).toLowerCase();
  if(l.includes('electr'))return`<span class="badge badge-e">${ico('eclair')} ${esc(e)}</span>`;
  if(l.includes('hybride'))return`<span class="badge badge-h">${ico('batterie')} ${esc(e)}</span>`;
  return`<span class="badge badge-g">${esc(e)}</span>`;
}
// Échappe le HTML des données IA (évite qu'une réponse casse la mise en page ou injecte du code).
// ── ICÔNES ──
// Le produit affichait quatre-vingt-quinze émojis. Dans une mise en page
// éditoriale ils sonnent faux, ils ne suivent aucune couleur de thème et ils
// se dessinent différemment sur chaque système. Des tracés au trait, comme
// ceux de la navigation, qui héritent de currentColor.
const ICONES = {
  carburant: '<path d="M14 20V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v15"/><path d="M2 20h14"/><path d="M3 10h11"/><path d="M17 8l3 3v7a2 2 0 0 1-4 0v-9"/>',
  eclair:    '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  batterie:  '<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 11v2M10 11v2"/>',
  reinit:    '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  voiture:   '<path d="M5 17h14"/><path d="M3 17v-4l2-5h14l2 5v4"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  balance:   '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7 2 14h6L5 7z"/><path d="M19 7l-3 7h6l-3-7z"/><path d="M8 21h8"/>',
  jauge:     '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-3"/><path d="M12 3v2M21 12h-2M12 21v-2M3 12h2"/>',
  reservoir: '<path d="M6 4h12v14a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><path d="M6 10h12"/><path d="M4 4h16"/>',
  route:     '<path d="M4 21 8 3"/><path d="M20 21 16 3"/><path d="M12 5v3M12 11v3M12 17v3"/>',
  huile:     '<path d="M12 3s5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 5-9 5-9z"/>',
  calendrier:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  engrenage: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  ampoule:   '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z"/>',
  antenne:   '<path d="M5 12a7 7 0 0 1 7-7"/><path d="M2 12a10 10 0 0 1 10-10"/><circle cx="12" cy="18" r="2"/><path d="M12 16v-4"/>',
  interdit:  '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  alerte:    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  trophee:   '<path d="M8 21h8M12 17v4"/><path d="M6 4h12v5a6 6 0 0 1-12 0z"/><path d="M6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3"/>',
  cle:       '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  pneu:      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
  frein:     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 5.5v2M18.5 12h-2M12 18.5v-2M5.5 12h2"/>',
  presse:    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
  bouclier:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
};

function ico(nom, classe) {
  const d = ICONES[nom];
  if (!d) return '';
  return `<svg class="ico${classe ? ' ' + classe : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

function esc(x){return String(x).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function v(x){return (x===0||x)?esc(x):'—';}
// Affichage à la française : virgule décimale, espace insécable pour les
// milliers. Réservé aux grandeurs mesurées — une année ne se groupe pas,
// « 2 021 » serait une faute.
// Les valeurs composées gardent leur texte mais passent à la virgule :
// « 10.2 L/100 km (WLTP) » devient « 10,2 L/100 km (WLTP) ». Le point n'est
// remplacé qu'entre deux chiffres, pour ne pas toucher aux abréviations.
function vfr(x) {
  if (!hasVal(x)) return '—';
  return esc(String(x).replace(/(\d)\.(\d)/g, '$1,$2'));
}

function vnum(x) {
  if (!hasVal(x)) return '—';
  const brut = String(x).trim();
  // Seule une valeur purement numérique est reformatée. Sinon « 50-70 »,
  // une fourchette de gain, serait tronquée à « 50 », et « 6 cylindres en
  // ligne » réduit à « 6 » : toNum lit le premier nombre et jette le reste.
  if (!/^-?\d+(?:[.,]\d+)?$/.test(brut)) return esc(x);
  return toNum(brut).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}
function vnu(x, unit) {
  if (!hasVal(x)) return '—';
  return vnum(x) + (unit ? ' ' + unit : '');
}

// Valeur + unité : l'unité n'est accolée que si la donnée existe (les champs
// numériques sont désormais renvoyés bruts, sans unité, par l'IA).
function vu(x, unit){ return hasVal(x) ? esc(x) + (unit ? ' ' + unit : '') : '—'; }

function ficheTab(cardId, tab){
  document.querySelectorAll('#'+cardId+' .fiche-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#'+cardId+' .fiche-panel').forEach(p=>p.classList.remove('active'));
  document.querySelector('#'+cardId+' .fiche-tab[data-tab="'+tab+'"]').classList.add('active');
  document.querySelector('#'+cardId+' .fiche-panel[data-panel="'+tab+'"]').classList.add('active');
}

function stageColor(n){ return n===1?'s1':n===2?'s2':'s3'; }
function fiabiliteIcon(f){
  if(!f) return '<span class="dot-fiab dot-nc"></span>';
  const l = String(f).toLowerCase();
  if(l.includes('excell')) return '<span class="dot-fiab dot-ok"></span>';
  if(l.includes('bonne')) return '<span class="dot-fiab dot-ok"></span>';
  if(l.includes('correct')) return '<span class="dot-fiab dot-moy"></span>';
  return '<span class="dot-fiab dot-risque"></span>';
}

function renderCard(c){
  const m=c.moteur||{},p=c.performances||{},co=c.consommation||{};
  const dim=c.chassis||{},tr=c.transmission||{},su=c.suspensions||{},pn=c.pneus||{};
  const fuel=c.carburant||{}, tun=c.tuning||{}, ent=c.entretien||{};
  const cardId = 'card-'+Math.random().toString(36).slice(2,7);
  window.carCache[cardId] = c;

  // Tuile conso : on isole le nombre de son unité pour garder un chiffre lisible.
  const consoN = toNum(hasVal(co.mixte) ? co.mixte : null);
  const consoUnit = /kwh/i.test(String(co.mixte || '')) ? 'kWh/100 km' : 'L/100 km';
  const co2N = toNum(hasVal(co.co2) ? co.co2 : null);
  const consoHero = {
    val: consoN !== null ? consoN.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—',
    unit: (consoN !== null ? consoUnit : '') + (co2N !== null ? (consoN !== null ? ' · ' : '') + 'CO₂ ' + co2N.toLocaleString('fr-FR') + ' g/km' : ''),
  };

  // ── PANEL SPECS ──
  const panelSpecs = `
  <div class="hero-grid">
    <div class="hero-item"><div class="h-label">Puissance</div><div class="h-val">${vnum(m.puissance_ch)}</div><div class="h-unit">ch · ${vnum(m.puissance_kw)} kW</div></div>
    <div class="hero-item"><div class="h-label">Couple</div><div class="h-val">${vnum(m.couple_nm)}</div><div class="h-unit">N·m</div></div>
    <div class="hero-item"><div class="h-label">0–100 km/h</div><div class="h-val">${vnum(p.zero_cent)}</div><div class="h-unit">secondes</div></div>
    <div class="hero-item"><div class="h-label">Vitesse max</div><div class="h-val">${vnum(p.vitesse_max)}</div><div class="h-unit">km/h</div></div>
    <div class="hero-item"><div class="h-label">Conso. mixte</div><div class="h-val">${consoHero.val}</div><div class="h-unit">${consoHero.unit}</div></div>
    <div class="hero-item"><div class="h-label">Masse</div><div class="h-val">${vnum(dim.masse)}</div><div class="h-unit">kg</div></div>
  </div>
  <div class="accel-bloc">
    <div class="accel-tete">
      <span class="sec-title" style="margin:0">Montée en vitesse</span>
      <span class="accel-note">d'après les temps homologués</span>
    </div>
    <canvas class="accel-canvas"></canvas>
  </div>
  <div class="section"><div class="sec-title">Motorisation</div><div class="kv">
    <div class="kv-row"><span class="kv-k">Type</span><span class="kv-v">${v(m.type)}</span></div>
    <div class="kv-row"><span class="kv-k">Cylindrée</span><span class="kv-v">${vfr(m.cylindree)}</span></div>
    <div class="kv-row"><span class="kv-k">Régime puissance</span><span class="kv-v">${vfr(m.regime_puissance)}</span></div>
    <div class="kv-row"><span class="kv-k">Régime couple</span><span class="kv-v">${vfr(m.regime_couple)}</span></div>
    <div class="kv-row"><span class="kv-k">Alimentation</span><span class="kv-v">${v(m.alimentation)}</span></div>
    <div class="kv-row"><span class="kv-k">0–200 km/h</span><span class="kv-v">${vnum(p.zero_deux_cent)}</span></div>
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
    <div class="kv-row"><span class="kv-k">L × l × h</span><span class="kv-v">${vfr(dim.longueur)} × ${vfr(dim.largeur)} × ${vfr(dim.hauteur)}</span></div>
    <div class="kv-row"><span class="kv-k">Empattement</span><span class="kv-v">${vfr(dim.empattement)}</span></div>
    <div class="kv-row"><span class="kv-k">Coffre</span><span class="kv-v">${vnu(dim.coffre, 'L')}</span></div>
    <div class="kv-row"><span class="kv-k">Pneus AV/AR</span><span class="kv-v">${v(pn.avant)} / ${v(pn.arriere)}</span></div>
  </div></div>
  <div class="section"><div class="sec-title">Consommation</div><div class="kv">
    <div class="kv-row"><span class="kv-k">Mixte</span><span class="kv-v">${vfr(co.mixte)}</span></div>
    <div class="kv-row"><span class="kv-k">Urbaine</span><span class="kv-v">${vfr(co.urbaine)}</span></div>
    <div class="kv-row"><span class="kv-k">Autoroute</span><span class="kv-v">${vfr(co.autoroute)}</span></div>
    <div class="kv-row"><span class="kv-k">CO₂</span><span class="kv-v">${vfr(co.co2)}</span></div>
  </div></div>
  ${c.anecdote?`<div class="anecdote">${ico('ampoule')} ${esc(c.anecdote)}</div>`:''}`;

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
        <span class="stage-gain ${sc}">${vnu(st.gain_ch,'ch')} / ${vnu(st.gain_nm,'N·m')}</span>
      </div>
      <div class="stage-card-body">
        <div class="stage-stat-row"><span class="stage-stat-k">Puissance</span><span class="stage-stat-v">${vnu(st.puissance_ch,'ch')}</span></div>
        <div class="stage-stat-row"><span class="stage-stat-k">Couple</span><span class="stage-stat-v">${vnu(st.couple_nm,'N·m')}</span></div>
        <div class="stage-stat-row"><span class="stage-stat-k">Prix estimé</span><span class="stage-stat-v">${v(st.prix_estime)}</span></div>
      </div>
      <div class="stage-fiabilite">${fiabiliteIcon(st.fiabilite)} <span style="color:var(--text2)">${v(st.fiabilite)}</span></div>
    </div>`;
  }).join('');

  const panelStage = `
  ${tun.remarque_generale?`<div class="stage-remarque">${ico('engrenage')} ${esc(tun.remarque_generale)}</div>`:''}
  <div class="stage-grid">${stageCards}</div>
  <div class="footer-note">Estimations indicatives — résultats variables selon le préparateur.</div>`;

  // ── PANEL CARBURANT ──
  const panelFuel = `
  <div class="fuel-hero">
    <div class="fuel-item"><div class="fuel-icon">${ico('carburant')}</div><div class="fuel-label">Type</div><div class="fuel-val">${vfr(fuel.type)}</div></div>
    <div class="fuel-item"><div class="fuel-icon">${ico('jauge')}</div><div class="fuel-label">Indice d'octane</div><div class="fuel-val">${vnum(fuel.indice_octane)}</div></div>
    <div class="fuel-item"><div class="fuel-icon">${ico('reservoir')}</div><div class="fuel-label">Réservoir</div><div class="fuel-val">${vnum(fuel.reservoir)}</div><div class="fuel-sub">litres</div></div>
    <div class="fuel-item"><div class="fuel-icon">${ico('route')}</div><div class="fuel-label">Autonomie est.</div><div class="fuel-val">${vnum(fuel.autonomie_estimee)}</div><div class="fuel-sub">km</div></div>
  </div>
  <div class="section"><div class="sec-title">Consommation détaillée</div><div class="kv">
    <div class="kv-row"><span class="kv-k">Mixte</span><span class="kv-v">${vfr(co.mixte)}</span></div>
    <div class="kv-row"><span class="kv-k">Urbaine</span><span class="kv-v">${vfr(co.urbaine)}</span></div>
    <div class="kv-row"><span class="kv-k">Autoroute</span><span class="kv-v">${vfr(co.autoroute)}</span></div>
    <div class="kv-row"><span class="kv-k">CO₂</span><span class="kv-v">${vfr(co.co2)}</span></div>
  </div></div>
  ${fuel.remarque?`<div class="fuel-remarque">${ico('ampoule')} ${esc(fuel.remarque)}</div>`:''}`;

  // ── PANEL ENTRETIEN ──
  const vigItems = (Array.isArray(ent.points_vigilance)?ent.points_vigilance:[]).map(pt => `<li>${esc(pt)}</li>`).join('');
  const panelEntretien = `
  <div class="fuel-hero" style="background:rgba(212,168,67,0.05); border:1px solid rgba(212,168,67,0.1); margin-top:0;">
    <div class="fuel-item"><div class="fuel-icon">${ico('huile')}</div><div class="fuel-label">Huile Moteur</div><div class="fuel-val" style="font-size:16px;">${vfr(ent.huile_viscosite)}</div><div class="fuel-sub">${v(ent.huile_norme)}</div></div>
    <div class="fuel-item"><div class="fuel-icon">${ico('calendrier')}</div><div class="fuel-label">Vidange</div><div class="fuel-val" style="font-size:16px;">${vfr(ent.frequence_vidange)}</div></div>
    <div class="fuel-item"><div class="fuel-icon">${ico('engrenage')}</div><div class="fuel-label">Distribution</div><div class="fuel-val" style="font-size:14px; line-height:1.2;">${v(ent.distribution)}</div></div>
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

  // ── BANDEAU DE FIABILITÉ ──
  // L'utilisateur doit voir d'un coup d'œil SUR QUELLE VERSION porte la fiche
  // et à quel point l'identification est sûre.
  const subline = [c.annee, c.type, c.pays, c.prix].filter(hasVal).map(esc).join(' · ') || '—';
  const identBits = [
    c.generation && !/^g[ée]n[ée]ration$/i.test(c.generation) ? c.generation : '',
    c.finition,
    c.code_moteur ? 'moteur ' + c.code_moteur : '',
  ].filter(hasVal).map(esc).join(' · ');

  const confRaw = deaccent(String(c.confiance || '')).toLowerCase();
  const conf = confRaw.includes('haut') ? 'high' : confRaw.includes('faibl') ? 'low' : confRaw.includes('moyen') ? 'mid' : '';
  const confLabel = { high: 'Version identifiée avec certitude', mid: 'Version probable — à confirmer', low: 'Identification incertaine' }[conf];
  const trustBar = conf ? `<div class="trust trust-${conf}">
    <span class="trust-dot"></span>
    <span class="trust-txt"><strong>${confLabel}</strong>${hasVal(c.precision_note) ? ' — ' + esc(c.precision_note) : ''}</span>
  </div>` : '';

  const variants = (Array.isArray(c.variantes_proches) ? c.variantes_proches : [])
    .filter(hasVal).slice(0, 4)
    .map(x => String(x).trim())
    .filter(x => x.toLowerCase() !== String(c.nom || '').toLowerCase());
  const variantBar = variants.length ? `<div class="trust-variants">
    <span class="tv-label">Pas la bonne version ?</span>
    ${variants.map(x => `<button type="button" class="tv-chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}
  </div>` : '';

  // Provenance : n'est affichée que si une base officielle a réellement
  // fourni des valeurs. Revendiquer une source qu'on n'a pas consultée serait
  // pire que de ne rien dire.
  const sources = Array.isArray(c._sources) ? c._sources : [];
  const sourcesHtml = sources.length ? `<div class="fiche-sources">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
    <span>${sources.map(s => `<strong>${esc(s.champs.join(', '))}</strong> d'après <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.nom)}</a>${s.correspondance ? ` — ${esc(s.correspondance)}` : ''}`).join(' · ')}</span>
  </div>` : '';

  const alertBar = (c._alerts || []).length ? `<div class="trust trust-warn">
    <span class="trust-dot"></span>
    <span class="trust-txt">${c._alerts.map(esc).join(' ')}</span>
  </div>` : '';

  return`<div class="card fade" id="${cardId}">
  <div class="card-head">
    <div class="car-name">${v(c.nom)} ${badge(c.energie)}</div>
    <div class="car-sub">${subline}</div>
    ${identBits ? `<div class="car-ident">${identBits}</div>` : ''}
  </div>
  ${trustBar}${alertBar}${variantBar}
  <div class="fiche-tabs">
    <button class="fiche-tab active" data-tab="specs" onclick="ficheTab('${cardId}','specs')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
      Caractéristiques
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
  ${sourcesHtml}
  <div class="card-foot">
    <span class="footer-note">${sourcesHtml ? 'Champs non couverts par la source : générés par IA.' : 'Données générées par IA — à titre indicatif.'}</span>
    <button type="button" class="report-open" onclick="toggleReport('${cardId}')">Signaler une erreur</button>
  </div>
  <div class="report-form" id="report-${cardId}" hidden></div>
</div>`;
}

// ── SIGNALEMENT D'UNE DONNÉE FAUSSE ──
// La fiche annonce un niveau de confiance ; sans retour, ce niveau reste une
// promesse. Ces signalements disent où le modèle se trompe vraiment.
const REPORT_FIELDS = [
  ['identification', "Ce n'est pas le bon véhicule"],
  ['puissance', 'Puissance'],
  ['couple', 'Couple'],
  ['performances', '0–100, vitesse max'],
  ['consommation', 'Consommation, CO₂'],
  ['masse', 'Masse'],
  ['dimensions', 'Dimensions, coffre'],
  ['transmission', 'Boîte, transmission'],
  ['entretien', 'Entretien, huile'],
  ['tuning', 'Préparations (stages)'],
  ['autre', 'Autre'],
];

window.toggleReport = function(cardId) {
  const box = document.getElementById('report-' + cardId);
  if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  const car = window.carCache[cardId] || {};
  box.innerHTML = `
    <label class="report-row">
      <span class="report-label">Quelle donnée est fausse ?</span>
      <select class="s-input report-field" id="rf-${cardId}">
        ${REPORT_FIELDS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
      </select>
    </label>
    <label class="report-row">
      <span class="report-label">La bonne valeur, si vous la connaissez</span>
      <input class="s-input" id="rv-${cardId}" maxlength="200" placeholder="ex : 250 ch, et non 245"/>
    </label>
    <div class="report-actions">
      <button type="button" class="btn btn-outline" onclick="toggleReport('${cardId}')">Annuler</button>
      <button type="button" class="btn btn-primary" onclick="sendReport('${cardId}')">Envoyer le signalement</button>
    </div>`;
  box.hidden = false;
  box.dataset.query = car._query || car.nom || '';
  document.getElementById('rf-' + cardId)?.focus();
};

window.sendReport = async function(cardId) {
  const box = document.getElementById('report-' + cardId);
  const field = document.getElementById('rf-' + cardId)?.value;
  const expected = document.getElementById('rv-' + cardId)?.value || '';
  const query = box?.dataset.query || '';
  if (!query || !field) return;

  const btn = box.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
  try {
    const res = await fetch(API_BASE + '/api/report', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ query, field, expected }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Signalement non enregistré.');
    box.innerHTML = '<div class="report-done">Merci — c\'est noté. Les signalements servent à corriger les fiches les plus consultées.</div>';
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Envoyer le signalement'; }
    showToast(err.message, 'error');
  }
};

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
  if(carb) html += `<span class="filter-active-chip">${ico('carburant')} ${carb}</span>`;
  if(stage) html += `<span class="filter-active-chip">${ico('eclair')} ${stage}</span>`;
  chips.innerHTML = html;
}

function resetFilters(){
  document.getElementById('f-carburant').value = '';
  document.getElementById('f-stage').value = '';
  updateFilterChips();
}

// ── FICHE ──
function qf(t){setSearchMode('car');document.getElementById('q1').value=t;searchFiche();}

// ── LES PLUS CONSULTÉES ──
// Remplace un bandeau de logos de marques qui suggérait des partenariats
// inexistants. Ces modèles viennent du cache de fiches : c'est ce que le site
// a réellement produit. Si la liste est vide — installation neuve — le bloc
// reste masqué plutôt que d'afficher une promesse creuse.
// « bmw m3 competition » doit se lire « BMW M3 Competition ». Une simple
// capitale initiale donnerait « Bmw M3 Gti » : les sigles et désignations
// s'écrivent en capitales, le reste prend une majuscule.
function habillerRequete(q) {
  return String(q).split(/\s+/).filter(Boolean).map(mot => {
    if (/\d/.test(mot) || mot.length <= 3) return mot.toUpperCase();
    return mot.charAt(0).toUpperCase() + mot.slice(1);
  }).join(' ');
}

async function chargerPlusVues() {
  const bloc = document.getElementById('plus-vues');
  const liste = document.getElementById('plus-vues-liste');
  if (!bloc || !liste) return;
  try {
    const res = await fetch(API_BASE + '/api/populaires');
    if (!res.ok) return;
    const data = await res.json();
    const fiches = (data.fiches || []).filter(f => f.requete && f.requete.length > 2).slice(0, 10);
    if (fiches.length < 3) return;
    liste.innerHTML = fiches.map(f => {
      const titre = habillerRequete(f.requete);
      return `<button type="button" class="chip" data-q="${esc(titre)}">${esc(titre)}</button>`;
    }).join('');
    bloc.hidden = false;
  } catch (e) {
    // Rien à afficher n'est pas une erreur : le bloc reste simplement masqué.
  }
}
window.addEventListener('DOMContentLoaded', chargerPlusVues);

// ── RECHERCHES RÉCENTES ──
const RECENT_KEY = 'autospec_recent_searches';
function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; }
}
function addRecentSearch(q) {
  const list = [q, ...getRecentSearches().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
  renderRecentSearches();
}
function renderRecentSearches() {
  const box = document.getElementById('recent-searches');
  if (!box) return;
  const list = getRecentSearches();
  box.hidden = list.length === 0;
  box.innerHTML = list.length
    ? `<span class="recent-label">Récent</span>` + list.map(q =>
        `<button type="button" class="chip chip-recent" data-q="${esc(q)}">${esc(q)}</button>`).join('')
    : '';
}
window.addEventListener('DOMContentLoaded', () => {
  renderRecentSearches();
  // Toute puce porteuse de data-q relance une recherche : variantes d'une
  // fiche, recherches récentes, modèles les plus consultés.
  document.addEventListener('click', e => {
    const chip = e.target.closest?.('[data-q]');
    if (chip) qf(chip.dataset.q);
  });
});

// ── ANNONCE D'OUVERTURE ──
// L'attente durait plusieurs secondes devant un squelette gris. Comme la
// marque se déduit de la requête avant même d'interroger le modèle, on
// l'annonce tout de suite : le temps mort devient une présentation.
// Pas de logo constructeur — ce sont des marques déposées ; c'est le nom
// qui porte l'identité, en capitales largement espacées.
function ficheSkeleton(label, query) {
  const { brand, model } = brandAndModel(query || '');
  const titre = brand || 'AutoSpec';
  const sous = model || (brand ? '' : 'Identification en cours');

  return `<div class="card skeleton-card" aria-busy="true" aria-live="polite">
    <div class="reveal">
      <div class="reveal-brand">${esc(titre)}</div>
      <div class="reveal-rule"></div>
      ${sous ? `<div class="reveal-model">${esc(sous)}</div>` : ''}
    </div>
    <div class="skeleton-status"><div class="spin"></div><span id="load-status">${esc(label)}</span></div>
    <div class="sk-grid">${'<div class="sk sk-box"></div>'.repeat(6)}</div>
    <div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div>
  </div>`;
}

// Les six chiffres de tête montent depuis zéro, décalés les uns des autres :
// un tableau de bord qui s'allume plutôt que six blocs qui apparaissent.
//
// Règle absolue : la valeur réelle doit s'afficher quoi qu'il arrive. Une
// animation qui écrit 0 en attendant requestAnimationFrame laisserait des
// zéros à l'écran dès que l'onglet passe en arrière-plan, où le navigateur
// gèle les images. D'où le garde-fou en fin de fonction.
function animateHeroFigures(cardEl) {
  if (!cardEl) return;
  const sansMouvement = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (sansMouvement || document.hidden) return;

  cardEl.querySelectorAll('.hero-item .h-val').forEach((el, i) => {
    const cible = toNum(el.textContent);
    if (cible === null || cible === 0) return;
    const final = el.textContent;
    const decimales = /[.,]/.test(final) ? 1 : 0;
    const depart = 90 + i * 70, duree = 620;

    // Le filet de sécurité est posé AVANT de toucher au contenu : même si
    // l'animation ne démarre jamais, la valeur revient.
    const secours = setTimeout(() => { el.textContent = final; }, depart + duree + 400);

    el.textContent = decimales > 0 ? '0,0' : '0';
    setTimeout(() => {
      if (document.hidden) { clearTimeout(secours); el.textContent = final; return; }
      const t0 = performance.now();
      (function pas(now) {
        const p = Math.min((now - t0) / duree, 1);
        const cur = cible * (1 - Math.pow(1 - p, 3));
        el.textContent = decimales > 0
          ? cur.toFixed(1).replace('.', ',')
          : Math.round(cur).toLocaleString('fr-FR');
        if (p < 1) requestAnimationFrame(pas);
        else { clearTimeout(secours); el.textContent = final; }
      })(performance.now());
    }, depart);
  });
}

// Numéro de la dernière recherche : une réponse plus ancienne n'écrase jamais la plus récente.
let ficheSeq = 0;
async function searchFiche() {
  const input = document.getElementById('q1');
  let q = input.value.trim();
  if (!q) return;
  // Correction visible des fautes de marque / chiffres collés (hors mode plaque) :
  // l'utilisateur voit exactement sur quoi la recherche a porté.
  if (searchMode !== 'plate') {
    const fixed = normalizeCarQuery(q);
    if (fixed && fixed !== q) { q = fixed; input.value = fixed; }
  }

  const seq = ++ficheSeq;
  const stage = document.getElementById('f-stage').value;
  const carb = document.getElementById('f-carburant').value;
  const out = document.getElementById('out-fiche');
  const btn = document.getElementById('btn-search');
  if (btn) btn.classList.add('is-loading');
  input.blur(); // ferme le clavier sur mobile
  // ── SÉQUENCE DE LOADER ──
  const statusMessages = {
    car: [
      "Analyse des spécifications techniques...",
      "Consultation de la base de données Groq IA...",
      "Calcul des rapports poids/puissance...",
      "Compilation des données de maintenance..."
    ],
    plate: [
      "Connexion aux bases de données multi-sources (Moove/Oscaro)...",
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

  // Affichage du loader initial (squelette de fiche : la page ne « saute » pas au rendu)
  out.innerHTML = searchMode === 'plate'
    ? ficheSkeleton("Initialisation de l'identification...", '')
    : ficheSkeleton('Analyse AutoSpec en cours...', q);
  if (out.getBoundingClientRect().top > window.innerHeight * 0.6) {
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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
        const plateRes = await fetch(`${API_BASE}/api/plate?q=${encodeURIComponent(q)}`);
        const plateData = await plateRes.json();
        
        clearInterval(msgInterval);
        if (seq !== ficheSeq) return;
        
        if (!plateRes.ok) {
          if (plateData.error === 'plate_provider_unavailable') {
            out.innerHTML = `
              <div class="card" style="border-color:var(--border); text-align:center; padding:2rem;">
                <div class="etat-ico">${ico('antenne')}</div>
                <div style="font-weight:bold; color:var(--text); margin-bottom:0.5rem;">Service d'identification saturé</div>
                <div style="color:var(--text2); font-size:13px; margin-bottom:1.5rem;">Les serveurs d'identification partenaires ne répondent pas. Pour une identification 100% garantie, vous pouvez configurer une clé <strong>RAPIDAPI_KEY</strong> dans Vercel.</div>
                <p style="font-size:12px; color:var(--text2); margin-bottom:1.5rem;">Sinon, passe en recherche manuelle (marque + modèle + année).</p>
                <button class="btn btn-primary" onclick="setSearchMode('car'); document.getElementById('q1').value=''; document.getElementById('q1').focus();" style="width:auto; padding: 0.5rem 1.5rem;">Passer en recherche manuelle</button>
              </div>
            `;
            return;
          }

          if (plateData.error === 'identification_failed') {
            if (plateData.diagnostics) console.warn("[AutoSpec Diagnostics]", plateData.diagnostics);
            out.innerHTML = `
              <div class="card" style="border-color:var(--border); text-align:center; padding:2rem;">
                <div class="etat-ico">${ico('antenne')}</div>
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
        out.innerHTML = ficheSkeleton(`Véhicule identifié : ${finalModel}`, finalModel);
        await new Promise(r => setTimeout(r, 600)); // Pause pour lecture
        setStatus("Génération de la fiche technique haute fidélité...");
      } catch (err) {
        clearInterval(msgInterval);
        console.error("[AutoSpec] Erreur identification:", err);
        throw err;
      }
    } else {
      // Messages de progression pendant la génération
      statusMessages.car.forEach((msg, i) => setTimeout(() => {
        if (seq === ficheSeq) setStatus(msg);
      }, 500 + i * 900));
    }

    const raw = await fetchFiche(finalModel, carb, stage, techData);
    if (seq !== ficheSeq) return;
    const car = sanitizeFiche(JSON.parse(raw));
    car._query = finalModel;

    if (isEmptyFiche(car)) {
        out.innerHTML = `
          <div class="card" style="border-color:var(--border); text-align:center; padding:2rem;">
            <div class="etat-ico">${ico('interdit')}</div>
            <div style="font-weight:bold; color:var(--text); margin-bottom:0.5rem;">Aucun véhicule identifié</div>
            <div style="color:var(--text3); font-size:13px;">Aucune donnée fiable pour « ${esc(q)} ».<br/>Précisez la marque, le modèle et l'année — par exemple <strong>Peugeot 308 GT 1.6 THP 2018</strong>.</div>
          </div>
        `;
        return;
    }
    
    out.innerHTML = renderCard(car);
    const carte = out.querySelector('.card');
    animateHeroFigures(carte);
    animerCourbe(carte, car);
    if (searchMode !== 'plate') addRecentSearch(q);

    if (stage) {
      const cardEl = out.querySelector('.card');
      if (cardEl) ficheTab(cardEl.id, 'stage');
    } else if (carb) {
      const cardEl = out.querySelector('.card');
      if (cardEl) ficheTab(cardEl.id, 'carburant');
    }
  } catch (e) {
    if (seq !== ficheSeq) return;
    if (e.code === 'QUOTA_EXCEEDED') { out.innerHTML = quotaCard(e); return; }
    out.innerHTML = `<div class="card"><div class="err">${ico('alerte')} ${esc(e.message)}<br/><button class="btn btn-outline" style="margin-top:1rem" onclick="searchFiche()">Réessayer</button></div></div>`;
  } finally {
    if (seq === ficheSeq && btn) btn.classList.remove('is-loading');
  }
}

// ── COMPARATEUR ──
function presetCompare(a,b){
  document.getElementById('qA').value=a;
  document.getElementById('qB').value=b;
  searchCompare();
}
let compareSeq = 0;
async function searchCompare(){
  const qA=document.getElementById('qA').value.trim();
  const qB=document.getElementById('qB').value.trim();
  if(!qA||!qB)return;
  const seq = ++compareSeq;

  const carbA = document.getElementById('cA-carburant').value;
  const stageA = document.getElementById('cA-stage').value;
  const carbB = document.getElementById('cB-carburant').value;
  const stageB = document.getElementById('cB-stage').value;

  const out=document.getElementById('out-compare');

  // Label contextuel
  const labelA = [qA, carbA, stageA].filter(Boolean).join(' · ');
  const labelB = [qB, carbB, stageB].filter(Boolean).join(' · ');
  out.innerHTML=`<div class="loading"><div class="spin"></div>Comparaison de ${esc(labelA)} vs ${esc(labelB)}…</div>`;

  try{
    const [rA,rB]=await Promise.all([
      fetchFiche(qA, carbA, stageA),
      fetchFiche(qB, carbB, stageB)
    ]);
    if (seq !== compareSeq) return;
    carA=sanitizeFiche(JSON.parse(rA)); carB=sanitizeFiche(JSON.parse(rB));
    const isErrA = isEmptyFiche(carA);
    const isErrB = isEmptyFiche(carB);
    
    if (isErrA || isErrB) {
        out.innerHTML = `
          <div class="card" style="border-color:var(--border); text-align:center; padding:2rem;">
            <div class="etat-ico">${ico('interdit')}</div>
            <div style="font-weight:bold; color:var(--text); margin-bottom:0.5rem;">Requête incorrecte</div>
            <div style="color:var(--text3); font-size:13px;">Rien n'a été trouvé à ce sujet. Assurez-vous d'entrer des modèles valides.</div>
          </div>
        `;
        return;
    }

    // Ajoute un badge de filtre dans le nom si stage ou carburant sélectionné
    if(stageA) carA._filterLabel = stageA;
    if(stageB) carB._filterLabel = stageB;
    if(carbA) carA._carbLabel = carbA;
    if(carbB) carB._carbLabel = carbB;
    out.innerHTML=renderCompare(carA,carB);
    requestAnimationFrame(()=>drawRadar(carA,carB));
  }catch(e){
    if (seq !== compareSeq) return;
    if (e.code === 'QUOTA_EXCEEDED') { out.innerHTML = quotaCard(e); return; }
    out.innerHTML=`<div class="card"><div class="err">${ico('alerte')} ${esc(e.message)}</div></div>`;
  }
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
    {label:'0–100 km/h (s)',a:v(pA.zero_cent),b:v(pB.zero_cent),cmp:cmpNum(pA.zero_cent,pB.zero_cent,true)},
    {label:'Vitesse max (km/h)',a:v(pA.vitesse_max),b:v(pB.vitesse_max),cmp:cmpNum(pA.vitesse_max,pB.vitesse_max)},
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
      <p>${v(A.annee)} · ${v(A.type)} · ${badge(A.energie)}${A._filterLabel?` <span class="badge" style="background:rgba(155,127,232,.15);color:var(--purple);border:1px solid rgba(155,127,232,.25)">${ico('eclair')} ${A._filterLabel}</span>`:''}</p>
    </div>
    <div class="cmp-head" style="background:var(--bg3);display:flex;align-items:center;justify-content:center;border-right:1px solid var(--border)">
      <span style="font-size:13px;font-weight:600;color:var(--text3);">VS</span>
    </div>
    <div class="cmp-head">
      <h3>${v(B.nom)}</h3>
      <p>${v(B.annee)} · ${v(B.type)} · ${badge(B.energie)}${B._filterLabel?` <span class="badge" style="background:rgba(155,127,232,.15);color:var(--purple);border:1px solid rgba(155,127,232,.25)">${ico('eclair')} ${B._filterLabel}</span>`:''}</p>
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
    ${A.anecdote?`<div class="anecdote" style="border-right:1px solid var(--border)">${ico('ampoule')} ${esc(A.anecdote)}</div>`:'<div></div>'}
    ${B.anecdote?`<div class="anecdote">${ico('ampoule')} ${esc(B.anecdote)}</div>`:'<div></div>'}
  </div>
  <div class="footer-note" style="color:var(--green)">${ico('trophee')} Valeurs en vert = meilleure dans la catégorie</div>
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
    // Virgule décimale, comme partout ailleurs sur le site.
    el.textContent = (decimals > 0
      ? cur.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : Math.round(cur).toLocaleString('fr-FR')) + suffix;
    if(p<1) _animTargets[id] = requestAnimationFrame(step);
    else { el.dataset.rawVal = to; }
  }
  _animTargets[id] = requestAnimationFrame(step);
}

// ── RADAR CHART ──
function drawRadar(A, B){
  const T = jetonsGraphe();
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
    ctx.strokeStyle = t === 1 ? T.axe : T.grilleFine;
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Spokes
  axes.forEach((_,i) => {
    const p = axisPoint(i, R);
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(p.x,p.y);
    ctx.strokeStyle = T.grille; ctx.lineWidth=1; ctx.stroke();
  });

  // Draw polygon for a dataset
  function drawPoly(scores, color, fillAlpha){
    ctx.beginPath();
    scores.forEach((s,i)=>{
      const p = axisPoint(i, R*s);
      i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y);
    });
    ctx.closePath();
    ctx.fillStyle = color.replace('1' + String.fromCharCode(41), fillAlpha + String.fromCharCode(41));
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
      ctx.strokeStyle = t === 1 ? T.axe : T.grilleFine;ctx.lineWidth=1;ctx.stroke();
    });
    axes.forEach((_,i)=>{const pt=axisPoint(i,R);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(pt.x,pt.y);ctx.strokeStyle = T.grille;ctx.lineWidth=1;ctx.stroke();});

    const animA = scoresA.map(s=>s*ease);
    const animB = scoresB.map(s=>s*ease);
    drawPoly(animB, 'rgba(91,155,213,1)', '0.15');
    drawPoly(animA, 'rgba(212,168,67,1)', '0.18');

    // Dots
    [animA,animB].forEach((sc,di)=>{
      sc.forEach((s,i)=>{
        const pt=axisPoint(i,R*s);
        ctx.beginPath();ctx.arc(pt.x,pt.y,3.5,0,Math.PI*2);
        ctx.fillStyle = di === 0 ? T.accent : T.compare;ctx.fill();
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

  animateValue('sv-ch', ch, 0);
  animateValue('sv-nm', nm, 0);
  animateValue('sv-kg', kg, 0);

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

// ── COURBE D'ACCÉLÉRATION DE LA FICHE ──
// Le simulateur trace une courbe à partir d'un modèle physique. Ici on a
// mieux : les temps homologués. La courbe passe EXACTEMENT par les points
// mesurés (0–100, 0–200) et n'interpole qu'entre eux — elle décrit la
// voiture, pas une estimation.
function pointsAcceleration(car) {
  const ch = toNum(hasVal(car.moteur?.puissance_ch) ? car.moteur.puissance_ch : null);
  const kg = toNum(hasVal(car.chassis?.masse) ? car.chassis.masse : null);
  const t100 = toNum(hasVal(car.performances?.zero_cent) ? car.performances.zero_cent : null);
  const t200 = toNum(hasVal(car.performances?.zero_deux_cent) ? car.performances.zero_deux_cent : null);
  const vmax = toNum(hasVal(car.performances?.vitesse_max) ? car.performances.vitesse_max : null);
  if (!t100 || !vmax || vmax < 60) return null;

  // t(v) = A·(v/100)^k. A est le 0–100 réel ; k vient du 0–200 quand il est
  // connu, sinon d'une heuristique fondée sur le rapport poids/puissance.
  const A = t100;
  let k = (ch && kg) ? 1.2 + (kg / ch) * 0.05 : 1.45;
  if (t200 && t200 > t100) k = Math.log(t200 / A) / Math.log(2);
  k = Math.min(Math.max(k, 1.05), 2.6);

  const pts = [];
  const pas = Math.max(2, Math.round(vmax / 60));
  for (let v = 0; v <= vmax; v += pas) pts.push({ v, t: v === 0 ? 0 : A * Math.pow(v / 100, k) });
  if (pts[pts.length - 1].v !== vmax) pts.push({ v: vmax, t: A * Math.pow(vmax / 100, k) });
  return { pts, t100, t200, vmax, A, k };
}

function drawCourbeAcceleration(canvas, car, progression) {
  const d = pointsAcceleration(car);
  if (!canvas || !d) return false;
  const T = jetonsGraphe();
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 600, H = 170;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const PAD = { top: 18, right: 16, bottom: 28, left: 40 };
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
  const tMax = Math.ceil(d.pts[d.pts.length - 1].t / 5) * 5 || 5;
  const toX = v => PAD.left + (v / d.vmax) * cW;
  const toY = t => PAD.top + cH - (t / tMax) * cH;

  ctx.strokeStyle = T.grilleFine; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  ctx.font = `10px ${T.police}`; ctx.fillStyle = T.texte3; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    ctx.fillText(Math.round(tMax - (i / 4) * tMax) + ' s', PAD.left - 6, y + 3.5);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = T.axe;
  ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, PAD.top + cH);
  ctx.lineTo(PAD.left + cW, PAD.top + cH); ctx.stroke();

  // Portion tracée : l'animation fait monter l'aiguille de 0 à la vitesse max.
  const p = Math.min(Math.max(progression == null ? 1 : progression, 0), 1);
  const visibles = d.pts.filter(pt => pt.v <= d.vmax * p);
  if (visibles.length < 2) return true;

  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, `rgba(${T.accentRgb},0.20)`);
  grad.addColorStop(1, `rgba(${T.accentRgb},0.02)`);
  ctx.beginPath();
  visibles.forEach((pt, i) => i ? ctx.lineTo(toX(pt.v), toY(pt.t)) : ctx.moveTo(toX(pt.v), toY(pt.t)));
  ctx.lineTo(toX(visibles[visibles.length - 1].v), PAD.top + cH);
  ctx.lineTo(PAD.left, PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = T.accent; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  visibles.forEach((pt, i) => i ? ctx.lineTo(toX(pt.v), toY(pt.t)) : ctx.moveTo(toX(pt.v), toY(pt.t)));
  ctx.stroke();

  // Les repères ne s'allument qu'une fois la vitesse atteinte.
  const repere = (v, t, libelle) => {
    if (!t || v > d.vmax * p || v > d.vmax) return;
    const x = toX(v), y = toY(t);
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = T.accent; ctx.fill();
    ctx.fillStyle = T.texte2; ctx.font = `600 10px ${T.police}`; ctx.textAlign = 'center';
    ctx.fillText(libelle, x, y - 9);
  };
  repere(100, d.t100, d.t100.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' s');
  repere(200, d.t200, d.t200 ? d.t200.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' s' : '');

  // Pas de graduation à la vitesse maximale : elle tombe sur le bord droit,
  // où se trouve l'unité, et les deux se chevauchaient. La valeur est de
  // toute façon affichée dans les chiffres de tête.
  ctx.fillStyle = T.texte3; ctx.font = `10px ${T.police}`; ctx.textAlign = 'center';
  [0, 100, 200].filter(v => v <= d.vmax * 0.92).forEach(v => ctx.fillText(v, toX(v), H - 9));
  ctx.textAlign = 'right';
  ctx.fillText('km/h', W - PAD.right, H - 9);
  return true;
}

// Le tracé s'anime une fois, à l'ouverture de la fiche. Comme pour les
// chiffres, l'état final est garanti même si les images sont gelées.
function animerCourbe(cardEl, car) {
  const canvas = cardEl?.querySelector('.accel-canvas');
  if (!canvas) return;
  if (!drawCourbeAcceleration(canvas, car, 1)) { canvas.closest('.accel-bloc')?.remove(); return; }

  const sansMouvement = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (sansMouvement || document.hidden) return;

  const secours = setTimeout(() => drawCourbeAcceleration(canvas, car, 1), 1500);
  const t0 = performance.now(), duree = 900;
  (function pas(now) {
    if (!canvas.isConnected) { clearTimeout(secours); return; }
    const p = Math.min((now - t0) / duree, 1);
    drawCourbeAcceleration(canvas, car, 1 - Math.pow(1 - p, 3));
    if (p < 1) requestAnimationFrame(pas);
    else clearTimeout(secours);
  })(performance.now());
}

// ── COULEURS DES GRAPHES ──
// Les tracés sur canvas ne peuvent pas lire une feuille de style : leurs
// couleurs étaient écrites en dur pour le thème sombre, si bien que depuis
// le passage au clair la grille se dessinait en blanc sur du papier. On lit
// les jetons une fois par tracé.
function jetonsGraphe() {
  const cs = getComputedStyle(document.documentElement);
  const j = (n, secours) => cs.getPropertyValue(n).trim() || secours;
  const tint = j('--tint-rgb', '255,255,255');
  const accentRgb = j('--accent-rgb', '212,168,67');
  return {
    accent: j('--accent', '#d4a843'),
    accent2: j('--accent2', '#f0c96a'),
    accentRgb,
    texte2: j('--text2', '#8b869e'),
    texte3: j('--text3', '#4a4660'),
    grille: `rgba(${tint},0.10)`,
    grilleFine: `rgba(${tint},0.06)`,
    axe: `rgba(${tint},0.18)`,
    compare: j('--blue', '#5b9bd5'),
    police: j('--font-body', "'DM Sans', sans-serif"),
  };
}

function drawChart(ch, kg, eff){
  const ratio = kg / ch;
  const canvas = document.getElementById('simChart');
  const ctx = canvas.getContext('2d');
  const T = jetonsGraphe();
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
  bgGrad.addColorStop(0, `rgba(${T.accentRgb},0.04)`);
  bgGrad.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(PAD.left, PAD.top, cW, cH);

  // Grid lines Y
  ctx.setLineDash([3,4]);
  ctx.strokeStyle = T.grilleFine;
  ctx.lineWidth=1;
  const ySteps = 5;
  for(let i=0;i<=ySteps;i++){
    const y = PAD.top + (i/ySteps)*cH;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left+cW, y); ctx.stroke();
    // Y labels
    const val = niceMaxT - (i/ySteps)*niceMaxT;
    ctx.setLineDash([]);
    ctx.fillStyle = T.texte3;
    ctx.font = `10px ${T.police}`;
    ctx.textAlign='right';
    ctx.fillText(val.toFixed(0) + ' s', PAD.left - 6, y + 3.5);
    ctx.setLineDash([3,4]);
  }
  ctx.setLineDash([]);

  // Grid lines X (subtle)
  ctx.strokeStyle = T.grilleFine;
  [0,50,100,150,200,250].forEach(s=>{
    const x = toX(s);
    ctx.beginPath(); ctx.moveTo(x,PAD.top); ctx.lineTo(x,PAD.top+cH); ctx.stroke();
  });

  // Axes
  ctx.strokeStyle = T.axe;
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top+cH);
  ctx.lineTo(PAD.left+cW, PAD.top+cH);
  ctx.stroke();

  // Fill under curve
  const fillGrad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top+cH);
  fillGrad.addColorStop(0, `rgba(${T.accentRgb},0.22)`);
  fillGrad.addColorStop(1, `rgba(${T.accentRgb},0.01)`);
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
  ctx.strokeStyle = T.accent;
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
    ctx.fillStyle = T.accent;
    ctx.fill();
    ctx.fillStyle = T.accent;
    ctx.font = `600 10px ${T.police}`;
    ctx.textAlign='center';
    ctx.fillText(p100.t.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s', cx2, cy2 - 10);
  }

  // X axis labels
  ctx.fillStyle = T.texte3;
  ctx.font = `10px ${T.police}`;
  ctx.textAlign='center';
  [0,50,100,150,200,250].forEach(s=>{
    ctx.fillText(s, toX(s), H-8);
  });

  // Axis titles
  ctx.fillStyle = T.texte3;
  ctx.font = `9px ${T.police}`;
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
  document.getElementById('ent-fuel-val').textContent = fuelPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const d=entData[type];
  const ageMult=1+age*0.04;
  const carburant = d.kwh
    ? (km/100)*d.carburant_conso*0.20
    : (km/100)*d.carburant_conso*fuelPrice;

  const items=[
    {icon:ico('huile'),name:'Vidange huile',price:Math.round(d.vidange*ageMult),freq:'/ an'},
    {icon:ico('cle'),name:'Filtres (air, habitacle…)',price:Math.round(d.filtres),freq:'/ an'},
    {icon:ico('pneu'),name:'Pneumatiques (prorata)',price:Math.round((d.pneus/3)*ageMult),freq:'/ an'},
    {icon:ico('frein'),name:'Freins (plaquettes/disques)',price:Math.round((d.freins/2)*ageMult),freq:'/ an'},
    {icon:ico('presse'),name:'Révision générale',price:Math.round(d.revision*ageMult),freq:'/ an'},
    ...(d.courroie>0?[{icon:ico('engrenage'),name:'Courroie distribution',price:Math.round(d.courroie/5),freq:'/ an (prorata)'}]:[]),
    {icon: d.kwh ? ico('eclair') : ico('carburant'),name:d.kwh?'Électricité':'Carburant',price:Math.round(carburant),freq:'/ an'},
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
// ── EXPERT IA ──
// Le prompt système est ajouté côté serveur.
let expertChatHistory = [];

async function askExpert() {
  const input = document.getElementById('expert-input');
  const box = document.getElementById('expert-chat-box');
  const text = input.value.trim();
  if (!text) return;

  // Add user message
  expertChatHistory.push({ role: 'user', content: text });
  input.value = '';
  
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.textContent = text;
  box.appendChild(userMsg);
  box.scrollTop = box.scrollHeight;

  // Loading state
  const aiMsg = document.createElement('div');
  aiMsg.className = 'chat-msg ai loading';
  aiMsg.innerHTML = '<div class="spin"></div> Analyse en cours...';
  box.appendChild(aiMsg);
  box.scrollTop = box.scrollHeight;

  try {
    const data = await postAi({ kind: 'expert', messages: expertChatHistory });
    aiMsg.classList.remove('loading');
    const reply = data.choices?.[0]?.message?.content;
    if (reply) {
      expertChatHistory.push({ role: 'assistant', content: reply });
      aiMsg.innerHTML = esc(reply).replace(/\n/g, '<br/>');
    } else {
      expertChatHistory.pop();
      aiMsg.innerHTML = `<span style="color:var(--red);">Désolé, j'ai rencontré une erreur. Réessayez bientôt.</span>`;
    }
  } catch (err) {
    // La question non répondue est retirée de l'historique pour ne pas être renvoyée.
    expertChatHistory.pop();
    aiMsg.classList.remove('loading');
    aiMsg.innerHTML = err.code === 'QUOTA_EXCEEDED'
      ? `<span style="color:var(--accent);">${esc(err.message)}</span> <a href="#" onclick="showPage('plans'); return false;" style="color:var(--accent2);">Voir les offres</a>`
      : `<span style="color:var(--red);">${esc(err.message)}</span>`;
  }
  box.scrollTop = box.scrollHeight;
}

// ── INIT ──
updateSim();
updateEntretien();

// ── RESPONSIVE REDRAW ──
// Les graphiques canvas (radar comparateur, courbe simulateur) calculent leur
// taille au moment du dessin (offsetWidth) : sans ce listener, ils restent
// figés à l'ancienne taille tant qu'on ne relance pas un rendu manuellement.
// On réécoute donc le resize de la fenêtre pour les redessiner automatiquement.
let _resizeRedrawTimeout = null;
window.addEventListener('resize', function() {
  clearTimeout(_resizeRedrawTimeout);
  _resizeRedrawTimeout = setTimeout(function() {
    if (carA && carB) drawRadar(carA, carB);
    if (document.getElementById('simChart')) updateSim();
    document.querySelectorAll('.accel-canvas').forEach(c => {
      const carte = c.closest('.card');
      const donnees = carte && window.carCache[carte.id];
      if (donnees) drawCourbeAcceleration(c, donnees, 1);
    });
  }, 150);
});

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
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Couple max</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${vu(c.moteur?.couple_nm,'N·m')} @ ${v(c.moteur?.regime_couple)}</td></tr>
            <tr><td style="padding:8px 0; color:#555;">Alimentation</td><td style="padding:8px 0; font-weight:bold; text-align:right;">${v(c.moteur?.alimentation)}</td></tr>
          </table>

          <div style="font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Consommation & Autonomie</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Mixte</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.consommation?.mixte)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Émissions CO₂</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.consommation?.co2)}</td></tr>
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Réservoir</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${vu(c.carburant?.reservoir,'L')}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555;">Autonomie ext.</td><td style="padding:8px 0; font-weight:bold; text-align:right;">${vu(c.carburant?.autonomie_estimee,'km')}</td></tr>
          </table>
        </div>

        <!-- Colonne 2 -->
        <div style="flex: 1;">
          <div style="font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Performances & Transmission</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 30px;">
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Vitesse max</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${vu(c.performances?.vitesse_max,'km/h')}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">0 à 100 km/h</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${vu(c.performances?.zero_cent,'s')}</td></tr>
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Boîte</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.transmission?.boite)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555;">Motricité</td><td style="padding:8px 0; font-weight:bold; text-align:right;">${v(c.transmission?.entrainement)}</td></tr>
          </table>

          <div style="font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Châssis & Dimensions</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">L x l x h</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.chassis?.longueur)} x ${v(c.chassis?.largeur)} x ${v(c.chassis?.hauteur)}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Empattement</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${v(c.chassis?.empattement)}</td></tr>
            <tr><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Masse à vide</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${vu(c.chassis?.masse,'kg')}</td></tr>
            <tr style="background:#fdfdfd;"><td style="padding:8px 0; color:#555; border-bottom: 1px solid #eee;">Volume coffre</td><td style="padding:8px 0; font-weight:bold; text-align:right; border-bottom: 1px solid #eee;">${vu(c.chassis?.coffre,'L')}</td></tr>
            <tr><td style="padding:8px 0; color:#555;">Pneus (AV/AR)</td><td style="padding:8px 0; font-weight:bold; text-align:right;">${v(c.pneus?.avant)} / ${v(c.pneus?.arriere)}</td></tr>
          </table>
        </div>

      </div>

      <!-- Bloc Expertise & Maintenance -->
      <div style="margin-top: 30px; border-top: 2px solid #1a1a1a; padding-top: 20px;">
        <div style="font-size: 20px; font-weight: bold; color: #1a1a1a; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px;">
           Expertise maintenance & Vigilance
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
            POINTS DE VIGILANCE TECHNIQUE
          </div>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #444; line-height: 1.6;">
            ${(Array.isArray(c.entretien?.points_vigilance)?c.entretien.points_vigilance:[]).map(pt => `<li>${esc(pt)}</li>`).join('')}
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
    btn.innerHTML = 'Fenêtre bloquée';
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

// ── ADMIN DASHBOARD LOGIC ──
// ── FICHES SIGNALÉES (ADMIN) ──
// Les signalements arrivaient en base sans que personne puisse les lire.
// Cette vue les regroupe par véhicule : les plus remontés en premier.
const REPORT_FIELD_LABELS = {
  identification: 'Mauvais véhicule', puissance: 'Puissance', couple: 'Couple',
  performances: 'Performances', consommation: 'Consommation', masse: 'Masse',
  dimensions: 'Dimensions', transmission: 'Transmission', entretien: 'Entretien',
  tuning: 'Préparations', autre: 'Autre',
};

window.loadReports = async function() {
  const tbody = document.getElementById('admin-reports-list');
  const resume = document.getElementById('admin-reports-summary');
  if (!tbody || !authToken) return;

  const traites = document.getElementById('admin-reports-resolved')?.checked;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text3);">Chargement…</td></tr>';

  try {
    const res = await fetch(API_BASE + '/api/report' + (traites ? '?resolved=1' : ''), {
      headers: { 'Authorization': 'Bearer ' + authToken },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lecture impossible.');

    const n = data.totals?.ouverts || 0;
    const badge = document.getElementById('admin-reports-count');
    if (badge) { badge.textContent = n; badge.hidden = n === 0; }
    if (resume) {
      resume.textContent = n === 0
        ? 'Aucun signalement en attente.'
        : `${n} signalement${n > 1 ? 's' : ''} en attente sur ${data.totals.vehicules} véhicule${data.totals.vehicules > 1 ? 's' : ''}.`;
    }

    if (!data.reports.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text3); padding:2rem;">${traites ? 'Rien de traité pour l\'instant.' : 'Aucune fiche signalée — bon signe.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.reports.map(r => {
      const champs = String(r.fields || '').split(', ')
        .map(f => REPORT_FIELD_LABELS[f] || f).join(', ');
      return `<tr>
        <td><strong>${esc(r.query)}</strong></td>
        <td><span class="report-count">${r.total}</span></td>
        <td style="font-size:12px; color:var(--text2);">${esc(champs)}</td>
        <td style="font-size:12px; color:var(--text2); max-width:260px;">${esc(r.suggestions || '—')}</td>
        <td style="font-size:12px; color:var(--text3);">${new Date(r.last_at).toLocaleDateString('fr-FR')}</td>
        <td>
          <button class="admin-action-btn btn-verify" onclick="qf('${esc(r.query).replace(/'/g, "\\'")}')">Voir la fiche</button>
          ${traites ? '' : `<button class="admin-action-btn" onclick="resolveReport(this, '${esc(r.query).replace(/'/g, "\\'")}')">Traité</button>`}
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--red);">${esc(err.message)}</td></tr>`;
  }
};

window.resolveReport = async function(btn, query) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const res = await fetch(API_BASE + '/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ action: 'resolve', query }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Mise à jour impossible.');
    showToast(`${data.traites} signalement${data.traites > 1 ? 's' : ''} marqué${data.traites > 1 ? 's' : ''} traité${data.traites > 1 ? 's' : ''}.`, 'success');
    loadReports();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Traité';
    showToast(err.message, 'error');
  }
};

function switchAdminSubTab(tabId, btn) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-sub-page').forEach(p => p.classList.remove('active'));
  // Hide push tab too (it uses display:none style, not the class)
  const pushTab = document.getElementById('admin-sub-push');
  if (pushTab) pushTab.style.display = 'none';

  if (btn) btn.classList.add('active');

  if (tabId === 'push') {
    if (pushTab) pushTab.style.display = 'block';
  } else {
    const target = document.getElementById('admin-sub-' + tabId);
    if (target) target.classList.add('active');
  }

  if (tabId === 'reports') loadReports();
}

async function sendAdminPush() {
  const title = document.getElementById('push-title').value.trim();
  const body = document.getElementById('push-body').value.trim();
  if (!title || !body) return alert('Veuillez remplir le titre et le message.');

  try {
    const res = await fetch(API_BASE + '/api/push?action=send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ title, message: body, url: '/' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur inconnue');
    
    if (data.successCount !== undefined) {
      alert(`✅ Push envoyé !\n${data.successCount} succès / ${data.failCount} échecs`);
    } else if (data.success !== undefined) {
      alert(`✅ Push envoyé !\n${data.success} succès / ${data.failed} échecs`);
    } else {
      alert(`ℹ️ ${data.message || 'Action terminée'}`);
    }
  } catch (err) {
    alert('❌ Erreur : ' + err.message);
  }
}

async function loadAdminData() {
  if (!currentUser) return;
  const userEmail = (currentUser.email || "").toLowerCase();
  const isAdmin = currentUser.user_type === 'admin' || userEmail === 'andreasgiacomello23@gmail.com';
  if (!isAdmin) return;

  try {
    const res = await fetch(API_BASE + '/api/admin', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Pastille des fiches signalées : visible dès l'arrivée sur le panneau.
    fetch(API_BASE + '/api/report', { headers: { 'Authorization': 'Bearer ' + authToken } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const badge = document.getElementById('admin-reports-count');
        const n = d?.totals?.ouverts || 0;
        if (badge) { badge.textContent = n; badge.hidden = n === 0; }
      })
      .catch(() => {});

    // Stats
    document.getElementById('admin-stat-users').innerText = data.stats.totalUsers;
    document.getElementById('admin-stat-pros').innerText = data.stats.totalPros;
    document.getElementById('admin-stat-pending').innerText = data.stats.pendingPros;

    // Users List
    const usersList = document.getElementById('admin-users-list');
    usersList.innerHTML = data.users.map(u => `
      <tr>
        <td>${u.id}</td>
        <td><strong>${u.first_name} ${u.last_name}</strong></td>
        <td>${u.email}</td>
        <td><span class="admin-badge badge-${u.user_type}">${u.user_type}</span></td>
        <td>${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          ${u.account_tier !== 'pro' ? `<button class="admin-action-btn btn-verify" style="background:var(--purple);" onclick="handleAdminAction('grant_pro', ${u.id})">Passer Pro</button>` : `<span style="font-size:12px; color:var(--purple); font-weight:bold; margin-right:8px;">★ PRO</span>`}
          <button class="admin-action-btn btn-delete" onclick="handleAdminAction('delete', ${u.id})">Supprimer</button>
        </td>
      </tr>
    `).join('');

    // Pros Verification List
    const prosList = document.getElementById('admin-pros-list');
    const enterpriseUsers = data.users.filter(u => u.siret);
    prosList.innerHTML = enterpriseUsers.map(u => `
      <tr>
        <td><strong>${u.company_name || 'Inconnu'}</strong></td>
        <td><code>${u.siret}</code></td>
        <td>
          ${u.proof_url ? `<a href="${u.proof_url}" target="_blank" style="color:var(--accent); text-decoration:underline;">Voir K-bis</a>` : '<span style="color:gray">Aucun</span>'}
        </td>
        <td>
          <span class="admin-badge ${u.is_verified ? 'badge-verified' : 'badge-pending'}">
            ${u.is_verified ? 'Vérifié' : 'À Valider'}
          </span>
        </td>
        <td>
          ${!u.is_verified ? `<button class="admin-action-btn btn-verify" onclick="handleAdminAction('verify', ${u.id})">Valider</button>` : '—'}
        </td>
      </tr>
    `).join('');

    // Referrals List
    const refList = document.getElementById('admin-referrals-list');
    refList.innerHTML = data.referrals.map(r => `
      <tr>
        <td>${r.first_name} ${r.last_name}</td>
        <td><code>${r.referral_code}</code></td>
        <td><span class="admin-badge badge-verified">${r.count} filleuls</span></td>
      </tr>
    `).join('');

    // Admin Reviews List
    fetchAdminReviews();

  } catch (err) {
    console.error('Failed to load admin data:', err);
  }
}

async function handleAdminAction(action, targetId) {
  const confirmMsg = action === 'delete' ? "Êtes-vous sûr de vouloir supprimer cet utilisateur ?" : 
                     action === 'delete_review' ? "Supprimer cet avis ?" :
                     action === 'grant_pro' ? "Voulez-vous donner l'accès Pro complet à cet utilisateur ?" :
                     "Voulez-vous valider ce compte entreprise ?";
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch(API_BASE + '/api/admin', {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer ' + authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, targetUserId: targetId })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    
    loadAdminData(); // Refresh list
  } catch (err) {
    alert('Erreur action : ' + err.message);
  }
}

// ── COMPANY SEARCH (ENTERPRISE LOOKUP) ──
let companySearchTimeout = null;
function debounceCompanySearch(query) {
  clearTimeout(companySearchTimeout);
  if (query.trim().length < 3) {
    document.getElementById('company-results').style.display = 'none';
    return;
  }
  companySearchTimeout = setTimeout(() => handleCompanySearch(query), 400);
}

async function handleCompanySearch(query) {
  const rs = document.getElementById('company-results');
  try {
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(query)}&limite=5`);
    const data = await res.json();
    
    if (data.results && data.results.length > 0) {
      rs.innerHTML = data.results.map(company => `
        <div class="company-item" onclick="selectCompany('${company.nom_complet}', '${company.siren}')">
          <div class="company-name">${company.nom_complet}</div>
          <div class="company-sub">${company.siege.adresse} • SIREN: ${company.siren}</div>
        </div>
      `).join('');
      rs.style.display = 'block';
    } else {
      rs.style.display = 'none';
    }
  } catch (err) {
    console.error('Company search error:', err);
    rs.style.display = 'none';
  }
}

function selectCompany(name, siren) {
  document.getElementById('company-search').value = name;
  document.getElementById('siret-input').value = siren; // Use SIREN as base SIRET
  document.getElementById('company-results').style.display = 'none';
  
  const status = document.getElementById('siret-status');
  status.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    <span>${name} sélectionné (SIREN: ${siren})</span>
  `;
  status.style.display = 'flex';
  status.style.background = 'rgba(78,203,130,0.1)';
  status.style.color = 'var(--green)';
}

// ════════════════════ PWA & PUSH NOTIFICATIONS ════════════════════
const VAPID_PUBLIC_KEY = "BENk7CYgAuJCfCv3-H0EJNQEs3VfyYVS7TcEe1ZfZZPxiXlBEOnpIN-d4yYOIRI62Hgn8brRg_ZmVUMODDqiTJ0";

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
  return outputArray;
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker enregistré:', registration);
      if (Notification.permission === 'granted') {
        subscribeUserToPush(registration);
      }
    } catch (error) {
      console.error('Erreur SW:', error);
      console.error('Erreur enregistrement SW:', error);
    }
  }
}

async function subscribeUserToPush(registration) {
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    console.log('Abonnement Push reçu');
    
    const token = localStorage.getItem('autospec_token');
    if (token) {
      const res = await fetch(API_BASE + '/api/push?action=subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(subscription)
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Erreur serveur lors de l\'abonnement:', data.error);
      }
    }
  } catch (error) {
    console.error('Erreur inscription Push:', error);
    console.error('Erreur technique Push:', error);
  }
}

window.requestNotificationPermission = async function() {
  if (Notification.permission === 'granted') {
    try {
      const registration = await navigator.serviceWorker.ready;
      await subscribeUserToPush(registration);
    } catch(e) {
      console.error('Re-subscribe error:', e);
    }
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    const registration = await navigator.serviceWorker.ready;
    await subscribeUserToPush(registration);
    updateNav();
  } else {
    console.warn("Notifications blocked.");
  }
};

window.fetchAdminReviews = async function() {
  try {
    const res = await fetch(API_BASE + '/api/reviews');
    const reviews = await res.json();
    const list = document.getElementById('admin-reviews-list');
    if (!list) return;
    list.innerHTML = reviews.map(r => `
      <tr>
        <td>${r.author_name}</td>
        <td>${'★'.repeat(r.rating)}</td>
        <td style="font-size:12px; max-width:300px;">${r.comment}</td>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
        <td>
          <button class="admin-action-btn btn-delete" onclick="deleteAdminReview(${r.id})">Supprimer</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Fetch admin reviews error:', err);
  }
};

window.deleteAdminReview = async function(id) {
  if (!confirm("Supprimer cet avis ?")) return;
  try {
    const res = await fetch(`${API_BASE}/api/reviews?id=${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.ok) {
      fetchAdminReviews();
      fetchReviews(); 
    }
  } catch (err) {
    alert("Erreur: " + err.message);
  }
};

// Tesseract (~plusieurs Mo) n'est chargé qu'au premier scan photo, pas à l'ouverture du site.
let _tesseractLoading = null;
function loadTesseract() {
  if (typeof Tesseract !== 'undefined') return Promise.resolve();
  if (!_tesseractLoading) {
    _tesseractLoading = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      sc.onload = resolve;
      sc.onerror = () => { _tesseractLoading = null; reject(new Error("Impossible de charger l'outil d'analyse photo.")); };
      document.head.appendChild(sc);
    });
  }
  return _tesseractLoading;
}

window.handlePlateOCR = async function(input) {
  if (!input.files || !input.files[0]) return;
  try {
    await loadTesseract();
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }
  const file = input.files[0];
  
  // UI Loading
  const dropzone = document.querySelector('.ocr-dropzone');
  const originalHtml = dropzone.innerHTML;
  dropzone.innerHTML = `
    <div class="spinner" style="width:40px; height:40px; border-top-color:var(--accent);"></div>
    <p>Analyse de la photo en cours...</p>
  `;

  const searchInput = document.getElementById('q1');

  try {
    const { data: { text } } = await Tesseract.recognize(file, 'eng');
    console.log("OCR Result:", text);
    
    const cleanText = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const plateRegex = /[A-Z]{2}[0-9]{3}[A-Z]{2}/; 
    const match = cleanText.match(plateRegex);
    
    if (match) {
      const plate = match[0];
      const formatted = plate.substring(0,2) + '-' + plate.substring(2,5) + '-' + plate.substring(5,7);
      setSearchMode('car');
      searchInput.value = formatted;
      searchFiche();
    } else {
      const looseMatch = cleanText.match(/[A-Z0-9]{5,9}/);
      if (looseMatch) {
        setSearchMode('car');
        searchInput.value = looseMatch[0];
        searchFiche();
      } else {
        alert("Impossible de lire la plaque. Essayez de prendre la photo de plus près.");
      }
    }
  } catch (err) {
    console.error("OCR Error:", err);
    alert("Erreur lors de l'analyse.");
  } finally {
    dropzone.innerHTML = originalHtml;
  }
};

window.updateAccountPage = async function() {
  if (!currentUser) return;
  
  // Basic info
  const tier = currentUser.account_tier || 'free';
  const display = document.getElementById('account-tier-display');
  const desc = document.getElementById('account-tier-desc');
  
  if (tier === 'free') {
    display.innerText = "Gratuit";
    display.style.background = "var(--border)";
    desc.innerText = "Vous utilisez la version limitée d'AutoSpec Pro.";
  } else if (tier === 'passionne') {
    display.innerText = "Passionné";
    display.style.background = "var(--accent)";
    desc.innerText = "Profitez de toutes les fonctionnalités premium !";
  } else if (tier === 'pro') {
    display.innerText = "Professionnel";
    display.style.background = "var(--purple)";
    desc.innerText = "Accès complet illimité pour les experts.";
  }

  // Profile display with customization
  applyProfileCustomization('profile-display-header', currentUser);
  document.getElementById('p-display-avatar').outerHTML = getUserAvatarHtml(currentUser, 'profile-main-avatar');
  document.getElementById('p-display-fullname').innerText = (currentUser.first_name || '') + ' ' + (currentUser.last_name || '');
  document.getElementById('p-display-pseudo').innerText = currentUser.pseudo ? '@' + currentUser.pseudo : '';
  document.getElementById('p-display-email').innerText = currentUser.email || '---';
  
  const bioEl = document.getElementById('p-display-bio');
  if (currentUser.bio) {
    bioEl.innerText = `"${currentUser.bio}"`;
    bioEl.style.opacity = '1';
  } else {
    bioEl.innerText = "Aucune bio renseignée.";
    bioEl.style.opacity = '0.5';
  }

  document.getElementById('p-display-location').innerText = currentUser.location || 'Localisation non définie';
  document.getElementById('p-display-instagram').innerText = currentUser.instagram || 'Instagram non lié';
  document.getElementById('p-display-garage').innerText = currentUser.garage || 'Garage vide';

  // XP & Rank
  await loadGamificationData();
  const progress = gamificationData?.progress;
  document.getElementById('p-display-points').innerText = (currentUser.points || 0) + ' XP';
  document.getElementById('p-display-rank').innerText = currentUser.user_rank || 'Novice';
  
  if (progress) {
    document.getElementById('p-points-fill').style.width = progress.percent + '%';
    const nextEl = document.getElementById('p-next-rank');
    if (progress.nextRank) {
      nextEl.innerText = `${progress.pointsToNext} XP pour atteindre ${progress.nextRank}`;
    } else {
      nextEl.innerText = 'Rang maximum atteint — Légendaire !';
    }
  }

  renderRewardsGrid();

  document.getElementById('account-referral-code').innerText = currentUser.referral_code || '---';

  // Fetch referral stats
  try {
    const res = await fetch(API_BASE + '/api/auth/referral-stats', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const stats = await res.json();
    if (res.ok) {
      document.getElementById('ref-count-total').innerText = stats.totalReferred;
      document.getElementById('ref-reward-earned').innerText = stats.rewardsEarned;
      
      const progress = stats.totalReferred % 3;
      const percent = (progress / 3) * 100;
      document.getElementById('ref-progress-fill').style.width = percent + '%';
      document.getElementById('ref-progress-text').innerText = progress + '/3';
    }
  } catch (err) {
    console.error("Failed to load referral stats:", err);
  }
};

window.copyReferralCode = function() {
  const code = document.getElementById('account-referral-code').innerText;
  navigator.clipboard.writeText(code);
  alert("Code copié ! Partagez-le avec vos amis.");
};

// ════════════════════ COMMUNAUTÉ & PLAYLISTS ════════════════════
window.switchCommunityTab = function(tabName, btn) {
  document.querySelectorAll('.comm-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  if (tabName === 'bolides') {
    document.getElementById('community-feed').style.display = 'grid';
    document.getElementById('playlist-feed').style.display = 'none';
    document.getElementById('chat-feed').style.display = 'none';
    document.getElementById('btn-post-car').style.display = 'block';
    document.getElementById('btn-post-playlist').style.display = 'none';
    document.getElementById('community-subtext').innerText = 'Découvrez et partagez les plus belles pépites.';
  } else if (tabName === 'playlists') {
    document.getElementById('community-feed').style.display = 'none';
    document.getElementById('playlist-feed').style.display = 'grid';
    document.getElementById('chat-feed').style.display = 'none';
    document.getElementById('btn-post-car').style.display = 'none';
    document.getElementById('btn-post-playlist').style.display = 'block';
    document.getElementById('community-subtext').innerText = 'Partagez votre musique de conduite idéale.';
    if (!window.communityPlaylists) fetchCommunityPlaylists();
  } else if (tabName === 'entraide') {
    document.getElementById('community-feed').style.display = 'none';
    document.getElementById('playlist-feed').style.display = 'none';
    document.getElementById('chat-feed').style.display = 'flex';
    document.getElementById('btn-post-car').style.display = 'none';
    document.getElementById('btn-post-playlist').style.display = 'none';
    document.getElementById('community-subtext').innerText = 'Posez vos questions et discutez avec les autres passionnés.';
    loadChatMessages();
    startChatPolling();
  }
  
  if (tabName !== 'entraide') stopChatPolling();
};

window.communityPlaylists = null;
window.fetchCommunityPlaylists = async function() {
  const feed = document.getElementById('playlist-feed');
  try {
    const res = await fetch(API_BASE + '/api/playlists', {
      headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
    });
    const playlists = await res.json();
    if (!res.ok) throw new Error(playlists.error);

    if (playlists.length === 0) {
      feed.innerHTML = '<div style="text-align:center; padding:50px; opacity:0.5;">Aucune playlist partagée. Soyez le premier !</div>';
      return;
    }

    window.communityPlaylists = playlists;
    
    feed.innerHTML = playlists.map(p => `
      <div class="playlist-card pl-theme-${p.theme || 'night'}" onclick="openPlaylistDetail(${p.id})">
        <div class="pl-header">
          <div class="pl-info">
            <h4>${p.title}</h4>
            <span>${getThemeLabel(p.theme)}</span>
          </div>
          ${(currentUser && currentUser.user_type === 'admin') ? `<button class="btn-delete-post" style="padding:4px; margin-top:-4px;" onclick="event.stopPropagation(); deletePlaylist(${p.id})" title="Supprimer (Admin)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
        </div>
        <div class="pl-media">
          ${getPlatformIcon(p.playlist_url)}
        </div>
        <div class="pl-author-bar">
          ${getUserAvatarHtml({ first_name: p.author_name, avatar_url: p.author_avatar_url }, 'user-avatar-nav')}
          <span class="post-author clickable-author" style="font-size:12px;" onclick="event.stopPropagation(); openUserProfile(${p.user_id})">${p.author_name}${getUserBadge(p.user_type, p.user_rank)}</span>
        </div>
        <div class="post-actions" style="margin-top:auto; padding-top:12px; border-top: 1px solid rgba(255,255,255,0.05);">
          <button class="like-btn ${p.is_liked ? 'active' : ''}" onclick="event.stopPropagation(); toggleLikePlaylist(${p.id}, this)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${p.is_liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span class="like-count">${p.likes_count || 0}</span>
          </button>
          <button class="comment-trigger" onclick="openPlaylistDetail(${p.id})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            <span>${p.comments_count || 0}</span>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error("Fetch playlists error:", err);
    feed.innerHTML = '<div style="color:var(--red); text-align:center; padding:20px;">Erreur de chargement.</div>';
  }
};

window.openPlaylistModal = function() {
  if (!authToken) { openAuthModal(); return; }
  document.getElementById('playlistModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

window.closePlaylistModal = function() {
  document.getElementById('playlistModal').style.display = 'none';
  document.body.style.overflow = 'auto';
};

window.submitPlaylist = async function() {
  if (!authToken) return;
  const title = document.getElementById('pl-title').value.trim();
  const theme = document.getElementById('pl-theme').value;
  const url = document.getElementById('pl-url').value.trim();
  const desc = document.getElementById('pl-description').value.trim();

  if (!title || !theme || !url) {
    alert("Veuillez remplir le titre, le thème et l'URL.");
    return;
  }

  const btn = document.querySelector('#playlistModal .auth-submit-btn');
  const ogText = btn.innerHTML;
  btn.innerText = "Publication...";
  btn.disabled = true;

  try {
    const res = await fetch(API_BASE + '/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ title, theme, playlist_url: url, description: desc })
    });
    
    if (res.ok) {
      document.getElementById('pl-title').value = '';
      document.getElementById('pl-theme').value = '';
      document.getElementById('pl-url').value = '';
      document.getElementById('pl-description').value = '';
      closePlaylistModal();
      showToast('Playlist partagée ! +10 points 🎉', 'success');
      fetchCommunityPlaylists();
      checkLevelUp();
    } else {
      const data = await res.json();
      alert("Erreur: " + data.error);
    }
  } catch (err) {
    alert("Erreur réseau");
  } finally {
    btn.innerHTML = ogText;
    btn.disabled = false;
  }
};

window.toggleLikePlaylist = async function(playlistId, btn, isModal = false) {
  if (!authToken) { openAuthModal(); return; }
  try {
    const res = await fetch(API_BASE + '/api/playlists?action=like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ playlistId })
    });
    const result = await res.json();
    if (res.ok) {
      const countSpan = isModal ? document.getElementById('pld-likes-count') : btn.querySelector('.like-count');
      let count = parseInt(countSpan.innerText);
      if (result.liked) {
        btn.classList.add('active');
        btn.querySelector('svg').setAttribute('fill', 'currentColor');
        if (countSpan) countSpan.innerText = count + 1;
      } else {
        btn.classList.remove('active');
        btn.querySelector('svg').setAttribute('fill', 'none');
        if (countSpan) countSpan.innerText = count - 1;
      }
    }
  } catch (err) {}
};

window.deletePlaylist = async function(playlistId) {
  if (!confirm("Voulez-vous vraiment supprimer cette playlist ?")) return;
  try {
    const res = await fetch(API_BASE + '/api/playlists', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ playlistId })
    });
    if (res.ok) {
      alert("Playlist supprimée.");
      fetchCommunityPlaylists();
      if (document.getElementById('playlistDetailModal').style.display === 'flex') closePlaylistDetail();
    }
  } catch (err) {
    alert("Erreur lors de la suppression.");
  }
};

window.openPlaylistDetail = async function(playlistId) {
  const playlist = (window.communityPlaylists || []).find(p => p.id === playlistId);
  if (!playlist) return;

  const modal = document.getElementById('playlistDetailModal');
  const embedContainer = document.getElementById('pld-embed-container');
  const author = document.getElementById('pld-author');
  const avatar = document.getElementById('pld-avatar');
  const date = document.getElementById('pld-date');
  const desc = document.getElementById('pld-description');
  const likes = document.getElementById('pld-likes-count');
  const likeBtn = document.getElementById('pld-like-btn');
  const submitBtn = document.getElementById('pld-submit-comment');
  const input = document.getElementById('pld-comment-input');
  
  document.getElementById('pld-title').innerText = playlist.title;
  document.getElementById('pld-theme-badge').innerText = getThemeLabel(playlist.theme);
  
  embedContainer.innerHTML = getEmbedHtml(playlist.playlist_url);

  avatar.outerHTML = getUserAvatarHtml({ first_name: playlist.author_name, avatar_url: playlist.author_avatar_url }, 'pld-avatar');
  author.innerHTML = `${playlist.author_name}${getUserBadge(playlist.user_type, playlist.user_rank)}`;
  author.className = 'pd-username clickable-author';
  author.onclick = () => { closePlaylistDetail(); openUserProfile(playlist.user_id); };
  
  const header = document.querySelector('#playlistDetailModal .pd-header-info');
  header.innerHTML = '';
  if (currentUser && playlist.user_id !== currentUser.id) {
    const btn = document.createElement('button');
    btn.className = 'btn-contact-mini';
    btn.innerText = 'Contacter';
    btn.onclick = () => { closePlaylistDetail(); openChat(playlist.user_id, playlist.author_name, playlist.author_avatar_url); showPage('messages'); };
    header.appendChild(btn);
  }
  if (currentUser && currentUser.user_type === 'admin') {
    const dBtn = document.createElement('button');
    dBtn.className = 'btn-delete-post';
    dBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    dBtn.onclick = () => deletePlaylist(playlist.id);
    header.appendChild(dBtn);
  }

  date.innerText = new Date(playlist.created_at).toLocaleDateString();
  desc.innerText = playlist.description || '';
  likes.innerText = playlist.likes_count || 0;
  
  if (playlist.is_liked) {
    likeBtn.classList.add('active');
    likeBtn.querySelector('svg').setAttribute('fill', 'currentColor');
  } else {
    likeBtn.classList.remove('active');
    likeBtn.querySelector('svg').setAttribute('fill', 'none');
  }

  likeBtn.onclick = () => toggleLikePlaylist(playlistId, likeBtn, true);
  submitBtn.onclick = () => submitPlaylistComment(playlistId);
  input.onkeyup = (e) => { if (e.key === 'Enter') submitPlaylistComment(playlistId); };

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  loadPlaylistComments(playlistId);
};

window.closePlaylistDetail = function() {
  document.getElementById('playlistDetailModal').style.display = 'none';
  document.getElementById('pld-embed-container').innerHTML = '';
  document.body.style.overflow = 'auto';
};

window.loadPlaylistComments = async function(playlistId) {
  const list = document.getElementById('pld-comments-list');
  list.innerHTML = '<div style="color:var(--text3); font-size:12px;">Chargement des commentaires...</div>';
  try {
    const res = await fetch(`${API_BASE}/api/playlists?action=comments&playlistId=${playlistId}`);
    const comments = await res.json();
    if (comments.length === 0) {
      list.innerHTML = '<div style="color:var(--text3); font-size:12px; margin-top:10px;">Soyez le premier à commenter !</div>';
      return;
    }
    list.innerHTML = comments.map(c => `
      <div class="pd-comment">
        <div style="font-weight:700; color:var(--text); font-size:13px;">${c.author_name}${getUserBadge(c.user_type, c.user_rank)}</div>
        <div style="color:var(--text2); font-size:13px; margin:2px 0;">${c.content}</div>
        <div style="color:var(--text3); font-size:10px;">${new Date(c.created_at).toLocaleDateString()}</div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = '<div style="color:var(--red); font-size:12px;">Erreur</div>';
  }
};

window.submitPlaylistComment = async function(playlistId) {
  if (!authToken) { openAuthModal(); return; }
  const input = document.getElementById('pld-comment-input');
  const content = input.value.trim();
  if (!content) return;

  try {
    const res = await fetch(`${API_BASE}/api/playlists?action=comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ playlistId, content })
    });
    if (res.ok) {
      input.value = '';
      loadPlaylistComments(playlistId);
      
      const playlist = (window.communityPlaylists || []).find(p => p.id === playlistId);
      if (playlist) playlist.comments_count = (playlist.comments_count || 0) + 1;
      fetchCommunityPlaylists();
      showToast('Commentaire ajouté ! +5 points', 'success');
      checkLevelUp();
    }
  } catch (err) {}
};

function getThemeLabel(theme) {
  const t = { 'night':'Rap de nuit 🌙', 'rain':'Pluie & Ambiance 🌧️', 'sunset':'Balade Sunset 🌅', 'sport':'Arsouille Sportive 🏁', 'highway':'Roadtrip Autoroute 🛣️', 'garage':'Garage / Méca 🔧', 'chill':'Chill ☕' };
  return t[theme] || 'Musique 🎵';
}

function getPlatformIcon(url) {
  if(url.includes('spotify.com')) return '<svg width="28" height="28" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.56.3z"/></svg>';
  if(url.includes('youtube.com') || url.includes('youtu.be')) return '<svg width="28" height="28" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
  if(url.includes('deezer.com')) return '<svg width="28" height="28" viewBox="0 0 24 24" fill="#FEAA2D"><path d="M2 13h4v8H2v-8zm5-5h4v13H7V8zm5-5h4v18h-4V3zm5 9h4v9h-4v-9z"/></svg>';
  if(url.includes('apple.com')) return '<svg width="28" height="28" viewBox="0 0 24 24" fill="#fa243c"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14H9v-2h4v2zm0-4H9V8h4v4z"/></svg>';
  return '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-7.5c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
}

function getEmbedHtml(url) {
  if(url.includes('open.spotify.com')) {
    const embedUrl = url.replace('open.spotify.com', 'open.spotify.com/embed');
    return `<iframe style="border-radius:12px" src="${embedUrl}" width="100%" height="352" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
  }
  if(url.includes('youtube.com') || url.includes('youtu.be')) {
    let videoId = url.split('v=')[1];
    if(url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1];
    if(videoId) {
      const ampersandPosition = videoId.indexOf('&');
      if(ampersandPosition !== -1) videoId = videoId.substring(0, ampersandPosition);
      return `<iframe width="100%" height="250" src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="border-radius:12px;"></iframe>`;
    }
  }
  if(url.includes('deezer.com/')) {
    const trackId = url.split('/').pop().split('?')[0];
    return `<iframe scrolling="no" frameborder="0" allowTransparency="true" src="https://widget.deezer.com/widget/dark/playlist/${trackId}" width="100%" height="300"></iframe>`;
  }
  return `<div style="padding:40px; text-align:center; color:var(--text);"><a href="${url}" target="_blank" style="background:var(--accent); color:#000; padding:10px 20px; border-radius:20px; font-weight:700; text-decoration:none;">Ouvrir la playlist ↗</a></div>`;
}

// ════════════════════ COMMUNAUTÉ ════════════════════
window.fetchCommunityPosts = async function() {
  const feed = document.getElementById('community-feed');
  try {
    const res = await fetch(API_BASE + '/api/posts', {
      headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
    });
    const posts = await res.json();
    if (!res.ok) throw new Error(posts.error);

    if (posts.length === 0) {
      feed.innerHTML = '<div style="text-align:center; padding:50px; opacity:0.5;">Aucun post pour le moment. Soyez le premier !</div>';
      return;
    }

    window.communityPosts = posts; // Store globally for access
    
    feed.innerHTML = posts.map(p => `
      <div class="post-card">
        <img class="post-img" src="${p.image_url}" loading="lazy" onclick="openPostDetail(${p.id})">
        <div class="post-content">
          <div class="post-header">
            <div style="display:flex; align-items:center; gap:8px;">
              ${getUserAvatarHtml({ first_name: p.author_name, avatar_url: p.author_avatar_url }, 'user-avatar-nav')}
              <span class="post-author clickable-author" onclick="event.stopPropagation(); openUserProfile(${p.user_id})">${p.author_name}${getUserBadge(p.user_type, p.user_rank)}</span>
              ${(currentUser && p.user_id !== currentUser.id) ? `<button class="btn-contact-mini" onclick="event.stopPropagation(); openChat(${p.user_id}, '${p.author_name}', '${p.author_avatar_url}'); showPage('messages')">Contacter</button>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="post-date">${new Date(p.created_at).toLocaleDateString()}</span>
              ${(currentUser && currentUser.user_type === 'admin') ? `<button class="btn-delete-post" onclick="deletePost(${p.id})" title="Supprimer (Admin)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
            </div>
          </div>
          <p class="post-desc">${p.description || ''}</p>
          <div class="post-actions">
            <button class="like-btn ${p.is_liked ? 'active' : ''}" onclick="toggleLikePost(${p.id}, this)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${p.is_liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span class="like-count">${p.likes_count || 0}</span>
            </button>
            <button class="comment-trigger" onclick="openPostDetail(${p.id})">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <span>${p.comments_count || 0}</span>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error("Fetch posts error:", err);
    feed.innerHTML = '<div style="color:var(--red); text-align:center; padding:20px;">Erreur de chargement.</div>';
  }
};

window.toggleLikePost = async function(postId, btn, isModal = false) {
  if (!authToken) { openAuthModal(); return; }
  try {
    const res = await fetch(API_BASE + '/api/posts?action=like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ postId })
    });
    const result = await res.json();
    if (res.ok) {
      const countSpan = isModal ? document.getElementById('pd-likes-count') : btn.querySelector('.like-count');
      let count = parseInt(countSpan.innerText);
      if (result.liked) {
        btn.classList.add('active');
        btn.querySelector('svg').setAttribute('fill', 'currentColor');
        if (countSpan) countSpan.innerText = count + 1;
      } else {
        btn.classList.remove('active');
        btn.querySelector('svg').setAttribute('fill', 'none');
        if (countSpan) countSpan.innerText = count - 1;
      }
      if (isModal) fetchCommunityPosts(); // Sync main feed
    }
  } catch (err) {
    console.error("Like error:", err);
  }
};

window.openPostModal = function() {
  if (!authToken) {
    showToast("Connectez-vous pour partager votre voiture !", "info");
    return;
  }
  document.getElementById('postModal').style.display = 'flex';
};

window.closePostModal = function() {
  document.getElementById('postModal').style.display = 'none';
};

window.submitPost = async function() {
  const image_url = document.getElementById('post-image-url').value.trim();
  const description = document.getElementById('post-description').value.trim();

  if (!image_url) {
    alert("L'URL de l'image est requise.");
    return;
  }

  try {
    const res = await fetch(API_BASE + '/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ image_url, description })
    });
    if (res.ok) {
      closePostModal();
      document.getElementById('post-image-url').value = '';
      document.getElementById('post-description').value = '';
      fetchCommunityPosts();
    } else {
      const err = await res.json();
      showToast("Erreur: " + err.error, "error");
    }
  } catch (err) {
    showToast("Erreur lors de la publication.", "error");
  }
};

window.deletePost = async function(postId) {
  if (!confirm("Voulez-vous vraiment supprimer ce post (Action Admin) ?")) return;
  try {
    const res = await fetch(API_BASE + '/api/posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ postId })
    });
    if (res.ok) {
      fetchCommunityPosts();
    } else {
      const err = await res.json();
      alert("Erreur: " + err.error);
    }
  } catch (err) {
    alert("Erreur lors de la suppression.");
  }
};

// ════════════════════ GESTION DES BADGES NOTIFS ════════════════════
window.updateCommunityBadges = async function() {
  if (document.hidden) return;
  const lastVisit = parseInt(localStorage.getItem('last_comm_visit') || '0');
  const badge = document.getElementById('comm-badge');
  const dot = document.getElementById('comm-dot');

  try {
    const res = await fetch(API_BASE + '/api/posts');
    const posts = await res.json();
    if (!res.ok) return;

    // On ne compte que les posts des AUTRES créés après la dernière visite
    const newPosts = posts.filter(p => {
      const isOthers = currentUser ? (p.user_id !== currentUser.id) : true;
      const isNew = new Date(p.created_at).getTime() > lastVisit;
      return isOthers && isNew;
    });

    const count = newPosts.length;

    if (count > 0) {
      if (badge) { badge.innerText = count; badge.style.display = 'block'; }
      if (dot) { dot.style.display = 'block'; }
    } else {
      if (badge) badge.style.display = 'none';
      if (dot) dot.style.display = 'none';
    }
  } catch (err) {
    console.error("Badge update error:", err);
  }
};

// Vérification au démarrage
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(updateCommunityBadges, 800);
  setInterval(updateCommunityBadges, 60000 * 2); // Toutes les 2 mins
});

// ════════════════════ AUTO-UPDATE ON FOCUS ════════════════════
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log("App focused, checking for updates...");
    
    // Rafraîchir les badges
    if (typeof updateCommunityBadges === 'function') updateCommunityBadges();

    // Les polls sont suspendus en arrière-plan : on rattrape tout de suite au retour.
    if (chatPollInterval) loadChatMessages();
    if (activeChatId) loadMessages();
    if (_msgPollingInterval) pollNewMessages();
    
    // Si on est sur la page communauté, rafraîchir le flux
    const commPage = document.getElementById('page-community');
    if (commPage && commPage.classList.contains('active')) {
      if (typeof fetchCommunityPosts === 'function') fetchCommunityPosts();
    }

    // Vérifier si une nouvelle version du Service Worker est dispo
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) reg.update();
      });
    }
  }
});

// ════════════════════ GESTION DES COMMENTAIRES ════════════════════
window.toggleComments = async function(postId, btn) {
  const section = document.getElementById('comments-' + postId);
  if (section.style.display === 'none') {
    section.style.display = 'block';
    loadComments(postId);
  } else {
    section.style.display = 'none';
  }
};

window.loadComments = async function(postId) {
  const list = document.getElementById('comments-list-' + postId);
  list.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--text3);">Chargement...</div>';
  
  try {
    const res = await fetch(`${API_BASE}/api/posts?action=comments&postId=${postId}`);
    const comments = await res.json();
    
    if (comments.length === 0) {
      list.innerHTML = '<div style="padding:15px; font-size:13px; color:var(--text3); text-align:center;">Soyez le premier à commenter !</div>';
      return;
    }

    list.innerHTML = comments.map(c => `
      <div class="comment-bubble">
        <div class="comment-header">
          <span class="comment-author">${c.author_name}</span>
          <span class="comment-date">${new Date(c.created_at).toLocaleDateString()}</span>
        </div>
        <div class="comment-text">${c.content}</div>
      </div>
    `).join('');
    
    // Scroll to bottom
    list.scrollTop = list.scrollHeight;
  } catch (err) {
    list.innerHTML = '<div style="color:var(--red); padding:10px;">Erreur de chargement</div>';
  }
};

window.submitComment = async function(postId) {
  const input = document.getElementById('comment-input-' + postId);
  const content = input.value.trim();
  if (!content) return;
  if (!authToken) { openAuthModal(); return; }

  try {
    const res = await fetch(`${API_BASE}/api/posts?action=comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ postId, content })
    });
    
    if (res.ok) {
      input.value = '';
      loadComments(postId);
      // Optionnel: rafraîchir le compteur sur le bouton
    } else {
      const err = await res.json();
      alert(err.error || "Erreur");
    }
  } catch (err) {
    alert("Erreur réseau");
  }
};

// ════════════════════ VUE DÉTAILLÉE (STYLE INSTA) ════════════════════
window.openPostDetail = async function(postId) {
  const post = (window.communityPosts || []).find(p => p.id === postId);
  if (!post) return;

  const modal = document.getElementById('postDetailModal');
  const img = document.getElementById('pd-img');
  const author = document.getElementById('pd-author');
  const avatar = document.getElementById('pd-avatar');
  const date = document.getElementById('pd-date');
  const desc = document.getElementById('pd-description');
  const likes = document.getElementById('pd-likes-count');
  const likeBtn = document.getElementById('pd-like-btn');
  const submitBtn = document.getElementById('pd-submit-comment');
  const input = document.getElementById('pd-comment-input');

  // Fill data
  img.src = post.image_url;
  avatar.outerHTML = getUserAvatarHtml({ first_name: post.author_name, avatar_url: post.author_avatar_url }, 'pd-avatar');
  author.innerHTML = `${post.author_name}${getUserBadge(post.user_type, post.user_rank)}`;
  author.className = 'pd-author clickable-author';
  author.onclick = () => { closePostDetail(); openUserProfile(post.user_id); };
  
  // Contact button in detail
  const header = document.querySelector('.pd-header-info');
  if (header && currentUser && post.user_id !== currentUser.id) {
    const existingBtn = header.querySelector('.btn-contact-mini');
    if (existingBtn) existingBtn.remove();
    const btn = document.createElement('button');
    btn.className = 'btn-contact-mini';
    btn.style.marginTop = '5px';
    btn.innerText = 'Contacter';
    btn.onclick = () => { closePostDetail(); openChat(post.user_id, post.author_name, post.author_avatar_url); showPage('messages'); };
    header.appendChild(btn);
  }
  date.innerText = new Date(post.created_at).toLocaleDateString();
  desc.innerText = post.description || '';
  likes.innerText = post.likes_count || 0;
  
  // Like state
  if (post.is_liked) {
    likeBtn.classList.add('active');
    likeBtn.querySelector('svg').setAttribute('fill', 'currentColor');
  } else {
    likeBtn.classList.remove('active');
    likeBtn.querySelector('svg').setAttribute('fill', 'none');
  }

  // Click handlers
  likeBtn.onclick = () => toggleLikePost(postId, likeBtn, true);
  submitBtn.onclick = () => submitDetailComment(postId);
  input.onkeyup = (e) => { if (e.key === 'Enter') submitDetailComment(postId); };

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  loadDetailComments(postId);
};

window.closePostDetail = function() {
  document.getElementById('postDetailModal').style.display = 'none';
  document.body.style.overflow = 'auto';
};

window.loadDetailComments = async function(postId) {
  const list = document.getElementById('pd-comments-list');
  list.innerHTML = '<div style="color:var(--text3); font-size:12px;">Chargement des commentaires...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/posts?action=comments&postId=${postId}`);
    const comments = await res.json();
    
    if (comments.length === 0) {
      list.innerHTML = '<div style="color:var(--text3); font-size:13px; text-align:center; padding:20px;">Aucun commentaire pour le moment.</div>';
      return;
    }

    list.innerHTML = comments.map(c => `
      <div class="comment-bubble" style="background:none; border:none; padding:0; margin-bottom:15px;">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          ${getUserAvatarHtml({ first_name: c.author_name, avatar_url: c.author_avatar_url }, 'pd-avatar')}
          <div>
            <div style="font-size:13px;"><strong class="clickable-author" onclick="closePostDetail(); openUserProfile(${c.user_id})" style="color:#fff; margin-right:6px;">${c.author_name}${getUserBadge(c.user_type, c.user_rank)}</strong> ${c.content}</div>
            <div style="font-size:10px; color:var(--text3); margin-top:4px;">${new Date(c.created_at).toLocaleDateString()}</div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = 'Erreur';
  }
};

window.submitDetailComment = async function(postId) {
  const input = document.getElementById('pd-comment-input');
  const content = input.value.trim();
  if (!content || !authToken) return;

  try {
    const res = await fetch(`${API_BASE}/api/posts?action=comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ postId, content })
    });
    if (res.ok) {
      input.value = '';
      loadDetailComments(postId);
      fetchCommunityPosts(); // Update count in background
    }
  } catch (err) {}
};

// ════════════════════ BADGES UTILISATEURS ════════════════════
window.getUserBadge = function(userType, rank) {
  let badges = '';
  if (userType === 'admin') {
    badges += `<span class="user-badge"><span class="badge-admin">Admin</span></span>`;
  }
  if (userType === 'admin' || userType === 'pro' || userType === 'verified') {
    badges += `<span class="user-badge badge-verified"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zM10 17l-5-5 1.4-1.4 3.6 3.6 7.6-7.6L19 8l-9 9z"/></svg></span>`;
  }
  if (rank && rank !== 'Novice') {
    const rankClass = 'rank-badge-' + rank.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    badges += `<span class="rank-badge ${rankClass}">${rank}</span>`;
  }
  return badges;
};

// ════════════════════ SYSTÈME XP & RÉCOMPENSES ════════════════════
window.applyProfileCustomization = function(elementId, user) {
  const el = document.getElementById(elementId);
  if (!el || !user) return;
  const theme = user.profile_theme || 'default';
  const banner = user.profile_banner || 'none';
  const frame = user.avatar_frame || 'none';

  ['default','midnight','racing','gold','neon'].forEach(t => el.classList.remove('theme-' + t));
  ['none','speed','sunset','carbon','aurora'].forEach(b => el.classList.remove('banner-' + b));
  ['none','bronze','silver','gold','diamond'].forEach(f => el.classList.remove('frame-' + f));

  el.classList.add(`theme-${theme}`, `banner-${banner}`, `frame-${frame}`);
};

window.loadGamificationData = async function() {
  if (!authToken) return;
  try {
    const res = await fetch(API_BASE + '/api/auth/gamification', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.ok) {
      gamificationData = await res.json();
    }
  } catch (err) {
    console.error('Gamification load error:', err);
  }
};

window.switchRewardsTab = function(tab) {
  activeRewardsTab = tab;
  document.querySelectorAll('.rewards-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderRewardsGrid();
};

window.renderRewardsGrid = function() {
  const grid = document.getElementById('rewards-grid');
  if (!grid || !gamificationData) return;

  const adminMode = isCurrentUserAdmin() || gamificationData.isAdmin === true;
  const items = gamificationData.unlocked[activeRewardsTab] || [];
  const equipped = gamificationData.equipped;
  const equippedKey = activeRewardsTab === 'themes' ? 'theme' : activeRewardsTab === 'banners' ? 'banner' : 'frame';

  const equippedItem = items.find(i => i.id === equipped[equippedKey]);
  const badge = document.getElementById('rewards-equipped-badge');
  if (badge && equippedItem) badge.innerText = equippedItem.name;

  grid.innerHTML = items.map(item => {
    // Admins have access to every item regardless of XP
    const unlocked = adminMode ? true : item.unlocked;
    const isEquipped = equipped[equippedKey] === item.id;
    const previewClass = activeRewardsTab === 'themes' ? `theme-${item.id}` :
                         activeRewardsTab === 'banners' ? `banner-${item.id}` : `frame-${item.id}`;
    const reqLabel = item.minPoints === 0 ? 'Débloqué'
                   : adminMode ? '👑 Admin'
                   : item.minPoints + ' XP';
    return `
      <div class="reward-item ${unlocked ? 'unlocked' : 'locked'} ${isEquipped ? 'equipped' : ''}"
           ${unlocked ? `onclick="equipReward('${activeRewardsTab}', '${item.id}')"` : ''}>
        ${!unlocked ? '<span class="reward-item-lock">🔒</span>' : ''}
        <div class="reward-preview ${previewClass}"></div>
        <div class="reward-item-icon">${item.icon}</div>
        <div class="reward-item-name">${item.name}</div>
        <div class="reward-item-desc">${item.description}</div>
        <div class="reward-item-req">${reqLabel}</div>
        ${isEquipped ? '<div class="reward-item-equipped">Équipé</div>' : ''}
      </div>
    `;
  }).join('');
};

window.equipReward = async function(category, itemId) {
  if (!authToken) return;
  const body = {};
  if (category === 'themes') body.profileTheme = itemId;
  else if (category === 'banners') body.profileBanner = itemId;
  else if (category === 'frames') body.avatarFrame = itemId;

  // ── Mise à jour optimiste immédiate ──
  const equippedKey = category === 'themes' ? 'theme' : category === 'banners' ? 'banner' : 'frame';
  if (gamificationData?.equipped) {
    gamificationData.equipped[equippedKey] = itemId;
    renderRewardsGrid(); // affiche "Équipé" instantanément
  }

  try {
    const res = await fetch(API_BASE + '/api/auth/apply-customization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      currentUser = data.user;
      gamificationData = data.gamification;
      localStorage.setItem('user', JSON.stringify(currentUser));

      // Applique les classes de thème/bannière/cadre sur le header
      applyProfileCustomization('profile-display-header', currentUser);

      // Met à jour l'avatar sans perdre l'id de l'élément
      const avatarEl = document.getElementById('p-display-avatar');
      if (avatarEl) {
        if (currentUser.avatar_url) {
          avatarEl.innerHTML = `<img src="${currentUser.avatar_url}" onerror="this.parentElement.innerHTML='${currentUser.first_name?.[0] || 'U'}'">`;
        } else {
          const initials = ((currentUser.first_name?.[0] || '') + (currentUser.last_name?.[0] || '')).toUpperCase() || 'U';
          avatarEl.innerHTML = initials;
        }
      }

      renderRewardsGrid(); // confirme l'état serveur
      showToast('Style appliqué !', 'success');
    } else {
      // Rollback si erreur serveur
      if (gamificationData?.equipped) {
        await loadGamificationData();
        renderRewardsGrid();
      }
      showToast(data.error || 'Récompense non débloquée', 'error');
    }
  } catch (err) {
    showToast('Erreur réseau', 'error');
  }
};

// ════════════════════ GESTION DU PROFIL ════════════════════
window.getUserAvatarHtml = function(user, sizeClass = 'user-avatar-nav') {
  if (!user) return `<div class="${sizeClass}">?</div>`;
  if (user.avatar_url) {
    return `<div class="${sizeClass}"><img src="${user.avatar_url}" onerror="this.parentElement.innerHTML='${user.first_name?.[0] || 'U'}'"></div>`;
  }
  const initials = ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || user.email?.[0].toUpperCase() || 'U';
  return `<div class="${sizeClass}">${initials}</div>`;
};

window.toggleEditProfile = function() {
  const display = document.getElementById('profile-display');
  const form = document.getElementById('profile-form');
  const btn = document.getElementById('edit-profile-btn');

  if (form.style.display === 'none') {
    form.style.display = 'block';
    display.style.display = 'none';
    btn.style.display = 'none';
    
    // Fill form with current data
    document.getElementById('p-edit-firstname').value = currentUser.first_name || '';
    document.getElementById('p-edit-lastname').value = currentUser.last_name || '';
    document.getElementById('p-edit-avatar').value = currentUser.avatar_url || '';
    document.getElementById('p-edit-bio').value = currentUser.bio || '';
    document.getElementById('p-edit-location').value = currentUser.location || '';
    document.getElementById('p-edit-instagram').value = currentUser.instagram || '';
    document.getElementById('p-edit-garage').value = currentUser.garage || '';
  } else {
    form.style.display = 'none';
    display.style.display = 'block';
    btn.style.display = 'block';
  }
};

window.handleSaveProfile = async function(e) {
  e.preventDefault();
  const firstName = document.getElementById('p-edit-firstname').value.trim();
  const lastName = document.getElementById('p-edit-lastname').value.trim();
  const avatarUrl = document.getElementById('p-edit-avatar').value.trim();
  const bio = document.getElementById('p-edit-bio').value.trim();
  const location = document.getElementById('p-edit-location').value.trim();
  const instagram = document.getElementById('p-edit-instagram').value.trim();
  const garage = document.getElementById('p-edit-garage').value.trim();

  try {
    const res = await fetch(API_BASE + '/api/auth/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ firstName, lastName, avatarUrl, bio, location, instagram, garage })
    });
    const data = await res.json();
    if (res.ok) {
      currentUser = data.user;
      localStorage.setItem('user', JSON.stringify(currentUser));
      updateAccountPage();
      updateNav();
      toggleEditProfile();
      showToast("Profil mis à jour !", "success");
    } else {
      showToast(data.error || "Erreur lors de la mise à jour", "error");
    }
  } catch (err) {
    showToast("Erreur réseau", "error");
  }
};

// ════════════════════ GESTION MESSAGERIE ════════════════════
let activeChatId = null;
let chatInterval = null;

window.fetchConversations = async function() {
  if (!authToken) return;
  try {
    const res = await fetch(API_BASE + '/api/messages?action=list', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    const list = document.getElementById('conv-list');
    
    if (data.length === 0) {
      list.innerHTML = '<div class="conv-empty">Aucune conversation.</div>';
      return;
    }

    let unreadCount = 0;
    list.innerHTML = data.map(c => {
      if (!c.is_read && c.last_message) unreadCount++;
      return `
        <div class="conv-item ${activeChatId == c.other_id ? 'active' : ''}" onclick="openChat(${c.other_id}, '${c.other_name}', '${c.other_avatar}')">
          ${getUserAvatarHtml({ first_name: c.other_name, avatar_url: c.other_avatar }, 'user-avatar-nav')}
          <div class="conv-info">
            <div class="conv-name">${c.other_name}</div>
            <div class="conv-last">${c.last_message || 'Démarrer une discussion'}</div>
          </div>
          ${!c.is_read ? '<div style="width:8px; height:8px; background:var(--accent); border-radius:50%;"></div>' : ''}
        </div>
      `;
    }).join('');

    updateMsgBadges(unreadCount);

  } catch (err) { console.error("Msg Error:", err); }
};

window.openChat = async function(otherId, name, avatar) {
  activeChatId = otherId;
  document.getElementById('chat-header').style.display = 'flex';
  document.getElementById('chat-input-area').style.display = 'flex';
  document.getElementById('chat-other-name').innerText = name;
  document.getElementById('chat-other-avatar').outerHTML = getUserAvatarHtml({ first_name: name, avatar_url: avatar }, 'user-avatar-nav');
  
  // Refresh conversations to update active state
  fetchConversations();
  
  // Load messages
  loadMessages();
  
  // Auto refresh chat
  if (chatInterval) clearInterval(chatInterval);
  chatInterval = setInterval(loadMessages, 3000);

  // Mobile layout adjustment
  if (window.innerWidth <= 768) {
    document.querySelector('.conv-sidebar').classList.add('hidden-mobile');
    document.querySelector('.chat-window').classList.remove('hidden-mobile');
  }
};

let _dmLastSig = '';
window.loadMessages = async function() {
  if (!activeChatId || !authToken || document.hidden) return;
  try {
    const res = await fetch(API_BASE + '/api/messages?action=chat&otherId=' + activeChatId, {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    const area = document.getElementById('dm-messages');
    if (!Array.isArray(data)) return;

    // Rien de nouveau : on ne reconstruit pas le DOM (évite scintillement et saccades).
    const sig = activeChatId + ':' + data.length + ':' + (data.length ? data[data.length - 1].id + data[data.length - 1].created_at : '');
    if (sig === _dmLastSig) return;
    _dmLastSig = sig;

    const oldScrollHeight = area.scrollHeight;
    
    area.innerHTML = data.map(m => `
      <div class="msg-bubble ${m.sender_id == currentUser.id ? 'msg-sent' : 'msg-received'}">
        ${esc(m.content)}
        <div style="font-size:9px; opacity:0.6; margin-top:4px; text-align:right;">
          ${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    `).join('');

    // Scroll to bottom only if we were already at bottom or if it's the first load
    if (area.scrollTop + area.clientHeight >= oldScrollHeight - 100) {
      area.scrollTop = area.scrollHeight;
    }
  } catch (err) { console.error("Chat Load Error:", err); }
};

window.sendMessage = async function() {
  const input = document.getElementById('dm-input');
  const content = input.value.trim();
  if (!content || !activeChatId) return;
  
  input.value = '';
  try {
    await fetch(API_BASE + '/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ receiverId: activeChatId, content })
    });
    _dmLastSig = '';
    loadMessages();
  } catch (err) { showToast("Erreur d'envoi", "error"); }
};

window.closeChat = function() {
  activeChatId = null;
  _dmLastSig = '';
  if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }
  document.getElementById('chat-header').style.display = 'none';
  document.getElementById('chat-input-area').style.display = 'none';
  document.getElementById('dm-messages').innerHTML = '<div class="chat-welcome">Sélectionnez une conversation pour commencer à discuter.</div>';
  
  if (window.innerWidth <= 768) {
    document.querySelector('.conv-sidebar').classList.remove('hidden-mobile');
    document.querySelector('.chat-window').classList.add('hidden-mobile');
  }
  fetchConversations();
};

let msgSearchTimeout = null;
window.handleMsgUserSearch = function() {
  const q = document.getElementById('msg-user-search-input').value.trim();
  const resultsDiv = document.getElementById('msg-user-search-results');
  
  if (q.length < 1) {
    resultsDiv.style.display = 'none';
    return;
  }
  
  resultsDiv.innerHTML = '<div style="padding:20px; text-align:center;"><div class="loader-sm"></div></div>';
  resultsDiv.style.display = 'block';
  
  clearTimeout(msgSearchTimeout);
  msgSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(API_BASE + '/api/messages?action=search_users&q=' + encodeURIComponent(q), {
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
      const users = await res.json();
      
      if (users.length === 0) {
        resultsDiv.innerHTML = '<div style="padding:12px; color:var(--text3); font-size:12px; text-align:center;">Aucun membre trouvé</div>';
      } else {
        resultsDiv.innerHTML = users.map(u => `
          <div class="conv-item" style="border-bottom:1px solid var(--border);" onclick="selectUserForChat(${u.id}, '${(u.name || '').replace(/'/g, "\\'")}', '${u.avatar_url || ''}')">
            ${getUserAvatarHtml(u, 'user-avatar-nav')}
            <div class="conv-info">
              <div class="conv-name" style="display:flex; align-items:center; gap:5px;">
                ${u.name} 
                ${u.pseudo ? `<span style="font-size:11px; color:var(--accent); font-weight:400; opacity:0.8;">@${u.pseudo}</span>` : ''}
                ${u.user_type === 'admin' ? '🛡️' : ''}
              </div>
              <div class="conv-last" style="color:var(--accent);">Envoyer un message</div>
            </div>
          </div>
        `).join('');
      }
      resultsDiv.style.display = 'block';
    } catch (err) {
      console.error('Search error:', err);
    }
  }, 300);
};

window.selectUserForChat = function(id, name, avatarUrl) {
  document.getElementById('msg-user-search-input').value = '';
  document.getElementById('msg-user-search-results').style.display = 'none';
  openChat(id, name, avatarUrl);
};

// ════════════════════ GESTION PROFIL PUBLIC ════════════════════
let activeProfileId = null;

window.openUserProfile = async function(userId) {
  if (currentUser && userId == currentUser.id) {
    showPage('account');
    return;
  }
  
  activeProfileId = userId;
  showPage('user-profile');
  
  const upPosts = document.getElementById('up-posts-grid');
  upPosts.innerHTML = '<div style="color:var(--text3);">Chargement du profil...</div>';
  
  try {
    const res = await fetch(`${API_BASE}/api/social?action=profile&userId=${userId}`, {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    const u = data.user;
    
    // Fill user info
    applyProfileCustomization('up-header', u);
    document.getElementById('up-avatar').outerHTML = getUserAvatarHtml(u, 'profile-main-avatar');
    document.getElementById('up-name').innerText = u.first_name + ' ' + (u.last_name || '');
    document.getElementById('up-pseudo').innerText = u.pseudo ? '@' + u.pseudo : '';
    document.getElementById('up-badges').innerHTML = getUserBadge(u.user_type, u.user_rank);
    document.getElementById('up-count-followers').innerText = u.followers_count;
    document.getElementById('up-count-following').innerText = u.following_count;
    
    document.getElementById('up-bio').innerText = u.bio || "Aucune bio renseignée.";
    document.getElementById('up-garage').innerText = u.garage || "Garage vide.";
    
    if (u.location) {
      document.getElementById('up-location-box').style.display = 'flex';
      document.getElementById('up-location').innerText = u.location;
    } else {
      document.getElementById('up-location-box').style.display = 'none';
    }
    
    if (u.instagram) {
      document.getElementById('up-instagram-box').style.display = 'block';
      document.getElementById('up-instagram').innerText = u.instagram;
    } else {
      document.getElementById('up-instagram-box').style.display = 'none';
    }
    
    // Follow button state
    const followBtn = document.getElementById('up-follow-btn');
    if (u.is_following) {
      followBtn.innerText = 'Se désabonner';
      followBtn.classList.add('btn-outline');
      followBtn.classList.remove('btn-primary');
    } else {
      followBtn.innerText = 'S\'abonner';
      followBtn.classList.remove('btn-outline');
      followBtn.classList.add('btn-primary');
    }
    
    // Fill posts
    if (data.posts.length === 0) {
      upPosts.innerHTML = '<div style="color:var(--text3); grid-column:1/-1; text-align:center; padding:40px;">Aucune publication.</div>';
    } else {
      upPosts.innerHTML = data.posts.map(p => `
        <div class="post-card">
          <img class="post-img" src="${p.image_url}" onclick="openPostDetail(${p.id})">
          <div class="post-content">
            <p class="post-desc" style="margin:0;">${p.description || ''}</p>
          </div>
        </div>
      `).join('');
    }
    
    // Fill playlists
    const upPlaylists = document.getElementById('up-playlists-grid');
    if (data.playlists && data.playlists.length > 0) {
      upPlaylists.innerHTML = data.playlists.map(p => `
        <div class="playlist-card pl-theme-${p.theme || 'night'}">
          <div class="pl-header">
            <div class="pl-info">
              <h4>${p.title}</h4>
              <span>${getThemeLabel(p.theme)}</span>
            </div>
          </div>
          <div class="pl-media" onclick="openPlaylistDetail(${p.id})">
            ${getPlatformIcon(p.playlist_url)}
          </div>
        </div>
      `).join('');
    } else {
      upPlaylists.innerHTML = '<div style="color:var(--text3); grid-column:1/-1; text-align:center; padding:40px;">Aucune playlist partagée.</div>';
    }
    
  } catch (err) {
    showToast("Erreur lors du chargement du profil", "error");
  }
};

window.switchUpTab = function(tabName, btn) {
  document.querySelectorAll('.up-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  if (tabName === 'posts') {
    document.getElementById('up-posts-grid').style.display = 'grid';
    document.getElementById('up-playlists-grid').style.display = 'none';
  } else {
    document.getElementById('up-posts-grid').style.display = 'none';
    document.getElementById('up-playlists-grid').style.display = 'grid';
  }
};

window.handleFollowUser = async function() {
  if (!authToken) {
    showToast("Connectez-vous pour suivre des membres", "info");
    return;
  }
  if (!activeProfileId) return;
  
  try {
    const res = await fetch(API_BASE + '/api/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ action: 'follow', targetId: activeProfileId })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.following ? "Abonnement réussi !" : "Désabonnement réussi", "success");
      openUserProfile(activeProfileId); // Refresh
    }
  } catch (err) { showToast("Erreur réseau", "error"); }
};

window.handleProfileMessage = function() {
  if (!activeProfileId) return;
  const name = document.getElementById('up-name').innerText;
  const avatar = document.getElementById('up-avatar').src;
  openChat(activeProfileId, name, avatar);
  showPage('messages');
};

// ════════════════════ DIRECT MESSAGES ACCESS ════════════════════

window.goToMessages = function() {
  if (!currentUser) {
    openAuthModal();
    showToast("Connectez-vous pour accéder à vos messages", "info");
    return;
  }
  showPage('messages');
};

// Répercute le nombre de messages non lus partout où il est signalé :
// pastille du menu compte, onglet Compte de la barre du bas, sélecteur Communauté.
function updateMsgBadges(count) {
  const sub = document.getElementById('msg-count-sub');
  if (sub) { sub.textContent = count > 0 ? (count > 9 ? '9+' : count) : ''; sub.hidden = !(count > 0); }

  const badges = ['msg-badge-nav', 'msg-badge-bnav'];
  const dots   = ['msg-dot'];

  badges.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 9 ? '9+' : count;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  });

  dots.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = count > 0 ? 'block' : 'none';
  });
}

// ── Background polling: checks for new messages every 15 s ──
let _lastUnreadCount = 0;
let _msgPollingInterval = null;

async function pollNewMessages() {
  if (!authToken || !currentUser || document.hidden) return;

  // Don't notify if the user is already on the messages page
  const messagesPageActive = document.getElementById('page-messages')?.classList.contains('active');

  try {
    const res = await fetch(API_BASE + '/api/messages?action=list', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (!res.ok) return;
    const data = await res.json();

    const unread = data.filter(c => !c.is_read && c.last_message).length;

    // Show toast only when unread count increases and user is NOT on messages page
    if (unread > _lastUnreadCount && !messagesPageActive) {
      const newMsgs = unread - _lastUnreadCount;
      const label = newMsgs === 1 ? 'nouveau message' : 'nouveaux messages';
      showToast(`💬 ${newMsgs} ${label} non lu${newMsgs > 1 ? 's' : ''}`, 'info');
    }

    _lastUnreadCount = unread;
    updateMsgBadges(unread);

  } catch (err) {
    // silent fail
  }
}

function startMessagePolling() {
  if (_msgPollingInterval) clearInterval(_msgPollingInterval);
  _lastUnreadCount = 0;
  _msgPollingInterval = setInterval(pollNewMessages, 15000);
  // Run immediately on start
  pollNewMessages();
}

function stopMessagePolling() {
  if (_msgPollingInterval) {
    clearInterval(_msgPollingInterval);
    _msgPollingInterval = null;
  }
  _lastUnreadCount = 0;
  updateMsgBadges(0);
}

// ════════════════════ CHAT ENTRAIDE ════════════════════
let chatPollInterval = null;
let _chatLastSig = '';

window.loadChatMessages = async function(force) {
  const container = document.getElementById('chat-messages');
  if (!container || (document.hidden && !force)) return;
  try {
    const res = await fetch(API_BASE + '/api/chat');
    const messages = await res.json();
    if (!res.ok) throw new Error(messages.error);
    
    if (messages.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:50px; opacity:0.5;">Aucun message. Soyez le premier !</div>';
      return;
    }
    
    const last = messages[messages.length - 1];
    const sig = messages.length + ':' + last.id + ':' + last.created_at + ':' + (currentUser ? currentUser.id : '');
    if (sig === _chatLastSig && !force) return;
    _chatLastSig = sig;

    // Check if scrolled to bottom before updating
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
    
    container.innerHTML = messages.map(m => {
      const isMe = currentUser && m.user_id === currentUser.id;
      return `
        <div class="chat-bubble ${isMe ? 'me' : 'other'}">
          <div class="chat-meta">
            ${!isMe ? `<span class="post-author clickable-author" onclick="openUserProfile(${m.user_id})">${esc(m.author_name)}${getUserBadge(m.user_type, m.user_rank)}</span>` : ''}
            <span>${new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
          <div class="chat-text">${esc(m.content)}</div>
        </div>
      `;
    }).join('');
    
    // Auto-scroll to bottom if we were already there
    if (isAtBottom) container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error("Chat error:", err);
  }
};

window.sendChatMessage = async function() {
  if (!authToken) { openAuthModal(); return; }
  
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content) return;
  
  input.value = '';
  
  try {
    const res = await fetch(API_BASE + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ content })
    });
    
    if (res.ok) {
      loadChatMessages(true);
      setTimeout(() => {
        const container = document.getElementById('chat-messages');
        container.scrollTop = container.scrollHeight;
      }, 100);
    } else {
      const data = await res.json();
      showToast(data.error, 'error');
    }
  } catch (err) {
    showToast("Erreur réseau", 'error');
  }
};

window.startChatPolling = function() {
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(loadChatMessages, 5000);
};

window.stopChatPolling = function() {
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }
};

document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});
