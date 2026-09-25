import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Même principe que fiche.test.js : le script est évalué tel que le
// navigateur le charge, ses déclarations deviennent des globales du contexte.
const code = readFileSync(new URL('../src/lib/quiz.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ console, Math });
vm.runInContext(code + '\n;this.QUIZ_QUESTIONS = QUIZ_QUESTIONS; this.QUIZ_THEMES = QUIZ_THEMES; this.QUIZ_PAR_PARTIE = QUIZ_PAR_PARTIE; this.QUIZ_DUREE_S = QUIZ_DUREE_S;', ctx);
const { QUIZ_QUESTIONS, QUIZ_THEMES, QUIZ_PAR_PARTIE, QUIZ_DUREE_S, quizTirer, quizPreparer, quizPoints, quizMention } = ctx;

// Générateur déterministe : un test qui échoue doit échouer à chaque fois.
function graine(n) {
  return () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
}

// ── BANQUE ──
test('chaque question est bien formée', () => {
  const ids = new Set();
  for (const q of QUIZ_QUESTIONS) {
    assert.ok(!ids.has(q.id), `identifiant en double : ${q.id}`);
    ids.add(q.id);
    assert.ok(QUIZ_THEMES[q.theme], `${q.id} : thème inconnu « ${q.theme} »`);
    assert.equal(q.choix.length, 4, `${q.id} : il faut 4 choix`);
    assert.equal(new Set(q.choix).size, 4, `${q.id} : deux choix identiques`);
    assert.ok(Number.isInteger(q.bonne) && q.bonne >= 0 && q.bonne < 4, `${q.id} : indice de bonne réponse invalide`);
    assert.ok(q.q.trim().length > 10, `${q.id} : question vide`);
    assert.ok(q.explication?.trim().length > 20, `${q.id} : explication manquante`);
  }
});

test('chaque thème a de quoi remplir une partie', () => {
  for (const t of Object.keys(QUIZ_THEMES)) {
    const n = QUIZ_QUESTIONS.filter(q => q.theme === t).length;
    assert.ok(n >= QUIZ_PAR_PARTIE, `« ${t} » n'a que ${n} questions`);
  }
});

// ── TIRAGE ──
test('le mélange des réponses garde la bonne réponse', () => {
  const rng = graine(7);
  for (const q of QUIZ_QUESTIONS) {
    const p = quizPreparer(q, rng);
    assert.equal(p.choix[p.bonne], q.choix[q.bonne], q.id);
    assert.deepEqual([...p.choix].sort(), [...q.choix].sort(), q.id);
  }
});

test('une partie à thème ne contient que ce thème, sans doublon', () => {
  const partie = quizTirer('sport', QUIZ_PAR_PARTIE, graine(3));
  assert.equal(partie.length, QUIZ_PAR_PARTIE);
  assert.ok(partie.every(q => q.theme === 'sport'));
  assert.equal(new Set(partie.map(q => q.id)).size, partie.length);
});

test('le mode « tout » répartit les thèmes à parts égales', () => {
  for (let s = 1; s <= 20; s++) {
    const partie = quizTirer('tout', QUIZ_PAR_PARTIE, graine(s));
    assert.equal(partie.length, QUIZ_PAR_PARTIE);
    assert.equal(new Set(partie.map(q => q.id)).size, partie.length);
    const parTheme = Object.keys(QUIZ_THEMES).map(t => partie.filter(q => q.theme === t).length);
    assert.ok(Math.max(...parTheme) - Math.min(...parTheme) <= 1, `graine ${s} : ${parTheme}`);
  }
});

// ── SCORE ──
test('les points récompensent la justesse puis la rapidité', () => {
  assert.equal(quizPoints(false, QUIZ_DUREE_S), 0);
  assert.equal(quizPoints(true, 0), 100);
  assert.equal(quizPoints(true, QUIZ_DUREE_S), 150);
  assert.equal(quizPoints(true, QUIZ_DUREE_S * 3), 150, 'le bonus est plafonné');
  assert.ok(quizPoints(true, 15) > quizPoints(true, 5));
});

test('la mention suit le taux de bonnes réponses', () => {
  assert.equal(quizMention(10, 10).titre, 'Sans faute');
  assert.equal(quizMention(8, 10).titre, 'Excellent');
  assert.equal(quizMention(5, 10).titre, 'Pas mal');
  assert.equal(quizMention(2, 10).titre, 'À réviser');
});
