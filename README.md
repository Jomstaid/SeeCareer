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
5. [The AI and the API key](#-the-ai-and-the-api-key)
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
| 📄 **Resume Assistant** | Checks your resume, rewrites it, pulls out your skills, and **designs a new one** with a real layout. Pick a design and colour, ask the AI for changes, download it as **PDF or Word**. |
| 🔎 **Job Finder** | Searches over 100,000 real remote jobs. Or upload your resume and say *"find me a job I'll get accepted for"*. |
| 🎯 **Job Matching** | A fit score for one job: why you match and what doesn't. |
| ✉️ **Application Assistant** | Cover letter, application email, and answers to application questions. Only uses facts from your resume. |
| 📈 **Skills Gap Analyzer** | The skills you're missing for a job plus an 8-week learning plan. |
| 🎤 **Interview Preparation** | Likely questions with sample answers, or a mock interview that scores each answer. |

### Other things worth knowing

- **Recommendations with numbers.** Job picks come as swipeable cards (a grid on big screens) showing the fit %, a chance label (High / Good / Moderate / Low), skills you match, skills you're missing, and an **Apply** button.
- **It checks your file first.** Upload anything and the app decides if it's really a resume, a job posting, a cover letter, or something unrelated. A school essay won't be treated as your resume.
- **Upload almost any file.** PDF (including scanned ones), Word, Excel, PowerPoint, OpenDocument, images, and text or code files. Use the paperclip button, **drag and drop**, or paste a screenshot.
- **Resume designer.** Tap *Design my resume* and the AI turns your resume into structured data (name, jobs, skills...). The app then lays it out itself in seven designs, **Modern**, **Bold** (dark side column), **Creative** (big colour column), **Classic**, **Minimal**, **Executive** and **Elegant**, in fourteen colours (or any hex colour the AI picks). The AI chooses the design for the person (a nurse, a welder and a software engineer get different looks), and you can say "give me a different design", "make it creative" or "elegant in burgundy" at any time, with your **profile photo** (found automatically in an uploaded resume, or added/removed in the designer), skill chips and a timeline. The AI also chooses the section order (education first for fresh graduates) and the page is fitted to one sheet. You see a live preview, can say things like *"make it fit one page"* or *"emphasize teamwork"*, and download the result as a real **PDF** or **Word** file. Because the app does the layout, the design never depends on what the AI happens to write.
- **Every chat is its own conversation.** The side menu lists your chats (Today, Yesterday, Earlier) with a **New chat** button, like ChatGPT. A new chat starts blank: your saved resume is only used when you ask for it ("update my resume", "from my resume") or work in a resume mode.
- **Chat like a normal AI chat.** *Reply* to any message (the AI is told what you mean by "that one"), *Edit* a message you sent (it and everything after it is replaced; press the up arrow in an empty box to edit your last one), keep typing while the AI is working (your follow-ups wait in a queue and are sent in order) and press *Stop* (or Esc) to cancel an answer.
- **Smarter job search.** Say it in plain words: *"nursing jobs in cebu"*, *"fresh graduate IT jobs in the philippines"*, *"i want a work from home job, im good at typing"*. The app understands the place (country and city), keeps only jobs for that place or open to anyone, hides jobs that barely fit, and shows company logos. The job feeds are remote-only, so for on-site work near a city it also gives buttons that open **JobStreet, Indeed and LinkedIn** already searching your role and place.
- **It can look things up.** The AI models cannot browse, so the app searches **Wikipedia** for questions that need facts ("who is...", "latest...", "search the internet for...") and gives the AI the pages. A resume for a well-known person is built from those facts, and *"add a picture from the internet"* finds their Wikipedia photo.
- **Always up to date model list.** The app re-checks which AI models work every 10 minutes, when you come back to it and when the internet returns. A model that fails while answering is skipped at once, and only working models are used.
- **Ask for a file in plain words.** Type things like *"create me a resume"*, *"make a minimal green resume in Word"*, *"write a cover letter for a marketing job"*, *"make me a weekly study schedule as PDF"* or *"make this a PDF"* (turns the last answer into a file). You never have to say which format: it is a PDF unless you say Word, text or Markdown. Documents download straight away; a **resume appears in the chat with Download PDF / Download Word buttons** (nothing is saved until you tap one), and you can keep changing it with messages like *"add picture"*, *"make it red"*, *"add skill Python"* or *"give me a different design"*. A resume uses your saved resume, a file you attach (PDF, Word, or even a **photo** of a resume) or, if you give no details, becomes a ready-to-fill template with [placeholders]. The AI also picks a layout and colour that suit the field, unless you name one. The file contains only the document: chat remarks, emoji and questions are removed before it is built.
- **Does more than careers.** Ask it to write, explain, summarise a document, draft an email, plan something, or help with code. Careers are the specialty, not the limit.
- **Download what the AI writes** as PDF, Word, TXT or Markdown.
- **Works on every screen.** Phone and tablet get a floating tab bar. Laptops and desktops get a side menu with your chat list. The look is frosted glass (glassmorphism) with a job-search blue and teal palette, and a short animated start screen.
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

> 🔁 **Restart `ionic serve` after you pull new changes or install packages.** Some features (such as the PDF reader) only load when the server starts.

---

## 🔑 The AI and the API key

**You don't need a key.** The app comes with a free AI already set up (`https://api.jomstaid.com/v1`). Open the app and chat.

How that stays safe: the address belongs to a small proxy (a Cloudflare Worker, code in [`worker/gatewayproxy.js`](worker/gatewayproxy.js)). The proxy holds the real API key on the server and adds it to each request. The app never receives the key, so there is **no secret in the source code, in the website, in the APK, or on your device**.

**Want to use your own AI?** Open **Settings**, choose a provider (Groq, OpenRouter, Google Gemini, or any OpenAI-compatible server), paste your own key and press **Test & Save**. Those keys are stored on your device only, and the key field has a show/hide button.

### Run your own proxy (optional)

If you fork this project and want your own free endpoint:

1. Cloudflare dashboard ▸ **Workers & Pages** ▸ **Create** ▸ **Start with Hello World!** ▸ name it, **Deploy**.
2. **Edit code**, paste the contents of `worker/gatewayproxy.js`, **Deploy**.
3. **Settings ▸ Variables and Secrets** ▸ add the secret `GATEWAY_KEY` with your gateway's API key.
4. **Settings ▸ Domains & Routes** ▸ add a route such as `api.example.com/*`.
5. Put your own address in `DEFAULT_FREE_AI.baseUrl` in `src/app/core/defaults.ts`, and your own website in `ORIGINS` inside the Worker.
6. Test: `curl https://api.example.com/v1/models` should list models without any key.

Add a Cloudflare **rate limiting rule** and a usage cap in your gateway, because the proxy is open to anyone who knows its address. Optional extras in the Worker file: `ALLOWED_MODELS` (only allow some models) and `APP_TOKEN` (require a private header).

---

## 📖 How to use the app

**1. Add your resume**
Tap the paperclip in the message box (or the *Upload your resume* banner), or drop a file anywhere on the chat. A PDF, Word file, text file or even a photo of your resume works. The app checks that it is a resume and remembers it.

**2. Ask for jobs**
Type something like *"find me a job I will get accepted for"* with your resume attached. After about a minute you get your best matches with fit scores.

**3. Pick a job**
Tap **Select** on a card. The job shows as a small tag above the message box. Now the other features know which job you mean.

**4. Use the tools**
Switch the feature bar to *Match*, *Apply*, *Skills gap* or *Interview*, or tap the buttons the assistant shows after each answer.

**5. Take your documents with you**
A resume has Download PDF and Download Word buttons under it. Letters and other documents download as soon as they are made, and the buttons under them give the other format. On Android, the share sheet opens so you can save to Files or Drive, or send it.

**Chat commands**

| Type | Does |
|---|---|
| `/new` | start a new chat |
| `/clear` | clear this chat |
| `/resume` | choose a resume file to upload |
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

> ✅ The APK has no key inside, so it is safe to share. The built-in AI works as soon as it is installed.

Notes for Android:
- The AI gateway is reached over HTTPS, so Android needs no special network setting.
- Job requests also go through native HTTP, so no proxy is needed on the phone.

---

## 🗂️ Project structure

```
SeeCareer/
├── android/                  Android project (made by Capacitor)
├── src/
│   ├── assets/               icons
│   ├── theme/variables.scss  colours, fonts, spacing (design tokens)
│   ├── global.scss           responsive layout rules
│   └── app/
│       ├── tabs/             main navigation (tab bar + side menu)
│       ├── chat/             the AI chat page (home)
│       ├── home/             Jobs page
│       ├── jobdetails/      one job
│       ├── settings/         AI providers and preferences
│       ├── about/            About Our Group
│       ├── shared/           reusable components
│       │   ├── pageheader/    title bar used on every page
│       │   ├── jobcard/       one job in a list
│       │   ├── featurelist/   the six features
│       │   ├── reccarousel/   recommended jobs with fit stats
│       │   ├── resumedesigner/ layout and colour picker, AI changes, downloads
│       │   └── resumepreview/ on-screen preview of each design
│       └── core/             logic with no screen
│           ├── ai.service.ts            talks to the AI, picks the model
│           ├── aitasks.ts              the prompts for each feature
│           ├── aitask.service.ts       runs a feature, asks for consent
│           ├── recommend.service.ts     finds and scores jobs from a resume or a request
│           ├── intent.ts                understands requests (file, design, photo, job search)
│           ├── places.ts                countries and cities in a request
│           ├── websearch.ts             Wikipedia lookup for facts
│           ├── webphoto.ts              public photo of a well-known person
│           ├── photo.ts                 finds and crops the photo in a resume
│           ├── logo.ts                  company logos from the company website
│           ├── docclean.ts              cleans AI text before it becomes a file
│           ├── doccheck.ts             is this file really a resume?
│           ├── filereader.ts           reads PDF, Word, Excel, images...
│           ├── fileexport.ts           creates PDF, Word, TXT, Markdown
│           ├── resumedata.ts           a resume as structured data, with checks
│           ├── resumedesign.service.ts asks the AI for resume data and for changes
│           ├── resumerender.ts         lays the resume out as PDF and Word
│           ├── job.service.ts           job API calls (HttpClient GET)
│           ├── provider.service.ts      saved AI providers
│           ├── chatstore.service.ts    saved conversations
│           ├── resume.service.ts        your resume, on your device
│           ├── validators.ts            input checks
│           └── models.ts                TypeScript interfaces and classes
├── worker/                   Cloudflare Worker that holds the API key (gatewayproxy.js)
└── capacitor.config.ts       Android settings
```

---

## ⚙️ How it works

**Jobs.** The Jobs page and Job Finder read the public Himalayas jobs API with Angular `HttpClient` GET:

```
GET https://himalayas.app/jobs/api?limit=20&offset=0          browse everything
GET https://himalayas.app/jobs/api/search?q=python&page=1     search
```

That API doesn't allow direct requests from a browser page, so in a browser the app uses its backup sources: **Remotive** and **Jobicy** (real keyword search, company logos, country filter), plus RemoteOK and Arbeitnow. They are merged without repeats. In the **Android app** the requests go through native HTTP, which has no such limit, so you get the full list of about 115,000 jobs. The Jobs page is never empty.

**Places.** `places.ts` finds the country (and the city or province) in a request, such as *"jobs near nueva ecija"*. Jobs for that country are requested from the source; the backup keeps jobs that mention the place or are open to anyone and never shows jobs tied to another country. If no job is only for that place the answer says so. The feeds hold remote jobs only, so the answer also offers JobStreet, Indeed and LinkedIn searches for the role and place.

**Recommendations.** When you ask for job picks:
1. the AI reads your resume and works out job titles, skills and your level,
2. the app searches real jobs for those titles,
3. a quick local score keeps the most promising ones,
4. the AI rates each one (fit %, skills matched, skills missing, a short reason).

The fit number is an estimate to help you decide where to apply first. It is not a promise of being hired.

**File check.** Before using an uploaded file, a quick rule-based check and then the AI decide what it is. Not a resume? Job features refuse it and tell you why.

**Choosing the AI model.** On save, at start and every 10 minutes the app tests the best models (it keeps going down the list until at least three answer) and remembers which work and how fast. Chat uses the smartest working one. A model that fails during an answer is dropped at once, and if every working model fails the app re-checks and retries once.

**Reading files.** PDF text is read in your browser with pdf.js; scanned PDFs and photos are sent to the AI as pictures. Word, Excel, PowerPoint and OpenDocument files are unpacked and read as text.

**Resume designs.** The AI returns the resume as data plus a design suggestion (one of seven templates, a colour, and the order of the sections). The app draws it as PDF (jsPDF), Word (docx) and an on-screen preview. Photos are found in uploaded resumes by asking a vision model for a box around the face (a "no photo" answer is double-checked with the best model), then cropped to a circle or square. Word has two layouts, so the Bold and Creative designs use the side-column layout there and Executive and Elegant the one-column layout.

**Looking things up.** `websearch.ts` queries the Wikipedia API (it allows browser requests, no key) and passes the pages to the AI as WEB RESULTS. The AI is told to name the page it used, and to say so when it cannot browse.

**Making files.** The AI writes in Markdown, then the app turns it into a PDF (jsPDF) or Word file (docx).

---

## 🧪 Testing

```bash
npm test
```

Unit tests (130) cover input validation, the resume check, the AI-answer parsing, model ranking, the jobs requests and place filtering, request understanding (files, designs, names, photos, job searches), the Wikipedia lookups, company logo guesses, text repair, request headers, reading and creating PDF, Word, Excel and PowerPoint files, all seven resume designs (PDF and Word, with and without a photo), and saved-provider migration.

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
| Walk-through as different users with the live AI: questions, web lookups, resumes in several designs, cover letters, uploads, job search for nurses, teachers, call centre, IT, drivers... | ✅ Works |
| Reply, edit, queued messages, stop; chat list and new chat | ✅ Works |

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
| Reusable component | `<app-page-header title="...">` on every page, plus `app-job-card`, `app-rec-carousel`, `app-feature-list`, `app-resume-designer`, `app-resume-preview` |
| Basic testing and notes | [Testing](#-testing) and [Known limits](#-known-limits) |
| Installable Android APK | [Build the Android APK](#-build-the-android-apk) |

Group name, members, roles and section are in `src/app/about/groupinfo.ts`. Edit that file and the About page updates.

---

## 🛠️ Troubleshooting

**"Could not read your PDF/Word file"**
The dev server was started before the file reader was installed. Stop it (`Ctrl + C`) and run `ionic serve` again. If it says the file is password-protected or damaged, save a copy without the password or export it as PDF.

**The Jobs page is empty or shows an error**
Check your internet. In a browser you only get the backup list (about 400 jobs); the full list is in the Android app. The app switches to the backup source on its own.

**The AI says the key was rejected, or "no model is working"**
Open Settings and press **Re-check**. The built-in AI needs no key; if you added your own provider, check its key and press **Test & Save**.

**"Cannot reach https://api.jomstaid.com" in a VS Code forwarded port, or on another website address**
The Worker only accepts requests from addresses it knows. Add the address to `ORIGINS` in the Worker (or keep the `TUNNEL` line for VS Code forwarded ports) and press **Deploy** in Cloudflare. A phone app and a desktop program send no address, so they are not affected.

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
- You can clear chat history or reset providers in Settings, and choose *Forget my saved resume* in the attach menu, at any time.
- The built-in AI needs no key. Keys you add for your own providers are stored on your device only and are never part of the repository.

---

## ⚠️ Known limits

- Job search is capped at 5,000 results per keyword by the jobs API. Browsing with no keyword reaches every job.
- In a browser the job sources are remote-only and small, so some jobs (nursing, driving, waiting tables...) have no matches. The app then links to JobStreet, Indeed and LinkedIn instead of listing on-site jobs itself.
- Company logos for the backup sources are guessed from the company name, so a few can belong to another company with a similar name.
- Web lookups cover Wikipedia only (people, places, events), not other websites, prices or live news.
- Fit scores are estimates and the AI can be wrong. Always read the job post yourself.
- Old `.doc`, `.xls` and `.ppt` files can't be read. Save them as PDF or the newer format first.
- Very large files are shortened before being sent to the AI (about 15,000 characters).
- Free AI models can be slow or busy at times. The app retries with the next model.
