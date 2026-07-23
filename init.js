/* ════════════════════════════════════════
   INIT — loads last, registers all global functions
   and boots the app
════════════════════════════════════════ */

// ── Auth & navigation ──
window.doLogin            = doLogin;
window.signOut            = signOut;
window.exitTutorSession   = exitTutorSession;
window.enterTutorSession  = enterTutorSession;
window.launchTutorQA      = launchTutorQA;
window.startTutorWorkout  = startTutorWorkout;

// ── Home & UI ──
window.setCurriculum      = setCurriculum;
window.updateCatAvatar    = updateCatAvatar;
window.updateGreeting     = updateGreeting;
window.updateStreak       = updateStreak;
window.showScreen         = showScreen;
window.goHome             = goHome;

// ── Admin ──
window.showAdmin              = showAdmin;
window.switchAdminTab         = switchAdminTab;
window.adminRenderUsage       = adminRenderUsage;
window.launchQAReview         = launchQAReview;
window.launchNewQuestion      = launchNewQuestion;
window.adminForceReload       = adminForceReload;
window.adminClearProgress     = adminClearProgress;
window.adminClearLocalStorage = adminClearLocalStorage;

// ── QA ──
window.qaNewQuestion      = qaNewQuestion;
window.qaOnStrandChange   = qaOnStrandChange;
window.qaOnSectionChange  = qaOnSectionChange;
window.qaOnTypeChange     = qaOnTypeChange;
window.qaPopulateStrands  = qaPopulateStrands;
window.qaSaveEdit         = qaSaveEdit;
window.qaCancelEdit       = qaCancelEdit;
window.qaDecide           = qaDecide;
window.qaGo               = qaGo;
window.qaStartEdit        = qaStartEdit;
window.setQAFilter        = setQAFilter;
window.pushToQA           = pushToQA;

// ── Drill ──
window.toggleDrillCard    = toggleDrillCard;
window.filterDrillCards   = filterDrillCards;
window.drillCardClick     = drillCardClick;
window.drillCardKeydown   = drillCardKeydown;
window.startDrillStrand   = startDrillStrand;
window.startDrillSkill    = startDrillSkill;
window.startAssessment    = startAssessment;

// ── Quiz & workout ──
window.pick               = pick;
window.go                 = go;
window.pickToken          = pickToken;
window.submitWordPicker   = submitWordPicker;
window.fbTapToken         = fbTapToken;
window.fbClearBlank       = fbClearBlank;
window.submitFillBlank    = submitFillBlank;
window.useHint            = useHint;
window.startWorkout       = startWorkout;
window.restartWorkout     = restartWorkout;
window.closeWorkoutEnd    = closeWorkoutEnd;
window.startDrill         = startDrill;
window.startQuiz          = startQuiz;
window.resetSection       = resetSection;
window.openQuizHelp       = openQuizHelp;

// ── Chat ──
window.openCatChat        = openCatChat;
window.closeCatChat       = closeCatChat;
window.handleOverlayClick = handleOverlayClick;
window.catChatSend        = catChatSend;

// ── Dashboard ──
window.loadParentDash     = loadParentDash;
window.pdShowSkillDrill   = pdShowSkillDrill;
window.pdOpenQuestion     = pdOpenQuestion;

// ── Wire up Enter key for chat ──
document.addEventListener('DOMContentLoaded', function() {
  const input = document.getElementById('catChatInput');
  if (input) input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') catChatSend();
  });
});

// ── Boot ──
initAuth();
