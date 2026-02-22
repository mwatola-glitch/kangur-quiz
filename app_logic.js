// =============================================================================
// QUIZ DATA — loaded from electronic format (multi-level)
// =============================================================================
const QUIZ_DATA = PLACEHOLDER_QUIZ_DATA;

// =============================================================================
// CONSTANTS & DATA HELPERS
// =============================================================================
const ALL_LEVELS = Object.keys(QUIZ_DATA);
const DEFAULT_LEVEL = ALL_LEVELS[0];

function getYearsForLevel(level) {
  const ld = QUIZ_DATA[level];
  if (!ld || !ld.years) return [];
  return Object.keys(ld.years).sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    const aIsYear = na >= 2000, bIsYear = nb >= 2000;
    if (aIsYear && !bIsYear) return 1;
    if (!aIsYear && bIsYear) return -1;
    return na - nb;
  });
}

function getYearData(level, year) {
  return QUIZ_DATA[level]?.years?.[String(year)] || null;
}

const LETTERS = ['A','B','C','D','E'];
const DIFF_LABELS = { e: 'Łatwe', m: 'Średnie', h: 'Trudne' };
const DIFF_CLASSES = { e: 'easy', m: 'medium', h: 'hard' };
const TIME_LIMIT = 75 * 60;

const $ = id => document.getElementById(id);

// =============================================================================
// STATE
// =============================================================================
const state = {
  screen: 'start',
  selectedLevel: DEFAULT_LEVEL,
  selectedYear: null,
  mode: 'exam',
  randomCount: 10,
  randomDiff: 'all',
  randomYears: [],
  tasks: [],
  currentIndex: 0,
  answers: {},
  feedback: {},
  quizStartTime: null,
  quizEndTime: null,
  timerInterval: null,
  timeRemaining: TIME_LIMIT,
  quizFinished: false,
  solutionShown: {},
  // Firebase / user
  user: null,
  firebaseReady: false,
  isOnline: navigator.onLine,
};

// =============================================================================
// FIREBASE
// =============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDK2TYx5FTj3Gk5x6Yg8kEfjlKTh_33lcE",
  authDomain: "kangur-quiz-app.firebaseapp.com",
  projectId: "kangur-quiz-app",
  storageBucket: "kangur-quiz-app.firebasestorage.app",
  messagingSenderId: "956832676569",
  appId: "1:956832676569:web:ce9a051ecc564489e65cc8"
};

let auth = null;
let db = null;

function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded — offline mode');
    state.firebaseReady = false;
    showScreen('start');
    updateOfflineBanner();
    return;
  }
  try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

    auth.onAuthStateChanged(async (user) => {
      if (user) {
        const profile = await loadUserProfile(user.uid);
        if (profile) {
          state.user = { uid: user.uid, ...profile };
          state.firebaseReady = true;
          renderUserBar();
          showScreen('start');
          syncLocalScoresToFirestore();
        } else {
          // Has auth but no profile — show login to complete
          state.firebaseReady = true;
          showScreen('login');
        }
      } else {
        state.firebaseReady = true;
        showScreen('login');
      }
    });
  } catch (e) {
    console.error('Firebase init error:', e);
    state.firebaseReady = false;
    showScreen('start');
  }
}

async function loadUserProfile(uid) {
  if (!db) return null;
  try {
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists ? doc.data() : null;
  } catch (e) {
    console.error('loadUserProfile error:', e);
    return null;
  }
}

