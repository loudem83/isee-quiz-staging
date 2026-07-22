
/* ════════════════════════════════════════
   SUPABASE CONFIG
════════════════════════════════════════ */
/* ════════════════════════════════════════
   SUPABASE AUTH
════════════════════════════════════════ */
const SUPA_URL = 'https://yajqvfwzhudghivzgijt.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhanF2Znd6aHVkZ2hpdnpnaWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTA0MjUsImV4cCI6MjA5NjkyNjQyNX0.9jFDuKr-mL9gl_skZcP5THhnJNjs-8ogzG4zmV6fIyk';

const supaClient = window.supabase.createClient(SUPA_URL, SUPA_KEY);

/* ════════════════════════════════════════
   EXAM CONFIG — swap these to add new subjects
════════════════════════════════════════ */
const CURRICULA = {
  'isee_lower': { id: 'isee_lower', label: 'Math (ISEE/CM1/2)', emoji: '📐', sections: ['MA','QR'] },
  'french_cm1': { id: 'french_cm1', label: 'Français CM1/2',     emoji: '🇫🇷', sections: ['GR','VO','CO','EX'] },
};
let currentCurriculum = localStorage.getItem('curriculum') || 'isee_lower';

const EXAM_CONFIG = {
  id:        currentCurriculum,
  q_table:   'questions',
  r_table:   'quiz_results',
  r_staging: 'quiz_results',
  label:     CURRICULA[currentCurriculum]?.label || 'ISEE Lower Level',
};
const Q_TABLE  = EXAM_CONFIG.q_table;
const R_TABLE  = EXAM_CONFIG.r_table;
const R_STAGING = EXAM_CONFIG.r_staging;
