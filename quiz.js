// Auth headers for all fetch calls
function authHeaders() {
  const token = authToken || SUPA_KEY;
  return {
    'apikey':        SUPA_KEY,
    'Authorization': 'Bearer ' + token,
    'Content-Type':  'application/json'
  };
}


async function supaInsert(row) {
  // Don't write results when tutor is previewing student session
  if (tutorMode && tutorStudentId) {
    showSyncStatus('👁 Tutor view — results not saved', '#4c1d95', '#f5f3ff');
    setTimeout(() => showSyncStatus('','',''), 2500);
    return;
  }
  showSyncStatus('⏳ Saving…', '#92400e', '#fffbeb');
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/' + R_STAGING + '', {
      method: 'POST',
      headers: {
        ...authHeaders(), 'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });
    if (res.status === 201 || res.status === 200) {
      showSyncStatus('✅ Saved', '#065f46', '#f0fdf4');
      setTimeout(() => showSyncStatus('','',''), 2500);
    } else {
      const err = await res.text();
      showSyncStatus('⚠️ Save failed (' + res.status + '): ' + err.slice(0,60), '#991b1b', '#fef2f2');
    }
  } catch(e) {
    showSyncStatus('⚠️ Network error: ' + e.message, '#991b1b', '#fef2f2');
  }
}

function showSyncStatus(msg, color, bg) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
  el.textContent = msg;
  el.style.color = color;
  el.style.background = bg;
  el.style.display = 'block';
}

// Persist session ID per day
const _todayKey = 'quiz_session_' + new Date().toISOString().slice(0,10);
const SESSION_ID = localStorage.getItem(_todayKey) ||
  (() => { const id = new Date().toISOString().slice(0,10) + '_' + Math.random().toString(36).slice(2,8); localStorage.setItem(_todayKey, id); return id; })();

/* ════════════════════════════════════════
   QUESTION BANK
   To add a new question, paste a new object
   before the closing ]; below.
   Format: ,{n:"QR-21",sec:"QR",text:"...",opts:["A","B","C","D"],ans:0,exp:"..."}
════════════════════════════════════════ */
// Question bank — populated from Supabase by fetchQuestionBank() on load
let ALL_QUESTIONS = [];
// Taxonomy map — populated from Supabase by fetchQuestionBank() on load
let TAXONOMY = {};

/* ════════════════════════════════════════
   DIAGRAMS
════════════════════════════════════════ */
function diagrams(key) {
  if (!key) return '';
  if (key.trimStart().startsWith('<svg')) return key;
  if (key.trimStart().startsWith('<table')) return key;
  return '';
}

/* ════════════════════════════════════════
   LOCAL STORAGE
════════════════════════════════════════ */
const LS_KEY = 'quiz_progress_v1';
const chosen = {}, statuses = {}, attempts = {};

function saveProgress() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({chosen, statuses, attempts})); } catch(e) {}
}
function loadProgress() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return;
    const data = JSON.parse(saved);
    if (data.chosen)   Object.assign(chosen,   data.chosen);
    if (data.statuses) Object.assign(statuses, data.statuses);
    if (data.attempts) Object.assign(attempts, data.attempts);
  } catch(e) {}
}

/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
let mode = 'all', curQs = [], cur = 0;

/* ════════════════════════════════════════
   QUIZ LOGIC
════════════════════════════════════════ */
/* ════════════════════════════════════════
   DRILL BY TOPIC
════════════════════════════════════════ */
/* ════════════════════════════════════════
   WORKOUT
════════════════════════════════════════ */
const STRAND_ICONS_SVG = {
  'Whole Numbers': '<span style="font-size:20px;font-weight:700;">123</span>',
  'Decimals, Fractions & Percentages': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 2 A10 10 0 0 1 22 12 L12 12 Z" fill="currentColor"/><path d="M12 12 L12 2 A10 10 0 0 0 4.2 18.2 Z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  'Algebraic Thinking': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4.5 12.3c.7.6 1.2 1.5 1.4 2.4.1.4.4.6.8.6h4.6c.4 0 .7-.2.8-.6.2-.9.7-1.8 1.4-2.4A7 7 0 0 0 12 2z"/></svg>',
  'Geometry': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20 L13 4 L21 20 Z"/></svg>',
  'Measurement': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8" width="19" height="8" rx="1" transform="rotate(-15 12 12)"/><line x1="7" y1="9" x2="8" y2="12" transform="rotate(-15 12 12)"/><line x1="11" y1="8" x2="12" y2="12" transform="rotate(-15 12 12)"/><line x1="15" y1="9" x2="16" y2="12" transform="rotate(-15 12 12)"/></svg>',
  'Data Analysis & Prob.': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="18" y1="20" x2="18" y2="11"/></svg>',
  'Conjugaison': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
  'Nature des mots': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
  'Fonctions': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="M9.5 9.5 14.5 14.5"/></svg>',
  'Accord': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/></svg>',
  'Types de phrases': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/><circle cx="12" cy="12" r="10"/></svg>',
  'Homophones grammaticaux': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  'Sens des mots': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  'Formation des mots': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  'Champ lexical': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/></svg>',
  'Compréhension globale': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  'Compréhension détaillée': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  'Inférences': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14a4.5 4.5 0 0 1 0-9c2.49 0 4.5 2.01 4.5 4.5"/><path d="M9 18h6"/><path d="M12 18v4"/></svg>',
  'Vocabulaire en contexte': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 21l1-5a8.5 8.5 0 1 1 17-1z"/></svg>',
  'Construction de phrases': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
  'Structure du texte': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
};

