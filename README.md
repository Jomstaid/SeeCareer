# SeeCareer

SeeCareer is our final case study for **IT-PT02 Mobile Application Development**. It is a career helper app for students and fresh graduates. You can browse real remote jobs, open a job to see the details, and chat with an AI that helps with your resume, cover letters, job matching and interview practice.

We made it with **Ionic 9 + Angular 22** and turned it into an **Android app with Capacitor**. It also runs in the browser. The design is a pixel theme with a light mode (sky blue) and a dark mode (purple).

**Group 2, BSIT 3E**
Nueva Ecija University of Science and Technology (NEUST)
Instructor: Sir Angelito Cunanan Jr.

| Member | Role | What they did |
|---|---|---|
| Jomar D. Alcantara | Leader / Developer | Planned the app, built the AI chat, job search and resume features, and set up the free AI server |
| Evia Cassandra Eliz D. Sindac | Designer | Made the pixel theme and icons, and designed the look of every page |
| Anjo T. Adriano | Tester | Tested every page and feature on phones and laptops, checked the job APIs and reported the bugs we fixed |
| Khimberly M. Bautista | Documentation | Wrote the documentation, the setup guide and the test results of the project |

## What is in this repository

| Folder | What it has |
|---|---|
| `apk/SeeCareer.apk` | The installable Android app |
| `docs/` | Our documentation (`SeeCareerDocumentation.pdf` and `.docx`) |
| `src/app/` | The app pages, shared components and services |
| `src/assets/` | Pixel icons, the logo, the font and our team photos |
| `android/` | The Android project made by Capacitor |
| `worker/` | The small server code for our free AI (`gatewayproxy.js`) |

## Pages

| Page | What it shows |
|---|---|
| Home | Welcome card, shortcuts and the newest jobs from the API |
| Job board | List of jobs from the API with search, category filter, saved jobs and more jobs when you scroll down |
| Job details | One job (route `/job/:id`) with the full description, an Apply button and buttons to ask the AI about it |
| AI Assistant | The chat with 7 modes: Chat, Resume, Find jobs, Match, Apply, Skills gap, Interview |
| Settings | AI providers, model check, theme, text size, reply length and your data |
| About Our Group | Project title and description, course, section, members and their roles |

## How we followed the case study

| Requirement | Where it is |
|---|---|
| At least 3 pages | Home, Job board, Job details, AI Assistant, Settings and About Our Group |
| Ionic components | `ion-header`, `ion-card`, `ion-button`, `ion-img`, `ion-accordion`, `ion-searchbar`, `ion-select`, `ion-toggle`, `ion-segment`, `ion-modal`, `ion-infinite-scroll`, `ion-refresher`, `ion-tabs` |
| Navigation | `routerLink`, `Router.navigate`, tabs and the `/job/:id` route |
| HttpClient GET from a public API with no key | `src/app/core/job.service.ts` (Himalayas Jobs API) |
| Data binding and events | `[(ngModel)]`, `{{ }}`, `[src]`, `(click)`, `(ionInput)`, `(ionChange)` |
| TypeScript interface and class | `src/app/core/models.ts` (`Job` interface, `GroupMember` class and more) |
| Reusable component | `<app-page-header title="...">`, the same header on every page with a different title |
| Testing | 158 unit tests plus our own walkthrough of every button (see below) |

## APIs we used

All of these are free and need no API key.

| API | Used for | Endpoint |
|---|---|---|
| **Himalayas Jobs API** (main) | The job list and job search | `https://himalayas.app/jobs/api?limit=20&offset=0` and `https://himalayas.app/jobs/api/search?q=developer` |
| Remotive | Backup jobs when Himalayas is blocked (in a browser) | `https://remotive.com/api/remote-jobs` |
| Jobicy | Backup jobs with a country filter | `https://jobicy.com/api/v2/remote-jobs` |
| RemoteOK and Arbeitnow | More backup jobs | `https://remoteok.com/api`, `https://www.arbeitnow.com/api/job-board-api` |
| Wikipedia | Facts and public photos the AI can look up | `https://en.wikipedia.org/w/api.php` |
| **SeeCareer free AI** | The AI in the chat | `https://api.jomstaid.com/v1` |

Note: Himalayas does not allow requests from a web page (CORS), so in the browser the Job board uses the backup APIs. In the Android app the requests go through native HTTP, so Himalayas works fully.

## How the free AI works

