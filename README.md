# Primary Practice

An adaptive quiz app for primary school children, covering **ISEE Maths** and **French grammar (CM1/CM2)**. Built as a single-page application hosted on GitHub Pages, backed by Supabase.

---

## Live

| Environment | URL |
|---|---|
| Staging | [loudem83.github.io/isee-quiz-staging](https://loudem83.github.io/isee-quiz-staging) |
| Production | [loudem83.github.io/isee-quiz](https://loudem83.github.io/isee-quiz) |

---

## Features

### For students
- **Adaptive Workout** — 20 questions across all topics, prioritising DoK 1 → 2 → 3 and unseen questions
- **Drill by Topic** — practice a specific strand or skill
- **Two question formats** — multiple choice (A/B/C/D) and word picker (tap the correct words)
- **Hint system** — cross out a wrong answer at a points cost
- **Progress dashboard** — score, weekly bar chart, strand/skill breakdown
- **Streak tracking** — daily practice streak with Mon–Sun circles
- **Mochi the cat** — animated virtual companion with contextual AI help during quizzes
- **"How do I do this?"** — tap during any question to get a concise rule explanation from Mochi, tailored to the question content

### For tutors
- **Student picker** — view the app as a specific student
- **Question Studio** — create and assign custom questions to students
- **Results visibility** — tutor session results are not saved to student history

### For admins
- **Admin panel** (5 tabs):
  - 📋 Questions — bank stats, QA review queue, strand coverage table
  - 👥 Users — all users with activity stats, score, last active date
  - 📊 Usage — daily bar chart + 7/30-day breakdown
  - 🔬 Content Health — thin strands, missing DoK levels, quality flags
  - 🔧 Debug — session info, force reload, localStorage tools

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Single-file HTML/CSS/JS — no build step |
| Hosting | GitHub Pages (Deploy from branch) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| AI chatbot | Claude Haiku via Supabase Edge Function |
| Local AI | Ollama + Qwen2.5-7B (question generation) |

---

## Project Structure

```
index.html              ← entire app (HTML + CSS + JS, ~300KB)
README.md
```

The app is intentionally a single file for simple deployment. A JS split into multiple files is planned for v2.1.

---

## Supabase Schema

### `questions`
| Column | Type | Notes |
|---|---|---|
| `question_id` | text | Primary key (e.g. `MA-001`, `GR-042`) |
| `curriculum` | text | `isee_lower` or `french_cm1` |
| `section` | text | `MA`, `QR`, `GR`, `VO`, `CO`, `EX` |
| `strand` | text | NCTM strand or French grammatical category |
| `skill` | text | Sub-topic within strand |
| `dok` | integer | Depth of Knowledge level (1–3) |
| `type` | text | `mcq` (default) or `word_picker` |
| `text` | text | Question text |
| `opt_a`–`opt_d` | text | MCQ options (null for word_picker) |
| `correct_index` | integer | 0–3 for MCQ (null for word_picker) |
| `tokens` | jsonb | Word list for word_picker format |
| `correct_tokens` | jsonb | Correct words for word_picker format |
| `explanation` | text | Shown after answering |
| `active` | boolean | False = pending QA review |
| `source` | text | `manual`, `generated` |

### `quiz_results`
Stores every answer attempt: `user_id`, `question_id`, `section`, `curriculum`, `correct`, `attempts`, `answered_at`, `session_id`.

### `profiles`
User metadata: `id`, `role` (`family`/`tutor`/`admin`), `display_name`, `created_at`.

### `tutor_students`
Maps tutors to their students: `tutor_id`, `student_id`.

---

## Design System

The app uses a token-based CSS design system (`--pp-*` custom properties) covering:

- **Colours** — 25+ semantic tokens (`--pp-primary`, `--pp-success`, `--pp-error`, `--pp-tutor` etc.)
- **Typography** — 12 font scale tokens
- **Spacing** — 8px grid (`--pp-space-xs/sm/md/lg/xl`)
- **Radius** — 7 tokens (`--pp-radius-sm` through `--pp-radius-full`)
- **Shadows** — 8 elevation aliases (`--pp-shadow-card/hover/float/btn` etc.)
- **Transitions** — 3 speed tokens

Full specification in `design_reference.md` (available in outputs).

---

## AI — Mochi Chatbot

The chatbot runs via a **Supabase Edge Function** (`cat-chat`) that proxies to Claude Haiku. The API key lives server-side and is never exposed to the client.

Two modes:
- **Rule mode** (quiz screen) — concise method explanation based on the actual question content, no personality flourishes
- **Chat mode** (home screen) — friendly companion, encourages practice, discusses weak topics

The Edge Function accepts: `messages`, `childName`, `curriculum`, `weakTopic`, `currentTopic`, `helpMode`, `exchangeCount`.

---

## Taxonomy

**Maths (ISEE Lower Level)** follows the NCTM framework:
- Strands: Whole Numbers, Decimals/Fractions/%, Algebraic Thinking, Measurement, Geometry, Data Analysis & Prob.
- DoK 1 = Recall, DoK 2 = Conceptual, DoK 3 = Analytical

**French (CM1/CM2)**:
- Strands: Conjugaison, Nature des mots, Fonctions, Accord, Types de phrases, Homophones grammaticaux, and more
- Skills map to specific grammar rules within each strand

---

## Deployment

The app deploys via **GitHub Pages — Deploy from branch (main)**. No GitHub Actions workflow is needed or used.

To update:
1. Download the latest `index.html` from the outputs
2. Replace `index.html` in the local repo clone
3. Commit and push via **GitHub Desktop** (the web UI upload silently fails on files this large)

The staging site updates within ~60 seconds of the push.

---

## Roles

| Role | Access |
|---|---|
| `family` | Standard student experience |
| `tutor` | Student picker + Question Studio + assigned question sets |
| `admin` | All of the above + Admin panel (UUID-gated) |

---

## Local Question Generation

A Python script (`~/Downloads/isee-generator/generate.py`) uses **Ollama + Qwen2.5-7B** to generate batches of questions locally. Generated questions are pushed to the `questions` table with `active = false` and reviewed via the Admin → Questions → QA Review queue before going live.

---

## Roadmap (v2.1+)

- [ ] Split `index.html` into multiple JS files (~300KB → ~150KB HTML shell)
- [ ] Multi-user support — separate progress per child on shared account
- [ ] Avatar unlock thresholds (200 / 600 / 1000 pts)
- [ ] Weekly Teacher Brief email (Supabase Edge Function + Resend)
- [ ] Dark mode (token system already structured for it)
- [ ] Surface AI-generated questions in quiz UI
- [ ] Production deploy of v2