function loadWorkout() {
  const statusEl  = document.getElementById('workout-status');
  const contentEl = document.getElementById('workout-content');

  // Build strand counts from ALL_QUESTIONS
  const strandMap = {};
  ALL_QUESTIONS.forEach(q => {
    const tax = TAXONOMY[q.n];
    if (!tax) return;
    if (!strandMap[tax.strand]) strandMap[tax.strand] = 0;
    strandMap[tax.strand]++;
  });

  if (Object.keys(strandMap).length === 0) {
    statusEl.textContent = 'No questions found.';
    contentEl.innerHTML = '';
    return;
  }

  const strandOrder = QA_STRANDS_BY_CURRICULUM[currentCurriculum] || QA_STRANDS_BY_CURRICULUM['isee_lower'];
  const strandLabels = Object.fromEntries((QA_STRANDS_BY_CURRICULUM[currentCurriculum] || QA_STRANDS_BY_CURRICULUM['isee_lower']).map(s => [s, s]));

  const total = Object.values(strandMap).reduce((s,c) => s+c, 0);
  statusEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--pp-primary);"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg> ' + total + ' questions available';

  let html = '';

  // ── Quick Assessment — highlighted card ──
  html += `
    <button class="pp-quick-card" onclick="startAssessment()">
      <div class="pp-quick-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--pp-primary)"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg></div>
      <div style="flex:1;">
        <div class="pp-quick-title">Quick Assessment</div>
        <div class="pp-quick-sub">20 mixed questions across all topics · Start here!</div>
      </div>
      <div>
        <div class="pp-quick-count">20</div>
        <div class="pp-quick-count-lbl">questions</div>
      </div>
    </button>`;

  const assignedQs = ALL_QUESTIONS.filter(q => q.assigned_to === userId());
  if (assignedQs.length > 0) {
    html += `
      <button class="pp-quick-card purple" onclick="startTutorWorkout()">
        <div class="pp-quick-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--pp-tutor)"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></div>
        <div style="flex:1;">
          <div class="pp-quick-title">Tutor Questions</div>
          <div class="pp-quick-sub">Assigned by your tutor</div>
        </div>
        <div>
          <div class="pp-quick-count">${assignedQs.length}</div>
          <div class="pp-quick-count-lbl">questions</div>
        </div>
      </button>`;
  }

  // ── Topic grid ──
  html += '<div class="pp-topic-grid">';
  strandOrder.filter(s => strandMap[s]).forEach(strand => {
    const count = Math.min(strandMap[strand], 20);
    const icon  = STRAND_ICONS_SVG[strand] || '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>';
    html += `
      <button class="pp-topic-card" onclick="startWorkout('${encodeURIComponent(strand)}')">
        <div class="pp-topic-icon-circle${strand === 'Whole Numbers' ? ' pp-topic-icon-circle--text' : ''}">${icon}</div>
        <div class="pp-topic-center">
          <div class="pp-topic-title">${strandLabels[strand]}</div>
        </div>
        <div class="pp-topic-right">
          <div class="pp-topic-count">${count}</div>
          <div class="pp-topic-count-lbl">questions</div>
        </div>
      </button>`;
  });
  html += '</div>';

  contentEl.innerHTML = html;
}

