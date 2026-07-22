function isAdmin() { return currentUser?.id === ADMIN_UUID; }

/* ════════════════════════════════════════
   ADMIN SCREEN
════════════════════════════════════════ */
let _adminTab = 'questions';

function showAdmin() {
  showScreen('screen-admin');
  switchAdminTab(_adminTab);
}

function switchAdminTab(tab) {
  _adminTab = tab;
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  const el = document.getElementById('atab-' + tab);
  if (el) el.classList.add('active');
  const content = document.getElementById('admin-content');
  content.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--pp-text-muted);">⏳ Loading…</div>';
  if      (tab === 'questions') adminRenderQuestions();
  else if (tab === 'users')     adminRenderUsers();
  else if (tab === 'usage')     adminRenderUsage();
  else if (tab === 'health')    adminRenderHealth();
  else if (tab === 'debug')     adminRenderDebug();
}

/* ── Questions tab ── */
async function adminRenderQuestions() {
  const el = document.getElementById('admin-content');
  try {
    // Fetch counts by curriculum and type
    const [qRes, pendRes] = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/questions?select=question_id,curriculum,type,strand,explanation,active&limit=2000', { headers: authHeaders() }),
      fetch(SUPA_URL + '/rest/v1/questions?active=eq.false&select=question_id,curriculum&limit=500', { headers: authHeaders() }),
    ]);
    const questions = qRes.ok ? await qRes.json() : [];
    const pending   = pendRes.ok ? await pendRes.json() : [];

    const active  = questions.filter(q => q.active);
    const maths   = active.filter(q => q.curriculum === 'isee_lower');
    const french  = active.filter(q => q.curriculum === 'french_cm1');
    const wpCount = active.filter(q => q.type === 'word_picker').length;
    const noExp   = active.filter(q => !q.explanation || q.explanation.trim() === '').length;
    const noStrand= active.filter(q => !q.strand).length;

    el.innerHTML = `
      <div class="admin-stat-grid">
        <div class="admin-stat"><div class="admin-stat-val">${active.length}</div><div class="admin-stat-lbl">Active questions</div></div>
        <div class="admin-stat"><div class="admin-stat-val">${maths.length}</div><div class="admin-stat-lbl">Maths (ISEE)</div></div>
        <div class="admin-stat"><div class="admin-stat-val">${french.length}</div><div class="admin-stat-lbl">French CM1/2</div></div>
        <div class="admin-stat"><div class="admin-stat-val">${pending.length}</div><div class="admin-stat-lbl">Pending review</div></div>
      </div>
      <div class="admin-stat-grid">
        <div class="admin-stat"><div class="admin-stat-val">${wpCount}</div><div class="admin-stat-lbl">Word picker</div></div>
        <div class="admin-stat"><div class="admin-stat-val">${active.length - wpCount}</div><div class="admin-stat-lbl">MCQ</div></div>
        <div class="admin-stat"><div class="admin-stat-val ${noExp > 0 ? 'admin-health-warn' : 'admin-health-ok'}">${noExp}</div><div class="admin-stat-lbl">Missing explanation</div></div>
        <div class="admin-stat"><div class="admin-stat-val ${noStrand > 0 ? 'admin-health-bad' : 'admin-health-ok'}">${noStrand}</div><div class="admin-stat-lbl">Missing taxonomy</div></div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">📋 QA Review Queue</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="admin-btn" onclick="launchQAReview()">📋 Open QA Review (${pending.length} pending)</button>
          <button class="admin-btn" onclick="launchNewQuestion()">➕ New Question</button>
        </div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">📚 Questions by Strand</div>
        ${adminStrandTable(active)}
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--pp-error);padding:2rem;">❌ ${e.message}</div>`;
  }
}

function adminStrandTable(questions) {
  const map = {};
  questions.forEach(q => {
    const key = (q.curriculum === 'french_cm1' ? '🇫🇷 ' : '📐 ') + (q.strand || '(no strand)');
    if (!map[key]) map[key] = { total: 0, mcq: 0, wp: 0 };
    map[key].total++;
    if (q.type === 'word_picker') map[key].wp++; else map[key].mcq++;
  });
  const rows = Object.entries(map).sort((a,b) => a[0].localeCompare(b[0]));
  const max = Math.max(...rows.map(([,v]) => v.total));
  return `<table class="admin-table">
    <thead><tr><th>Strand</th><th>Total</th><th>MCQ</th><th>Word picker</th><th>Coverage</th></tr></thead>
    <tbody>${rows.map(([strand, v]) => `
      <tr>
        <td>${strand}</td>
        <td><strong>${v.total}</strong></td>
        <td>${v.mcq}</td>
        <td>${v.wp}</td>
        <td><div class="admin-bar-wrap"><div class="admin-bar-track"><div class="admin-bar-fill" style="width:${Math.round(v.total/max*100)}%"></div></div><span style="font-size:11px;color:var(--pp-text-muted);min-width:28px;">${v.total}</span></div></td>
      </tr>`).join('')}
    </tbody></table>`;
}

function launchQAReview() {
  showScreen('screen-qa');
  loadQAReview();
}

function launchNewQuestion() {
  showScreen('screen-qa');
  qaNewQuestion();
}

/* ── Users tab ── */
async function adminRenderUsers() {
  const el = document.getElementById('admin-content');
  try {
    // Fetch profiles + aggregate quiz_results per user
    const [profRes, resultsRes] = await Promise.all([
      fetch(SUPA_URL + '/rest/v1/profiles?select=id,role,display_name,created_at', { headers: authHeaders() }),
      fetch(SUPA_URL + '/rest/v1/quiz_results?select=user_id,correct,answered_at&order=answered_at.desc&limit=5000', { headers: authHeaders() }),
    ]);
    const profiles = profRes.ok ? await profRes.json() : [];
    const results  = resultsRes.ok ? await resultsRes.json() : [];

    // Aggregate per user
    const agg = {};
    results.forEach(r => {
      if (!agg[r.user_id]) agg[r.user_id] = { total: 0, correct: 0, lastActive: r.answered_at };
      agg[r.user_id].total++;
      if (r.correct) agg[r.user_id].correct++;
      if (r.answered_at > agg[r.user_id].lastActive) agg[r.user_id].lastActive = r.answered_at;
    });

    const rows = profiles.sort((a,b) => (a.display_name||'').localeCompare(b.display_name||''));
    const totalUsers = profiles.length;
    const activeThisWeek = Object.values(agg).filter(a => {
      const d = new Date(a.lastActive);
      return (Date.now() - d) < 7 * 24 * 60 * 60 * 1000;
    }).length;

    el.innerHTML = `
      <div class="admin-stat-grid">
        <div class="admin-stat"><div class="admin-stat-val">${totalUsers}</div><div class="admin-stat-lbl">Total users</div></div>
        <div class="admin-stat"><div class="admin-stat-val">${activeThisWeek}</div><div class="admin-stat-lbl">Active this week</div></div>
        <div class="admin-stat"><div class="admin-stat-val">${results.length}</div><div class="admin-stat-lbl">Total answers</div></div>
        <div class="admin-stat"><div class="admin-stat-val">${results.length ? Math.round(results.filter(r=>r.correct).length/results.length*100) : 0}%</div><div class="admin-stat-lbl">Overall score</div></div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">👥 All Users</div>
        <table class="admin-table">
          <thead><tr><th>Name</th><th>Role</th><th>Questions answered</th><th>Score</th><th>Last active</th><th>Member since</th></tr></thead>
          <tbody>${rows.map(p => {
            const a = agg[p.id] || { total: 0, correct: 0, lastActive: null };
            const score = a.total ? Math.round(a.correct / a.total * 100) : null;
            const lastActive = a.lastActive ? new Date(a.lastActive).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
            const since = new Date(p.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
            const roleClass = p.role === 'admin' ? 'admin' : p.role === 'tutor' ? 'tutor' : 'family';
            return `<tr>
              <td><strong>${p.display_name || '(no name)'}</strong></td>
              <td><span class="admin-pill admin-pill--${roleClass}">${p.role || 'family'}</span></td>
              <td>${a.total}</td>
              <td>${score !== null ? `<span style="color:${score >= 70 ? 'var(--pp-success)' : score >= 50 ? 'var(--pp-amber-text)' : 'var(--pp-error)'}">${score}%</span>` : '—'}</td>
              <td style="color:var(--pp-text-secondary)">${lastActive}</td>
              <td style="color:var(--pp-text-secondary)">${since}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--pp-error);padding:2rem;">❌ ${e.message}</div>`;
  }
}