`api.jomstaid.com` is our own small server (a Cloudflare Worker, code in `worker/gatewayproxy.js`). It passes the chat to free AI models (free LLMs) that we set up on **OmniRoute**. The secret key stays on the server, so there is no key in the app, the APK or this repository.

* **It finds working models by itself.** Every 10 minutes the app tests the smart models first (like GPT 6.1, Claude Sonnet, Grok, DeepSeek, Kimi and Gemini) and keeps a list of the ones that answer.
* **It never gets stuck on one model.** If a model gives an error, the next one is asked right away. If a model is slow and has not answered after about 10 seconds, the next one is asked too and the first answer is used. Your question, the chat so far and your resume go with it, so you still get a full answer.
* **It tells you when the AI is busy.** If every model says "too many requests", the app shows "The free AI is busy right now, try again in a minute" instead of waiting.
* **It is always SeeCareer AI.** Questions like "who are you" get a fixed answer, and the app removes the model's own name if it ever says it.

To use a new model from OmniRoute, add its name to `preferred` (or its provider to `preferPrefixes`) in `src/app/core/defaults.ts`.

You can also add your own AI provider (Groq, OpenRouter, Google Gemini or any OpenAI compatible server) in Settings.

## How to run it

You need **Node.js 20 or newer**, **Git** and the **Ionic CLI** (`npm install -g @ionic/cli`).

```bash
git clone https://github.com/Jomstaid/SeeCareer.git
cd SeeCareer
npm install
ionic serve
```

The app opens at http://localhost:8100

## Install the APK on a phone

1. Copy `apk/SeeCareer.apk` to your Android phone (Android 7.0 or newer).
2. Open the file. If Android asks, allow "Install unknown apps" for your file manager or browser.
3. Open SeeCareer. It needs internet for the jobs and the AI.

## How to build the APK

You need Android Studio (or JDK 21 and the Android SDK).

```bash
ionic build
npx cap sync android
cd android
gradlew assembleDebug
```

The APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`. You can also open the `android` folder in Android Studio and use Build, Build APK.

## Testing

Run the unit tests with:

```bash
npm test
```

Result: **158 tests passed** (input checks, the resume check, reading and making PDF and Word files, job search and place filter, how the app understands requests, the AI model list, asking the next model when one hangs, the busy message, the identity filter and more).

We also clicked through every button of the app one by one, on a phone screen (390 x 844) in light mode and on a laptop screen (1440 x 900) in dark mode. All **74 checks passed** on both:

| Test | Result |
|---|---|
| Home tiles and buttons open the right pages, side menu and tab bar work | Passed |
| Job board search, category filter, saved jobs, more jobs on scroll | Passed |
| Open a job, bookmark it, Apply link, back button, open a job link directly | Passed |
| Chat answers, reply, edit, stop, new chat, chat list | Passed |
| All 7 modes, mock interview, attach menu, commands like `/help` and `/settings` | Passed |
| "Who are you" always answers SeeCareer AI | Passed |
| Off topic questions get a polite "I focus on careers" | Passed |
| Upload a resume, design it, download PDF and Word, cover letter in Word | Passed |
| Settings: theme, text size, reply length, providers, a wrong API key, export chats | Passed |
| Turning off chat history asks first, Cancel keeps the chats | Passed |
| About Our Group shows the project, course, section and all members | Passed |
| No sideways scrolling and no errors on every page | Passed |

## Known limits

* The job APIs list remote jobs only, so some jobs (like nursing or driving) have few results. The app then gives buttons for JobStreet, Indeed and LinkedIn.
* In a browser the job list is smaller (backup APIs). The full list works in the Android app.
* Free AI models can be busy at times. The app moves to the next working model, or tells you to try again in a minute.
* Fit scores are only estimates from the AI.
* Old `.doc`, `.xls` and `.ppt` files cannot be read. Save them as PDF or the newer format first.

## Problems and fixes

* **`npm test` says "Vitest failed to find the runner" (Windows):** open the folder with a capital drive letter (`C:\...`, not `c:\...`) and run it again.
* **Port 8100 is already used:** close the other terminal or run `ionic serve --port 8200`.
* **The chat says the AI is busy:** wait a minute and send again. In Settings you can press Re-check to test the models.

## Privacy

There is no account and no login. Your resume, chats and settings are saved only on your device. When you use the AI, the text you send goes to the AI provider set in Settings.