async function saveUserProfile(uid, data) {
  if (!db) return;
  try {
    await db.collection('users').doc(uid).set({
      name: data.name,
      className: data.className,
      school: data.school,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.error('saveUserProfile error:', e);
  }
}

async function handleLogin() {
  const name = $('loginName').value.trim();
  const className = $('loginClass').value.trim();
  const school = $('loginSchool').value.trim();
  const errEl = $('loginError');

  if (!name) { errEl.textContent = 'Wpisz swoje imię!'; errEl.style.display = 'block'; return; }
  if (!className) { errEl.textContent = 'Wpisz swoją klasę!'; errEl.style.display = 'block'; return; }
  if (!school) { errEl.textContent = 'Wpisz nazwę szkoły!'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  $('btnLogin').disabled = true;
  $('btnLogin').textContent = 'Łączenie...';

  try {
    if (!auth) throw new Error('No auth');
    const cred = await auth.signInAnonymously();
    const uid = cred.user.uid;
    const profile = { name, className, school };
    await saveUserProfile(uid, { ...profile, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    state.user = { uid, ...profile };
    state.firebaseReady = true;
    renderUserBar();
    showScreen('start');
    syncLocalScoresToFirestore();
  } catch (e) {
    console.error('Login error:', e);
    errEl.textContent = 'Błąd połączenia. Spróbuj ponownie.';
    errEl.style.display = 'block';
    $('btnLogin').disabled = false;
    $('btnLogin').textContent = 'Grajmy! 🎮';
  }
}

function renderUserBar() {
  const bar = $('userBar');
  if (!state.user) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  $('userAvatar').textContent = state.user.name.charAt(0).toUpperCase();
  $('userName').textContent = state.user.name;
  $('userDetail').textContent = `${state.user.className} — ${state.user.school}`;
}

function updateOfflineBanner() {
  const banner = $('offlineBanner');
  if (!banner) return;
  banner.style.display = (!state.firebaseReady || !state.isOnline) ? 'block' : 'none';
}

// =============================================================================
// FIRESTORE SCORE SYNC
// =============================================================================
async function saveScoreToFirestore(results) {
  if (!db || !state.user) return;
  const uid = state.user.uid;
  const level = state.selectedLevel;
  const yearKey = state.mode === 'random' ? 'random' : state.selectedYear;
  const mode = state.mode;
  const docId = `${uid}_${level}_${yearKey}_${mode}`;

  try {
    const docRef = db.collection('scores').doc(docId);
    const existing = await docRef.get();
    const existingScore = existing.exists ? (existing.data().score || 0) : 0;

    if (results.score > existingScore) {
      await docRef.set({
        uid, name: state.user.name, className: state.user.className, school: state.user.school,
        level, year: String(yearKey), mode,
        score: results.score, maxScore: results.maxScore,
        correct: results.correct, total: state.tasks.length,
        elapsed: results.elapsed,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      updateAggregates(uid, level);
    }
  } catch (e) {
    console.error('saveScoreToFirestore error:', e);
  }
}

async function updateAggregates(uid, level) {
  if (!db) return;
  try {
    const snap = await db.collection('scores')
      .where('uid', '==', uid)
      .where('level', '==', level)
      .where('mode', '==', 'exam')
      .get();

    let totalScore = 0, quizCount = 0, bestSingle = 0;
    snap.forEach(doc => {
      const d = doc.data();
      if (d.year !== 'random') {
        totalScore += d.score;
        quizCount++;
        if (d.score > bestSingle) bestSingle = d.score;
      }
    });

    const aggId = `${uid}_${level}`;
    await db.collection('aggregates').doc(aggId).set({
      uid, name: state.user.name, className: state.user.className, school: state.user.school,
      level,
      totalScore, quizCount,
      avgScore: quizCount > 0 ? Math.round((totalScore / quizCount) * 100) / 100 : 0,
      bestSingleScore: bestSingle,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('updateAggregates error:', e);
  }
}

async function syncLocalScoresToFirestore() {
  if (!db || !state.user) return;
  const uid = state.user.uid;
  const levelsToSync = new Set();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const m = key.match(/^kangur_best_(\w+)_(.+)_(exam|practice|random)$/);
    if (!m) continue;
    const [, level, year, mode] = m;
    const localScore = parseFloat(localStorage.getItem(key)) || 0;
    if (localScore <= 0) continue;

    const docId = `${uid}_${level}_${year}_${mode}`;
    try {
      const docRef = db.collection('scores').doc(docId);
      const existing = await docRef.get();
      const remoteScore = existing.exists ? (existing.data().score || 0) : 0;

      if (localScore > remoteScore) {
        await docRef.set({
          uid, name: state.user.name, className: state.user.className, school: state.user.school,
          level, year: String(year), mode,
          score: localScore, maxScore: 105, correct: 0, total: 0, elapsed: 0,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        levelsToSync.add(level);
      } else if (remoteScore > localScore) {
        localStorage.setItem(key, remoteScore);
      }
    } catch (e) {
      // Offline — will sync later
    }
  }

  for (const level of levelsToSync) {
    updateAggregates(uid, level);
  }
  renderBestScores();
}

// =============================================================================
// EDIT PROFILE
// =============================================================================
function showEditProfile() {
  if (!state.user) return;
  $('editName').value = state.user.name;
  $('editClass').value = state.user.className;
  $('editSchool').value = state.user.school;
  $('editProfileOverlay').classList.add('active');
}

function hideEditProfile() {
  $('editProfileOverlay').classList.remove('active');
}

async function saveEditProfile() {
  const name = $('editName').value.trim();
  const className = $('editClass').value.trim();
  const school = $('editSchool').value.trim();
  if (!name || !className || !school) return;

  const uid = state.user.uid;
  state.user.name = name;
  state.user.className = className;
  state.user.school = school;
  renderUserBar();
  hideEditProfile();

  await saveUserProfile(uid, { name, className, school });

  // Update denormalized data in scores
  if (!db) return;
  try {
    const snap = await db.collection('scores').where('uid', '==', uid).get();
    const batch = db.batch();
    snap.forEach(doc => {
      batch.update(doc.ref, { name, className, school });
    });
    const aggSnap = await db.collection('aggregates').where('uid', '==', uid).get();
    aggSnap.forEach(doc => {
      batch.update(doc.ref, { name, className, school });
    });
    await batch.commit();
  } catch (e) {
    console.error('Profile update in scores error:', e);
  }
}

// =============================================================================
// LEADERBOARD
// =============================================================================
let lbState = { tab: 'test', level: null, year: null, mode: 'exam', scope: 'global' };

function initLeaderboardUI() {
  // Tab switching
  $('lbTabTest').addEventListener('click', () => { setLbTab('test'); });
  $('lbTabOverall').addEventListener('click', () => { setLbTab('overall'); });

  // Scope buttons
  document.querySelectorAll('.lb-scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lb-scope-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      lbState.scope = btn.dataset.scope;
      loadLeaderboard();
    });
  });

  // Year/mode selects
  $('lbYearSelect').addEventListener('change', () => { lbState.year = $('lbYearSelect').value; loadLeaderboard(); });
  $('lbModeSelect').addEventListener('change', () => { lbState.mode = $('lbModeSelect').value; loadLeaderboard(); });

  // Back button
  $('btnLeaderboardBack').addEventListener('click', goHome);
}

function setLbTab(tab) {
  lbState.tab = tab;
  $('lbTabTest').classList.toggle('selected', tab === 'test');
  $('lbTabOverall').classList.toggle('selected', tab === 'overall');
  $('lbTestFilters').style.display = tab === 'test' ? 'flex' : 'none';
  loadLeaderboard();
}

function populateLbFilters(level) {
  lbState.level = level || state.selectedLevel;

  // Level buttons
  const container = $('lbLevelBtns');
  container.innerHTML = '';
  ALL_LEVELS.forEach(lvl => {
    const btn = document.createElement('button');
    btn.className = 'lb-scope-btn' + (lvl === lbState.level ? ' selected' : '');
    btn.textContent = QUIZ_DATA[lvl]?.emoji + ' ' + QUIZ_DATA[lvl]?.name;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.lb-scope-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      lbState.level = lvl;
      populateLbYears();
      loadLeaderboard();
    });
    container.appendChild(btn);
  });

  populateLbYears();
}

function populateLbYears() {
  const sel = $('lbYearSelect');
  sel.innerHTML = '';
  const years = getYearsForLevel(lbState.level);
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = parseInt(y) < 2000 ? `Test ${y}` : y;
    sel.appendChild(opt);
  });
  lbState.year = sel.value;
}

function showLeaderboard(options) {
  if (options) {
    if (options.level) lbState.level = options.level;
    if (options.year) lbState.year = String(options.year);
    if (options.mode) lbState.mode = options.mode;
    if (options.tab) lbState.tab = options.tab;
  }
  populateLbFilters(lbState.level);
  $('lbModeSelect').value = lbState.mode;
  if (lbState.year) $('lbYearSelect').value = lbState.year;
  setLbTab(lbState.tab);
  showScreen('leaderboard');
}

async function loadLeaderboard() {
  if (!db) {
    $('lbEmpty').style.display = 'block';
    $('lbEmpty').textContent = 'Ranking wymaga połączenia z internetem.';
    $('lbLoading').style.display = 'none';
    $('lbList').innerHTML = '';
    return;
  }

  $('lbLoading').style.display = 'block';
  $('lbEmpty').style.display = 'none';
  $('lbList').innerHTML = '';

  try {
    let query;
    if (lbState.tab === 'test') {
      query = db.collection('scores')
        .where('level', '==', lbState.level)
        .where('year', '==', String(lbState.year))
        .where('mode', '==', lbState.mode);
    } else {
      query = db.collection('aggregates')
        .where('level', '==', lbState.level);
    }

    // Scope filter
    if (lbState.scope === 'school' && state.user) {
      query = query.where('school', '==', state.user.school);
    } else if (lbState.scope === 'class' && state.user) {
      query = query.where('school', '==', state.user.school)
                   .where('className', '==', state.user.className);
    }

    // Sort
    const sortField = lbState.tab === 'test' ? 'score' : 'avgScore';
    query = query.orderBy(sortField, 'desc').limit(50);

    const snap = await query.get();
    $('lbLoading').style.display = 'none';

    if (snap.empty) {
      $('lbEmpty').style.display = 'block';
      return;
    }

    const list = $('lbList');
    let rank = 0;
    snap.forEach(doc => {
      rank++;
      const d = doc.data();
      const isMe = state.user && d.uid === state.user.uid;
      const scoreVal = lbState.tab === 'test' ? `${d.score} pkt` : `śr. ${d.avgScore} pkt`;

      const entry = document.createElement('div');
      entry.className = 'lb-entry' + (isMe ? ' is-me' : '');
      const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
      entry.innerHTML = `
        <div class="lb-rank ${rankClass}">${rankIcon}</div>
        <div class="lb-info">
          <div class="lb-name">${escapeHtml(d.name)}${isMe ? ' (Ty)' : ''}</div>
          <div class="lb-meta">${escapeHtml(d.className)} — ${escapeHtml(d.school)}</div>
        </div>
        <div class="lb-score">${scoreVal}</div>
      `;
      list.appendChild(entry);
    });
  } catch (e) {
    console.error('loadLeaderboard error:', e);
    $('lbLoading').style.display = 'none';
    $('lbEmpty').style.display = 'block';
    $('lbEmpty').textContent = 'Błąd ładowania rankingu. Indeksy mogą być w trakcie tworzenia — spróbuj za chwilę.';
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// =============================================================================
// BACKGROUND ANIMATION
// =============================================================================
function initMathSymbols() {
  const symbols = ['+', '−', '×', '÷', '=', '∑', 'π', '√', '∞', '△', '□', '◯', '%', '∠', '⊕'];
  const container = $('mathSymbols');
  for (let i = 0; i < 20; i++) {
    const span = document.createElement('span');
    span.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    span.style.cssText = `
      position:absolute;
      font-size:${20 + Math.random() * 30}px;
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      opacity:${0.03 + Math.random() * 0.03};
      animation: symbolDrift ${30 + Math.random() * 40}s ease-in-out infinite;
      animation-delay: ${-Math.random() * 30}s;
    `;
    container.appendChild(span);
  }
}

// =============================================================================
// SCREEN MANAGEMENT
// =============================================================================
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = $(name + 'Screen');
  if (screen) screen.classList.add('active');
  state.screen = name;
}

// =============================================================================
// START SCREEN
// =============================================================================
function initStartScreen() {
  initLevelSelector();
  renderYearGrid();

  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => selectMode(btn.dataset.mode));
  });

  initRandomOptions();
  $('btnStart').addEventListener('click', startQuiz);
  renderBestScores();
  updateStartButton();
}

function initLevelSelector() {
  const container = $('levelSelector');
  container.innerHTML = '';

  for (const levelKey of ALL_LEVELS) {
    const info = QUIZ_DATA[levelKey];
    const btn = document.createElement('button');
    btn.className = 'level-btn';
    btn.dataset.level = levelKey;
    if (levelKey === state.selectedLevel) btn.classList.add('selected');

    btn.innerHTML = `
      <span class="level-emoji">${info.emoji}</span>
      <span class="level-name">${info.name}</span>
      <span class="level-subtitle">${info.subtitle}</span>
    `;

    btn.addEventListener('click', () => selectLevel(levelKey));
    container.appendChild(btn);
  }
}

function selectLevel(level) {
  state.selectedLevel = level;
  state.selectedYear = null;
  state.randomYears = [];

  document.querySelectorAll('.level-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.level === level)
  );

  renderYearGrid();
  initRandomOptions();
  renderBestScores();
  updateStartButton();
}

function renderYearGrid() {
  const grid = $('yearGrid');
  grid.innerHTML = '';

  const allYears = getYearsForLevel(state.selectedLevel);
  const numberedTests = allYears.filter(y => parseInt(y) < 2000);
  const yearTests = allYears.filter(y => parseInt(y) >= 2000);

  if (numberedTests.length > 0) {
    const label = document.createElement('div');
    label.className = 'year-group-label';
    label.textContent = 'Testy ćwiczeniowe';
    grid.appendChild(label);
    numberedTests.forEach(y => addYearBtn(grid, y));
  }

  if (yearTests.length > 0) {
    const label = document.createElement('div');
    label.className = 'year-group-label';
    label.textContent = 'Konkursy';
    grid.appendChild(label);
    yearTests.forEach(y => addYearBtn(grid, y));
  }
}

function addYearBtn(grid, y) {
  const btn = document.createElement('button');
  btn.className = 'year-btn';
  const yearNum = parseInt(y);
  btn.textContent = yearNum < 2000 ? `Test ${y}` : y;
  btn.dataset.year = y;
  btn.addEventListener('click', () => selectYear(y));
  grid.appendChild(btn);
}

function selectYear(year) {
  state.selectedYear = year;
  document.querySelectorAll('.year-btn').forEach(b => b.classList.toggle('selected', b.dataset.year === String(year)));
  updateStartButton();
}

function selectMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('selected', b.dataset.mode === mode));
  $('randomOptions').style.display = mode === 'random' ? 'block' : 'none';
  updateStartButton();
}

