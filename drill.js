function loadDrill() {
  const statusEl  = document.getElementById('drill-status');
  const contentEl = document.getElementById('drill-content');

  const strandMap = {};
  const skillMap  = {};

  ALL_QUESTIONS.forEach(q => {
    const tax = TAXONOMY[q.n];
    if (!tax) return;
    const strand = tax.strand;
    const skill  = tax.skill || null;
    if (!strandMap[strand]) strandMap[strand] = 0;
    strandMap[strand]++;
    if (skill) {
      const key = strand + '|||' + skill;
      if (!skillMap[key]) skillMap[key] = { strand, skill, count: 0 };
      skillMap[key].count++;
    }
  });

  if (Object.keys(strandMap).length === 0) {
    statusEl.innerHTML = 'No questions found.';
    contentEl.innerHTML = '';
    return;
  }

  const strandOrder = QA_STRANDS_BY_CURRICULUM[currentCurriculum] || QA_STRANDS_BY_CURRICULUM['isee_lower'];
  const total = Object.values(strandMap).reduce((s,c) => s+c, 0);

  statusEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--pp-primary);"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg> ' + total + ' questions across ' + Object.keys(strandMap).length + ' topics';

  // Build strand data for rendering + search
  _drillStrandData = strandOrder.filter(s => strandMap[s]).map(strand => {
    const skills = Object.values(skillMap)
      .filter(s => s.strand === strand)
      .sort((a,b) => a.skill.localeCompare(b.skill));

    return { strand, count: strandMap[strand], skills };
  });

  renderDrillCards(null);
}

function renderDrillCards(expandedStrand) {
  const contentEl = document.getElementById('drill-content');
  if (!contentEl) return;

  let html = '<div class="drill-topic-grid">';
  const PREVIEW = 4;

  _drillStrandData.forEach(({ strand, count, skills }) => {
    const isExpanded = strand === expandedStrand;
    const icon = STRAND_ICONS_SVG[strand] || '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>';
    const safe = encodeURIComponent(strand);
    const hasSkills = skills.length > 0;

    // Skill rows — use data attributes to avoid quote issues with French text
    let skillsHtml = '';
    if (isExpanded) {
      skillsHtml = skills.map(s => {
        const sk = encodeURIComponent(strand + '|||' + s.skill);
        return `<button class="drill-skill-row" data-sk="${sk}" onclick="startDrillSkill(this.dataset.sk);event.stopPropagation();">
          <span class="drill-skill-name">${s.skill}</span>
          <span class="drill-skill-num">${s.count}</span>
        </button>`;
      }).join('');
    } else {
      const preview = skills.slice(0, PREVIEW);
      skillsHtml = preview.map(s => {
        const sk = encodeURIComponent(strand + '|||' + s.skill);
        return `<button class="drill-skill-row" data-sk="${sk}" onclick="startDrillSkill(this.dataset.sk);event.stopPropagation();">
          <span class="drill-skill-name">${s.skill}</span>
          <span class="drill-skill-num">${s.count}</span>
        </button>`;
      }).join('');
      for (let i = preview.length; i < PREVIEW; i++) {
        skillsHtml += `<div class="drill-skill-row drill-skill-row--empty" aria-hidden="true"><span class="drill-skill-name">&nbsp;</span></div>`;
      }
      if (skills.length > PREVIEW) {
        const more = skills.length - PREVIEW;
        skillsHtml += `<button class="drill-more" data-strand="${safe}" onclick="toggleDrillCard(this.dataset.strand);event.stopPropagation();">+ ${more} more strand${more > 1 ? 's' : ''} — tap to expand</button>`;
      } else {
        skillsHtml += `<div class="drill-more drill-more--spacer" aria-hidden="true">&nbsp;</div>`;
      }
    }

    // CTA — use data attributes
    const cta = isExpanded
      ? `<button class="drill-start-btn" data-strand="${safe}" onclick="startDrillStrand(this.dataset.strand);event.stopPropagation();">Start Drill in ${strand} ›</button>`
      : `<div class="drill-explore-row"><button class="drill-explore-btn" data-strand="${safe}" onclick="startDrillStrand(this.dataset.strand);event.stopPropagation();">Start ›</button></div>`;

    html += `
      <div class="drill-topic-card${isExpanded ? ' expanded' : ''}" role="button" tabindex="0"
        data-strand="${safe}" data-hasskills="${hasSkills}"
        onclick="drillCardClick(this)" onkeydown="drillCardKeydown(event,this)">
        <div class="drill-card-top">
          <div class="drill-card-left">
            <div class="pp-topic-icon-circle${strand === 'Whole Numbers' ? ' pp-topic-icon-circle--text' : ''}">${icon}</div>
            <div>
              <div class="drill-card-name">${strand}</div>
              <div class="drill-card-count">${count} questions</div>
            </div>
          </div>
          <div class="drill-chevron">${hasSkills ? (isExpanded ? '∧' : '›') : '▶'}</div>
        </div>
        ${skillsHtml}
        ${cta}
      </div>`;
  });


  contentEl.innerHTML = html;
}