/* ── Usage tab ── */
async function adminRenderUsage(days = 30) {
  const el = document.getElementById('admin-content');
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      SUPA_URL + '/rest/v1/quiz_results?select=user_id,correct,answered_at,curriculum&answered_at=gte.' + since + '&order=answered_at.asc&limit=10000',
      { headers: authHeaders() }
    );
    const rows = res.ok ? await res.json() : [];

    // Daily counts
    const daily = {};
    rows.forEach(r => {
      const day = r.answered_at.slice(0, 10);
      if (!daily[day]) daily[day] = { total: 0, correct: 0, users: new Set() };
      daily[day].total++;
      if (r.correct) daily[day].correct++;
      daily[day].users.add(r.user_id);
    });

    // Fill gaps
    const allDays = [];
    for (let d = 0; d < days; d++) {
      const dt = new Date(Date.now() - (days - 1 - d) * 24 * 60 * 60 * 1000);
      const key = dt.toISOString().slice(0, 10);
      allDays.push({ key, label: dt.toLocaleDateString('en-GB', { day:'numeric', month:'short' }), ...(daily[key] || { total: 0, correct: 0, users: new Set() }) });
    }

    const maxVal = Math.max(...allDays.map(d => d.total), 1);
    const totalQ = rows.length;
    const uniqueUsers = new Set(rows.map(r => r.user_id)).size;
    const mathsQ  = rows.filter(r => r.curriculum === 'isee_lower').length;
    const frenchQ = rows.filter(r => r.curriculum === 'french_cm1').length;

    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:var(--pp-space-lg);">
        <button class="admin-btn ${days===7?'active':''}" onclick="adminRenderUsage(7)" style="${days===7?'background:var(--pp-tutor);color:white;border-color:var(--pp-tutor);':''}">7 days</button>
        <button class="admin-btn ${days===30?'active':''}" onclick="adminRenderUsage(30)" style="${days===30?'background:var(--pp-tutor);color:white;border-color:var(--pp-tutor);':''}">30 days</button>
      </div>
      <div class="admin-stat-grid">
        <div class="admin-stat"><div class="admin-stat-val">${totalQ}</div><div class="admin-stat-lbl">Questions answered</div></div>
        <div class="admin-stat"><div class="admin-stat-val">${uniqueUsers}</div><div class="admin-stat-lbl">Active users</div></div>
        <div class="admin-stat"><div class="admin-stat-val">${mathsQ}</div><div class="admin-stat-lbl">Maths answers</div></div>
        <div class="admin-stat"><div class="admin-stat-val">${frenchQ}</div><div class="admin-stat-lbl">French answers</div></div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">📊 Daily Activity — last ${days} days</div>
        <div style="display:flex;align-items:flex-end;gap:3px;height:120px;margin-bottom:8px;overflow-x:auto;">
          ${allDays.map(d => {
            const h = d.total ? Math.max(4, Math.round(d.total / maxVal * 100)) : 2;
            const pct = d.total ? Math.round(d.correct/d.total*100) : 0;
            return `<div style="flex:1;min-width:${days>14?'10px':'16px'};display:flex;flex-direction:column;align-items:center;gap:2px;" title="${d.key}: ${d.total} questions, ${pct}% correct">
              <div style="width:100%;height:${h}px;background:var(--pp-tutor);border-radius:2px 2px 0 0;opacity:${d.total?'1':'0.2'};"></div>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--pp-text-muted);">
          <span>${allDays[0]?.label}</span>
          <span>${allDays[Math.floor(allDays.length/2)]?.label}</span>
          <span>${allDays[allDays.length-1]?.label}</span>
        </div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">📅 Daily breakdown</div>
        <table class="admin-table">
          <thead><tr><th>Date</th><th>Questions</th><th>Score</th><th>Active users</th></tr></thead>
          <tbody>${[...allDays].reverse().filter(d => d.total > 0).map(d => {
            const pct = Math.round(d.correct / d.total * 100);
            return `<tr>
              <td>${d.key}</td>
              <td>${d.total}</td>
              <td><span style="color:${pct>=70?'var(--pp-success)':pct>=50?'var(--pp-amber-text)':'var(--pp-error)'}">${pct}%</span></td>
              <td>${d.users.size}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--pp-error);padding:2rem;">❌ ${e.message}</div>`;
  }
}

