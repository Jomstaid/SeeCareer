# 💼 SeeCareer

A career helper app for students and fresh graduates. Upload your resume, chat with the assistant, and it finds real jobs you have a good chance of getting, writes your cover letter, shows the skills you're missing, and lets you practice interviews.

Built with **Ionic + Angular** for a Mobile Application Development final case study (NEUST, IT-PT02). Runs as a web app, on desktop, and as an **Android app** through Capacitor.

> No sign-up, no login. Your resume stays on your own device.

---

## 📑 Contents

1. [What it does](#-what-it-does)
2. [What you need](#-what-you-need)
3. [Install Git](#-install-git)
4. [Get the project and run it](#-get-the-project-and-run-it)
5. [Set up the AI key](#-set-up-the-ai-key)
6. [How to use the app](#-how-to-use-the-app)
7. [Build the Android APK](#-build-the-android-apk)
8. [Project structure](#-project-structure)
9. [How it works](#-how-it-works)
10. [Testing](#-testing)
11. [Course requirements checklist](#-course-requirements-checklist)
12. [Troubleshooting](#-troubleshooting)
13. [Privacy](#-privacy)
14. [Known limits](#-known-limits)

---

## ✨ What it does

Everything happens in one chat. Pick a feature from the bar at the top, or just type.

| Feature | What you get |
|---|---|
| 📄 **Resume Assistant** | Checks your resume, rewrites it, pulls out your skills, and creates a new one as **PDF or Word**. |
| 🔎 **Job Finder** | Searches over 100,000 real remote jobs. Or upload your resume and say *"find me a job I'll get accepted for"*. |
| 🎯 **Job Matching** | A fit score for one job: why you match and what doesn't. |
| ✉️ **Application Assistant** | Cover letter, application email, and answers to application questions. Only uses facts from your resume. |
| 📈 **Skills Gap Analyzer** | The skills you're missing for a job plus an 8-week learning plan. |
| 🎤 **Interview Preparation** | Likely questions with sample answers, or a mock interview that scores each answer. |

### Other things worth knowing

- **Recommendations with numbers.** Job picks come as swipeable cards (a grid on big screens) showing the fit %, a chance label (High / Good / Moderate / Low), skills you match, skills you're missing, and an **Apply** button.
- **It checks your file first.** Upload anything and the app decides if it's really a resume, a job posting, a cover letter, or something unrelated. A school essay won't be treated as your resume.
- **Upload almost any file.** PDF (including scanned ones), Word, Excel, PowerPoint, OpenDocument, images, and text or code files. Use the paperclip button, **drag and drop**, or paste a screenshot.
- **Download what the AI writes** as PDF, Word, TXT or Markdown.
- **Works on every screen.** Phone and tablet get a bottom tab bar. Laptops and desktops get a side menu.
- **Light and dark theme**, text size setting, saved chat history, saved jobs.
- **Bring your own AI.** Use the built-in free gateway, or add Groq, OpenRouter, Google Gemini, or any OpenAI-compatible server in Settings.

---

## 🧰 What you need

| Tool | Version | Why |
|---|---|---|
| [Node.js](https://nodejs.org) | 20 or newer (built and tested on 24) | Runs the build tools |
| [Git](https://git-scm.com) | any recent version | Download the project |
| Ionic CLI | 7 | `ionic serve` and friends |
| [Android Studio](https://developer.android.com/studio) | latest | **Only** if you want the Android app (includes the SDK) |
| Java (JDK) | 21 | Comes with Android Studio |

Install the Ionic CLI once:

```bash
npm install -g @ionic/cli
```

---

## 🧬 Install Git

Skip this if `git --version` already prints a version number.

**Windows**
1. Download the installer from <https://git-scm.com/download/win>.
2. Run it. The default choices are fine. Keep "Git from the command line" selected.
3. Open a new Command Prompt and check:

```bash
git --version
```

**macOS**

```bash
xcode-select --install
```

(or `brew install git` if you use Homebrew)

**Linux (Debian / Ubuntu)**

```bash
sudo apt update && sudo apt install git
```

**Tell Git who you are** (one time). Use the email linked to your GitHub account so your commits show on your profile:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

---

## 🚀 Get the project and run it

```bash
# 1. download the project
git clone https://github.com/Jomstaid/SeeCareer.git
cd SeeCareer

# 2. install the packages (takes a few minutes the first time)
npm install

# 3. start it
ionic serve
```

The app opens at **http://localhost:8100**.

Handy ways to look at it:
- Press **F12**, then **Ctrl + Shift + M** to switch the browser to a phone-sized view.
- `ionic serve --lab` shows iOS and Android styles side by side.
- No Ionic CLI? `npm start` does the same job.

> 🔁 **Restart `ionic serve` after you pull new changes or install packages.** Some features (the PDF reader, the jobs proxy) only load when the server starts.

---

## 🔑 Set up the AI key

The chat needs an API key for the AI provider. The key is **not** in this repository, so you add your own. Pick one way:

**Option A: local file (best before building the APK)**

1. Copy `src/assets/local-config.example.json` to `src/assets/local-config.json`.
2. Open the new file and paste your key:

```json
{
  "freeAi": {
    "apiKey": "paste-your-key-here"
  }
}
```

`local-config.json` is in `.gitignore`, so it never gets committed.

**Option B: inside the app**

1. Open **Settings**, find **AI Providers**.
2. Paste the key, press **Test & Save**.
3. The app tests the connection and lists which models work.

You can also add other providers there (Groq, OpenRouter, Gemini, or your own). The app picks the smartest model that is working and switches to the next one automatically if it fails.

---

## 📖 How to use the app

**1. Add your resume**
Tap the paperclip in the message box (or the *Add your resume* banner). Paste text, or import a PDF or Word file. You can also drop a file anywhere on the chat.

**2. Ask for jobs**
Type something like *"find me a job I will get accepted for"* with your resume attached. After about a minute you get your best matches with fit scores.

**3. Pick a job**
Tap **Select** on a card. The job shows as a small tag above the message box. Now the other features know which job you mean.

**4. Use the tools**
Switch the feature bar to *Match*, *Apply*, *Skills gap* or *Interview*, or tap the buttons the assistant shows after each answer.

**5. Take your documents with you**
Press the download icon under any answer and choose PDF, Word, TXT or Markdown. On Android, the share sheet opens so you can save to Files or Drive, or send it.

**Chat commands**

| Type | Does |
|---|---|
| `/new` | start a new chat |
| `/clear` | clear this chat |
| `/resume` | add or edit your resume |
| `/settings` | open Settings |
| `/help` | show this list |

**Other tabs**
- 🧭 **Jobs**: browse and search all jobs, filter by category, save favourites, scroll for more.
- ⚙️ **Settings**: AI providers, model health check, theme, text size, reply length, your own AI instructions, privacy and data.
- 👥 **About**: the project and the group members.

---

## 📱 Build the Android APK

You need Android Studio installed (see [What you need](#-what-you-need)).

```bash
npm run build                 # build the web app
npx cap sync android          # copy it into the Android project
npx cap open android          # opens Android Studio
```

In Android Studio: **Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)**.

Your file ends up at:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Send that file to a phone and install it. To run on a connected phone or emulator straight away:

```bash
ionic capacitor run android
```

> ✅ Do the local key file ([Option A](#-set-up-the-ai-key)) **before** `npm run build`, so your own build has the key inside.

Notes for Android:
- The AI gateway uses plain `http`, so cleartext traffic is allowed in the Android manifest and the app uses native HTTP.
- Job requests also go through native HTTP, so no proxy is needed on the phone.

---

## 🗂️ Project structure

```
SeeCareer/
├── android/                  Android project (made by Capacitor)
├── src/
│   ├── assets/               local-config.example.json, icons
│   ├── theme/variables.scss  colours, fonts, spacing (design tokens)
│   ├── global.scss           responsive layout rules
│   └── app/
│       ├── tabs/             main navigation (tab bar + side menu)
│       ├── chat/             the AI chat page (home)
│       ├── home/             Jobs page
│       ├── job-details/      one job
│       ├── settings/         AI providers and preferences
│       ├── about/            About Our Group
│       ├── shared/           reusable components
│       │   ├── page-header/    title bar used on every page
│       │   ├── job-card/       one job in a list
│       │   ├── feature-list/   the six features
│       │   ├── rec-carousel/   recommended jobs with fit stats
│       │   └── resume-sheet/   add or edit your resume
│       └── core/             logic with no screen
│           ├── ai.service.ts            talks to the AI, picks the model
│           ├── ai-tasks.ts              the prompts for each feature
│           ├── ai-task.service.ts       runs a feature, asks for consent
│           ├── recommend.service.ts     finds and scores jobs from a resume
│           ├── doc-check.ts             is this file really a resume?
│           ├── file-reader.ts           reads PDF, Word, Excel, images...
│           ├── file-export.ts           creates PDF, Word, TXT, Markdown
│           ├── job.service.ts           job API calls (HttpClient GET)
│           ├── provider.service.ts      saved AI providers
│           ├── chat-store.service.ts    saved conversations
│           ├── resume.service.ts        your resume, on your device
│           ├── validators.ts            input checks
│           └── models.ts                TypeScript interfaces and classes
├── proxy.conf.json           dev proxy for the jobs API (browser only)
└── capacitor.config.ts       Android settings
```

---

## ⚙️ How it works

**Jobs.** The Jobs page and Job Finder read the public Himalayas jobs API with Angular `HttpClient` GET:

```
GET https://himalayas.app/jobs/api?limit=20&offset=0          browse everything
GET https://himalayas.app/jobs/api/search?q=python&page=1     search
```

That API doesn't allow direct requests from a browser, so while you run `ionic serve` the requests go through the small proxy in `proxy.conf.json`. On the phone no proxy is needed. If the main source can't be reached, the app falls back to RemoteOK and Arbeitnow (about 400 jobs) so the list is never empty.

**Recommendations.** When you ask for job picks:
1. the AI reads your resume and works out job titles, skills and your level,
2. the app searches real jobs for those titles,
3. a quick local score keeps the most promising ones,
4. the AI rates each one (fit %, skills matched, skills missing, a short reason).

The fit number is an estimate to help you decide where to apply first. It is not a promise of being hired.

**File check.** Before using an uploaded file, a quick rule-based check and then the AI decide what it is. Not a resume? Job features refuse it and tell you why.

**Choosing the AI model.** On save (and the first message) the app tests the best few models and remembers which work and how fast. Chat uses the smartest working one and falls back to the next on any error.

**Reading files.** PDF text is read in your browser with pdf.js; scanned PDFs and photos are sent to the AI as pictures. Word, Excel, PowerPoint and OpenDocument files are unpacked and read as text.

**Making files.** The AI writes in Markdown, then the app turns it into a PDF (jsPDF) or Word file (docx).

---

## 🧪 Testing

```bash
npm test
```

Unit tests cover input validation, the resume check, the AI-answer parsing, model ranking, the jobs requests, reading and creating PDF, Word, Excel and PowerPoint files, and saved-provider migration.

What was also tried by hand or in a real browser:

| Check | Result |
|---|---|
| Jobs page loads the live list (about 115,000 jobs), search, next page | ✅ Works |
| Backup job source when the main one is unreachable | ✅ Works |
| Upload PDF, scanned PDF, image, Word through the picker | ✅ Works |
| Drag and drop a file onto the chat | ✅ Works |
| Real resume accepted, school essay refused | ✅ Works |
| Job recommendations with fit %, matched and missing skills | ✅ Works |
| Layout at 375, 768, 1024, 1440 and 1920 px wide, no sideways scrolling | ✅ Works |

---

## 🎓 Course requirements checklist

Mobile Application Development final case study:

| Requirement | Where |
|---|---|
| At least 3 pages, including **About Our Group** | AI Chat, Jobs, Job Details, Settings, About |
| Ionic UI components | `ion-card`, `ion-list`, `ion-segment`, `ion-accordion`, `ion-searchbar`, `ion-select`, `ion-toggle`, `ion-modal`, `ion-refresher`, `ion-infinite-scroll`, `ion-tabs`, and more |
| Navigation and routing | `routerLink`, `Router.navigate`, lazy-loaded modules, route `/job/:id` |
| Public API with `HttpClient` GET, no key | `src/app/core/job.service.ts` (Himalayas) |
| Data binding and events | `[(ngModel)]`, `(click)`, `(ionInput)`, `[class.x]`, `@if` / `@for`, signals |
| TypeScript interfaces and classes | `src/app/core/models.ts` (`Job`, `ChatMessage`, `GroupMember`, `AiError`...) |
| Reusable component | `<app-page-header title="...">` on every page, plus `app-job-card`, `app-rec-carousel`, `app-feature-list`, `app-resume-sheet` |
| Basic testing and notes | [Testing](#-testing) and [Known limits](#-known-limits) |
| Installable Android APK | [Build the Android APK](#-build-the-android-apk) |

Group name, members, roles and section are in `src/app/about/group-info.ts`. Edit that file and the About page updates.

---

## 🛠️ Troubleshooting

**"Could not read your PDF/Word file"**
The dev server was started before the file reader was installed. Stop it (`Ctrl + C`) and run `ionic serve` again. If it says the file is password-protected or damaged, save a copy without the password or export it as PDF.

**The Jobs page is empty or shows an error**
Restart `ionic serve` so the jobs proxy loads. Check your internet. The app also tries a backup source on its own.

**The AI says the key was rejected, or "no model is working"**
Add your API key ([Set up the AI key](#-set-up-the-ai-key)), then open Settings and press **Test & Save** or **Re-check**.

**Port 8100 already in use**
Another dev server is running. Close that terminal, or run `ionic serve --port 8200`.

**Build crashes with no message, or "memory allocation failed"**
Your computer ran out of memory. Close browser tabs and other apps, then try again with more memory for Node:

```bash
# Windows (Command Prompt)
set NODE_OPTIONS=--max-old-space-size=4096 && npm run build
```

**`git push` is rejected**
The GitHub repository already has files. Run:

```bash
git pull origin main --rebase --allow-unrelated-histories
git push -u origin main
```

**Git asks for a password**
GitHub no longer accepts account passwords in the terminal. Sign in through the browser window that opens, or use a Personal Access Token (GitHub ▸ Settings ▸ Developer settings ▸ Tokens).

---

## 🔒 Privacy

- No account, no login, no SeeCareer server.
- Your resume, chats, saved jobs and settings are stored **only on your device**.
- When you run an AI feature, the text you chose is sent to the **AI provider you set in Settings**. The app asks for your OK the first time.
- You can delete your resume, clear chat history, or reset providers in Settings at any time.
- API keys are stored on the device and are never part of the repository.

---

## ⚠️ Known limits

- Job search is capped at 5,000 results per keyword by the jobs API. Browsing with no keyword reaches every job.
- The backup job source has about 400 jobs and no real search; results are ranked by keyword.
- Fit scores are estimates and the AI can be wrong. Always read the job post yourself.
- Old `.doc`, `.xls` and `.ppt` files can't be read. Save them as PDF or the newer format first.
- Very large files are shortened before being sent to the AI (about 15,000 characters).
- Free AI models can be slow or busy at times. The app retries with the next model.

---

Made for NEUST, Mobile Application Development.