function drillCardKeydown(e, el) {
  if (e.key === 'Enter' || e.key === ' ') drillCardClick(el);
}

function drillCardClick(el) {
  const safe     = el.dataset.strand;
  const hasSkills = el.dataset.hasskills === 'true';
  if (hasSkills) {
    toggleDrillCard(safe);
  } else {
    startDrillStrand(safe);
  }
}

function toggleDrillCard(safeStrand) {
  const strand = decodeURIComponent(safeStrand);
  const cards = document.querySelectorAll('.drill-topic-card');
  // Check if already expanded
  const isCurrentlyExpanded = [...cards].some(c =>
    c.classList.contains('expanded') &&
    c.querySelector('.drill-card-name')?.textContent === strand
  );
  renderDrillCards(isCurrentlyExpanded ? null : strand);
}

function filterDrillCards(query) {
  if (!query.trim()) { renderDrillCards(null); return; }
  const q = query.toLowerCase();
  const contentEl = document.getElementById('drill-content');
  const cards = contentEl.querySelectorAll('.drill-topic-card');
  cards.forEach(card => {
    const name = card.querySelector('.drill-card-name')?.textContent.toLowerCase() || '';
    card.style.display = name.includes(q) ? '' : 'none';
  });
}

function startDrillStrand(safeStrand) {
  const strand = decodeURIComponent(safeStrand);
  const pool = ALL_QUESTIONS.filter(q => {
    const tax = TAXONOMY[q.n];
    return tax && tax.strand === strand;
  });
  if (pool.length === 0) { alert('No questions found for this topic.'); return; }
  // Clear previous answers so questions appear fresh
  pool.forEach(q => { const k = String(q.n); delete chosen[k]; delete statuses[k]; delete hintedOptions[k]; });
  mode = 'drill';
  curQs = pool;
  cur = 0;
  const labels = Object.fromEntries((QA_STRANDS_BY_CURRICULUM[currentCurriculum] || QA_STRANDS_BY_CURRICULUM['isee_lower']).map(s => [s, s]));
  document.getElementById('quiz-title').textContent = labels[strand] || strand;
  document.getElementById('bar-fill').className = 'bar-fill all';
  setLastScreen('screen-drill');
  showScreen('screen-quiz');
  renderQ();
}

function startDrillSkill(safeKey, fromHome) {
  const key = decodeURIComponent(safeKey);
  const [strand, skill] = key.split('|||');
  const pool = ALL_QUESTIONS.filter(q => {
    const tax = TAXONOMY[q.n];
    return tax && tax.strand === strand && tax.skill === skill;
  });
  if (pool.length === 0) { alert('No questions found for this skill.'); return; }
  // Clear answers so questions appear fresh
  pool.forEach(q => { const k = String(q.n); delete chosen[k]; delete statuses[k]; delete hintedOptions[k]; });
  mode = 'drill';
  curQs = pool;
  cur = 0;
  document.getElementById('quiz-title').textContent = skill;
  document.getElementById('bar-fill').className = 'bar-fill all';
  setLastScreen(fromHome ? 'screen-home' : 'screen-drill');
  showScreen('screen-quiz');
  renderQ();
}

/* ════════════════════════════════════════
   PUSH TO QA
════════════════════════════════════════ */