const CAT_CHAT_EDGE_URL = 'https://yajqvfwzhudghivzgijt.supabase.co/functions/v1/cat-chat';

let catChatHistory   = [];
let catChatExchanges = 0;

function getWeakTopic() {
  // Find weakest skill from quiz results (built in updateDash)
  if (window._weakestSkill) return window._weakestSkill;
  return 'maths'; // fallback
}

let _chatScrollY = 0;


function getWeakTopic() {
  // Find weakest skill from quiz results (built in updateDash)
  if (window._weakestSkill) return window._weakestSkill;
  return 'maths'; // fallback
}


function openCatChat() {
  const childName = window.currentChildName || 'friend';
  const catName   = 'Mochi';

  const cardNameEl = document.getElementById('catCardName');
  if (cardNameEl) cardNameEl.textContent = catName;
  const headerNameEl = document.getElementById('catChatHeaderName');
  if (headerNameEl) headerNameEl.textContent = catName;

  catChatHistory   = [];
  catChatExchanges = 0;

  const isFrench = currentCurriculum === 'french_cm1';
  const greeting = isFrench
    ? 'Purrr ! Bonjour ' + childName + ' ! Je suis ' + catName + ' — trop content de te voir ! 🐾'
    : 'Purrr! Hi ' + childName + '! I\'m ' + catName + ' — so happy to see you! 🐾';

  document.getElementById('catChatOverlay').classList.add('open');
  document.getElementById('catChatMessages').innerHTML = '';
  appendCatMsg(greeting);
  setTimeout(() => document.getElementById('catChatInput').focus(), 300);
}

function closeCatChat() {
  document.getElementById('catChatOverlay').classList.remove('open');
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('catChatOverlay')) closeCatChat();
}

async function catChatSend() {
  const input = document.getElementById('catChatInput');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  document.getElementById('catChatSend').disabled = true;

  appendChildMsg(text);
  catChatHistory.push({ role: 'user', content: text });

  const typingId = appendTypingIndicator();

  try {
    const res = await fetch(CAT_CHAT_EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken,
      },
      body: JSON.stringify({
        messages:      catChatHistory,
        childName:     window.currentChildName || 'friend',
        catName:       'Mochi',
        weakTopic:     getWeakTopic(),
        currentTopic:  window._weakestSkill || getWeakTopic(),
        points:        totalPoints || 0,
        recentScore:   window._recentScore || null,
        curriculum:    currentCurriculum,
        exchangeCount: catChatExchanges,
      }),
    });

    const data = await res.json();
    removeTypingIndicator(typingId);
    catChatHistory.push({ role: 'assistant', content: data.reply });
    catChatExchanges++;
    appendCatMsg(data.reply);
  } catch(e) {
    removeTypingIndicator(typingId);
    appendCatMsg('Meow... something went wrong! Try again? 🐾');
  }

  document.getElementById('catChatSend').disabled = false;
  document.getElementById('catChatInput').focus();
}

function appendCatMsg(text) {
  const msgs = document.getElementById('catChatMessages');
  const wrap = document.createElement('div');
  wrap.className = 'cat-msg-wrap';
  wrap.innerHTML = '<div class="cat-msg-bubble">' + text + '</div>';
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendChildMsg(text) {
  const msgs = document.getElementById('catChatMessages');
  const wrap = document.createElement('div');
  wrap.className = 'child-msg-wrap';
  wrap.innerHTML = '<div class="child-msg-bubble">' + text + '</div>';
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendTypingIndicator() {
  const msgs = document.getElementById('catChatMessages');
  const wrap = document.createElement('div');
  wrap.className = 'cat-msg-wrap';
  const id = 'cat-typing-' + Date.now();
  wrap.id = id;
  wrap.innerHTML = '<div class="cat-msg-bubble cat-typing"><span></span><span></span><span></span></div>';
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── Quiz contextual help ── //
let _quizHelpQ = null; // current question context for quiz chat

async function openQuizHelp(qn) {
  const q = curQs.find(q2 => String(q2.n) === String(qn)) || curQs[cur];
  if (!q) { return; }

  const overlay = document.getElementById('catChatOverlay');
  if (!overlay) { return; }

  _quizHelpQ = q;
  const tax      = TAXONOMY[q.n] || {};
  const strand   = tax.strand || '';
  const skill    = tax.skill  || strand;
  const isFrench    = currentCurriculum === 'french_cm1';
  const childName   = window.currentChildName || 'friend';
  const catName     = 'Mochi';

  // Build a silent user message asking for the rule
  // Include question text so Mochi explains the right concept
  const questionContext = q.type === 'word_picker'
    ? `Question: "${q.text}" (word picker format)`
    : `Question: "${q.text}" Options: ${(q.opts||[]).filter(Boolean).map((o,i)=>['A','B','C','D'][i]+') '+o).join(' | ')}`;

  const ruleRequest = isFrench
    ? `Explique-moi la règle générale pour répondre à ce type de question. ${questionContext}`
    : `Explain the general rule or strategy I need to answer this type of question. ${questionContext}`;

  // Reset chat and open overlay
  catChatHistory   = [];
  catChatExchanges = 0;

  // Set header name
  const headerNameEl = document.getElementById('catChatHeaderName');
  if (headerNameEl) headerNameEl.textContent = catName;

  document.getElementById('catChatOverlay').classList.add('open');
  document.getElementById('catChatMessages').innerHTML = '';

  // Show greeting
  const greeting = isFrench
    ? `Purrr ! Bonjour ${childName} ! Je vais t'expliquer la règle pour **${skill || strand}** ! 🐾`
    : `Purrr! Hi ${childName}! Let me explain how to tackle **${skill || strand}**! 🐾`;
  appendCatMsg(greeting);

  // Pre-seed history with the rule request (silent — user doesn't see this)
  catChatHistory.push({ role: 'user', content: ruleRequest });

  // Show typing indicator while fetching rule
  const typingId = appendTypingIndicator();
  document.getElementById('catChatSend').disabled = true;

  try {
    const res = await fetch(CAT_CHAT_EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken,
      },
      body: JSON.stringify({
        messages:      catChatHistory,
        childName,
        catName,
        weakTopic:     skill || strand,
        currentTopic:  skill || strand,
        points:        userPoints || 0,
        recentScore:   window._recentScore || null,
        curriculum:    currentCurriculum,
        exchangeCount: catChatExchanges,
        helpMode:      'rule', // hint to edge fn (future use)
      }),
    });
    const data = await res.json();
    removeTypingIndicator(typingId);
    catChatHistory.push({ role: 'assistant', content: data.reply });
    catChatExchanges++;
    appendCatMsg(data.reply);
  } catch(e) {
    removeTypingIndicator(typingId);
    appendCatMsg(isFrench ? 'Miaou... essaie encore ! 🐾' : 'Meow... something went wrong! Try again? 🐾');
  }

  document.getElementById('catChatSend').disabled = false;
  setTimeout(() => document.getElementById('catChatInput').focus(), 100);
}

window.openQuizHelp = openQuizHelp;

window.closeCatChat       = closeCatChat;
window.handleOverlayClick = handleOverlayClick;
window.catChatSend        = catChatSend;

// Wire up Enter key
document.addEventListener('DOMContentLoaded', function() {
  const input = document.getElementById('catChatInput');
  if (input) input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') catChatSend();
  });
});
window.qaNewQuestion      = qaNewQuestion;