function initRandomOptions() {
  // Count buttons
  $('countBtns').querySelectorAll('.chip-btn').forEach(b => {
    b.addEventListener('click', () => {
      $('countBtns').querySelectorAll('.chip-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      state.randomCount = parseInt(b.dataset.count);
    });
  });

  // Diff buttons
  $('diffBtns').querySelectorAll('.chip-btn').forEach(b => {
    b.addEventListener('click', () => {
      $('diffBtns').querySelectorAll('.chip-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      state.randomDiff = b.dataset.diff;
    });
  });

  // Year multi-select — level-specific
  const multiGrid = $('yearMultiGrid');
  multiGrid.innerHTML = '';
  getYearsForLevel(state.selectedLevel).forEach(y => {
    const btn = document.createElement('button');
    btn.className = 'chip-btn';
    btn.textContent = parseInt(y) < 2000 ? `T${y}` : y;
    btn.dataset.year = y;
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      if (btn.classList.contains('selected')) {
        if (!state.randomYears.includes(y)) state.randomYears.push(y);
      } else {
        state.randomYears = state.randomYears.filter(x => x !== y);
      }
      updateStartButton();
    });
    multiGrid.appendChild(btn);
  });
}

function updateStartButton() {
  const btn = $('btnStart');
  if (state.mode === 'random') {
    btn.disabled = state.randomYears.length === 0;
  } else {
    btn.disabled = !state.selectedYear;
  }
}