async function startAssessment() {
  const statusEl = document.getElementById('workout-status');
  statusEl.textContent = 'Building your assessment…';

  // Fetch history
  let history = [];
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/' + R_STAGING + '?select=question_id,correct,answered_at&user_id=eq.' + userId() + '&curriculum=eq.' + currentCurriculum + '&order=answered_at.desc&limit=1000', { headers: authHeaders() });
    if (res.ok) history = await res.json();
  } catch(e) {}

  const histMap = {};
  history.forEach(r => {
    if (!histMap[r.question_id]) histMap[r.question_id] = { lastSeen: r.answered_at, correct: 0, total: 0 };
    else if (r.answered_at > histMap[r.question_id].lastSeen) histMap[r.question_id].lastSeen = r.answered_at;
    histMap[r.question_id].total++;
    if (r.correct) histMap[r.question_id].correct++;
  });

  const now = new Date();
  const strandOrder = QA_STRANDS_BY_CURRICULUM[currentCurriculum] || QA_STRANDS_BY_CURRICULUM['isee_lower'];

  const oneDayAgo = new Date(now - 1000*60*60*24);

  // Pick ~3-4 questions per strand, favouring DoK 1, prioritise unseen
  const selected = [];
  strandOrder.forEach(strand => {
    const pool = ALL_QUESTIONS.filter(q => {
      const tax = TAXONOMY[q.n];
      if (!tax || tax.strand !== strand) return false;
      // Hard exclude questions seen in last 24 hours
      const h = histMap[q.n];
      if (h && new Date(h.lastSeen) > oneDayAgo) return false;
      return true;
    });
    // Score: unseen + DoK 1 first
    pool.forEach(q => {
      const h = histMap[q.n];
      const dok = TAXONOMY[q.n]?.dok || 2;
      const unseen = h ? 0 : 1;
      const recency = h ? Math.min((now - new Date(h.lastSeen)) / (1000*60*60*24*7), 1) : 1;
      q._priority = (unseen * 0.5) + (recency * 0.3) + ((3 - dok) / 2 * 0.2);
    });
    pool.sort((a, b) => b._priority - a._priority || Math.random() - 0.5);
    selected.push(...pool.slice(0, 4)); // up to 4 per strand
  });

  // Cap at 20, shuffle order across strands
  const assessment = selected.slice(0, 20).sort(() => Math.random() - 0.5);

  if (assessment.length === 0) { statusEl.textContent = ''; alert('No questions available.'); return; }

  curQs  = assessment;
  mode   = 'drill';
  cur    = 0;
  Object.keys(chosen).forEach(k => delete chosen[k]);
  Object.keys(statuses).forEach(k => delete statuses[k]);
  Object.keys(hintedOptions).forEach(k => delete hintedOptions[k]);
  setLastScreen('screen-workout');
  document.getElementById('quiz-title').textContent = (window.currentChildName || '') + (window.currentChildName ? "'s " : '') + 'Assessment';
  statusEl.textContent = '';
  showScreen('screen-quiz');
  renderQ();
  updateDash();
}

