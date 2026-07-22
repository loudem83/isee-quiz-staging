function updateCatAvatar() {
  const isFrench = currentCurriculum === 'french_cm1';
  const iseeEl   = document.getElementById('cat-svg-isee');
  const frenchEl = document.getElementById('cat-svg-french');
  if (iseeEl)   iseeEl.style.display   = isFrench ? 'none' : '';
  if (frenchEl) frenchEl.style.display = isFrench ? '' : 'none';
}

function setCurriculum(c) {
  currentCurriculum = c;
  localStorage.setItem('curriculum', c);
  updateCurriculumUI();
  updateCatAvatar();
  // Reload question bank with new filter
  ALL_QUESTIONS = [];
  Object.keys(TAXONOMY).forEach(k => delete TAXONOMY[k]);
  Object.keys(chosen).forEach(k => delete chosen[k]);
  Object.keys(statuses).forEach(k => delete statuses[k]);
  fetchQuestionBank();
}

function updateCurriculumUI() {
  const curr = CURRICULA[currentCurriculum];
  // Update header subject
  const subj = document.getElementById('pp-header-subject');
  if (subj) subj.textContent = curr.label;
  // Update pill styles
  Object.keys(CURRICULA).forEach(c => {
    const btn = document.getElementById('btn-' + c);
    if (!btn) return;
    if (c === currentCurriculum) {
      btn.classList.add('active');
      btn.classList.remove('inactive');
    } else {
      btn.classList.remove('active');
      btn.classList.add('inactive');
    }
  });
}

function updateGreeting() {
  const name = window.currentChildName || '';
  const el = document.getElementById('pp-greeting');
  if (el) el.textContent = 'Welcome back, ' + (name || 'friend') + ' 👋';
}

function updateStreak() {
  // Compute streak from quiz_results already loaded in updateDash
  // Use localStorage-cached recent session dates
  const today = new Date();
  const days = ['S','M','T','W','T','F','S'];
  const dayEls = document.getElementById('pp-streak-days');
  if (!dayEls) return;

  // Build last 7 days array (Mon→Sun)
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    week.push(d);
  }

  // Check which days have quiz_results (use snap-tw data as proxy)
  // For now render the 7-day row with today's streak from totalPoints activity
  const streakDays = window._streakDays || [];
  dayEls.innerHTML = week.map((d, i) => {
    const label = ['M','T','W','T','F','S','S'][(d.getDay() + 6) % 7];
    const dateStr = d.toISOString().slice(0, 10);
    const done = streakDays.includes(dateStr);
    return '<div class="pp-day-circle' + (done ? ' done' : '') + '">' +
      (done ? '✓' : label) + '</div>';
  }).join('');

  const streak = window._currentStreak || 0;
  const best   = window._bestStreak   || 0;
  const numEl  = document.getElementById('pp-streak-num');
  const bestEl = document.getElementById('pp-streak-best');
  const subEl  = document.getElementById('pp-streak-sub');
  if (numEl)  numEl.textContent  = streak;
  if (bestEl) bestEl.textContent = 'Best: ' + best + ' days';
  if (subEl)  subEl.textContent  = streak > 0 ? 'Keep it going!' : 'Start your streak today!';
}

function computeStreak(rows) {
  // rows: array of {answered_at} strings, already filtered by curriculum
  const dates = [...new Set(rows.map(r => r.answered_at.slice(0,10)))].sort().reverse();
  const today  = new Date().toISOString().slice(0,10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);

  let streak = 0;
  let check  = dates[0] === today || dates[0] === yesterday ? dates[0] : null;
  if (check) {
    for (const d of dates) {
      if (d === check) {
        streak++;
        const dt = new Date(check);
        dt.setDate(dt.getDate() - 1);
        check = dt.toISOString().slice(0,10);
      } else break;
    }
  }

  // Best streak
  let best = 0, cur = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i-1]) - new Date(dates[i])) / 86400000;
    if (diff === 1) { cur++; best = Math.max(best, cur); }
    else cur = 1;
  }
  best = Math.max(best, streak);

  window._currentStreak = streak;
  window._bestStreak    = Math.max(best, streak);
  window._streakDays    = dates.slice(0, 7);
  updateStreak();
}

const ADMIN_UUID = '388dbcdf-8f2a-4f0c-86ad-8e9c11e43e57'; // ldemerli@amazon.co.uk