function renderBestScores() {
  const list = $('scoreList');
  list.innerHTML = '';
  let hasScores = false;

  for (const y of getYearsForLevel(state.selectedLevel)) {
    for (const m of ['exam', 'practice', 'random']) {
      const key = `kangur_best_${state.selectedLevel}_${y}_${m}`;
      const val = localStorage.getItem(key);
      if (val) {
        hasScores = true;
        const li = document.createElement('li');
        const modeLabel = m === 'exam' ? '🏆 Konkurs' : m === 'practice' ? '📚 Trening' : '🎲 Losowe';
        const yearLabel = parseInt(y) < 2000 ? `Test ${y}` : y;
        li.innerHTML = `<span>${yearLabel} — ${modeLabel}</span><strong>${val} pkt</strong>`;
        list.appendChild(li);
      }
    }
  }

  if (!hasScores) {
    list.innerHTML = '<li class="no-scores">Brak zapisanych wyników — zagraj!</li>';
  }
}

// =============================================================================
// QUIZ START
// =============================================================================
function startQuiz() {
  let tasks = [];

  if (state.mode === 'random') {
    let pool = [];
    for (const y of state.randomYears) {
      const yearData = getYearData(state.selectedLevel, y);
      if (!yearData) continue;
      for (const t of yearData.tasks) {
        if (state.randomDiff === 'all' || t.d === state.randomDiff) {
          pool.push({ ...t, _year: y });
        }
      }
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    tasks = pool.slice(0, state.randomCount);
  } else {
    const yearData = getYearData(state.selectedLevel, state.selectedYear);
    if (!yearData) return;
    tasks = yearData.tasks.map(t => ({ ...t, _year: state.selectedYear }));
  }

  if (tasks.length === 0) return;

  state.tasks = tasks;
  state.currentIndex = 0;
  state.answers = {};
  state.feedback = {};
  state.solutionShown = {};
  state.quizFinished = false;
  state.quizStartTime = Date.now();
  state.quizEndTime = null;
  state.timeRemaining = TIME_LIMIT;

  if (state.timerInterval) clearInterval(state.timerInterval);
  if (state.mode === 'exam') {
    state.timerInterval = setInterval(tickTimer, 1000);
  }

  showScreen('quiz');
  renderQuiz();
}

function tickTimer() {
  if (state.quizFinished) return;
  const elapsed = Math.floor((Date.now() - state.quizStartTime) / 1000);
  state.timeRemaining = TIME_LIMIT - elapsed;
  if (state.timeRemaining <= 0) {
    state.timeRemaining = 0;
    finishQuiz();
  }
  renderTimer();
}

function renderTimer() {
  const timer = $('timer');
  if (state.mode !== 'exam') {
    timer.textContent = '∞';
    timer.style.color = 'var(--text-muted)';
    return;
  }
  const m = Math.floor(state.timeRemaining / 60);
  const s = state.timeRemaining % 60;
  timer.textContent = `${m}:${String(s).padStart(2, '0')}`;

  if (state.timeRemaining <= 300) {
    timer.style.color = 'var(--accent-coral)';
    timer.style.animation = state.timeRemaining <= 60 ? 'pulse 1s infinite' : 'none';
  } else {
    timer.style.color = 'var(--accent-gold)';
    timer.style.animation = 'none';
  }
}

// =============================================================================
// QUIZ RENDERING
// =============================================================================
function renderQuiz() {
  const task = state.tasks[state.currentIndex];
  if (!task) return;

  const total = state.tasks.length;
  const idx = state.currentIndex;

  $('taskLabel').textContent = `Zadanie ${idx + 1} / ${total}`;
  $('progressFill').style.width = ((idx + 1) / total * 100) + '%';

  renderTaskDots();

  // Difficulty badge
  const badge = $('diffBadge');
  badge.className = 'diff-badge ' + DIFF_CLASSES[task.d];
  badge.textContent = DIFF_LABELS[task.d];
  $('pointsBadge').textContent = `${task.p} pkt`;

  // Question content — always an image in electronic format
  const taskImg = $('taskImg');
  const taskText = $('taskText');

  if (task.qi) {
    taskImg.src = task.qi;
    taskImg.style.display = 'block';
    taskText.style.display = 'none';
  } else if (task.qt) {
    taskImg.style.display = 'none';
    taskText.style.display = 'block';
    taskText.textContent = task.qt;
  } else {
    taskImg.style.display = 'none';
    taskText.style.display = 'block';
    taskText.textContent = 'Zadanie graficzne';
  }

  // Solution button (only in practice/random with feedback)
  const solBtn = $('btnSolution');
  const solViewer = $('solutionViewer');
  const hasFeedback = state.feedback[idx] !== undefined;
  const hasSolution = !!task.s;

  if ((state.mode === 'practice' || state.mode === 'random') && hasFeedback && hasSolution) {
    solBtn.style.display = 'block';
    solBtn.textContent = state.solutionShown[idx] ? '💡' : '💡';
    solBtn.classList.toggle('active', !!state.solutionShown[idx]);

    if (state.solutionShown[idx]) {
      solViewer.style.display = 'block';
      $('solutionImg').src = task.s;
    } else {
      solViewer.style.display = 'none';
    }
  } else {
    solBtn.style.display = 'none';
    solViewer.style.display = 'none';
  }

  // Options
  renderOptions(task, idx);

  // Feedback bar
  renderFeedback(idx);

  // Navigation
  $('btnPrev').disabled = idx === 0;
  $('btnNext').disabled = idx === total - 1;

  renderTimer();
}

function renderTaskDots() {
  const dots = $('taskDots');
  dots.innerHTML = '';
  state.tasks.forEach((task, i) => {
    const dot = document.createElement('button');
    dot.className = 'task-dot';
    dot.textContent = i + 1;

    if (i === state.currentIndex) dot.classList.add('current');
    if (state.answers[i] !== undefined) dot.classList.add('answered');
    if (state.feedback[i] === 'correct') dot.classList.add('dot-correct');
    if (state.feedback[i] === 'wrong') dot.classList.add('dot-wrong');

    dot.classList.add('dot-' + DIFF_CLASSES[task.d]);

    dot.addEventListener('click', () => goToTask(i));
    dots.appendChild(dot);
  });
}

function renderOptions(task, idx) {
  const grid = $('optionsGrid');
  grid.innerHTML = '';

  const options = task.o;
  const letters = options.length <= 4 ? ['A', 'B', 'C', 'D'] : LETTERS;

  letters.forEach((letter, i) => {
    if (i >= options.length) return;
    const opt = options[i];

    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.dataset.letter = letter;

    const letterSpan = document.createElement('span');
    letterSpan.className = 'option-letter';
    letterSpan.textContent = letter;
    btn.appendChild(letterSpan);

    // Option content: text or image
    if (opt.t === 'img' && opt.v) {
      const img = document.createElement('img');
      img.src = opt.v;
      img.alt = `Odpowiedź ${letter}`;
      img.className = 'option-img';
      btn.appendChild(img);
      btn.setAttribute('aria-label', `Odpowiedź ${letter}: obrazek`);
    } else {
      const textSpan = document.createElement('span');
      textSpan.textContent = opt.v || 'Patrz rysunek';
      btn.appendChild(textSpan);
      btn.setAttribute('aria-label', `Odpowiedź ${letter}: ${opt.v || 'obrazek'}`);
    }

    // State styling
    const userAnswer = state.answers[idx];
    const isAnswered = userAnswer !== undefined;
    const hasFeedback = state.feedback[idx] !== undefined;

    if (isAnswered && userAnswer === letter) {
      if (hasFeedback) {
        btn.classList.add(state.feedback[idx] === 'correct' ? 'correct' : 'wrong');
      } else {
        btn.classList.add('selected');
      }
    }

    if (hasFeedback && state.feedback[idx] === 'wrong' && letter === task.a) {
      btn.classList.add('reveal-correct');
    }

    if (state.mode === 'exam' || (hasFeedback && state.mode !== 'practice')) {
      if (isAnswered && hasFeedback) btn.classList.add('locked');
    }

    btn.addEventListener('click', () => selectAnswer(idx, letter));
    grid.appendChild(btn);
  });
}

function renderFeedback(idx) {
  const bar = $('feedbackBar');
  const fb = state.feedback[idx];
  bar.className = 'feedback-bar';

  if (fb && (state.mode === 'practice' || state.mode === 'random')) {
    bar.classList.add('show');
    if (fb === 'correct') {
      bar.classList.add('feedback-correct');
      bar.textContent = '✅ Brawo! Poprawna odpowiedź!';
    } else {
      bar.classList.add('feedback-wrong');
      bar.textContent = `❌ Niestety! Poprawna: ${state.tasks[idx].a}`;
    }
  }
}

// =============================================================================
// ANSWER SELECTION
// =============================================================================
function selectAnswer(idx, letter) {
  if (state.quizFinished) return;

  const task = state.tasks[idx];
  const hasPriorFeedback = state.feedback[idx] !== undefined;

  if (state.mode === 'practice' && hasPriorFeedback) {
    delete state.feedback[idx];
    delete state.solutionShown[idx];
  }

  if (state.mode === 'random' && hasPriorFeedback) return;

  state.answers[idx] = letter;

  if (state.mode === 'practice' || state.mode === 'random') {
    state.feedback[idx] = letter === task.a ? 'correct' : 'wrong';
  }

  renderQuiz();

  if (state.mode === 'random' && state.feedback[idx]) {
    setTimeout(() => {
      if (state.currentIndex < state.tasks.length - 1) {
        goToTask(state.currentIndex + 1);
      }
    }, 1200);
  }
}

// =============================================================================
// NAVIGATION
// =============================================================================
function goToTask(idx) {
  if (idx < 0 || idx >= state.tasks.length) return;
  state.currentIndex = idx;
  renderQuiz();
}

function initQuizNavigation() {
  $('btnPrev').addEventListener('click', () => goToTask(state.currentIndex - 1));
  $('btnNext').addEventListener('click', () => goToTask(state.currentIndex + 1));
  $('btnSkip').addEventListener('click', () => {
    if (state.currentIndex < state.tasks.length - 1) goToTask(state.currentIndex + 1);
  });
  $('btnFinish').addEventListener('click', confirmFinish);

  // Solution button
  $('btnSolution').addEventListener('click', () => {
    const idx = state.currentIndex;
    state.solutionShown[idx] = !state.solutionShown[idx];
    renderQuiz();
  });
}

function confirmFinish() {
  const answered = Object.keys(state.answers).length;
  const total = state.tasks.length;
  const unanswered = total - answered;

  if (unanswered > 0) {
    $('modalTitle').textContent = 'Zakończyć quiz?';
    $('modalText').textContent = `Masz ${unanswered} ${unanswered === 1 ? 'zadanie bez odpowiedzi' : 'zadań bez odpowiedzi'}.`;
    $('confirmModal').classList.add('show');
    $('modalConfirm').onclick = () => {
      $('confirmModal').classList.remove('show');
      finishQuiz();
    };
    $('modalCancel').onclick = () => $('confirmModal').classList.remove('show');
  } else {
    finishQuiz();
  }
}

// =============================================================================
// QUIZ FINISH & RESULTS
// =============================================================================
function finishQuiz() {
  state.quizFinished = true;
  state.quizEndTime = Date.now();
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  const results = calculateResults();
  showResults(results);
  // Save to Firestore
  if (state.user) saveScoreToFirestore(results);
}

function calculateResults() {
  const startScore = state.tasks.length;
  let score = startScore;
  let correct = 0, wrong = 0, skipped = 0;
  const byDiff = {
    e: { correct: 0, total: 0, points: 0, maxPts: 0 },
    m: { correct: 0, total: 0, points: 0, maxPts: 0 },
    h: { correct: 0, total: 0, points: 0, maxPts: 0 }
  };

  state.tasks.forEach((task, i) => {
    const diff = task.d;
    byDiff[diff].total++;
    byDiff[diff].maxPts += task.p;

    const answer = state.answers[i];
    if (answer === undefined) {
      skipped++;
    } else if (answer === task.a) {
      correct++;
      score += task.p;
      byDiff[diff].correct++;
      byDiff[diff].points += task.p;
    } else {
      wrong++;
      score -= task.p * 0.25;
    }
  });

  const elapsed = Math.floor(((state.quizEndTime || Date.now()) - state.quizStartTime) / 1000);
  const maxScore = startScore + state.tasks.reduce((s, t) => s + t.p, 0);
  return { score: Math.round(score * 100) / 100, correct, wrong, skipped, elapsed, byDiff, maxScore, startScore };
}

function showResults(results) {
  showScreen('results');

  const maxScore = results.maxScore || 105;
  animateCount($('resultsScore'), 0, results.score, 1500);
  $('resultsMax').textContent = `/ ${maxScore} punktów`;

  setTimeout(() => {
    const pct = Math.max(0, Math.min(100, (results.score / maxScore) * 100));
    $('resultsBarFill').style.width = pct + '%';
  }, 200);

  let msg, icon;
  const pctScore = (results.score / maxScore) * 100;
  if (pctScore >= 85) { msg = '🌟 Fantastycznie! Jesteś mistrzem!'; icon = '🌟'; }
  else if (pctScore >= 65) { msg = '🎉 Świetna robota!'; icon = '🎉'; }
  else if (pctScore >= 45) { msg = '👍 Dobrze Ci poszło!'; icon = '👍'; }
  else if (pctScore >= 25) { msg = '💪 Ćwicz dalej!'; icon = '💪'; }
  else { msg = '🦘 Nie poddawaj się!'; icon = '🦘'; }

  $('resultsMsg').textContent = msg;
  $('resultsIcon').textContent = icon;

  $('statCorrect').textContent = results.correct;
  $('statWrong').textContent = results.wrong;
  $('statSkipped').textContent = results.skipped;

  const m = Math.floor(results.elapsed / 60);
  const s = results.elapsed % 60;
  $('statTime').textContent = `${m}:${String(s).padStart(2, '0')}`;

  // Breakdown
  const bd = $('resultsBreakdown');
  bd.innerHTML = '';
  const diffData = [
    { key: 'e', label: 'Łatwe', color: 'var(--easy-color)' },
    { key: 'm', label: 'Średnie', color: 'var(--medium-color)' },
    { key: 'h', label: 'Trudne', color: 'var(--hard-color)' }
  ];
  for (const d of diffData) {
    const data = results.byDiff[d.key];
    if (data.total === 0) continue;
    const item = document.createElement('div');
    item.className = 'breakdown-item';
    item.innerHTML = `
      <div class="breakdown-diff" style="color:${d.color}">${d.label}</div>
      <div class="breakdown-score">${data.correct}/${data.total}</div>
      <div class="breakdown-detail">${data.points}/${data.maxPts} pkt</div>
    `;
    bd.appendChild(item);
  }

  const isNewRecord = saveBestScore(results.score);
  $('newRecord').classList.toggle('show', isNewRecord);
  saveHistory(results);

  $('btnReview').onclick = () => showReview();
  $('btnReplay').onclick = () => startQuiz();
  $('btnHome').onclick = () => goHome();
}

function animateCount(el, start, end, duration) {
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;
    el.textContent = Math.round(current * 10) / 10;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function saveBestScore(score) {
  const yearKey = state.mode === 'random' ? 'random' : state.selectedYear;
  const key = `kangur_best_${state.selectedLevel}_${yearKey}_${state.mode}`;
  const prev = parseFloat(localStorage.getItem(key)) || 0;
  if (score > prev) {
    localStorage.setItem(key, score);
    return true;
  }
  return false;
}

function saveHistory(results) {
  const hist = JSON.parse(localStorage.getItem('kangur_history') || '[]');
  hist.unshift({
    date: new Date().toISOString(),
    level: state.selectedLevel,
    year: state.mode === 'random' ? 'random' : state.selectedYear,
    mode: state.mode,
    score: results.score,
    maxScore: results.maxScore,
    correct: results.correct,
    total: state.tasks.length,
    elapsed: results.elapsed,
  });
  if (hist.length > 20) hist.length = 20;
  localStorage.setItem('kangur_history', JSON.stringify(hist));
}

// =============================================================================
// REVIEW SCREEN
// =============================================================================
function showReview() {
  showScreen('review');
  const list = $('reviewList');
  list.innerHTML = '';

  state.tasks.forEach((task, i) => {
    const answer = state.answers[i];
    const isCorrect = answer === task.a;
    const isSkipped = answer === undefined;

    let status, statusClass, pointsText, pointsClass;
    if (isSkipped) {
      status = '⏭️'; statusClass = 'skipped-ans'; pointsText = '0'; pointsClass = 'zero';
    } else if (isCorrect) {
      status = '✅'; statusClass = 'correct-ans'; pointsText = `+${task.p}`; pointsClass = 'plus';
    } else {
      status = '❌'; statusClass = 'wrong-ans'; pointsText = `-${(task.p * 0.25).toFixed(2)}`; pointsClass = 'minus';
    }

    const options = task.o;
    const letters = options.length <= 4 ? ['A', 'B', 'C', 'D'] : LETTERS;

    const item = document.createElement('div');
    item.className = 'review-item';

    // Build options HTML
    const optionsHtml = letters.map((l, li) => {
      if (li >= options.length) return '';
      const opt = options[li];
      const isC = l === task.a;
      const isW = l === answer && !isCorrect;
      const optContent = opt.t === 'img' && opt.v
        ? `<img src="${opt.v}" class="review-option-img" alt="${l}">`
        : `<span>${opt.v || 'obrazek'}</span>`;
      return `<div class="review-option-row ${isC ? 'is-correct' : ''} ${isW ? 'is-wrong' : ''}">
        <strong style="color:var(--letter-${l.toLowerCase()})">${l})</strong>
        ${optContent}
        ${isC ? '<span style="color:var(--accent-mint);font-size:0.75rem;margin-left:auto;">✓ poprawna</span>' : ''}
        ${isW ? '<span style="color:var(--accent-coral);font-size:0.75rem;margin-left:auto;">✗ twoja</span>' : ''}
      </div>`;
    }).join('');

    // Solution HTML
    const solutionHtml = task.s ? `
      <div class="review-solution" style="display:none;">
        <div class="review-solution-label">💡 Rozwiązanie</div>
        <img src="${task.s}" class="review-solution-img" alt="Rozwiązanie">
      </div>
    ` : '';

    item.innerHTML = `
      <div class="review-item-header">
        <span class="review-num">${i + 1}</span>
        <span class="review-status">${status}</span>
        <div class="review-answer-info">
          <span class="review-yours ${statusClass}">${isSkipped ? 'pominięte' : answer}</span>
          ${!isCorrect && !isSkipped ? `<span class="review-correct-label">→ ${task.a}</span>` : ''}
        </div>
        <span class="review-points ${pointsClass}">${pointsText}</span>
        <span class="diff-badge ${DIFF_CLASSES[task.d]}" style="font-size:0.65rem;padding:2px 8px;">${task.p}pkt</span>
      </div>
      <div class="review-detail">
        ${task.qi ? `<img src="${task.qi}" class="review-question-img" alt="Zadanie ${i + 1}">` : ''}
        ${task.qt ? `<p class="review-task-text">${task.qt}</p>` : ''}
        <div class="review-options-mini">${optionsHtml}</div>
        ${task.s ? '<button class="btn-solution" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">💡 Pokaż rozwiązanie</button>' : ''}
        ${solutionHtml}
      </div>
    `;

    item.querySelector('.review-item-header').addEventListener('click', () => {
      item.classList.toggle('expanded');
    });

    list.appendChild(item);
  });
}

// =============================================================================
// HOME / NAVIGATION
// =============================================================================
function goHome() {
  state.quizFinished = true;
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  showScreen('start');
  renderBestScores();
  renderUserBar();
  updateOfflineBanner();
}

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (state.screen !== 'quiz' || state.quizFinished) return;

    const key = e.key.toUpperCase();
    const idx = state.currentIndex;
    const optCount = state.tasks[idx]?.o?.length || 5;
    const letters = optCount <= 4 ? ['A', 'B', 'C', 'D'] : LETTERS;

    if (letters.includes(key)) {
      e.preventDefault();
      selectAnswer(idx, key);
    } else if (['1', '2', '3', '4', '5'].includes(key)) {
      const li = parseInt(key) - 1;
      if (li < optCount) {
        e.preventDefault();
        selectAnswer(idx, letters[li]);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToTask(idx - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToTask(idx + 1);
    } else if (e.key === ' ') {
      e.preventDefault();
      if (idx < state.tasks.length - 1) goToTask(idx + 1);
    } else if (e.key === 'Enter') {
      if (state.screen === 'quiz') {
        const allAnswered = Object.keys(state.answers).length === state.tasks.length;
        if (allAnswered) confirmFinish();
      }
    }
  });
}

// =============================================================================
// INIT
// =============================================================================
function init() {
  initMathSymbols();
  initStartScreen();
  initQuizNavigation();
  initKeyboard();
  initLeaderboardUI();

  // Navigation
  $('btnReviewBack').addEventListener('click', () => showScreen('results'));
  $('btnReviewHome').addEventListener('click', goHome);

  // Login
  $('btnLogin').addEventListener('click', handleLogin);
  $('loginName').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginClass').focus(); });
  $('loginClass').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginSchool').focus(); });
  $('loginSchool').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

  // Leaderboard
  $('btnLeaderboard').addEventListener('click', () => showLeaderboard({ tab: 'test' }));
  $('btnResultsLeaderboard').addEventListener('click', () => showLeaderboard({
    tab: 'test',
    level: state.selectedLevel,
    year: state.mode === 'random' ? 'random' : state.selectedYear,
    mode: state.mode,
  }));

  // Edit profile
  $('btnEditProfile').addEventListener('click', showEditProfile);
  $('btnEditCancel').addEventListener('click', hideEditProfile);
  $('btnEditSave').addEventListener('click', saveEditProfile);

  // Online/offline
  window.addEventListener('online', () => { state.isOnline = true; updateOfflineBanner(); });
  window.addEventListener('offline', () => { state.isOnline = false; updateOfflineBanner(); });

  // Firebase — determines which screen to show
  initFirebase();
}

document.addEventListener('DOMContentLoaded', init);
