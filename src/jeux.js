// ═══════════════════════════════════════════
//  AUTOSPEC — QUIZ (interface)
//
//  Les questions et les règles sont dans src/lib/quiz.js ; ce fichier ne
//  fait qu'afficher la partie. Trois écrans se succèdent dans #quiz-app :
//  choix du thème, question, bilan. Les clics passent par un seul écouteur
//  délégué plutôt que par des onclick="…" dans le HTML.
// ═══════════════════════════════════════════

(function () {
  const LETTRES = ['A', 'B', 'C', 'D'];
  const CLE_RECORD = 'autospec_quiz_record_';

  let partie = null;   // { theme, questions, i, score, bonnes, reponses, repondu }
  let chrono = null;   // { fin, timer }

  const racine = () => document.getElementById('quiz-app');

  // Le stockage peut être indisponible (navigation privée) : le record est
  // un bonus, jamais une condition pour jouer.
  function lireRecord(theme) {
    try { return Number(localStorage.getItem(CLE_RECORD + theme)) || 0; } catch { return 0; }
  }
  function ecrireRecord(theme, score) {
    try { localStorage.setItem(CLE_RECORD + theme, String(score)); } catch { /* sans effet */ }
  }

  function nomTheme(theme) {
    return theme === 'tout' ? 'Tous les thèmes' : QUIZ_THEMES[theme].label;
  }

  // ── ÉCRAN 1 : CHOIX DU THÈME ──
  function afficherAccueil() {
    arreterChrono();
    partie = null;
    const themes = [['tout', { label: 'Tous les thèmes', desc: 'Un peu de tout, à parts égales' }], ...Object.entries(QUIZ_THEMES)];
    racine().innerHTML = `
      <div class="quiz-themes">
        ${themes.map(([id, t]) => {
          const record = lireRecord(id);
          return `
          <button type="button" class="quiz-theme${id === 'tout' ? ' quiz-theme-tout' : ''}" data-quiz="jouer" data-theme="${id}">
            <span class="quiz-theme-nom">${esc(t.label)}</span>
            <span class="quiz-theme-desc">${esc(t.desc)}</span>
            <span class="quiz-theme-record">${record ? `Record : ${vfrScore(record)} pts` : 'Pas encore joué'}</span>
          </button>`;
        }).join('')}
      </div>`;
  }

  // ── ÉCRAN 2 : QUESTION ──
  function lancer(theme) {
    partie = { theme, questions: quizTirer(theme), i: 0, score: 0, bonnes: 0, reponses: [], repondu: false };
    afficherQuestion();
  }

  function afficherQuestion() {
    const q = partie.questions[partie.i];
    const total = partie.questions.length;
    partie.repondu = false;
    racine().innerHTML = `
      <div class="quiz-carte">
        <div class="quiz-entete">
          <span class="quiz-progression">Question ${partie.i + 1} / ${total} · ${esc(QUIZ_THEMES[q.theme].label)}</span>
          <span class="quiz-score">${vfrScore(partie.score)} pts</span>
        </div>
        <div class="quiz-chrono" aria-hidden="true"><div class="quiz-chrono-barre" id="quiz-barre"></div></div>
        <div class="quiz-secondes" id="quiz-secondes">${QUIZ_DUREE_S} s</div>
        <h2 class="quiz-question" tabindex="-1" id="quiz-question">${esc(q.q)}</h2>
        <div class="quiz-choix" role="group" aria-label="Réponses">
          ${q.choix.map((c, k) => `
            <button type="button" class="quiz-reponse" data-quiz="repondre" data-k="${k}">
              <span class="quiz-lettre">${LETTRES[k]}</span><span>${esc(c)}</span>
            </button>`).join('')}
        </div>
        <div class="quiz-retour" id="quiz-retour" hidden></div>
      </div>`;
    document.getElementById('quiz-question')?.focus({ preventScroll: true });
    demarrerChrono();
  }

  function demarrerChrono() {
    arreterChrono();
    const fin = performance.now() + QUIZ_DUREE_S * 1000;
    const barre = document.getElementById('quiz-barre');
    const sec = document.getElementById('quiz-secondes');
    const tic = () => {
      const reste = Math.max(0, (fin - performance.now()) / 1000);
      if (barre) {
        barre.style.transform = `scaleX(${reste / QUIZ_DUREE_S})`;
        barre.classList.toggle('urgent', reste <= 5);
      }
      if (sec) sec.textContent = `${Math.ceil(reste)} s`;
      if (reste <= 0) repondre(null);
    };
    chrono = { fin, timer: setInterval(tic, 100) };
    tic();
  }

  function arreterChrono() {
    if (chrono) clearInterval(chrono.timer);
    const reste = chrono ? Math.max(0, (chrono.fin - performance.now()) / 1000) : 0;
    chrono = null;
    return reste;
  }

  // k === null : le temps est écoulé.
  function repondre(k) {
    if (!partie || partie.repondu) return;
    partie.repondu = true;
    const reste = arreterChrono();
    const q = partie.questions[partie.i];
    const juste = k === q.bonne;
    const gain = quizPoints(juste, reste);
    partie.score += gain;
    if (juste) partie.bonnes++;
    partie.reponses.push({ q, k, juste });

    racine().querySelectorAll('.quiz-reponse').forEach((b, idx) => {
      b.disabled = true;
      if (idx === q.bonne) b.classList.add('juste');
      else if (idx === k) b.classList.add('faux');
    });
    racine().querySelector('.quiz-score').textContent = `${vfrScore(partie.score)} pts`;

    const derniere = partie.i === partie.questions.length - 1;
    const verdict = juste ? `Bonne réponse · +${gain} pts` : (k === null ? 'Temps écoulé' : 'Raté');
    const retour = document.getElementById('quiz-retour');
    retour.hidden = false;
    retour.className = 'quiz-retour ' + (juste ? 'est-juste' : 'est-faux');
    retour.innerHTML = `
      <div class="quiz-verdict">${verdict}</div>
      <p class="quiz-explication">${esc(q.explication)}</p>
      <button type="button" class="btn btn-primary quiz-suivant" data-quiz="suivant">${derniere ? 'Voir mon score' : 'Question suivante'}</button>`;
    retour.querySelector('.quiz-suivant').focus({ preventScroll: true });
    retour.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function suivant() {
    if (!partie?.repondu) return;
    partie.i++;
    if (partie.i < partie.questions.length) afficherQuestion();
    else afficherBilan();
  }

  // ── ÉCRAN 3 : BILAN ──
  function afficherBilan() {
    const { theme, score, bonnes, reponses } = partie;
    const total = reponses.length;
    const ancien = lireRecord(theme);
    const nouveauRecord = score > ancien;
    if (nouveauRecord) ecrireRecord(theme, score);
    const m = quizMention(bonnes, total);
    const rates = reponses.filter(r => !r.juste);

    racine().innerHTML = `
      <div class="quiz-carte quiz-bilan">
        <div class="quiz-progression">${esc(nomTheme(theme))}</div>
        <div class="quiz-bilan-score">${vfrScore(score)}<small> pts</small></div>
        <div class="quiz-bilan-titre">${esc(m.titre)} · ${bonnes} / ${total}</div>
        <p class="quiz-bilan-texte">${esc(m.texte)}</p>
        <div class="quiz-bilan-record">${nouveauRecord ? (ancien ? `Nouveau record ! L'ancien était de ${vfrScore(ancien)} pts.` : 'Premier record établi.') : `Votre record : ${vfrScore(ancien)} pts.`}</div>
        <div class="quiz-actions">
          <button type="button" class="btn btn-primary" data-quiz="jouer" data-theme="${theme}">Rejouer</button>
          <button type="button" class="btn btn-outline" data-quiz="accueil">Changer de thème</button>
          <button type="button" class="btn btn-outline" data-quiz="partager">Partager</button>
        </div>
      </div>
      ${rates.length ? `
      <h3 class="quiz-revue-titre">À retenir</h3>
      <ul class="quiz-revue">
        ${rates.map(r => `
          <li>
            <div class="quiz-revue-q">${esc(r.q.q)}</div>
            <div class="quiz-revue-r">Réponse : <strong>${esc(r.q.choix[r.q.bonne])}</strong></div>
            <p>${esc(r.q.explication)}</p>
          </li>`).join('')}
      </ul>` : ''}`;
    racine().querySelector('.quiz-bilan-score')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function partager() {
    if (!partie) return;
    const texte = `J'ai fait ${vfrScore(partie.score)} points (${partie.bonnes}/${partie.reponses.length}) au quiz AutoSpec — ${nomTheme(partie.theme)}. À vous de jouer !`;
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) { await navigator.share({ text: texte, url }); return; }
      await navigator.clipboard.writeText(`${texte} ${url}`);
      showToast('Score copié dans le presse-papiers.', 'success');
    } catch (e) {
      if (e?.name !== 'AbortError') showToast('Partage impossible sur cet appareil.', 'error');
    }
  }

  // Espace insécable fine pour les milliers : 1 250 pts.
  function vfrScore(n) {
    return Number(n).toLocaleString('fr-FR');
  }

  // ── ÉVÉNEMENTS ──
  document.addEventListener('click', (e) => {
    const cible = e.target.closest?.('#quiz-app [data-quiz]');
    if (!cible) return;
    const action = cible.dataset.quiz;
    if (action === 'jouer') lancer(cible.dataset.theme);
    else if (action === 'repondre') repondre(Number(cible.dataset.k));
    else if (action === 'suivant') suivant();
    else if (action === 'accueil') afficherAccueil();
    else if (action === 'partager') partager();
  });

  // Clavier : 1-4 ou A-D pour répondre.
  document.addEventListener('keydown', (e) => {
    if (!partie || partie.repondu || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!document.getElementById('page-quiz')?.classList.contains('active')) return;
    if (e.target.closest?.('input, textarea, select')) return;
    const k = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : LETTRES.indexOf(e.key.toUpperCase());
    if (k >= 0 && k < partie.questions[partie.i].choix.length) { e.preventDefault(); repondre(k); }
  });

  // Appelées par showPage() dans app.js.
  window.quizOuvrir = () => { if (!partie) afficherAccueil(); };
  // Quitter la page abandonne la partie : un chrono ne doit pas courir en
  // arrière-plan, et reprendre une question déjà vue fausserait le score.
  window.quizQuitter = () => { if (partie) { arreterChrono(); partie = null; } };
})();