async function startWorkout(safeStrand) {
  const strand = decodeURIComponent(safeStrand);
  const statusEl = document.getElementById('workout-status');
  statusEl.textContent = 'Building your workout…';

  // ── 1. Fetch answer history for this student ──────────────────────────
  let history = [];
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/' + R_STAGING + '?select=question_id,correct,answered_at&user_id=eq.' + userId() + '&curriculum=eq.' + currentCurriculum + '&order=answered_at.desc&limit=1000', {
      headers: authHeaders()
    });
    if (res.ok) history = await res.json();
  } catch(e) { /* proceed without history */ }

  // ── 2. Build lookup: question_id → { lastSeen, correctCount, totalCount } ──
  const histMap = {};
  history.forEach(r => {
    if (!histMap[r.question_id]) histMap[r.question_id] = { lastSeen: r.answered_at, correct: 0, total: 0 };
    else if (r.answered_at > histMap[r.question_id].lastSeen) histMap[r.question_id].lastSeen = r.answered_at;
    histMap[r.question_id].total++;
    if (r.correct) histMap[r.question_id].correct++;
  });

  // ── 3. Build skill accuracy map for this strand ───────────────────────
  const skillAcc = {};
  ALL_QUESTIONS.forEach(q => {
    const tax = TAXONOMY[q.n];
    if (!tax || tax.strand !== strand || !tax.skill) return;
    const h = histMap[q.n];
    if (!h) return;
    if (!skillAcc[tax.skill]) skillAcc[tax.skill] = { correct: 0, total: 0 };
    skillAcc[tax.skill].correct += h.correct;
    skillAcc[tax.skill].total  += h.total;
  });

  // ── 4. Score each question ────────────────────────────────────────────
  const now = new Date();

  function scoreQuestion(q) {
    const tax  = TAXONOMY[q.n];
    const h    = histMap[q.n];
    const skill = tax?.skill;

    // Skill weakness score (0=strong, 1=weak, 0.5=untested)
    let skillScore = 0.5;
    if (skill && skillAcc[skill] && skillAcc[skill].total > 0) {
      const pct = skillAcc[skill].correct / skillAcc[skill].total;
      skillScore = pct < 0.5  ? 1.0   // needs work
                 : pct < 0.70 ? 0.75  // developing
                 : 0.25;              // strong
    }

    // Recency score (0=seen recently, 1=never seen)
    let recencyScore = 1.0;
    if (h && h.lastSeen) {
      const daysSince = (now - new Date(h.lastSeen)) / (1000 * 60 * 60 * 24);
      recencyScore = Math.min(daysSince / 7, 1.0); // caps at 1 after 7 days
    }

    // Individual question accuracy penalty
    let accuracyScore = 0.5;
    if (h && h.total > 0) {
      accuracyScore = 1 - (h.correct / h.total); // 1=always wrong, 0=always right
    }

    // Combined priority (higher = serve sooner)
    return (skillScore * 0.4) + (recencyScore * 0.35) + (accuracyScore * 0.25);
  }

  // ── 5. Filter to strand, score, sort ─────────────────────────────────
  const pool = ALL_QUESTIONS.filter(q => {
    const tax = TAXONOMY[q.n];
    return tax && tax.strand === strand;
  });

  if (pool.length === 0) { statusEl.textContent = ''; alert('No questions found for this topic.'); return; }

  // Sort by priority descending, shuffle within ties
  pool.forEach(q => { q._priority = scoreQuestion(q); });
  pool.sort((a, b) => {
    const diff = b._priority - a._priority;
    if (Math.abs(diff) > 0.05) return diff;
    return Math.random() - 0.5; // shuffle within similar priority
  });

  // Take top 20, then re-sort by DoK 1 → 2 → 3
  const top20 = pool.slice(0, 20);
  top20.sort((a, b) => {
    const da = TAXONOMY[a.n]?.dok || 2;
    const db = TAXONOMY[b.n]?.dok || 2;
    return da - db;
  });

  const strandLabels = Object.fromEntries((QA_STRANDS_BY_CURRICULUM[currentCurriculum] || QA_STRANDS_BY_CURRICULUM['isee_lower']).map(s => [s, s]));
  const label = strandLabels[strand] || strand;

  // Clear answer state and hints for these questions so they appear fresh
  top20.forEach(q => {
    const key = String(q.n);
    delete chosen[key];
    delete statuses[key];
    delete hintedOptions[key];
  });

  // Reset workout state
  workoutStreak = 0;
  workoutCorrect = 0;
  workoutTopicLabel = label;

  mode = 'workout';
  curQs = top20;
  cur = 0;
  statusEl.textContent = '';
  document.getElementById('quiz-title').textContent = '🏋️ ' + label;
  document.getElementById('bar-fill').className = 'bar-fill workout';
  setLastScreen('screen-workout');
  showScreen('screen-quiz');

  // Show countdown then render first question
  workoutCountdown(label, () => renderQ());
}

/* ════════════════════════════════════════
   WORKOUT ANIMATIONS
════════════════════════════════════════ */
let workoutStreak = 0;
let workoutCorrect = 0;
let workoutTopicLabel = '';
let workoutReactionTimer = null;

function workoutCountdown(topicLabel, onDone) {
  const el = document.getElementById('workout-countdown');
  el.style.display = 'flex';
  const steps = [
    { html: `<div class="cd-topic">${topicLabel}</div><div class="cd-number">3</div>` },
    { html: `<div class="cd-topic">${topicLabel}</div><div class="cd-number">2</div>` },
    { html: `<div class="cd-topic">${topicLabel}</div><div class="cd-number">1</div>` },
    { html: `<div class="cd-go">Go! 🚀</div>` },
  ];
  let i = 0;
  function next() {
    if (i >= steps.length) {
      el.style.display = 'none';
      onDone();
      return;
    }
    el.innerHTML = steps[i].html;
    i++;
    setTimeout(next, i === steps.length ? 600 : 800);
  }
  next();
}

