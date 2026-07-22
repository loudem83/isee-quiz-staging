async function initAuth() {
  const { data: { session } } = await supaClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    authToken   = session.access_token;
    // Fetch display name for the continue button
    const bar = document.getElementById('login-user-bar');
    const emailEl = document.getElementById('login-user-email');
    if (bar) bar.style.display = 'block';
    if (emailEl) emailEl.textContent = session.user.email;
    // Try to get display name from profiles
    try {
      const pr = await fetch(SUPA_URL + '/rest/v1/profiles?id=eq.' + session.user.id + '&select=display_name', { headers: authHeaders() });
      const rows = pr.ok ? await pr.json() : [];
      const displayName = rows.length > 0 && rows[0].display_name ? rows[0].display_name : session.user.email.split('@')[0];
      document.getElementById('login-btn').textContent = 'Continue as ' + displayName + ' →';
    } catch(e) {
      document.getElementById('login-btn').textContent = 'Continue as ' + session.user.email.split('@')[0] + ' →';
    }
    document.getElementById('login-btn').onclick = onSignedIn;
    showScreen('screen-login');
  } else {
    showScreen('screen-login');
  }
  supaClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      authToken   = session.access_token;
      // Only route on first sign-in — never re-route on tab focus
      if (!appBooted) onSignedIn();
    } else if (event === 'TOKEN_REFRESHED' && session) {
      authToken = session.access_token;
    } else if (event === 'SIGNED_OUT') {
      currentUser = null; authToken = null;
      appBooted = false; tutorBooted = false;
      const btn = document.getElementById('login-btn');
      if (btn) { btn.textContent = 'Sign in →'; btn.onclick = doLogin; }
      const bar = document.getElementById('login-user-bar');
      if (bar) bar.style.display = 'none';
      showScreen('screen-login');
    }
  });
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');
  errEl.style.display = 'none';
  if (!email || !password) { showLoginError('Please enter your email and password.'); return; }
  btn.disabled = true; btn.textContent = 'Signing in…';
  const { data, error } = await supaClient.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Sign in →';
  if (error) { showLoginError(error.message); return; }
  currentUser = data.user;
  authToken   = data.session.access_token;
  onSignedIn();
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

async function signOut() {
  await supaClient.auth.signOut();
  currentUser = null; authToken = null; appBooted = false;
  // Reset tutor state
  tutorMode = false; tutorStudentId = null; tutorStudentName = '';
  // Reset app state
  Object.keys(chosen).forEach(k => delete chosen[k]);
  Object.keys(statuses).forEach(k => delete statuses[k]);
  Object.keys(hintedOptions).forEach(k => delete hintedOptions[k]);
  userPoints = 0;
  totalPoints = 0;
  ALL_QUESTIONS = [];
  // Reset UI
  const btn = document.getElementById('login-btn');
  if (btn) { btn.textContent = 'Sign in →'; btn.onclick = doLogin; }
  const bar = document.getElementById('login-user-bar');
  if (bar) bar.style.display = 'none';
  const banner = document.getElementById('tutor-session-banner');
  if (banner) banner.style.display = 'none';
  const studioBtn = document.getElementById('home-studio-btn');
  if (studioBtn) studioBtn.style.display = 'none';
  showScreen('screen-login');
}

async function onSignedIn() {
  if (appBooted) return;
  appBooted = true; // Set immediately — blocks any re-entry from SIGNED_IN events

  // Check role
  const profile = await getUserRole();
  const role = profile.role || 'family';

  if (role === 'tutor') {
    // Tutor — show student picker, hide QA button on home screen
    const qaBtn = document.getElementById('home-qa-btn');
    if (qaBtn) qaBtn.style.display = 'none';
    // Admin gets the admin button even if role is tutor
    const adminBtn = document.getElementById('home-admin-btn');
    if (adminBtn) adminBtn.style.display = isAdmin() ? '' : 'none';
    const tutorAdminBtn = document.getElementById('tutor-admin-btn');
    if (tutorAdminBtn) tutorAdminBtn.style.display = isAdmin() ? '' : 'none';
    showScreen('screen-tutor');
    loadTutorStudents();
    return;
  }

  // Family — boot app, hide all tutor UI elements
  const qaBtn     = document.getElementById('home-qa-btn');
  const studioBtn = document.getElementById('home-studio-btn');
  const banner    = document.getElementById('tutor-session-banner');
  if (qaBtn)     qaBtn.style.display     = '';
  if (studioBtn) studioBtn.style.display = 'none';
  if (banner)    banner.style.display    = 'none';

  // Show admin button for admin users
  const adminBtn = document.getElementById('home-admin-btn');
  if (adminBtn) adminBtn.style.display = isAdmin() ? '' : 'none';

  // Family — update greeting and boot app
  const email = currentUser.email || '';
  const name  = profile.display_name || currentUser.user_metadata?.display_name || email.split('@')[0];

  // Store name globally for use across the app
  window.currentChildName = name;

  updateGreeting();
  updateCurriculumUI();
  updateCatAvatar();

  // Show name in quiz top bar
  const quizTitle = document.getElementById('quiz-title');
  if (quizTitle) quizTitle.textContent = `${name}'s Quiz`;
  fetchQuestionBank();
}

// Expose auth functions to global scope for inline handlers

window.showAdmin          = showAdmin;
window.switchAdminTab     = switchAdminTab;
window.adminRenderUsage   = adminRenderUsage;
window.launchQAReview     = launchQAReview;
window.launchNewQuestion  = launchNewQuestion;
window.adminForceReload   = adminForceReload;
window.adminClearProgress = adminClearProgress;
window.adminClearLocalStorage = adminClearLocalStorage;
window.doLogin            = doLogin;
window.signOut            = signOut;
window.exitTutorSession   = exitTutorSession;
window.enterTutorSession  = enterTutorSession;
window.launchTutorQA      = launchTutorQA;
window.startTutorWorkout  = startTutorWorkout;
window.setCurriculum      = setCurriculum;
window.updateCatAvatar    = updateCatAvatar;
window.updateGreeting     = updateGreeting;
window.updateStreak       = updateStreak;
window.toggleDrillCard    = toggleDrillCard;
window.filterDrillCards   = filterDrillCards;
window.startAssessment    = startAssessment;
window.qaOnStrandChange   = qaOnStrandChange;

/* ════════════════════════════════════════
   CAT CHAT
════════════════════════════════════════ */