/* ── Content Health tab ── */
async function adminRenderHealth() {
  const el = document.getElementById('admin-content');
  try {
    const res = await fetch(
      SUPA_URL + '/rest/v1/questions?active=eq.true&select=question_id,curriculum,strand,skill,dok,type,explanation&limit=2000',
      { headers: authHeaders() }
    );
    const qs = res.ok ? await res.json() : [];

    // Build health data
    const strands = {};
    qs.forEach(q => {
      const key = q.curriculum + '|||' + (q.strand || '(no strand)');
      if (!strands[key]) strands[key] = { curriculum: q.curriculum, strand: q.strand, dok: {1:0,2:0,3:0}, noSkill: 0, noExp: 0, total: 0, wp: 0 };
      strands[key].total++;
      if (q.dok) strands[key].dok[q.dok] = (strands[key].dok[q.dok] || 0) + 1;
      if (!q.skill) strands[key].noSkill++;
      if (!q.explanation || !q.explanation.trim()) strands[key].noExp++;
      if (q.type === 'word_picker') strands[key].wp++;
    });

    const rows = Object.values(strands).sort((a,b) => a.curriculum.localeCompare(b.curriculum) || (a.strand||'').localeCompare(b.strand||''));
    const thinStrands = rows.filter(r => r.total < 5).length;
    const missingDok  = rows.filter(r => !r.dok[2] && !r.dok[3]).length;
    const noSkillRows = qs.filter(q => !q.skill).length;
    const noExpRows   = qs.filter(q => !q.explanation || !q.explanation.trim()).length;

    el.innerHTML = `
      <div class="admin-stat-grid">
        <div class="admin-stat"><div class="admin-stat-val ${thinStrands>0?'admin-health-warn':'admin-health-ok'}">${thinStrands}</div><div class="admin-stat-lbl">Thin strands (&lt;5q)</div></div>
        <div class="admin-stat"><div class="admin-stat-val ${missingDok>0?'admin-health-warn':'admin-health-ok'}">${missingDok}</div><div class="admin-stat-lbl">Strands missing DoK 2/3</div></div>
        <div class="admin-stat"><div class="admin-stat-val ${noSkillRows>0?'admin-health-warn':'admin-health-ok'}">${noSkillRows}</div><div class="admin-stat-lbl">Missing skill tag</div></div>
        <div class="admin-stat"><div class="admin-stat-val ${noExpRows>0?'admin-health-warn':'admin-health-ok'}">${noExpRows}</div><div class="admin-stat-lbl">Missing explanation</div></div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">🔬 Strand Health</div>
        <table class="admin-table">
          <thead><tr><th>Curriculum</th><th>Strand</th><th>Total</th><th>DoK 1</th><th>DoK 2</th><th>DoK 3</th><th>Word picker</th><th>Issues</th></tr></thead>
          <tbody>${rows.map(r => {
            const issues = [];
            if (r.total < 5)           issues.push('⚠️ thin');
            if (!r.dok[2] && !r.dok[3]) issues.push('⚠️ DoK');
            if (r.noSkill > 0)          issues.push(`⚠️ ${r.noSkill} no skill`);
            if (r.noExp > 0)            issues.push(`⚠️ ${r.noExp} no exp`);
            return `<tr>
              <td><span style="font-size:11px;color:var(--pp-text-muted)">${r.curriculum === 'french_cm1' ? '🇫🇷' : '📐'}</span></td>
              <td>${r.strand || '<em style="color:var(--pp-text-muted)">none</em>'}</td>
              <td><strong>${r.total}</strong></td>
              <td>${r.dok[1]||0}</td>
              <td class="${!r.dok[2]?'admin-health-warn':''}">${r.dok[2]||0}</td>
              <td class="${!r.dok[3]?'admin-health-warn':''}">${r.dok[3]||0}</td>
              <td>${r.wp}</td>
              <td style="font-size:11px">${issues.join(' ') || '<span class="admin-health-ok">✓</span>'}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--pp-error);padding:2rem;">❌ ${e.message}</div>`;
  }
}

/* ── Debug tab ── */
function adminRenderDebug() {
  const el = document.getElementById('admin-content');
  el.innerHTML = `
    <div class="admin-card">
      <div class="admin-card-title">🔧 Session Info</div>
      <table class="admin-table">
        <tbody>
          <tr><td>User ID</td><td style="font-family:monospace;font-size:11px">${currentUser?.id || '—'}</td></tr>
          <tr><td>Email</td><td>${currentUser?.email || '—'}</td></tr>
          <tr><td>Role</td><td>${isAdmin() ? '🔑 Admin' : 'Family'}</td></tr>
          <tr><td>Curriculum</td><td>${currentCurriculum}</td></tr>
          <tr><td>Questions loaded</td><td>${ALL_QUESTIONS.length}</td></tr>
          <tr><td>Session ID</td><td style="font-family:monospace;font-size:11px">${typeof SESSION_ID !== 'undefined' ? SESSION_ID : '—'}</td></tr>
          <tr><td>Supabase URL</td><td style="font-family:monospace;font-size:11px">${SUPA_URL}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="admin-card">
      <div class="admin-card-title">⚡ Actions</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="admin-btn" onclick="adminForceReload()">🔄 Force reload questions</button>
        <button class="admin-btn" onclick="adminClearProgress()">🗑️ Clear my local progress</button>
        <button class="admin-btn" onclick="updateDash();alert('Dashboard refreshed')">📊 Refresh dashboard</button>
        <button class="admin-btn admin-btn--danger" onclick="adminClearLocalStorage()">⚠️ Clear all localStorage</button>
      </div>
    </div>
    <div class="admin-card">
      <div class="admin-card-title">📦 Question Bank</div>
      <div id="admin-debug-qbank" style="font-size:var(--pp-font-small-size);color:var(--pp-text-secondary);line-height:1.8;">
        ${(() => {
          const byCurr = {};
          ALL_QUESTIONS.forEach(q => {
            const c = q.sec.startsWith('MA') || q.sec.startsWith('QR') ? 'isee_lower' : 'french_cm1';
            if (!byCurr[c]) byCurr[c] = { total:0, mcq:0, wp:0 };
            byCurr[c].total++;
            if (q.type === 'word_picker') byCurr[c].wp++; else byCurr[c].mcq++;
          });
          return Object.entries(byCurr).map(([c,v]) =>
            `<div>${c === 'french_cm1' ? '🇫🇷' : '📐'} <strong>${c}</strong>: ${v.total} questions (${v.mcq} MCQ, ${v.wp} word picker)</div>`
          ).join('') || '<div>No questions loaded</div>';
        })()}
      </div>
    </div>`;
}

function adminForceReload() {
  ALL_QUESTIONS = [];
  Object.keys(TAXONOMY).forEach(k => delete TAXONOMY[k]);
  fetchQuestionBank().then(() => alert('✅ Question bank reloaded: ' + ALL_QUESTIONS.length + ' questions'));
}

function adminClearProgress() {
  Object.keys(chosen).forEach(k => delete chosen[k]);
  Object.keys(statuses).forEach(k => delete statuses[k]);
  Object.keys(attempts).forEach(k => delete attempts[k]);
  localStorage.removeItem('pp_progress_' + currentCurriculum);
  alert('✅ Local progress cleared');
}

function adminClearLocalStorage() {
  if (!confirm('Clear ALL localStorage? This will reset curriculum preference and saved progress.')) return;
  localStorage.clear();
  alert('✅ localStorage cleared. Reloading…');
  location.reload();
}

let authToken   = null;

let appBooted  = false;  // true once user has authenticated and been routed
let tutorBooted = false; // true once tutor has entered the app


function setQAFilter(filter) {
  qaFilter = filter;
  ['all','generated','user','manual'].forEach(f => {
    const el = document.getElementById('qa-filter-' + f);
    if (!el) return;
    el.style.background = f === filter ? '#4c1d95' : 'white';
    el.style.color      = f === filter ? 'white'   : '#4c1d95';
  });
  loadQAReview();
}

function qaNewQuestion() {
  // Hide review areas, show blank edit panel
  document.getElementById('qa-area').innerHTML = '';
  document.getElementById('qa-counter').style.display = 'none';
  document.getElementById('qa-taxonomy').style.display = 'none';
  document.getElementById('qa-actions').style.display = 'none';
  document.getElementById('qa-done-msg').style.display = 'none';
  document.getElementById('qa-status').textContent = '';

  // Clear edit fields
  document.getElementById('qa-edit-text').value = '';
  document.getElementById('qa-edit-a').value = '';
  document.getElementById('qa-edit-b').value = '';
  document.getElementById('qa-edit-c').value = '';
  document.getElementById('qa-edit-d').value = '';
  document.getElementById('qa-edit-correct').value = '0';
  document.getElementById('qa-edit-exp').value = '';
  document.getElementById('qa-edit-type').value = 'mcq';
  document.getElementById('qa-edit-tokens').value = '';
  document.getElementById('qa-edit-correct-tokens').value = '';
  qaOnTypeChange();
  // Populate section dropdown for current curriculum
  const sectionEl = document.getElementById('qa-edit-section');
  if (sectionEl) {
    const sections = currentCurriculum === 'french_cm1'
      ? [{v:'GR',l:'GR — Grammaire'},{v:'VO',l:'VO — Vocabulaire'},{v:'CO',l:'CO — Compréhension'},{v:'EX',l:'EX — Expression'}]
      : [{v:'MA',l:'MA — Mathematics Achievement'},{v:'QR',l:'QR — Quantitative Reasoning'}];
    sectionEl.innerHTML = sections.map(s => `<option value="${s.v}">${s.l}</option>`).join('');
  }
  document.getElementById('qa-edit-dok').value = '1';
  document.getElementById('qa-edit-skill').value = '';
  qaOnSectionChange(); // populate strands for selected section

  // Change edit panel title and save button behaviour
  const panel = document.getElementById('qa-edit-panel');
  panel.querySelector('div').textContent = '➕ New Question';
  panel.style.display = 'block';

  // Override save button to insert new question
  const saveBtn = panel.querySelector('button:last-child');
  saveBtn.textContent = '💾 Save Question';
  saveBtn.onclick = qaInsertNewQuestion;

  // Override cancel to reload QA
  const cancelBtn = panel.querySelector('button:first-child');
  cancelBtn.onclick = () => {
    panel.style.display = 'none';
    panel.querySelector('div').textContent = '✏️ Edit Question';
    saveBtn.onclick = qaSaveEdit;
    cancelBtn.onclick = qaCancelEdit;
    // Tutors go back to home screen, admins reload QA queue
    if (tutorStudentId) {
      showScreen('screen-home');
    } else {
      loadQAReview();
    }
  };
}

