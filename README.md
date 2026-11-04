# SeeCareer

Hybrid mobile app (Ionic 9 + Angular 22 + Capacitor) for the *Mobile Application Development* final case study.
Explore remote jobs from a public REST API and ask an AI career assistant how to prepare.

## Pages (linked with `routerLink` / `Router.navigate`)
| Page | Route | Purpose |
|---|---|---|
| **AI Chat (Home)** | `/tabs/chat` | One chat with 6 modes: Resume Assistant, Job Finder, Job Matching, Application Assistant, Skills Gap, Interview Prep |
| Jobs | `/tabs/home` | 100,000+ live jobs, search, category, bookmarks, infinite scroll |
| Job Details | `/job/:id` | One job + buttons that open the AI chat with that job |
| Settings | `/tabs/settings` | AI providers, model health, theme, AI instructions, privacy |
| **About Our Group** | `/tabs/about` | Project, course/year/section, members & roles |

## What the AI chat can do
- **Upload any common file** with the 📎 button: PDF (text is read with pdf.js; scanned PDFs are sent as page images), Word `.docx`, images (PNG/JPG/WebP — read by a vision model), and text/code files (TXT, MD, CSV, JSON, HTML…). Up to 5 files, 15 MB each.
- **Generate files** from any answer (⬇ button): **PDF**, **Word (.docx)**, TXT or Markdown. Resume mode has **Generate resume PDF**.
- **Drag & drop** a file onto the chat (or paste a screenshot) to attach it.
- **Is it really a resume?** Every uploaded file is checked first (resume, cover letter, job posting, other job document, or not job related). A non-resume is refused for job features with the reason; a job posting can be used as the job to match.
- **"Find me a job I'll be accepted for"**: upload your resume and say so (or tap *Find jobs I can get*). The AI reads the resume, searches real jobs, and shows a swipeable **carousel** with fit %, chance (High/Good/Moderate/Low), skills matched and missing, and an **Apply** button.
- The AI uses the smartest working model first (the strongest model the gateway offers, then smaller ones as backup).
- Job Finder searches live jobs inside the chat with **Show more jobs** paging; pick one with **Select**.
- Match score ring, cover letter / email, skills gap roadmap, mock interview with scores.
- Not supported: old `.doc`, Excel and PowerPoint files (save them as PDF first).

## Layout
On a phone the app fills the screen. On a tablet or desktop it stays in one centered phone-width column so everything lines up.

## Jobs API
Himalayas public API (no key): `https://himalayas.app/jobs/api?limit=20&offset=N` (about 115,000 jobs) and
`/jobs/api/search?q=...&page=N`. Himalayas sends no CORS headers, so in the browser `ionic serve` uses the dev proxy in
`proxy.conf.json`; on the phone requests go through native HTTP (CapacitorHttp), so no proxy is needed.
**Restart `ionic serve` after pulling these changes** so the proxy is loaded. If Himalayas cannot be reached, the app automatically falls back to RemoteOK + Arbeitnow (about 400 jobs), so the Jobs page still works.

## Rubric map
- **Ionic components**: ion-header, ion-card, ion-button, ion-accordion, ion-searchbar, ion-select, ion-segment, ion-modal, ion-refresher, ion-tabs.
- **Data binding / events**: `[(ngModel)]`, `(click)`, `(ionInput)`, `[class.x]`, `@if/@for`, signals.
- **TypeScript**: interfaces (`Job`, `ChatMessage`, `AiProvider`…) and classes (`GroupMember`, `AiError`) in `src/app/core/models.ts`.
- **HttpClient GET**: `src/app/core/job.service.ts` → `https://himalayas.app/jobs/api` (public, no key, HTTPS, JSON).
- **Reusable components**: `<app-page-header title="…">` (every page), `<app-job-card>`, `<app-resume-sheet>`.
- **Validation**: `src/app/core/validators.ts` (provider form, chat input) with unit tests.

## Setup
```
npm install
npm start            # http://localhost:8100
npm test             # unit tests
```

## Free AI (Settings page)
The built-in free AI gateway (`http://194.156.90.214:20128/v1`) is added on first launch (`src/app/core/defaults.ts`). It needs an API key.
Settings: choose a provider, **Test & Save** (finds working models), **Model health** list, **Re-check**,
enable/disable/delete, plus Groq / OpenRouter / Gemini / custom presets.
Model "Auto" tests the best models and uses the smartest working one; if it fails the next takes over.
**API key (not stored in the repository).** Either:
1. copy `src/assets/local-config.example.json` to `src/assets/local-config.json` and paste your key (this file is git-ignored), or
2. open **Settings > AI Providers**, paste the key and press **Test & Save**.

Do the first option before building the APK so the key is bundled into your own build only.

## Build the Android APK
Needs Android Studio (SDK + JDK 21).
```
npm run build
npx cap sync android
npx cap open android      # Build > Build APK(s)
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`.
Cleartext HTTP is enabled (the AI gateway is `http://`) and native HTTP is used on the phone.

## Basic test results
| # | Flow | Result |
|---|---|---|
| 1 | Jobs page loads from Himalayas (GET, via dev proxy) | Pass: "Showing 20 of 114,698 jobs" |
| 2 | Search + page 2 of search results | Pass (proxy check; unit test checks GET params) |
| 3 | Infinite scroll adds the next 20 jobs | Pass (offset paging unit test) |
| 4 | Open job details, back, bookmark | Pass |
| 5 | AI chat: six modes, job cards in chat, Select job | Pass (build + screenshots) |
| 6 | Create Word file then read it back; create PDF | Pass (unit tests) |
| 7 | Text file read; unsupported (.pptx) and empty files rejected with a message | Pass (unit tests) |
| 8 | Image understanding with the AI gateway (Gemini models) | Pass (live test: colors read correctly) |
| 9 | Settings validation (bad URL, short key, duplicate name) | Pass (unit tests) |
| 10 | Resume check: real resume accepted, biology essay refused (live AI) | Pass |
| 11 | Job recommendations with fit %, matched/missing skills (live AI + live jobs) | Pass |
| 12 | Jobs fallback when the main source is unreachable (399 jobs, search, page 2) | Pass |
| 13 | Unit tests (`npm test`) | 30/30 pass |

Known limitations
- The gateway's `auto/*` combos currently return 502 (their upstream providers are down); `antigravity/*` models work, so Auto picks those.
- Job search results are capped at 5,000 per keyword by Himalayas (browsing without a keyword reaches all ~115k).
- PDF reading of real files, photo upload, drag & drop, the carousel look and file sharing were checked by build and tests but not on a real device; try them once on the phone.
- Chat history is stored on the device only. APK was not built here (no Android SDK on this PC).