function workoutReaction(isCorrect) {
  if (mode !== 'workout') return;
  if (workoutReactionTimer) clearTimeout(workoutReactionTimer);

  const correctEmojis = ['🌟','⭐','🎯','✨','💡','🔥','👏'];
  const correctMsgs   = ['Nice one!','Nailed it!','Keep going!','Brilliant!','Spot on!','Excellent!','You got it!'];
  const wrongMsgs     = ['Not quite…','Keep trying!','Almost there!'];

  const el = document.getElementById('workout-reaction');
  if (isCorrect) {
    workoutStreak++;
    workoutCorrect++;
    const emoji = correctEmojis[Math.floor(Math.random() * correctEmojis.length)];
    const msg   = correctMsgs[Math.floor(Math.random() * correctMsgs.length)];
    el.style.display = 'flex';
    el.innerHTML = `<div class="wr-emoji">${emoji}</div><div class="wr-msg" style="color:#065f46">${msg}</div>`;
    workoutReactionTimer = setTimeout(() => { el.style.display = 'none'; }, 900);
    updateStreakBadge();
  } else {
    workoutStreak = 0;
    const msg = wrongMsgs[Math.floor(Math.random() * wrongMsgs.length)];
    el.style.display = 'flex';
    el.innerHTML = `<div class="wr-emoji">💪</div><div class="wr-msg" style="color:#92400e">${msg}</div>`;
    workoutReactionTimer = setTimeout(() => { el.style.display = 'none'; }, 900);
    updateStreakBadge();
    // Shake the selected option
    setTimeout(() => {
      const btns = document.querySelectorAll('.option-btn.wrong-sel');
      btns.forEach(b => { b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 400); });
    }, 50);
  }
  // Check milestones
  const done = curQs.filter(q2 => chosen[String(q2.n)] != null).length;
  if (done === Math.floor(curQs.length / 2)) showMilestone('Halfway there! Keep it up 🏃');
  if (done === curQs.length - 3) showMilestone('Almost done! Final push 💪');
  if (done === curQs.length) setTimeout(() => showWorkoutEnd(), 1000);
}

function updateStreakBadge() {
  const badge = document.getElementById('streak-badge');
  if (workoutStreak >= 3) {
    badge.textContent = `🔥 ${workoutStreak} in a row!`;
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }
}

function showMilestone(msg) {
  const banner = document.getElementById('milestone-banner');
  banner.textContent = msg;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 2500);
}

function showWorkoutEnd() {
  const total   = curQs.length;
  const correct = workoutCorrect;
  const pct     = total ? Math.round(correct / total * 100) : 0;
  let emoji, title, sub;
  if (pct >= 90)      { emoji = '🏆'; title = 'Outstanding!';   sub = 'You absolutely crushed it!'; }
  else if (pct >= 70) { emoji = '🌟'; title = 'Well done!';     sub = 'Great effort today.'; }
  else if (pct >= 50) { emoji = '💪'; title = 'Good work!';     sub = 'Keep practising — you\'re getting there.'; }
  else                { emoji = '🎯'; title = 'Nice try!';       sub = 'These topics need more practice. Come back tomorrow!'; }

  document.getElementById('we-emoji').textContent   = emoji;
  document.getElementById('we-title').textContent   = title;
  document.getElementById('we-sub').textContent     = sub;
  document.getElementById('we-correct').textContent = correct;
  document.getElementById('we-total').textContent   = total;
  document.getElementById('we-pct').textContent     = pct + '%';
  document.getElementById('workout-end').style.display = 'flex';
  // Hide streak badge
  document.getElementById('streak-badge').classList.remove('show');
}

function restartWorkout() {
  document.getElementById('workout-end').style.display = 'none';
  showScreen('screen-workout');
  loadWorkout();
}

function closeWorkoutEnd() {
  document.getElementById('workout-end').style.display = 'none';
  goHome();
}


/* ════════════════════════════════════════
   POINTS & HINTS
════════════════════════════════════════ */
const POINTS_PER_CORRECT = 10;
const HINT_COST          = 50;

let userPoints    = 0;  // hint balance (spendable, goes up and down)
let totalPoints   = 0;  // cumulative total (never decreases)
let hintedOptions = {}; // key → [crossed-off option indices]

// Load points from Supabase on startup
async function loadPoints() {
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/user_points?user_id=eq.' + userId() + '&select=points,total_points', {
      headers: authHeaders()
    });
    if (!res.ok) return;
    const rows = await res.json();
    if (rows.length > 0) {
      userPoints  = rows[0].points       || 0;
      totalPoints = rows[0].total_points || rows[0].points || 0;
      refreshPointsBadge();
      refreshTotalPoints();
    }
  } catch(e) {}
}

// Save points to Supabase
async function savePoints() {
  try {
    await fetch(SUPA_URL + '/rest/v1/user_points', {
      method: 'POST',
      headers: { ...authHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: userId(), points: userPoints, total_points: totalPoints, updated_at: new Date().toISOString() })
    });
  } catch(e) {}
}

function refreshPointsBadge() {
  const el = document.getElementById('points-display');
  if (el) el.textContent = userPoints;
}

function refreshTotalPoints() {
  const el = document.getElementById('snap-total-pts');
  if (el) el.textContent = totalPoints;
}

function awardPoints(n) {
  userPoints  += n;
  totalPoints += n;  // total always increases
  refreshPointsBadge();
  refreshTotalPoints();
  // Animate the badge
  const badge = document.getElementById('points-badge');
  if (badge) {
    badge.classList.remove('points-pop');
    void badge.offsetWidth;
    badge.classList.add('points-pop');
    setTimeout(() => badge.classList.remove('points-pop'), 300);
  }
  savePoints();
}