async function qaInsertNewQuestion() {
  const saveBtn = document.getElementById('qa-edit-panel').querySelector('button:last-child');
  saveBtn.textContent = '⏳ Saving…'; saveBtn.disabled = true;

  const section = document.getElementById('qa-edit-section')?.value || 'MA';
  try {
    // Get next question ID
    const idRes = await fetch(
      SUPA_URL + '/rest/v1/' + Q_TABLE + '?select=question_id&section=eq.' + section,
      { headers: authHeaders() }
    );
    const existingIds = idRes.ok ? await idRes.json() : [];
    const prefix = section + '-';
    const maxNum = existingIds
      .map(r => parseInt(r.question_id.replace(prefix,'')))
      .filter(n => !isNaN(n))
      .reduce((a,b) => Math.max(a,b), 0);
    const newId = prefix + (maxNum + 1);

    const qType      = document.getElementById('qa-edit-type').value;
    const tokensRaw  = document.getElementById('qa-edit-tokens')?.value || '';
    const ctokensRaw = document.getElementById('qa-edit-correct-tokens')?.value || '';

    const goLive = isAdmin(); // admin → active immediately; tutors → goes to QA review
    const newQ = {
      question_id:   newId,
      section:       section,
      text:          document.getElementById('qa-edit-text').value.trim(),
      opt_a:         qType === 'mcq' ? document.getElementById('qa-edit-a').value.trim() : null,
      opt_b:         qType === 'mcq' ? document.getElementById('qa-edit-b').value.trim() : null,
      opt_c:         qType === 'mcq' ? document.getElementById('qa-edit-c').value.trim() : null,
      opt_d:         qType === 'mcq' ? document.getElementById('qa-edit-d').value.trim() : null,
      correct_index: qType === 'mcq' ? parseInt(document.getElementById('qa-edit-correct').value) : null,
      explanation:   document.getElementById('qa-edit-exp').value.trim(),
      strand:        document.getElementById('qa-edit-strand').value,
      dok:           parseInt(document.getElementById('qa-edit-dok').value),
      skill:         document.getElementById('qa-edit-skill').value,
      active:        goLive,
      source:        'manual',
      curriculum:    currentCurriculum,
      created_by:    currentUser ? currentUser.id : null,
      assigned_to:   tutorMode && tutorStudentId ? tutorStudentId : null,
      type:          qType,
      tokens:        qType === 'word_picker' ? tokensRaw.split(',').map(t => t.trim()).filter(Boolean) : null,
      correct_tokens:qType === 'word_picker' ? ctokensRaw.split(',').map(t => t.trim()).filter(Boolean) : null,
    };

    const res = await fetch(SUPA_URL + '/rest/v1/' + Q_TABLE, {
      method: 'POST',
      headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(newQ)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    if (goLive) {
      // Add to local question bank immediately
      ALL_QUESTIONS.push({
        n: newId, sec: section, text: newQ.text,
        opts: [newQ.opt_a, newQ.opt_b, newQ.opt_c, newQ.opt_d],
        ans: newQ.correct_index, exp: newQ.explanation,
        assigned_to: newQ.assigned_to, created_by: newQ.created_by,
        type: newQ.type, tokens: newQ.tokens, correct_tokens: newQ.correct_tokens
      });
      await fetchQuestionBank();
      alert(`✅ Question ${newId} created and live!`);
    } else {
      alert(`✅ Question ${newId} submitted for review. It will go live once approved.`);
    }

    // Reset panel
    const panel = document.getElementById('qa-edit-panel');
    panel.style.display = 'none';
    panel.querySelector('div').textContent = '✏️ Edit Question';
    const sb = panel.querySelector('button:last-child');
    sb.onclick = qaSaveEdit; sb.textContent = '💾 Save changes'; sb.disabled = false;
    const cb = panel.querySelector('button:first-child');
    cb.onclick = qaCancelEdit;

    // Tutors go back to home, admins reload QA
    if (tutorStudentId) {
      showScreen('screen-home');
    } else {
      loadQAReview();
    }
  } catch(e) {
    alert('❌ Could not save: ' + e.message);
  } finally {
    saveBtn.textContent = '💾 Save Question';
    saveBtn.disabled = false;
  }
}

async function loadQAReview() {
  const statusEl  = document.getElementById('qa-status');
  const counterEl = document.getElementById('qa-counter');
  const taxEl     = document.getElementById('qa-taxonomy');
  const areaEl    = document.getElementById('qa-area');
  const actionsEl = document.getElementById('qa-actions');
  const navEl     = document.getElementById('qa-nav');
  const doneEl    = document.getElementById('qa-done-msg');
  const editEl    = document.getElementById('qa-edit-panel');

  statusEl.textContent = '⏳ Loading questions…';
  statusEl.style.display = 'block';
  counterEl.style.display = 'none';
  taxEl.style.display = 'none';
  areaEl.innerHTML = '';
  actionsEl.style.display = 'none';
  navEl.style.display = 'none';
  doneEl.style.display = 'none';
  if (editEl) editEl.style.display = 'none';

  try {
    let allRows = [];

    // Fetch from generated_questions (pending)
    if (qaFilter === 'all' || qaFilter === 'generated') {
      const r1 = await fetch(
        SUPA_URL + '/rest/v1/generated_questions?status=eq.pending&select=*&order=generated_at.asc',
        { headers: authHeaders() }
      );
      if (r1.ok) {
        const rows = await r1.json();
        rows.forEach(r => { r._source = 'generated'; r._table = 'generated_questions'; });
        allRows.push(...rows);
      }
    }

    // Fetch from questions (active=false) — filtered by current curriculum
    if (qaFilter === 'all' || qaFilter === 'user' || qaFilter === 'manual') {
      let url = SUPA_URL + '/rest/v1/' + Q_TABLE + '?active=eq.false&curriculum=eq.' + currentCurriculum + '&select=*&order=question_id';
      if (qaFilter === 'user')   url += '&source=eq.user';
      if (qaFilter === 'manual') url += '&source=eq.manual';
      const r2 = await fetch(url, { headers: authHeaders() });
      if (r2.ok) {
        const rows = await r2.json();
        rows.forEach(r => {
          r._source      = r.source || 'manual';
          r._table       = 'questions';
          r.target_topic = r.sub ? `${r.sub} (DoK${r.dok})` : '';
        });
        allRows.push(...rows);
      }
    }

    if (allRows.length === 0) {
      statusEl.style.display = 'none';
      doneEl.style.display = 'block';
      return;
    }
    qaQuestions = allRows;
    qaIdx = 0;
    statusEl.style.display = 'none';
    qaRender();
  } catch(e) {
    statusEl.textContent = '❌ Could not load: ' + e.message;
  }
}

function qaGo(i) {
  if (i < 0 || i >= qaQuestions.length) return;
  qaIdx = i;
  qaRender();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function qaRender() {
  const row = qaQuestions[qaIdx];
  if (!row) return;
  const tax = topicToTaxonomy(row.target_topic, row.section);
  const dokLabel = ['', 'DoK 1 — Recall', 'DoK 2 — Conceptual', 'DoK 3 — Analytical'][row.dok || tax?.dok] || '';

  const counterEl = document.getElementById('qa-counter');
  counterEl.style.display = 'flex';
  document.getElementById('qa-counter-text').textContent = `Question ${qaIdx + 1} of ${qaQuestions.length} pending`;

  // Section badge — dynamic per curriculum
  const sectionLabels = {
    'MA': 'Mathematics Achievement', 'QR': 'Quantitative Reasoning',
    'GR': 'Grammaire', 'VO': 'Vocabulaire', 'CO': 'Compréhension', 'EX': 'Expression'
  };
  const sectionColors = {
    'MA': {bg:'#dbeafe',col:'#1e40af'}, 'QR': {bg:'#d1fae5',col:'#065f46'},
    'GR': {bg:'#f5f3ff',col:'#4c1d95'}, 'VO': {bg:'#fef9c3',col:'#92400e'},
    'CO': {bg:'#f0fdf4',col:'#065f46'}, 'EX': {bg:'#fff7ed',col:'#c2410c'}
  };
  const badge = document.getElementById('qa-section-badge');
  const sc = sectionColors[row.section] || {bg:'#f1f5f9',col:'#475569'};
  badge.textContent = sectionLabels[row.section] || row.section;
  badge.style.background = sc.bg;
  badge.style.color = sc.col;

  // Fix 1: remove redundant ID/Topic header — taxonomy shown in question card below
  const taxEl = document.getElementById('qa-taxonomy');
  taxEl.style.display = 'none';

  // Build question body based on type
  let questionBody;
  if (row.type === 'word_picker') {
    const tokens = row.tokens || [];
    const correct = new Set(row.correct_tokens || []);
    const tokenBtns = tokens.map(t =>
      `<button class="wp-token ${correct.has(t) ? 'wp-correct' : ''}" disabled style="cursor:default;">${t}</button>`
    ).join('');
    questionBody = `<div class="wp-tokens">${tokenBtns}</div>
      <div style="font-size:var(--pp-font-small-size);color:var(--pp-text-secondary);margin-top:8px;">
        ✓ Correct: <strong>${[...correct].join(', ')}</strong>
      </div>`;
  } else {
    const opts = [row.opt_a, row.opt_b, row.opt_c, row.opt_d].map((o, i) => {
      const isCorrect = i === row.correct_index;
      return `<button class="opt${isCorrect ? ' correct-ans' : ''}" disabled style="cursor:default;">
        <span class="badge">${['A','B','C','D'][i]}</span><span>${o ?? '—'}</span>
      </button>`;
    }).join('');
    questionBody = `<div class="options">${opts}</div>`;
  }

  const expHtml = row.explanation
    ? `<div class="feedback correct show"><div class="fb-title">📖 Explanation</div>${row.explanation}</div>`
    : `<div class="feedback incorrect show"><div class="fb-title">⚠ No explanation provided</div></div>`;

  document.getElementById('qa-area').innerHTML = `
    <div class="q-card">
      <div class="q-meta ${row.section.toLowerCase()}">${row.question_id}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
        <span style="font-size:0.72rem;padding:2px 8px;border-radius:10px;background:#f1f5f9;color:#475569;font-weight:600;">${row.strand || '—'}</span>
        <span style="font-size:0.72rem;padding:2px 8px;border-radius:10px;background:#fef9c3;color:#92400e;font-weight:600;">${row.dok ? 'DoK ' + row.dok : '—'}</span>
        ${row.skill ? `<span style="font-size:0.72rem;padding:2px 8px;border-radius:10px;background:#f0fdf4;color:#065f46;font-weight:600;">${row.skill}</span>` : ''}
      </div>
      <div class="q-text">${formatText(row.text)}</div>
      ${row.diag ? `<div class="q-diagram">${diagrams(row.diag)}</div>` : ''}
      ${questionBody}
      ${expHtml}
    </div>`;

  document.getElementById('qa-actions').style.display = 'flex';
  const navEl = document.getElementById('qa-nav');
  navEl.style.display = 'flex';
  document.getElementById('qa-btn-prev').disabled = qaIdx === 0;
  document.getElementById('qa-btn-next').disabled = qaIdx === qaQuestions.length - 1;
}

/* ════════════════════════════════════════
   QA EDIT FUNCTIONS
════════════════════════════════════════ */
function qaStartEdit() {
  const row = qaQuestions[qaIdx];
  if (!row) return;

  // Populate section dropdown for current curriculum
  const sectionEl = document.getElementById('qa-edit-section');
  if (sectionEl) {
    const sections = currentCurriculum === 'french_cm1'
      ? [{v:'GR',l:'GR — Grammaire'},{v:'VO',l:'VO — Vocabulaire'},{v:'CO',l:'CO — Compréhension'},{v:'EX',l:'EX — Expression'}]
      : [{v:'MA',l:'MA — Mathematics Achievement'},{v:'QR',l:'QR — Quantitative Reasoning'}];
    sectionEl.innerHTML = sections.map(s => `<option value="${s.v}" ${s.v === row.section ? 'selected' : ''}>${s.l}</option>`).join('');
  }

  // Populate strand and skill dropdowns based on the question's section
  const currentStrand = row.strand || '';
  const currentDok    = row.dok    || 2;
  const currentSkill  = row.skill  || '';

  // Populate strands for the question's section
  qaPopulateStrands(currentStrand);
  // Select correct skill
  const skillEl = document.getElementById('qa-edit-skill');
  if (skillEl) skillEl.value = currentSkill;

  document.getElementById('qa-edit-dok').value = String(currentDok);

  // Populate edit fields from current row
  document.getElementById('qa-edit-text').value    = row.text || '';
  document.getElementById('qa-edit-a').value       = row.opt_a || '';
  document.getElementById('qa-edit-b').value       = row.opt_b || '';
  document.getElementById('qa-edit-c').value       = row.opt_c || '';
  document.getElementById('qa-edit-d').value       = row.opt_d || '';
  document.getElementById('qa-edit-correct').value = String(row.correct_index ?? 0);
  document.getElementById('qa-edit-exp').value     = row.explanation || '';
  // Type + token fields
  const qType = row.type || 'mcq';
  document.getElementById('qa-edit-type').value = qType;
  document.getElementById('qa-edit-tokens').value         = (row.tokens || []).join(', ');
  document.getElementById('qa-edit-correct-tokens').value = (row.correct_tokens || []).join(', ');
  qaOnTypeChange(); // show/hide correct fields
  // Show edit panel, hide action buttons
  document.getElementById('qa-edit-panel').style.display = 'block';
  document.getElementById('qa-actions').style.display    = 'none';
  // Scroll edit panel into view
  document.getElementById('qa-edit-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function qaCancelEdit() {
  document.getElementById('qa-edit-panel').style.display = 'none';
  document.getElementById('qa-actions').style.display    = 'flex';
}

function qaOnTypeChange() {
  const type = document.getElementById('qa-edit-type').value;
  document.getElementById('qa-edit-mcq-fields').style.display = type === 'mcq' ? '' : 'none';
  document.getElementById('qa-edit-wp-fields').style.display  = type === 'word_picker' ? '' : 'none';
}

async function qaSaveEdit() {
  const row = qaQuestions[qaIdx];
  if (!row) return;
  const saveBtn = document.querySelector('#qa-edit-panel button:last-child');
  saveBtn.textContent = '⏳ Saving…';
  saveBtn.disabled = true;

  const qType = document.getElementById('qa-edit-type').value;
  const tokensRaw  = document.getElementById('qa-edit-tokens')?.value || '';
  const ctokensRaw = document.getElementById('qa-edit-correct-tokens')?.value || '';

  const updates = {
    text:          document.getElementById('qa-edit-text').value.trim(),
    explanation:   document.getElementById('qa-edit-exp').value.trim(),
    strand:        document.getElementById('qa-edit-strand').value,
    dok:           parseInt(document.getElementById('qa-edit-dok').value),
    skill:         document.getElementById('qa-edit-skill').value,
    created_by:    currentUser ? currentUser.id : null,
    assigned_to:   tutorMode && tutorStudentId ? tutorStudentId : null,
    type:          qType,
    // MCQ fields
    opt_a:         qType === 'mcq' ? document.getElementById('qa-edit-a').value.trim() : null,
    opt_b:         qType === 'mcq' ? document.getElementById('qa-edit-b').value.trim() : null,
    opt_c:         qType === 'mcq' ? document.getElementById('qa-edit-c').value.trim() : null,
    opt_d:         qType === 'mcq' ? document.getElementById('qa-edit-d').value.trim() : null,
    correct_index: qType === 'mcq' ? parseInt(document.getElementById('qa-edit-correct').value) : null,
    // Word picker fields
    tokens:        qType === 'word_picker' ? tokensRaw.split(',').map(t => t.trim()).filter(Boolean) : null,
    correct_tokens:qType === 'word_picker' ? ctokensRaw.split(',').map(t => t.trim()).filter(Boolean) : null,
  };

  try {
    const table   = row._table === 'questions' ? Q_TABLE : 'generated_questions';
    const idField = row._table === 'questions' ? 'question_id=eq.' + row.question_id : 'id=eq.' + row.id;
    const res = await fetch(SUPA_URL + '/rest/v1/' + table + '?' + idField, {
      method: 'PATCH',
      headers: {
        ...authHeaders(), 'Prefer': 'return=minimal'
      },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    // Update local copy so re-render shows the edits
    Object.assign(qaQuestions[qaIdx], updates);

    // Close edit panel and re-render
    document.getElementById('qa-edit-panel').style.display = 'none';
    document.getElementById('qa-actions').style.display    = 'flex';
    qaRender();
  } catch(e) {
    alert('❌ Could not save: ' + e.message);
  } finally {
    saveBtn.textContent = '💾 Save changes';
    saveBtn.disabled = false;
  }
}

async function qaDecide(decision) {
  const row = qaQuestions[qaIdx];
  if (!row) return;
  const actionsEl = document.getElementById('qa-actions');
  actionsEl.style.display = 'none';

  try {
    if (row._table === 'questions') {
      if (decision === 'approved') {
        const res = await fetch(SUPA_URL + '/rest/v1/' + Q_TABLE + '?question_id=eq.' + row.question_id, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ active: true })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const newQ = { n: row.question_id, sec: row.section, text: row.text,
          opts: [row.opt_a, row.opt_b, row.opt_c, row.opt_d], ans: row.correct_index, exp: row.explanation || '',
          assigned_to: row.assigned_to || null, created_by: row.created_by || null,
          type: row.type || 'mcq', tokens: row.tokens || null, correct_tokens: row.correct_tokens || null };
        if (row.diag) newQ.diag = row.diag;
        if (row.strand) TAXONOMY[row.question_id] = { strand: row.strand, dok: row.dok, skill: row.skill || null };
        ALL_QUESTIONS.push(newQ);
        ALL_QUESTIONS.sort((a, b) => {
          const [as, an] = [a.n.split('-')[0], parseInt(a.n.split('-')[1])||0];
          const [bs, bn] = [b.n.split('-')[0], parseInt(b.n.split('-')[1])||0];
          return as !== bs ? as.localeCompare(bs) : an - bn;
        });
        updateDash();
      } else {
        // Rejected — delete from questions table so it doesn't reappear
        await fetch(SUPA_URL + '/rest/v1/' + Q_TABLE + '?question_id=eq.' + row.question_id, {
          method: 'DELETE',
          headers: { ...authHeaders(), 'Prefer': 'return=minimal' }
        });
      }

    } else {
      // ── generated_questions table: INSERT into questions, PATCH status ──
      let newQuestionId = row.question_id;
      if (decision === 'approved') {
        const idRes = await fetch(
          SUPA_URL + '/rest/v1/' + Q_TABLE + '?select=question_id&section=eq.' + row.section,
          { headers: authHeaders() }
        );
        const existingIds = idRes.ok ? await idRes.json() : [];
        const prefix = row.section === 'MA' ? 'MA-' : 'QR-';
        const maxNum = existingIds
          .map(r => parseInt(r.question_id.replace(prefix, '')))
          .filter(n => !isNaN(n))
          .reduce((a, b) => Math.max(a, b), 0);
        newQuestionId = `${prefix}${maxNum + 1}`;
        const tax = topicToTaxonomy(row.target_topic, row.section);
        const insertRes = await fetch(SUPA_URL + '/rest/v1/' + Q_TABLE + '', {
          method: 'POST',
          headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            question_id: newQuestionId, section: row.section,
            text: row.text, opt_a: row.opt_a, opt_b: row.opt_b, opt_c: row.opt_c, opt_d: row.opt_d,
            correct_index: row.correct_index, explanation: row.explanation || '',
            diag: null, strand: tax?.strand||null, dok: tax?.dok||null,
            source: 'generated', active: true,
            curriculum: currentCurriculum,
            created_by: currentUser ? currentUser.id : null,
            assigned_to: tutorMode && tutorStudentId ? tutorStudentId : null,
          })
        });
        if (!insertRes.ok) throw new Error('Insert failed: HTTP ' + insertRes.status);
        const newQ = { n: newQuestionId, sec: row.section, text: row.text,
          opts: [row.opt_a, row.opt_b, row.opt_c, row.opt_d], ans: row.correct_index, exp: row.explanation||'' };
        if (tax) TAXONOMY[newQuestionId] = tax;
        ALL_QUESTIONS.push(newQ);
        updateDash();
      }
      const patchBody = { status: decision === 'approved' ? 'promoted' : 'rejected' };
      if (decision === 'approved') patchBody.question_id = newQuestionId;
      const patchRes = await fetch(SUPA_URL + `/rest/v1/generated_questions?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify(patchBody)
      });
      if (!patchRes.ok) throw new Error('Patch failed: HTTP ' + patchRes.status);
    }

    // Remove from pending list and advance
    qaQuestions.splice(qaIdx, 1);
    if (qaQuestions.length === 0) {
      document.getElementById('qa-counter').style.display  = 'none';
      document.getElementById('qa-taxonomy').style.display = 'none';
      document.getElementById('qa-area').innerHTML         = '';
      document.getElementById('qa-nav').style.display      = 'none';
      actionsEl.style.display                              = 'none';
      document.getElementById('qa-done-msg').style.display = 'block';
      return;
    }
    if (qaIdx >= qaQuestions.length) qaIdx = qaQuestions.length - 1;
    actionsEl.style.display = 'flex';
    qaRender();
  } catch(e) {
    actionsEl.style.display = 'flex';
    alert('❌ Could not save: ' + e.message);
  }
}


/* ════════════════════════════════════════
   QA TAXONOMY OPTIONS (global)
════════════════════════════════════════ */
const QA_SKILL_OPTIONS = {
  // ISEE Lower Level
  'Whole Numbers':                     ['Adding & Subtracting Integers','Multiplying & Dividing Integers','Order of Operations','Place Value & Standard Form','Factors, Multiples & Divisibility','Prime & Composite Numbers','Remainder Problems','Whole Number Word Problems'],
  'Decimals, Fractions & Percentages': ['Adding & Subtracting Decimals','Multiplying & Dividing Decimals','Adding & Subtracting Fractions & Mixed Numbers','Comparing & Ordering Fractions & Decimals','Converting Between Fractions, Decimals & Percents','Fraction & Percent of a Quantity','Estimating with Fractions & Decimals','Ratio & Proportion Word Problems'],
  'Algebraic Thinking':                ['Numerical & Shape Patterns','Input/Output & Function Tables','Writing & Translating Expressions','Solving 1-Variable Equations','Solving Multi-Step & Symbol Equations','Linear Relationships & Word Problems','Patterns & Sequences'],
  'Measurement':                       ['Perimeter of Polygons','Area of Rectangles, Squares & Triangles','Area & Perimeter of Composite Figures','Volume of Solids','Missing Side given Area or Perimeter','Unit Conversions & Time','Angles in Triangles & Polygons'],
  'Geometry':                          ['Identifying & Classifying Shapes','Symmetry, Transformations & Views of 3D','Coordinate Planes'],
  'Data Analysis & Prob.':             ['Reading Tables & Graphs','Mean, Median & Mode','Simple Probability','Data Interpretation & Inference','Interpreting Data & Graphs'],
  // French CM1 — GR Grammaire
  'Conjugaison':              ['Les verbes du 1er groupe au présent','Les verbes du 2ème groupe au présent','Les verbes du 3ème groupe au présent','Les verbes irréguliers au présent (être, avoir, aller, faire)','Le passé composé (avoir et être)','L\'imparfait','Le futur simple','L\'impératif'],
  'Nature des mots':          ['Le nom et le déterminant','Le groupe nominal (nom noyau, épithète)','Les déterminants (articles définis, indéfinis, possessifs, démonstratifs)','L\'adjectif qualificatif','Le pronom personnel sujet','Les pronoms personnels compléments','Le verbe','L\'adverbe','Les conjonctions de coordination'],
  'Fonctions':                ['Le sujet du verbe','Le complément d\'objet direct','Le complément d\'objet indirect','Les compléments circonstanciels'],
  'Accord':                   ['Accord sujet-verbe','Accord du nom et de l\'adjectif','Le féminin des noms et des adjectifs','Le pluriel des noms et des adjectifs','La chaîne d\'accords dans le groupe nominal','Accord du participe passé avec être','Accord du participe passé avec avoir'],
  'Types de phrases':         ['Phrase affirmative & négative','Phrase interrogative','Phrase exclamative & impérative','La ponctuation'],
  'Homophones grammaticaux':  ['Distinguer a / à','Distinguer son / sont','Distinguer et / est','Distinguer on / ont / on n\'','Distinguer ou / où','Distinguer ce / se','Distinguer ces / ses / mes / mais','Distinguer c\'est / s\'est','Distinguer la / là / l\'a / l\'as'],
  // French CM1 — VO Vocabulaire
  'Sens des mots':            ['Utiliser le dictionnaire','Synonymes & antonymes','Homophones lexicaux','Sens propre & sens figuré','Polysémie'],
  'Formation des mots':       ['Préfixes','Suffixes','Familles de mots','Mots composés'],
  'Champ lexical':            ['Identifier le champ lexical'],
  // French CM1 — CO Compréhension
  'Compréhension globale':    ['Identifier l\'idée principale','Dégager le thème d\'un texte','Identifier le type de texte (narratif, théâtre, poème, documentaire)','Identifier l\'intention de l\'auteur'],
  'Compréhension détaillée':  ['Repérer les informations explicites','Reconstituer la chronologie','Identifier les personnages & leurs relations'],
  'Inférences':               ['Déduire des informations implicites','Comprendre les causes & conséquences','Identifier le point de vue du narrateur'],
  'Vocabulaire en contexte':  ['Trouver le sens d\'un mot en contexte'],
  // French CM1 — EX Expression
  'Construction de phrases':  ['Construire une phrase simple correcte','Construire une phrase complexe','Utiliser les connecteurs logiques','Transformer une phrase (négation, interrogation)'],
  'Structure du texte':       ['Identifier & rédiger une introduction','Organiser un paragraphe','Utiliser les temps verbaux de façon cohérente'],
};

const QA_STRANDS_BY_SECTION = {
  // ISEE
  'MA': ['Whole Numbers','Decimals, Fractions & Percentages','Algebraic Thinking','Measurement','Geometry','Data Analysis & Prob.'],
  'QR': ['Whole Numbers','Decimals, Fractions & Percentages','Algebraic Thinking','Measurement','Geometry','Data Analysis & Prob.'],
  // French CM1
  'GR': ['Conjugaison','Nature des mots','Fonctions','Accord','Types de phrases','Homophones grammaticaux'],
  'VO': ['Sens des mots','Formation des mots','Champ lexical'],
  'CO': ['Compréhension globale','Compréhension détaillée','Inférences','Vocabulaire en contexte'],
  'EX': ['Construction de phrases','Structure du texte'],
};

const QA_STRANDS_BY_CURRICULUM = {
  'isee_lower': ['Whole Numbers','Decimals, Fractions & Percentages','Algebraic Thinking','Measurement','Geometry','Data Analysis & Prob.'],
  'french_cm1': ['Conjugaison','Nature des mots','Fonctions','Accord','Types de phrases','Homophones grammaticaux','Sens des mots','Formation des mots','Champ lexical','Compréhension globale','Compréhension détaillée','Inférences','Vocabulaire en contexte','Construction de phrases','Structure du texte'],
};

function qaOnSectionChange() {
  const section = document.getElementById('qa-edit-section')?.value;
  const strandEl = document.getElementById('qa-edit-strand');
  if (!strandEl) return;
  const strands = QA_STRANDS_BY_SECTION[section] || QA_STRANDS_BY_CURRICULUM[currentCurriculum] || [];
  strandEl.innerHTML = strands.map(s => `<option value="${s}">${s}</option>`).join('');
  qaOnStrandChange();
}

function qaPopulateStrands(selectedStrand) {
  const section = document.getElementById('qa-edit-section')?.value;
  const strandEl = document.getElementById('qa-edit-strand');
  const strands = (section && QA_STRANDS_BY_SECTION[section])
    ? QA_STRANDS_BY_SECTION[section]
    : QA_STRANDS_BY_CURRICULUM[currentCurriculum] || QA_STRANDS_BY_CURRICULUM['isee_lower'];
  strandEl.innerHTML = strands.map(s => `<option value="${s}" ${s === selectedStrand ? 'selected' : ''}>${s}</option>`).join('');
  qaOnStrandChange();
}

function qaOnStrandChange() {
  const strand  = document.getElementById('qa-edit-strand').value;
  const skillEl = document.getElementById('qa-edit-skill');
  skillEl.innerHTML = (QA_SKILL_OPTIONS[strand] || []).map(s => `<option value="${s}">${s}</option>`).join('');
}

// Expose globally
window.qaOnStrandChange   = qaOnStrandChange;
window.qaOnSectionChange  = qaOnSectionChange;
window.qaPopulateStrands  = qaPopulateStrands;

/* ════════════════════════════════════════════
   TAXONOMY — Update when new questions are added
════════════════════════════════════════════ */
/* ════════════════════════════════════════
   QUESTION BANK — fetch from Supabase
   Converts Supabase rows → ALL_QUESTIONS shape
   and populates TAXONOMY
════════════════════════════════════════ */
function setLoadState(pct, msg) {
  document.getElementById('load-bar').style.width = pct + '%';
  document.getElementById('load-msg').textContent = msg;
}

async function fetchQuestionBank() {
  // Show loading bar
  const loadEl = document.getElementById('screen-loading');
  if (loadEl) loadEl.style.display = 'flex';
  try {
    setLoadState(20, 'Fetching questions…');

    // Fetch all active questions from Supabase
    const res = await fetch(
      SUPA_URL + '/rest/v1/' + Q_TABLE + '?active=eq.true&curriculum=eq.' + currentCurriculum + '&select=*',
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();

    setLoadState(60, `Building question bank (${rows.length} questions)…`);

    // Convert Supabase rows → ALL_QUESTIONS shape
    ALL_QUESTIONS = rows.map(r => {
      const q = {
        n:             r.question_id,
        sec:           r.section,
        text:          r.text,
        opts:          [r.opt_a, r.opt_b, r.opt_c, r.opt_d],
        ans:           r.correct_index,
        exp:           r.explanation || '',
        assigned_to:   r.assigned_to || null,
        created_by:    r.created_by  || null,
        type:          r.type || 'mcq',
        tokens:        r.tokens || null,
        correct_tokens:r.correct_tokens || null,
      };
      if (r.diag) q.diag = r.diag;
      return q;
    });

    // Sort numerically by question number (MA-1, MA-2... not MA-1, MA-10, MA-11)
    ALL_QUESTIONS.sort((a, b) => {
      const [aSec, aNum] = [a.n.split('-')[0], parseInt(a.n.split('-')[1]) || 0];
      const [bSec, bNum] = [b.n.split('-')[0], parseInt(b.n.split('-')[1]) || 0];
      if (aSec !== bSec) return aSec.localeCompare(bSec);
      return aNum - bNum;
    });

    // Populate TAXONOMY from Supabase rows
    rows.forEach(r => {
      if (r.strand) {
        TAXONOMY[r.question_id] = { strand: r.strand, dok: r.dok || null, skill: r.skill || null };
      }
    });

    setLoadState(90, 'Loading your progress…');

    // Now run the rest of the init that depends on ALL_QUESTIONS
    loadProgress();
    await Promise.all([updateDash(), loadPoints()]);

    setLoadState(100, 'Ready!');

    // Small delay so user sees 100% briefly, then hide the banner and show home
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('screen-loading').style.display = 'none';
    // Ensure admin button is visible for admin users
    const adminBtn = document.getElementById('home-admin-btn');
    if (adminBtn) adminBtn.style.display = isAdmin() ? '' : 'none';
    showScreen('screen-home');
    refreshTotalPoints();
    updateCatAvatar();

  } catch(e) {
    const banner = document.getElementById('screen-loading');
    banner.style.background = '#dc2626';
    document.getElementById('load-msg').textContent = '❌ ' + e.message + ' — check connection';
    document.getElementById('load-bar').style.background = '#fca5a5';
    console.error('fetchQuestionBank failed:', e);
  }
}



const STRANDS = [
  "Numbers & Operations",
  "Algebraic Thinking",
  "Geometry",
  "Measurement",
  "Data Analysis & Prob."
];

function computeHeatDataFromRows(rows) {
  // Build heat data from Supabase rows — latest attempt per question
  const data = {};
  STRANDS.forEach(s => { data[s] = {1:{c:0,t:0}, 2:{c:0,t:0}, 3:{c:0,t:0}}; });
  // Get latest result per question_id
  const latest = {};
  rows.forEach(r => { if (!latest[r.question_id]) latest[r.question_id] = r; });
  Object.values(latest).forEach(r => {
    const tx = TAXONOMY[r.question_id];
    if (!tx) return;
    data[tx.strand][tx.dok].t++;
    if (r.correct) data[tx.strand][tx.dok].c++;
  });
  return data;
}

function applyHeatData(data) {
  const el = document.getElementById('heat-grid-body');
  if (!el) return;
  el.innerHTML = STRANDS.map(s => {
    const cells = [1,2,3].map(d => {
      const {c,t} = data[s][d];
      if (t === 0) return `<div class="hc"><div class="hcell hc-none">—</div></div>`;
      const pct = Math.round(c/t*100);
      const cls = pct >= 70 ? 'hc-strong' : pct >= 50 ? 'hc-ok' : 'hc-weak';
      return `<div class="hc"><div class="hcell ${cls}">${pct}%<br><span style="font-size:10px;opacity:0.7;">${c}/${t}</span></div></div>`;
    }).join('');
    const shortName = s.replace('Numbers & Operations','Numbers & Ops').replace('Data Analysis & Prob.','Data & Prob.');
    return `<div class="heat-row"><div class="hc">${shortName}</div>${cells}</div>`;
  }).join('');
}

async function renderHeatGrid() {
  const el = document.getElementById('heat-grid-body');
  if (!el) return;
  // Show loading state
  el.innerHTML = `<div class="heat-row"><div class="hc" style="grid-column:span 4;color:var(--color-text-tertiary);font-size:12px;padding:14px;">Loading performance data…</div></div>`;
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/' + R_STAGING + '?select=question_id,correct&user_id=eq.' + userId() + '&curriculum=eq.' + currentCurriculum + '&order=answered_at.desc&limit=500', {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    if (rows.length === 0) {
      el.innerHTML = `<div class="heat-row"><div class="hc" style="grid-column:span 4;color:var(--color-text-tertiary);font-size:12px;padding:14px;">Answer some questions to see your performance map</div></div>`;
      return;
    }
    applyHeatData(computeHeatDataFromRows(rows));
  } catch(e) {
    el.innerHTML = `<div class="heat-row"><div class="hc" style="grid-column:span 4;color:var(--color-text-tertiary);font-size:12px;padding:14px;">Could not load data — check connection</div></div>`;
  }
}

// Initialise on load — auth first, then questions
initAuth();
