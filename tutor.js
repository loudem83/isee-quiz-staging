async function getUserRole() {
  try {
    const url = SUPA_URL + '/rest/v1/profiles?id=eq.' + userId() + '&select=role,display_name';
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return { role: 'family', display_name: null };
    const rows = await res.json();
    return rows.length > 0 ? rows[0] : { role: 'family', display_name: null };
  } catch(e) { console.error('getUserRole error:', e); return { role: 'family', display_name: null }; }
}

// Load tutor's students
async function loadTutorStudents() {
  const listEl = document.getElementById('tutor-student-list');
  try {
    // Get student IDs linked to this tutor
    const res = await fetch(
      SUPA_URL + '/rest/v1/tutor_students?tutor_id=eq.' + userId() + '&select=student_id',
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error('Failed to load students');
    const links = await res.json();
    if (links.length === 0) {
      listEl.innerHTML = '<div style="color:#94a3b8;font-size:0.9rem;padding:1rem 0;">No students linked yet. Ask an admin to link students to your account.</div>';
      return;
    }
    const studentIds = links.map(l => l.student_id);

    // Get profiles for each student
    const ids = studentIds.join(',');
    const res2 = await fetch(
      SUPA_URL + '/rest/v1/profiles?id=in.(' + ids + ')&select=id,display_name',
      { headers: authHeaders() }
    );
    const profiles = await res2.json();

    // Get quick stats for each student
    const cards = await Promise.all(profiles.map(async p => {
      try {
        const sr = await fetch(
          SUPA_URL + '/rest/v1/' + R_TABLE + '?user_id=eq.' + p.id + '&select=question_id,correct,answered_at&order=answered_at.desc&limit=500',
          { headers: authHeaders() }
        );
        const results = await sr.json();
        // Latest per question for count, raw correct/total for score
        const latest = {};
        results.forEach(r => { if (!latest[r.question_id]) latest[r.question_id] = r; });
        const total = Object.keys(latest).length;
        const correct = results.filter(r => r.correct).length;
        const pct = results.length ? Math.round(correct/results.length*100) : null;
        return { ...p, total, pct };
      } catch(e) { return { ...p, total: 0, pct: null }; }
    }));

    listEl.innerHTML = cards.map(s => `
      <div class="student-card" onclick="enterTutorSession('${s.id}','${(s.display_name||s.id).replace(/'/g,"\\'")}')">
        <div class="student-avatar">👤</div>
        <div class="student-info">
          <div class="student-name">${s.display_name || 'Student'}</div>
          <div class="student-stats">${s.total} questions answered${s.pct !== null ? ' · ' + s.pct + '% correct' : ''}</div>
        </div>
        <div class="student-arrow">›</div>
      </div>`).join('');
  } catch(e) {
    listEl.innerHTML = '<div style="color:#dc2626;font-size:0.9rem;">Error loading students: ' + e.message + '</div>';
  }
}

// Enter tutor session for a specific student
function enterTutorSession(studentId, studentName) {
  tutorMode        = true;
  tutorStudentId   = studentId;
  tutorStudentName = studentName;
  // Show banner
  document.getElementById('tutor-session-banner').style.display = 'flex';
  document.getElementById('tutor-viewing-name').textContent = studentName;
  // Show tutor tools section, hide QA button
  const tutorTools = document.getElementById('home-tutor-tools');
  const qaBtn      = document.getElementById('home-qa-btn');
  const studioSub  = document.getElementById('studio-subtitle');
  if (tutorTools) tutorTools.style.display = '';
  if (qaBtn)      qaBtn.style.display = 'none';
  if (studioSub)  studioSub.textContent = 'Create questions for ' + studentName;
  // Cat not tappable in tutor session
  const catCard = document.getElementById('cat-avatar-card');
  const catHint = document.getElementById('catCardHint');
  if (catCard) { catCard.onclick = null; catCard.style.cursor = 'default'; }
  if (catHint) catHint.textContent = studentName + '\'s learning buddy 🐾';
  // Reload question bank scoped to student — don't reset appBooted
  ALL_QUESTIONS = [];
  fetchQuestionBank();
}

// Exit tutor session back to student picker
function exitTutorSession() {
  tutorMode        = false;
  tutorStudentId   = null;
  tutorStudentName = '';
  ALL_QUESTIONS    = [];
  Object.keys(chosen).forEach(k => delete chosen[k]);
  Object.keys(statuses).forEach(k => delete statuses[k]);
  document.getElementById('tutor-session-banner').style.display = 'none';
  const tutorTools = document.getElementById('home-tutor-tools');
  const qaBtn      = document.getElementById('home-qa-btn');
  const catCard    = document.getElementById('cat-avatar-card');
  const catHint    = document.getElementById('catCardHint');
  if (tutorTools) tutorTools.style.display = 'none';
  if (qaBtn)      qaBtn.style.display = '';
  // Restore cat interactivity
  if (catCard) { catCard.onclick = openCatChat; catCard.style.cursor = 'pointer'; }
  if (catHint) catHint.textContent = 'Tap me to chat! 🐾';
  showScreen('screen-tutor');
}

// Tutor QA — launch Question Studio
function launchTutorQA() {
  const qaTitle = document.querySelector('#screen-qa .top-bar h1');
  if (qaTitle) qaTitle.textContent = '✏️ Question Studio';
  // Hide filter bar — tutors don't need the review queue
  const filterBar = document.querySelector('#screen-qa .quiz-wrap > div:first-child');
  if (filterBar) filterBar.style.display = (tutorMode || tutorStudentId) ? 'none' : '';
  showScreen('screen-qa');
  if (tutorMode || tutorStudentId) {
    qaNewQuestion();
  } else {
    loadQAReview();
  }
}

// Override userId() to return student ID when in tutor session
function userId() {
  if (tutorMode && tutorStudentId) return tutorStudentId;
  return currentUser ? currentUser.id : 'default';
}

/* ════════════════════════════════════════
   KEYBOARD NAVIGATION
════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const quiz = document.getElementById('screen-quiz');
  if (!quiz || !quiz.classList.contains('active')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft')  go(cur - 1);
  if (e.key === 'ArrowRight') go(cur + 1);
});

/* ════════════════════════════════════════
   BACK NAVIGATION
════════════════════════════════════════ */
let lastScreen = null; // screen id to go back to

function setLastScreen(screenId) {
  lastScreen = screenId;
  const btn = document.getElementById('quiz-back-btn');
  if (btn) {
    btn.style.display = screenId ? '' : 'none';
    btn.textContent = '↩ ' + (screenId === 'screen-drill'   ? 'Drill by Topic'
                            : screenId === 'screen-workout' ? 'Workout'
                            : screenId === 'screen-pd'      ? 'Dashboard'
                            : screenId === 'screen-home'    ? 'Home'
                            : 'Back');
  }
}

function goBack() {
  if (lastScreen) showScreen(lastScreen);
  else goHome();
}

/* ════════════════════════════════════════
   BRAVO ANIMATION
════════════════════════════════════════ */
function triggerBravo() {
  const done  = curQs.filter(q => chosen[String(q.n)] != null).length;
  const corr  = curQs.filter(q => statuses[String(q.n)] === 'correct').length;
  const pct   = done ? Math.round(corr / done * 100) : 0;
  const sub   = pct >= 90 ? 'Outstanding performance! 🏆'
              : pct >= 70 ? `${corr} out of ${done} correct — well done!`
              : pct >= 50 ? `${corr} out of ${done} correct — keep practising!`
              : `${corr} out of ${done} correct — you\'re improving!`;
  document.getElementById('bravo-sub').textContent = sub;
  const stars = pct >= 90 ? '⭐ ⭐ ⭐' : pct >= 70 ? '⭐ ⭐' : '⭐';
  document.getElementById('bravo-overlay').querySelector('.br-stars').textContent = stars;
  document.getElementById('bravo-overlay').style.display = 'flex';
  setTimeout(() => {
    document.getElementById('bravo-overlay').style.display = 'none';
    goHome();
  }, 3200);
}

function startTutorWorkout() {
  const uid = userId();
  const assignedQs = ALL_QUESTIONS.filter(q => q.assigned_to === uid);
  console.log('startTutorWorkout: userId=', uid, 'assigned=', assignedQs.length, 'total=', ALL_QUESTIONS.length);
  if (assignedQs.length === 0) {
    alert('No tutor questions assigned yet.');
    return;
  }
  curQs  = assignedQs.slice();
  mode   = 'drill';
  cur    = 0;
  Object.keys(chosen).forEach(k => delete chosen[k]);
  Object.keys(statuses).forEach(k => delete statuses[k]);
  Object.keys(hintedOptions).forEach(k => delete hintedOptions[k]);
  setLastScreen('screen-workout');
  showScreen('screen-quiz');
  renderQ();
  updateDash();
}

let _drillStrandData = []; // cache for search filtering
