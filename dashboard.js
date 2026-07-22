async function updateDash() {
  const total = ALL_QUESTIONS.length;

  // Fetch full answer history
  let rows = [];
  try {
    const dashUrl = SUPA_URL + '/rest/v1/' + R_STAGING + '?select=question_id,correct,answered_at&user_id=eq.' + userId() + '&curriculum=eq.' + currentCurriculum + '&order=answered_at.desc&limit=2000';
    const res = await fetch(dashUrl, {
      headers: authHeaders()
    });
    if (res.ok) rows = await res.json();
  } catch(e) { console.error('updateDash error:', e); return; }

  // Score = total correct / total answers (includes retries)
  const totalAnswers = rows.length;
  const totalCorrect = rows.filter(r => r.correct).length;
  const score = totalAnswers ? Math.round(totalCorrect / totalAnswers * 100) : null;
  // Latest per question for done/remaining counts
  const latest = {};
  rows.forEach(r => { if (!latest[r.question_id]) latest[r.question_id] = r; });
  const latestVals = Object.values(latest);
  const done  = latestVals.length;
  const corr  = latestVals.filter(r => r.correct).length;
  const remaining = Math.max(0, total - done);



  // Week boundaries (Mon 00:00 local)
  function weekStart(weeksAgo) {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const diffToMon = (day + 6) % 7; // days since last Mon
    const mon = new Date(now);
    mon.setDate(now.getDate() - diffToMon - (weeksAgo * 7));
    mon.setHours(0,0,0,0);
    return mon;
  }
  const thisWeekStart = weekStart(0);
  const lastWeekStart = weekStart(1);

  // Count questions answered this week / last week (all attempts, not just latest)
  const twRows = rows.filter(r => new Date(r.answered_at) >= thisWeekStart);
  const lwRows = rows.filter(r => {
    const d = new Date(r.answered_at);
    return d >= lastWeekStart && d < thisWeekStart;
  });

  // Unique questions per week
  const twUniq = new Set(twRows.map(r => r.question_id));
  const lwUniq = new Set(lwRows.map(r => r.question_id));
  const twCount = twUniq.size;
  const lwCount = lwUniq.size;

  // Correct % per week
  const twLatest = {};
  twRows.forEach(r => { if (!twLatest[r.question_id]) twLatest[r.question_id] = r; });
  const twCorr = Object.values(twLatest).filter(r => r.correct).length;
  const twPct  = twCount ? Math.round(twCorr / twCount * 100) : null;

  const lwLatest = {};
  lwRows.forEach(r => { if (!lwLatest[r.question_id]) lwLatest[r.question_id] = r; });
  const lwCorr = Object.values(lwLatest).filter(r => r.correct).length;
  const lwPct  = lwCount ? Math.round(lwCorr / lwCount * 100) : null;

  // Bar widths — scale relative to the larger of the two
  const maxW = Math.max(twCount, lwCount, 1);
  const twBarW = Math.round(twCount / maxW * 100);
  const lwBarW = Math.round(lwCount / maxW * 100);

  // Skill weakness — based on raw correct/total per skill
  const skillMapWeak = {};
  rows.forEach(r => {
    const tax = TAXONOMY[r.question_id];
    if (!tax || !tax.skill) return;
    if (!skillMapWeak[tax.skill]) skillMapWeak[tax.skill] = { c:0, t:0, strand: tax.strand };
    skillMapWeak[tax.skill].t++;
    if (r.correct) skillMapWeak[tax.skill].c++;
  });
  const weakSkills = Object.entries(skillMapWeak)
    .filter(([,v]) => v.t >= 2)
    .map(([skill, v]) => ({ skill, pct: Math.round(v.c / v.t * 100), strand: v.strand }))
    .sort((a,b) => a.pct - b.pct)
    .slice(0, 3);

  // Expose weakest skill and recent score for cat chat
  if (weakSkills.length > 0) window._weakestSkill = weakSkills[0].skill;
  if (score !== null) window._recentScore = score;

  // Compute streak from quiz results
  computeStreak(rows);

  // ── Update DOM ──────────────────────────────────────────────────────
  const snapDone = document.getElementById('snap-done');
  const snapScore = document.getElementById('snap-score');
  const snapWeek = document.getElementById('snap-thisweek');
  const snapRem = document.getElementById('snap-remaining');
  const snapTwCount = document.getElementById('snap-tw-count');
  const snapLwCount = document.getElementById('snap-lw-count');
  const snapTwPct = document.getElementById('snap-tw-pct');
  const snapLwPct = document.getElementById('snap-lw-pct');
  const snapBarTw = document.getElementById('snap-bar-tw');
  const snapBarLw = document.getElementById('snap-bar-lw');

  if (snapDone) snapDone.textContent      = done;
  if (snapScore) snapScore.textContent    = score !== null ? score + '%' : '—';
  if (snapWeek) snapWeek.textContent      = twCount;
  if (snapRem) snapRem.textContent        = remaining;
  if (snapTwCount) snapTwCount.textContent = twCount;
  if (snapLwCount) snapLwCount.textContent = lwCount;
  if (snapTwPct) snapTwPct.textContent    = twPct !== null ? twPct + '% ✓' : '—';
  if (snapLwPct) snapLwPct.textContent    = lwPct !== null ? lwPct + '% ✓' : '—';
  if (snapBarTw) snapBarTw.style.width    = twBarW + '%';
  if (snapBarLw) snapBarLw.style.width    = lwBarW + '%';

  // Boost section
  const boostEl = document.getElementById('snap-boost');
  if (boostEl) {
    if (weakSkills.length === 0) {
      boostEl.innerHTML = '<div style="font-size:0.82rem;color:#94a3b8;">Answer more questions to see your focus areas.</div>';
    } else {
      boostEl.innerHTML = weakSkills.map(s => {
        const col = s.pct < 50 ? '#E24B4A' : s.pct < 80 ? '#BA7517' : '#639922';
        const safeSkillKey = encodeURIComponent((s.strand||'') + '|||' + s.skill);
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:0.5px solid #f1f5f9;cursor:pointer;" data-sk="${safeSkillKey}" onclick="startDrillSkill(this.dataset.sk, true)">
          <div style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;"></div>
          <div style="font-size:0.82rem;color:#334155;flex:1;">${s.skill}</div>
          <div style="font-size:0.75rem;font-weight:600;color:${col};">${s.pct}% 1st attempt</div>
          <div style="font-size:0.8rem;color:#94a3b8;">→</div>
        </div>`;
      }).join('');
    }
  }
}

/* ════════════════════════════════════════
   PARENT DASHBOARD
════════════════════════════════════════ */
async function loadParentDash() {
  document.getElementById('pd-status').textContent = 'Loading results…';
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/' + R_STAGING + '?select=*&user_id=eq.' + userId() + '&curriculum=eq.' + currentCurriculum + '&order=answered_at.desc&limit=500',
      { headers: authHeaders() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    renderParentDash(rows);
  } catch(e) {
    document.getElementById('pd-status').textContent = '❌ Could not load: ' + e.message;
  }
}

function renderParentDash(rows) {
  if (rows.length === 0) {
    document.getElementById('pd-status').textContent = 'No results yet.';
    document.getElementById('pd-content').innerHTML = '';
    return;
  }
  document.getElementById('pd-status').textContent = '';

  const sessions = {};
  rows.forEach(r => { if (!sessions[r.session_id]) sessions[r.session_id] = []; sessions[r.session_id].push(r); });
  const latest = {};
  rows.forEach(r => { if (!latest[r.question_id]) latest[r.question_id] = r; });
  const latestVals = Object.values(latest);
  const totalAns   = latestVals.length;
  const totalCor   = rows.filter(r => r.correct).length;
  const pct        = rows.length ? Math.round(totalCor / rows.length * 100) : 0;
  const sessionCount = Object.keys(sessions).length;
  const remaining  = Math.max(0, ALL_QUESTIONS.length - totalAns);

  // Skill performance
  const skillStats = {};
  const skillQuestions = {};
  rows.forEach(r => {
    const tax = TAXONOMY[r.question_id];
    if (!tax || !tax.skill) return;
    const key = (tax.strand||'') + '|||' + tax.skill;
    if (!skillStats[key]) skillStats[key] = { strand: tax.strand, skill: tax.skill, correct: 0, total: 0 };
    skillStats[key].total++;
    if (r.correct) skillStats[key].correct++;
    if (!skillQuestions[key]) skillQuestions[key] = [];
    const existing = skillQuestions[key].find(q => q.question_id === r.question_id);
    if (!existing) skillQuestions[key].push(r);
  });

  // DoK performance
  const dokStats = { 1:{c:0,t:0}, 2:{c:0,t:0}, 3:{c:0,t:0} };
  rows.forEach(r => {
    const tax = TAXONOMY[r.question_id];
    if (!tax || !tax.dok) return;
    dokStats[tax.dok].t++;
    if (r.correct) dokStats[tax.dok].c++;
  });

  // Session scores for chart
  const sessionScores = Object.keys(sessions).sort().slice(-12).map(sid => {
    const sr = sessions[sid];
    const c  = sr.filter(r => r.correct).length;
    return { date: sid.slice(5,10), pct: Math.round(c/sr.length*100) };
  });

  // Strand grouping
  const strandOrder  = QA_STRANDS_BY_CURRICULUM[currentCurriculum] || QA_STRANDS_BY_CURRICULUM['isee_lower'];
  const strandLabels = Object.fromEntries((QA_STRANDS_BY_CURRICULUM[currentCurriculum] || QA_STRANDS_BY_CURRICULUM['isee_lower']).map(s => [s, s]));
  const childName    = window.currentChildName || 'Your';

  function scoreColor(p) {
    if (p >= 85) return { bar: 'var(--pp-success)',   text: 'var(--pp-success)' };
    if (p >= 70) return { bar: '#639922',              text: '#3B6D11' };
    if (p >= 55) return { bar: 'var(--pp-primary)',   text: 'var(--pp-primary)' };
    if (p >= 40) return { bar: '#EF9F27',              text: '#BA7517' };
    return             { bar: '#E24B4A',               text: '#A32D2D' };
  }

  function statNumClass(p) {
    if (p >= 80) return 'green';
    if (p >= 60) return 'orange';
    return 'red';
  }

  // Skill rows (new design)
  function skillRows(strand) {
    return Object.values(skillStats)
      .filter(s => s.strand === strand)
      .sort((a,b) => a.skill.localeCompare(b.skill))
      .map(s => {
        const p   = Math.round(s.correct / s.total * 100);
        const col = scoreColor(p);
        const safe = encodeURIComponent((s.strand||'') + '|||' + s.skill);
        return `<div class="pd-skill-row" onclick="pdShowSkillDrill('${safe}')">
          <div class="pd-skill-name">${s.skill}</div>
          <div class="pd-skill-bar-track"><div class="pd-skill-bar-fill" style="width:${p}%;background:${col.bar};"></div></div>
          <div class="pd-skill-pct" style="color:${col.text};">${p}%</div>
          <div class="pd-skill-count">${s.total}q</div>
          <div class="pd-skill-chevron">›</div>
        </div>`;
      }).join('');
  }

  // Strand blocks
  const strandBlocks = strandOrder.map(strand => {
    const strandSkills = Object.values(skillStats).filter(s => s.strand === strand);
    if (strandSkills.length === 0) return '';
    const sc  = strandSkills.reduce((s,x) => s+x.correct, 0);
    const st  = strandSkills.reduce((s,x) => s+x.total,   0);
    const sp  = st ? Math.round(sc/st*100) : 0;
    const col = scoreColor(sp);
    return `<div class="pd-strand-card">
      <div class="pd-strand-header">
        <div class="pd-strand-name">${strandLabels[strand]||strand}</div>
        <div class="pd-strand-pct" style="color:${col.text};">${sp}%</div>
      </div>
      ${skillRows(strand)}
    </div>`;
  }).join('');

  // DoK cards
  const dokLabels = {1:'DoK 1 — recall', 2:'DoK 2 — apply', 3:'DoK 3 — analyse'};
  const dokCards  = [1,2,3].map(d => {
    const p   = dokStats[d].t ? Math.round(dokStats[d].c/dokStats[d].t*100) : null;
    const col = p !== null ? scoreColor(p) : { text: 'var(--pp-text-muted)' };
    return `<div class="pd-dok-card">
      <div class="pd-dok-label">${dokLabels[d]}</div>
      <div class="pd-dok-pct" style="color:${col.text};">${p !== null ? p+'%' : '—'}</div>
      <div class="pd-dok-count">${dokStats[d].t} answered</div>
    </div>`;
  }).join('');

  // Stat colour for % correct card
  const pctClass  = statNumClass(pct);
  const pctBg     = pct >= 80 ? 'background:var(--pp-success-bg);' : pct >= 60 ? 'background:var(--pp-surface-warm);' : 'background:#FCEBEB;';
  const pctSubCol = pct >= 80 ? 'color:var(--pp-success);' : pct >= 60 ? 'color:var(--pp-primary);' : 'color:#A32D2D;';

  window._pdSkillQuestions = skillQuestions;

  document.getElementById('pd-content').innerHTML = `

    <div style="margin-bottom:var(--pp-space-lg);">
      <div class="pp-intro-heading">${childName}'s results</div>
      <div class="pp-intro-text">${CURRICULA[currentCurriculum]?.label || 'Math'} · All time</div>
    </div>

    <!-- Overview -->
    <div class="pd-card">
      <div class="pd-sec-title">Overview</div>
      <div class="pd-stat-grid">
        <div class="pd-stat">
          <div class="pd-stat-num">${totalAns}</div>
          <div class="pd-stat-lbl">Questions answered</div>
        </div>
        <div class="pd-stat" style="${pctBg}">
          <div class="pd-stat-num ${pctClass}">${pct}%</div>
          <div class="pd-stat-lbl" style="${pctSubCol}">% Correct</div>
          <div class="pd-stat-sub">incl. retries</div>
        </div>
        <div class="pd-stat">
          <div class="pd-stat-num">${sessionCount}</div>
          <div class="pd-stat-lbl">Sessions</div>
        </div>
        <div class="pd-stat">
          <div class="pd-stat-num orange">${remaining}</div>
          <div class="pd-stat-lbl">Remaining</div>
        </div>
      </div>
    </div>

    <!-- DoK -->
    <div class="pd-card">
      <div class="pd-sec-title">DoK breakdown</div>
      <div class="pd-dok-grid">${dokCards}</div>
    </div>

    <!-- Progress over time -->
    ${sessionScores.length >= 2 ? `
    <div class="pd-card">
      <div class="pd-sec-title">Progress over time</div>
      <div style="position:relative;height:180px;">
        <canvas id="pd-progress-chart" role="img" aria-label="Line chart showing score per session">${sessionScores.map(s=>s.date+': '+s.pct+'%').join(', ')}</canvas>
      </div>
    </div>` : ''}

    <!-- Performance by skill -->
    <div class="pd-sec-title" style="margin-bottom:var(--pp-space-md);">
      Performance by skill <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--pp-text-muted);">— click a skill to see questions</span>
    </div>
    <div id="pd-skill-drill" style="display:none;">
      <div class="pd-drill-panel">
        <div class="pd-drill-header">
          <div class="pd-drill-title" id="pd-drill-label"></div>
          <button class="pd-drill-close" onclick="document.getElementById('pd-skill-drill').style.display='none'">✕ Close</button>
        </div>
        <div class="pd-drill-summary" id="pd-drill-summary"></div>
        <div style="border-radius:12px;overflow:hidden;border:1px solid var(--pp-border);">
          <table class="pd-drill-table">
            <thead><tr>
              <th>ID</th>
              <th>Question</th>
              <th style="text-align:center;">Result</th>
              <th style="text-align:center;">Attempts</th>
              <th></th>
            </tr></thead>
            <tbody id="pd-drill-rows"></tbody>
          </table>
        </div>
      </div>
    </div>
    <div>${strandBlocks || '<div style="color:var(--pp-text-muted);font-size:14px;padding:24px 0;">No skill data yet — answer some questions first.</div>'}</div>

    <button class="pd-refresh-btn" onclick="loadParentDash()">↻ Refresh results</button>
  `;

  // Render chart with orange colour
  if (sessionScores.length >= 2) {
    function drawProgressChart(attempts) {
      const canvas = document.getElementById('pd-progress-chart');
      if (!canvas) return;
      if (!window.Chart) {
        if (attempts > 20) return;
        setTimeout(() => drawProgressChart(attempts + 1), 200);
        return;
      }
      new window.Chart(canvas, {
        type: 'line',
        data: {
          labels: sessionScores.map(s => s.date),
          datasets: [{
            data: sessionScores.map(s => s.pct),
            borderColor: '#FF6B00',
            backgroundColor: 'rgba(255,107,0,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#FF6B00',
            pointBorderColor: 'white',
            pointBorderWidth: 2,
            borderWidth: 2.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { min: 0, max: 100, ticks: { callback: v => v+'%', font:{size:11}, color:'#ADADAD' }, grid: { color:'#ECECEC' }, border:{display:false} },
            x: { ticks: { font:{size:11}, color:'#ADADAD' }, grid:{display:false}, border:{display:false} }
          }
        }
      });
    }
    drawProgressChart(0);
  }
}

function pdShowSkillDrill(safeKey) {
  const key = decodeURIComponent(safeKey);
  const [strand, skill] = key.split('|||');
  const qs = (window._pdSkillQuestions || {})[key] || [];
  if (qs.length === 0) return;

  const correct = qs.filter(r => r.correct).length;
  const pct     = Math.round(correct / qs.length * 100);

  document.getElementById('pd-drill-label').textContent   = skill + ' — ' + pct + '% correct';
  document.getElementById('pd-drill-summary').textContent =
    correct + ' correct, ' + (qs.length - correct) + ' incorrect out of ' + qs.length + ' attempted';

  const sorted = [...qs].sort((a,b) => a.question_id.localeCompare(b.question_id, undefined, {numeric:true}));
  window._pdDrillPool = sorted.map(r => r.question_id);

  document.getElementById('pd-drill-rows').innerHTML = sorted.map(r => {
    const q       = ALL_QUESTIONS.find(q => String(q.n) === r.question_id);
    const preview = q ? q.text.split('\n')[0].slice(0,60) + (q.text.length > 60 ? '…' : '') : r.question_id;
    const ok      = r.correct;
    return `<tr onclick="pdOpenQuestion('${r.question_id}')">
      <td style="color:var(--pp-text-muted);white-space:nowrap;">${r.question_id}</td>
      <td style="color:var(--pp-text);">${preview}</td>
      <td style="text-align:center;"><span class="pd-badge ${ok ? 'correct' : 'wrong'}">${ok ? '✓ Correct' : '✗ Wrong'}</span></td>
      <td style="text-align:center;color:var(--pp-text-secondary);">${r.attempts}</td>
      <td style="text-align:center;color:var(--pp-text-muted);">›</td>
    </tr>`;
  }).join('');

  const drillEl = document.getElementById('pd-skill-drill');
  drillEl.style.display = 'block';
  drillEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pdOpenQuestion(questionId) {
  // Build pool from the current drill list, preserving order
  const pool = (window._pdDrillPool || [questionId])
    .map(id => ALL_QUESTIONS.find(q => String(q.n) === id))
    .filter(Boolean);
  if (pool.length === 0) return;
  const startIdx = pool.findIndex(q => String(q.n) === questionId);
  // Clear answers so questions appear fresh
  pool.forEach(q => { const k = String(q.n); delete chosen[k]; delete statuses[k]; delete hintedOptions[k]; });
  mode = 'drill';
  curQs = pool;
  cur = Math.max(0, startIdx);
  document.getElementById('quiz-title').textContent = 'Review question';
  document.getElementById('bar-fill').className = 'bar-fill all';
  setLastScreen('screen-pd');
  showScreen('screen-quiz');
  renderQ();
}

/* ════════════════════════════════════════
   DIAGNOSTIC
════════════════════════════════════════ */
async function runDiagnostic() {
  const el = document.getElementById('diag-result');
  el.style.display = 'block';
  el.innerHTML = '⏳ Testing…';
  const steps = [];
  try {
    const r1 = await fetch(SUPA_URL + '/rest/v1/', { headers: authHeaders() });
    steps.push('✅ Step 1 — Reached Supabase (HTTP ' + r1.status + ')');
  } catch(e) { steps.push('❌ Step 1 — Cannot reach Supabase: ' + e.message); el.innerHTML = steps.join('<br>'); return; }
  try {
    const r2 = await fetch(SUPA_URL + '/rest/v1/' + R_STAGING + '?limit=1', { headers: authHeaders() });
    steps.push(r2.ok ? '✅ Step 2 — Can READ table' : '❌ Step 2 — READ failed: ' + await r2.text());
  } catch(e) { steps.push('❌ Step 2: ' + e.message); }
  try {
    const r3 = await fetch(SUPA_URL + '/rest/v1/' + R_STAGING + '', {
      method: 'POST',
      headers: {'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Prefer':'return=minimal'},
      body: JSON.stringify({session_id:'diag_test',question_id:'MA-1',section:'MA',correct:true,attempts:1,answered_at:new Date().toISOString()})
    });
    steps.push((r3.status===201||r3.status===200) ? '✅ Step 3 — INSERT succeeded!' : '❌ Step 3 — INSERT failed: ' + await r3.text());
  } catch(e) { steps.push('❌ Step 3: ' + e.message); }
  steps.push('<br><b>🎉 Connection working!</b> Answer a question and click Refresh Results.');
  el.innerHTML = steps.join('<br>');
}

/* ════════════════════════════════════════
   SCREEN NAVIGATION
════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goHome() {
  document.getElementById('workout-reaction').style.display = 'none';
  document.getElementById('workout-countdown').style.display = 'none';
  document.getElementById('streak-badge').classList.remove('show');
  document.getElementById('milestone-banner').classList.remove('show');
  document.getElementById('workout-end').style.display = 'none';
  document.getElementById('bravo-overlay').style.display = 'none';
  setLastScreen(null);
  showScreen('screen-home'); updateDash();
}


/* ════════════════════════════════════════
   TAXONOMY HELPERS FOR GENERATED QUESTIONS
════════════════════════════════════════ */

// Map target_topic string → {strand, sub, dok} for generated questions
function topicToTaxonomy(target_topic, section) {
  if (!target_topic) return null;
  const dokMatch = target_topic.match(/DoK\s*(\d)/i);
  const dok = dokMatch ? parseInt(dokMatch[1]) : 2;
  const topic = target_topic.replace(/\s*\(DoK\s*\d\)/i, '').trim();
  const strandMap = {
    'Fractions & Decimals':    'Numbers & Operations',
    'Whole Number Arithmetic': 'Numbers & Operations',
    'Ratios & Percentages':    'Numbers & Operations',
    'Expressions & Equations': 'Algebraic Thinking',
    'Patterns & Sequences':    'Algebraic Thinking',
    '2D & 3D Shapes':          'Geometry',
    'Coordinate Planes':       'Geometry',
    'Perimeter & Area':        'Measurement',
    'Units & Conversions':     'Measurement',
    'Visual/Spatial Scaling':  'Measurement',
    'Tables & Graphs':         'Data Analysis & Prob.',
    'Mean, Median, Mode':      'Data Analysis & Prob.',
    'Simple Probability':      'Data Analysis & Prob.',
  };
  const strand = strandMap[topic] || (section === 'MA' ? 'Numbers & Operations' : 'Algebraic Thinking');
  return { strand, dok };
}

/* ════════════════════════════════════════
   QA REVIEW
════════════════════════════════════════ */
let qaQuestions = [], qaIdx = 0;

let qaFilter = 'all';