function useHint(key) {
  if (userPoints < HINT_COST) return;
  const q = curQs[cur];
  if (!q || String(q.n) !== key) return;
  if (!hintedOptions[key]) hintedOptions[key] = [];
  if (hintedOptions[key].length >= 2) return;

  // Pick a random wrong answer that hasn't been crossed off yet
  const available = [0,1,2,3].filter(i =>
    i !== q.ans &&
    !hintedOptions[key].includes(i)
  );
  if (available.length === 0) return;

  const pick = available[Math.floor(Math.random() * available.length)];
  hintedOptions[key].push(pick);

  userPoints -= HINT_COST;  // only hint_balance decreases
  savePoints();
  renderQ();
}

/* ════════════════════════════════════════
   TUTOR SYSTEM
════════════════════════════════════════ */
let tutorMode     = false;   // true when tutor is viewing a student
let tutorStudentId = null;   // UUID of student being viewed
let tutorStudentName = '';

// Check user role from profiles table

async function pushToQA(questionId) {
  if (!confirm(`Push "${questionId}" to QA for editing?\n\nIt will be temporarily removed from the live quiz until approved.`)) return;

  const res = await fetch(SUPA_URL + '/rest/v1/' + Q_TABLE + '?question_id=eq.' + questionId, {
    method: 'PATCH',
    headers: {
      ...authHeaders(), 'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ active: false })
  });

  if (!res.ok) { alert('Failed to push to QA. Please try again.'); return; }

  const idx = ALL_QUESTIONS.findIndex(q => q.n === questionId);
  if (idx !== -1) ALL_QUESTIONS.splice(idx, 1);

  showScreen('screen-qa');
  await loadQAReview();

  const qaIdx2 = qaQuestions.findIndex(r => r.question_id === questionId);
  if (qaIdx2 !== -1) { qaIdx = qaIdx2; qaRender(); }
}

function startDrill(safeKey) {
  const key    = decodeURIComponent(safeKey);
  const [strand, sub] = key.split('|||');
  const pool   = ALL_QUESTIONS.filter(q => {
    const tax = TAXONOMY[q.n];
    return tax && tax.strand === strand && tax.sub === sub;
  });
  if (pool.length === 0) { alert('No questions found for this subtopic.'); return; }
  mode = 'drill';
  curQs = pool;
  cur   = 0;
  document.getElementById('quiz-title').textContent = sub;
  document.getElementById('bar-fill').className = 'bar-fill all';
  showScreen('screen-quiz');
  renderQ();
}

function startQuiz(m) {
  mode = m;
  const pool = ALL_QUESTIONS;
  curQs = m === 'ma' ? pool.filter(q => q.sec === 'MA')
        : m === 'qr' ? pool.filter(q => q.sec === 'QR')
        : [...pool];
  cur = 0;
  document.getElementById('quiz-title').textContent =
    m === 'ma' ? 'Mathematics Achievement' :
    m === 'qr' ? 'Quantitative Reasoning' : 'All Questions';
  document.getElementById('bar-fill').className = 'bar-fill ' + m;
  showScreen('screen-quiz');
  renderQ();
}

function go(i) {
  if (i < 0 || i >= curQs.length) return;
  cur = i;
  renderQ();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function pick(idx) {
  const q = curQs[cur];
  const key = String(q.n);
  if (chosen[key] != null) return;
  attempts[key] = (attempts[key] || 0) + 1;
  chosen[key] = idx;
  const isCorrect = idx === q.ans;
  statuses[key] = isCorrect ? 'correct' : 'wrong';
  if (isCorrect) awardPoints(POINTS_PER_CORRECT);
  saveProgress();
  renderQ(); updateDash();
  if (mode === 'workout') {
    workoutReaction(isCorrect);
  }
  supaInsert({
    user_id:     userId(),
    session_id:  SESSION_ID,
    question_id: key,
    section:     q.sec,
    curriculum:  currentCurriculum,
    correct:     isCorrect,
    attempts:    attempts[key],
    answered_at: new Date().toISOString()
  });
}

function renderTabs() {
  document.getElementById('tabs').innerHTML = curQs.map((q, i) => {
    const key = String(q.n);
    let c = 'tab';
    if (statuses[key] === 'correct') c += ' correct';
    if (statuses[key] === 'wrong')   c += ' wrong';
    if (i === cur) c += ' active';
    const label = q.n.replace('MA-','M').replace('QR-','Q');
    return `<button class="${c}" onclick="go(${i})" title="${q.n}">${label}</button>`;
  }).join('');
}

function formatText(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    // Detect pipe-table: line contains | and has at least 2 cells
    if (line.includes('|') && line.split('|').filter(c => c.trim()).length >= 2) {
      // Collect all consecutive pipe lines
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // Filter out separator rows (---|---|--- style)
      const dataRows = tableLines.filter(l => !/^\s*[\|\-\s]+$/.test(l) || l.includes('|'));
      const separatorRe = /^\s*\|?[\s\-\|]+\|?\s*$/;
      const rows = dataRows.filter(l => !separatorRe.test(l));
      if (rows.length === 0) continue;
      // Build HTML table
      let tbl = '<table class="dtable" style="margin:10px 0;">';
      rows.forEach((row, ri) => {
        const rawCells = row.split('|');
        const start = rawCells[0].trim() === '' ? 1 : 0;
        const end = rawCells[rawCells.length - 1].trim() === '' ? rawCells.length - 1 : rawCells.length;
        const cells = rawCells.slice(start, end).map(c => c.trim());
        const tag = ri === 0 ? 'th' : 'td';
        tbl += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
      });
      tbl += '</table>';
      html += tbl;
    } else {
      // Regular text line — convert newlines to <br> but skip blank lines between sections
      if (line === '') {
        html += '<br>';
      } else {
        html += `<span>${line}</span><br>`;
      }
      i++;
    }
  }
  // Clean up trailing <br>
  return html.replace(/(<br>)+$/, '');
}

function renderQ() {
  const q = curQs[cur];
  if (q.type === 'word_picker') { renderWordPicker(q); return; }
  renderMCQ(q);
}

function renderMCQ(q) {
  const key = String(q.n);
  const answered = chosen[key] != null;
  const diag = q.diag ? `<div class="q-diagram">${diagrams(q.diag)}</div>` : '';
  const opts = q.opts.map((o, i) => {
    let c = 'opt';
    const hinted = (hintedOptions[key] || []).includes(i);
    if (answered) {
      if (i === q.ans) c += ' correct-ans';
      else if (i === chosen[key]) c += ' wrong-sel';
    }
    const crossedClass = hinted && !answered ? ' hint-crossed' : '';
    return `<button class="${c}${crossedClass}" ${answered || hinted ? 'disabled' : ''} onclick="pick(${i})">
      <span class="badge">${['A','B','C','D'][i]}</span><span>${o}</span>
    </button>`;
  }).join('');
  const fb = answered ? `<div class="feedback ${chosen[key] === q.ans ? 'correct' : 'incorrect'} show">
    <div class="fb-title">${chosen[key] === q.ans ? '✓ Correct!' : '✗ Not quite.'}</div>${q.exp}
  </div>` : '';
  const hintsUsed = (hintedOptions[key] || []).length;
  const canHint = !answered && hintsUsed < 2 && userPoints >= HINT_COST;
  const isQA = document.getElementById('screen-qa') && document.getElementById('screen-qa').classList.contains('active');
  const hintBarHtml = (!answered && mode !== 'qa' && !isQA) ? `
    <div class="hint-bar">
      <span class="hint-used">${hintsUsed > 0 ? `💡 ${hintsUsed}/2 hint${hintsUsed>1?'s':''} used` : ''}</span>
      ${canHint
        ? `<button class="hint-btn" onclick="useHint('${key}')">💡 Use hint <span class="hint-cost">(−${HINT_COST} pts)</span></button>`
        : hintsUsed >= 2
          ? `<span class="hint-used">Max hints used</span>`
          : `<span class="hint-used" title="Need ${HINT_COST} pts to use a hint">💡 Need ${HINT_COST} pts for hint</span>`
      }
    </div>` : '';
  _renderQShell(q, `<div class="options">${opts}</div>${fb}${hintBarHtml}`);
}

function renderWordPicker(q) {
  const key     = String(q.n);
  const answered = chosen[key] != null;
  const tokens  = q.tokens || [];
  const correct = new Set(q.correct_tokens || []);
  const selected = new Set(answered ? (chosen[key] || []) : []);

  const tokenBtns = tokens.map(t => {
    let cls = 'wp-token';
    if (answered) {
      if (correct.has(t) && selected.has(t))  cls += ' wp-correct';
      else if (!correct.has(t) && selected.has(t)) cls += ' wp-wrong';
      else if (correct.has(t) && !selected.has(t)) cls += ' wp-missed';
    } else if (selected.has(t)) {
      cls += ' wp-selected';
    }
    return `<button class="${cls}" ${answered ? 'disabled' : ''} data-token="${t.replace(/"/g,'&quot;')}" onclick="pickToken(this)">${t}</button>`;
  }).join('');

  let fb = '';
  if (answered) {
    const isCorrect = statuses[key] === 'correct';
    const correctList = [...correct].join(', ');
    fb = `<div class="feedback ${isCorrect ? 'correct' : 'incorrect'} show">
      <div class="fb-title">${isCorrect ? '✓ Correct!' : `✗ Not quite. La bonne réponse${correct.size > 1 ? ' : ' : ' : '}<strong>${correctList}</strong>`}</div>${q.exp}
    </div>`;
  }

  const submitBtn = !answered
    ? `<button class="nav-btn primary wp-submit-btn" onclick="submitWordPicker('${key}')">Valider ›</button>`
    : '';

  _renderQShell(q, `<div class="wp-tokens">${tokenBtns}</div>${submitBtn}${fb}`);
}

function _renderQShell(q, bodyHtml) {
  const key  = String(q.n);
  const done = curQs.filter(q2 => chosen[String(q2.n)] != null).length;
  const corr = curQs.filter(q2 => statuses[String(q2.n)] === 'correct').length;
  const secLabel = q.sec === 'MA' ? 'Mathematics Achievement'
    : q.sec === 'QR' ? 'Quantitative Reasoning'
    : q.sec === 'GR' ? 'Grammaire'
    : q.sec === 'VO' ? 'Vocabulaire'
    : q.sec === 'CO' ? 'Compréhension'
    : q.sec === 'EX' ? 'Expression'
    : q.sec;

  document.getElementById('q-area').innerHTML = `
    <div class="q-card">
      <div class="q-meta ${q.sec.toLowerCase()}">${q.n} — ${secLabel}</div>
      ${(()=>{ const tax = TAXONOMY[q.n]; return tax ? `<div class="q-taxonomy-row"><span class="q-tax-badge q-tax-badge--strand">${tax.strand}</span><span class="q-tax-badge q-tax-badge--dok">DoK ${tax.dok}</span>${tax.skill ? `<span class="q-tax-badge q-tax-badge--skill">${tax.skill}</span>` : ''}</div>` : ''; })()}
      <div class="q-text">${formatText(q.text)}</div>
      ${q.diag ? `<div class="q-diagram">${diagrams(q.diag)}</div>` : ''}
      ${bodyHtml}
      ${isAdmin() ? `<div class="q-admin-row">
        <button data-qn="${q.n}" onclick="pushToQA(this.dataset.qn)" class="q-admin-btn">✏️ Push to QA</button>
      </div>` : ''}
    </div>`;

  document.getElementById('prog-label').textContent = `${done} of ${curQs.length} answered`;
  document.getElementById('score-badge').textContent = `Score: ${corr}/${done}`;
  document.getElementById('bar-fill').style.width = (done / curQs.length * 100) + '%';
  document.getElementById('points-display').textContent = userPoints;
  document.getElementById('btn-prev').disabled = cur === 0;
  const isLast = cur === curQs.length - 1;
  document.getElementById('btn-next').disabled = isLast;
  document.getElementById('btn-next').style.display = isLast ? 'none' : '';
  document.getElementById('btn-finish').style.display = isLast ? '' : 'none';
  renderTabs();
}

function pickToken(btn) {
  btn.classList.toggle('wp-selected');
}

function submitWordPicker(key) {
  const q = curQs[cur];
  const correct = new Set(q.correct_tokens || []);
  const selected = new Set(
    [...document.querySelectorAll('.wp-token.wp-selected')].map(b => b.dataset.token)
  );
  attempts[key] = (attempts[key] || 0) + 1;
  const isCorrect = correct.size === selected.size && [...correct].every(t => selected.has(t));
  chosen[key]   = [...selected];
  statuses[key] = isCorrect ? 'correct' : 'wrong';
  if (isCorrect) awardPoints(POINTS_PER_CORRECT);
  saveProgress();
  renderQ(); updateDash();
  if (mode === 'workout') workoutReaction(isCorrect);
  supaInsert({
    user_id:     userId(),
    session_id:  SESSION_ID,
    question_id: key,
    section:     q.sec,
    curriculum:  currentCurriculum,
    correct:     isCorrect,
    attempts:    attempts[key],
    answered_at: new Date().toISOString()
  });
}


function resetSection(sec) {
  const label = sec === 'MA' ? 'Mathematics Achievement' : 'Quantitative Reasoning';
  if (!confirm(`Reset all ${label} answers?\n\nAttempt counts will be kept.`)) return;
  ALL_QUESTIONS.filter(q => q.sec === sec).forEach(q => {
    const key = String(q.n);
    delete chosen[key];
    delete statuses[key];
  });
  saveProgress();
  updateDash();
}

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */