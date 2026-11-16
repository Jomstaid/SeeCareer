<p align="center">
  <img src="src/assets/icon/icon192.png" width="110" alt="SeeCareer logo">
</p>

<h1 align="center">SeeCareer 💼</h1>

<p align="center">
  An AI job finder and career helper app for students and fresh graduates<br>
  Final Case Study · IT-PT02 Mobile Application Development
</p>

<p align="center">
  <a href="https://seecareer.jomstaid.com/"><b>🌐 Try the demo website</b></a>
</p>

<p align="center">
  <a href="apk/SeeCareer.apk">📱 Download the APK</a> ·
  <a href="#how-to-run-it-">🚀 How to run</a> ·
  <a href="#apis-we-used-">🌐 APIs</a> ·
  <a href="#testing-">✅ Testing</a>
</p>

---

## About the project 📌

SeeCareer is our final case study for **IT-PT02 Mobile Application Development**. It is a career helper app for students and fresh graduates. You can browse real remote jobs, open a job to see the details, and chat with an AI that helps with your resume, cover letters, job matching and interview practice.

We made it with **Ionic 9 + Angular 22** and turned it into an **Android app with Capacitor**. It also runs in the browser, and you can try it right now on our demo website: **https://seecareer.jomstaid.com/**. The design is a pixel theme with a light mode (sky blue) and a dark mode (purple) 🎨

## Our group 👋

**Group 2, BSIT 3E**<br>
Nueva Ecija University of Science and Technology (NEUST)<br>
Instructor: Sir Angelito Cunanan Jr.

| | Member | Role | What they did |
|---|---|---|---|
| <img src=".github/readme/jomarAlcantara.png" width="56" alt="Jomar"> | Jomar D. Alcantara | Leader / Developer | Planned the app, built the AI chat, job search and resume features, and set up the free AI server |
| <img src=".github/readme/eviaSindac.png" width="56" alt="Evia"> | Evia Cassandra Eliz D. Sindac | Designer | Made the pixel theme and icons, and designed the look of every page |
| <img src=".github/readme/anjoAdriano.png" width="56" alt="Anjo"> | Anjo T. Adriano | Tester | Tested every page and feature on phones and laptops, checked the job APIs and reported the bugs we fixed |
| <img src=".github/readme/khimberlyBautista.png" width="56" alt="Khimberly"> | Khimberly M. Bautista | Documentation | Wrote the documentation, the setup guide and the test results of the project |

## What is in this repository 📂

| Folder | What it has |
|---|---|
| `apk/SeeCareer.apk` | The installable Android app |
| `src/app/` | The app pages, shared components and services |
| `src/assets/` | Pixel icons, the logo, the font and our team photos |
| `android/` | The Android project made by Capacitor |
| `worker/` | The small server code for our free AI (`gatewayproxy.js`) |

## Pages 📱

| Page | What it shows |
|---|---|
| Home | Welcome card, shortcuts and the newest jobs from the API |
| Job board | List of jobs from the API with search, category filter, saved jobs and more jobs when you scroll down |
| Job details | One job (route `/job/:id`) with the full description, an Apply button and buttons to ask the AI about it |
| AI Assistant | The chat with 7 modes: Chat, Resume, Find jobs, Match, Apply, Skills gap, Interview. The answer shows word by word while the AI writes it |
| Resume designer | Opens from the chat: 7 designs, 14 colours, photo, **paper size** (A4, Letter / short bond, Legal, Long bond, A5, A3, B5, B4, Executive, Tabloid or any custom size), AI changes and PDF or Word download |
| Settings | AI providers, the list of every AI model and which ones work, theme, text size, reply length and your data. It fits on one screen |
| About Our Group | Project title and description, course, section, members and their roles |

## How we followed the case study 📋

| Requirement | Where it is |
|---|---|
| At least 3 pages | Home, Job board, Job details, AI Assistant, Settings and About Our Group |
| Ionic components | `ion-header`, `ion-card`, `ion-button`, `ion-img`, `ion-accordion`, `ion-searchbar`, `ion-select`, `ion-toggle`, `ion-segment`, `ion-modal`, `ion-infinite-scroll`, `ion-refresher`, `ion-tabs` |
| Navigation | `routerLink`, `Router.navigate`, tabs and the `/job/:id` route |
| HttpClient GET from a public API with no key | `src/app/core/job.service.ts` (Himalayas Jobs API) |
| Data binding and events | `[(ngModel)]`, `{{ }}`, `[src]`, `(click)`, `(ionInput)`, `(ionChange)` |
| TypeScript interface and class | `src/app/core/models.ts` (`Job` interface, `GroupMember` class and more) |
| Reusable component | `<app-page-header title="...">`, the same header on every page with a different title |
| Testing | 207 unit tests plus our own walkthrough of every button (see below) |

## APIs we used 🌐

All of these are free and need no API key.

| API | Used for | Endpoint |
|---|---|---|
| **Himalayas Jobs API** (main) | The job list and job search | `https://himalayas.app/jobs/api?limit=20&offset=0` and `https://himalayas.app/jobs/api/search?q=developer` |
| Remotive | Backup jobs when Himalayas is blocked (in a browser) | `https://remotive.com/api/remote-jobs` |
| Jobicy | Backup jobs with a country filter | `https://jobicy.com/api/v2/remote-jobs` |
| RemoteOK and Arbeitnow | More backup jobs | `https://remoteok.com/api`, `https://www.arbeitnow.com/api/job-board-api` |
| Wikipedia | Facts and public photos the AI can look up | `https://en.wikipedia.org/w/api.php` |
| **SeeCareer free AI** | The AI in the chat | `https://api.jomstaid.com/v1` |

💡 Note: Himalayas does not allow requests from a web page (CORS), so in the browser the Job board uses the backup APIs. In the Android app the requests go through native HTTP, so Himalayas works fully.

## How the free AI works 🤖

`api.jomstaid.com` is our own small server (a Cloudflare Worker, code in `worker/gatewayproxy.js`). It passes the chat to free AI models (free LLMs) that we set up on **OmniRoute**. The secret key stays on the server, so there is no key in the app, the APK or this repository.

* **It answers fast.** The answer appears word by word while the AI writes it, so the first words show in about 1 to 2 seconds instead of waiting for the whole answer. The app picks the smartest model that is also quick, so a slow model is not used first.
* **It checks every model by itself.** Settings lists every chat model on our OmniRoute gateway (image and video models are left out). The app checks all of them in the background, 6 at a time, so you never have to press Test. Servers that already work are checked first, and a server whose first 3 models all fail is skipped, so working models are found in seconds. Every model that answers is marked working and used by the chat. Models that failed are checked again every 30 minutes, so a model that comes back is used again.
* **It finds working models by itself.** Every 10 minutes the app tests the smart models first (like GPT 6.1, Claude Sonnet, Grok, DeepSeek, Kimi and Gemini) and keeps a list of the ones that answer. It takes turns between the different servers behind the gateway, so one server that is down does not slow down the check.
* **It never gets stuck on one model.** If a model gives an error, the next one is asked right away. If a model is slow and has not started answering after about 4 seconds, the next one is asked too and the first one that starts writing is used (the others are stopped). Your question, the chat so far and your resume go with it, so you still get a full answer. If all the working models fail in the middle of a question, the app keeps going down the full list of models (skipping the servers that are busy) until one answers.
* **It tells you when the AI is busy.** If every model says "too many requests", the app shows "The free AI is busy right now, try again in a minute" instead of waiting.
* **It shows what it is doing.** While you wait, the chat says "Thinking…", then "Picking the fastest free AI for you…", and "Writing…" once the answer starts.
* **It understands how people really type.** Typos like "mak me resum pls" still make a resume, "create a resume about SpongeBob legal" looks up the person and uses Legal paper, "search on internet" or "yes" runs the button the app just offered, and "what about data analyst" after a job search searches again. It never searches the internet for a photo of a private person unless you ask.
* **It is always SeeCareer AI.** Questions like "who are you", "are you ChatGPT" or "ikaw ba si Claude" get a fixed answer, and the app removes the model's own name if it ever says it.
* **It answers questions about itself correctly.** "What can you do", "is this free", "do you save my data" and "how do you work" get the app's own answers, so the AI never makes them up.
* **It handles nonsense.** Random letters like "asdfgh", "jsjsjs" or "???" get a friendly "Sorry, I didn't understand that" with buttons for what the app can do. Questions that are not about careers (like sports or jokes) get a polite "I focus on careers".

To use a new model from OmniRoute, add its name to `preferred` (or its provider to `preferPrefixes`) in `src/app/core/defaults.ts`.

You can also add your own AI provider (Groq, OpenRouter, Google Gemini or any OpenAI compatible server) in Settings.

## How to run it 🚀

Just want to see it? Open the demo website: **https://seecareer.jomstaid.com/**

To run it on your own computer, follow these steps one by one. You only need to do steps 1 to 3 once.

### Step 1: Install Node.js

Node.js runs the tools that build the app. It also installs `npm`, which downloads the app's packages.

1. Go to **https://nodejs.org** and download the **LTS** version (version 20 or newer).
2. Open the file you downloaded and click **Next** until it finishes. Keep all the default options.
   * **Windows:** run the `.msi` file.
   * **macOS:** run the `.pkg` file.
   * **Linux (Ubuntu):** run `sudo apt install nodejs npm` in the terminal, or follow the steps on nodejs.org.
3. Close and open your terminal again (on Windows: **PowerShell** or **Command Prompt**, on macOS: **Terminal**).
4. Check that it works. Each command should show a version number:

   ```bash
   node -v
   npm -v
   ```

### Step 2: Install Git

Git downloads the code from GitHub.

1. Go to **https://git-scm.com/downloads** and download Git for your computer.
2. Install it with the default options. On macOS you can also run `xcode-select --install` in Terminal.
3. Close and open your terminal again, then check:

   ```bash
   git --version
   ```

### Step 3: Install the Ionic CLI

The Ionic CLI gives you the `ionic` command that runs and builds the app.

```bash
npm install -g @ionic/cli
ionic --version
```

* **macOS or Linux:** if it says "permission denied", run `sudo npm install -g @ionic/cli` and type your computer password.
* **Windows:** if PowerShell says "running scripts is disabled on this system", run this once, then try again:

  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```

### Step 4: Download the code

Pick a folder (for example your Desktop), open the terminal there and run:

```bash
git clone https://github.com/Jomstaid/SeeCareer.git
cd SeeCareer
```

No Git? On the GitHub page click **Code ➜ Download ZIP**, unzip it and open the terminal inside the `SeeCareer` folder.

### Step 5: Install the app's packages

```bash
npm install
```

This takes a few minutes the first time. It makes a `node_modules` folder.

### Step 6: Start the app

```bash
ionic serve
```

The app opens in your browser at **http://localhost:8100** 🎉 Keep the terminal open while you use it. Press **Ctrl + C** in the terminal to stop it.

Tip: to see the phone layout in the browser, press **F12**, then click the phone icon (device toolbar).

## Install the APK on a phone 📲

You need an **Android phone with Android 7.0 or newer** and internet. No Play Store account is needed.

### Step 1: Get the APK file on your phone

Pick one way:

* **Download it on the phone (easiest):** open this page in the phone's browser (Chrome), tap `apk` ➜ `SeeCareer.apk` ➜ the **Download** button (the ⬇ icon or "View raw"). If Chrome warns that the file can be harmful, tap **Download anyway**.
* **From a computer with a USB cable:** connect the phone, choose **File transfer** on the phone, then copy `apk/SeeCareer.apk` into the phone's **Download** folder.
* **From a computer without a cable:** send the file to yourself (Google Drive, Messenger, email) and download it on the phone.

### Step 2: Open the APK

Open the **Files** app (or **My Files**, or Chrome's **Downloads**) and tap **SeeCareer.apk**.

### Step 3: Allow the install

Android blocks apps from outside the Play Store the first time. This is normal for a school project app.

* **Android 8 or newer:** a message says the app "is not allowed to install unknown apps". Tap **Settings**, turn on **Allow from this source**, then press **Back**.
* **Android 7:** go to **Settings ➜ Security** and turn on **Unknown sources**, then tap the APK again.

Then tap **Install**.

### Step 4: If Google Play Protect shows a warning

Play Protect does not know the app because it is not on the Play Store. Tap **More details ➜ Install anyway** (or **Install without scanning**). If it asks to send the app for scanning, you can tap **Don't send**.

### Step 5: Open SeeCareer

Tap **Open**, or find the **SeeCareer** icon on your home screen or app drawer. The app needs **internet** for the jobs and the AI. It asks for no other permissions. When you attach a resume or a photo, Android lets you pick the file.

### Update to a newer version

Download the new `SeeCareer.apk` and install it the same way. Your chats, resume and settings stay.

### Uninstall

Press and hold the SeeCareer icon ➜ **Uninstall** (or **Settings ➜ Apps ➜ SeeCareer ➜ Uninstall**). This also deletes the chats and resume saved in the app.

### If the install does not work

| What you see | What to do |
|---|---|
| "App not installed" | An older SeeCareer made from a different computer is installed. Uninstall it first, then install again. Also check that the phone has free storage. |
| "There was a problem parsing the package" | The download did not finish, or the phone is older than Android 7.0. Download the APK again. |
| The Install button does nothing or is grey | Turn off screen filters or apps that draw over the screen (blue light filter, chat bubbles), then try again. |
| "Blocked by Play Protect" | Tap **More details ➜ Install anyway** (Step 4). |
| The app opens but shows no jobs or no AI answer | Check the internet connection. If the chat says the free AI is busy, wait a minute and try again. |

## How to build the APK 🔧

Do Steps 1 to 5 above first.

### Step 1: Install Android Studio

1. Download **Android Studio** from **https://developer.android.com/studio** and install it with the default options. It comes with Java (JDK 21), so you do not need to install Java yourself.
2. Open Android Studio once. The setup wizard downloads the **Android SDK**. Click **Next** and **Finish** until it is done.
3. Tell your terminal where the SDK is (you can find the path in Android Studio under **Settings ➜ Languages & Frameworks ➜ Android SDK**):
   * **Windows (PowerShell):**

     ```powershell
     setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
     setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
     ```

   * **macOS (Terminal):**

     ```bash
     echo 'export ANDROID_HOME=$HOME/Library/Android/sdk' >> ~/.zshrc
     echo 'export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"' >> ~/.zshrc
     ```

   Close and open the terminal again after this.

### Step 2: Build the APK

In the `SeeCareer` folder run:

```bash
ionic build
npx cap sync android
cd android
gradlew assembleDebug
```

On macOS or Linux, use `./gradlew assembleDebug` instead of `gradlew assembleDebug`.

The APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`.

### Or build it inside Android Studio

1. Run `ionic build` and `npx cap sync android` in the terminal.
2. Run `npx cap open android`, or open the `android` folder in Android Studio.
3. Wait until Gradle finishes (the progress bar at the bottom), then click **Build ➜ Build App Bundle(s) / APK(s) ➜ Build APK(s)**.
4. To try it on a phone: turn on **Developer options ➜ USB debugging** on your Android phone, connect it with a USB cable and press the green **Run** ▶ button.

## Testing ✅

Run the unit tests with:

```bash
npm test
```

Result: **207 tests passed** (input checks, typos like "mak me resum", short replies like "search on internet" or "yes", paper sizes and custom sizes in the PDF and Word files, showing the answer word by word, skipping a server that is down, the resume check, reading and making PDF and Word files, job search and place filter, how the app understands requests, the AI model list, asking the next model when one hangs, the busy message, the identity filter, questions about the AI, nonsense messages, falling back to the full model list, checking every model in the background, reading a person's name for an example resume and more).

We also clicked through every button of the app one by one, on a phone screen (390 x 844) in light mode and on a laptop screen (1440 x 900) in dark mode. All **74 checks passed** on both, and again on a small phone (360 x 780). We also ran **72 checks** on Android phone sizes with the status bar and navigation bar, and **69 checks** for the paper size on a phone, a small phone and a laptop:

| Test | Result |
|---|---|
| Home tiles and buttons open the right pages, side menu and tab bar work | ✅ Passed |
| Job board search, category filter, saved jobs, more jobs on scroll | ✅ Passed |
| Open a job, bookmark it, Apply link, back button, open a job link directly | ✅ Passed |
| Chat answers, reply, edit, stop, new chat, chat list | ✅ Passed |
| All 7 modes, mock interview, attach menu, commands like `/help` and `/settings` | ✅ Passed |
| "Who are you" always answers SeeCareer AI | ✅ Passed |
| Off topic questions get a polite "I focus on careers" | ✅ Passed |
| "What can you do", "is this free", "do you save my data" get the app's own answers | ✅ Passed |
| Random letters like "asdfgh" or "???" get a friendly "I didn't understand" | ✅ Passed |
| Settings lists every chat model and checks all of them by itself, on one screen at every text size | ✅ Passed |
| When the working models are down, the chat still answers from the full model list | ✅ Passed |
| Upload a resume, design it, download PDF and Word, cover letter in Word | ✅ Passed |
| Paper size in the designer (Legal, A5, custom 8 x 10 in) changes the page shape and the files | ✅ Passed |
| On a bigger paper like A3 the whole design grows with the page, and the side column fills the full page | ✅ Passed |
| Messy messages from many test users (typos, Taglish, "yes", "search on internet", "what about…", nonsense, off topic) get the right action | ✅ Passed |
| Asking the chat "make it legal size", "use long bond paper", "make the paper 8 x 10 inches" or "back to A4" changes the paper | ✅ Passed |
| The answer shows word by word, and the first words come in about 1 to 2 seconds | ✅ Passed |
| Settings: theme, text size, reply length, providers, a wrong API key, export chats | ✅ Passed |
| Turning off chat history asks first, Cancel keeps the chats | ✅ Passed |
| About Our Group shows the project, course, section and all members | ✅ Passed |
| No sideways scrolling and no errors on every page | ✅ Passed |

## Known limits ⚠️

* The job APIs list remote jobs only, so some jobs (like nursing or driving) have few results. The app then gives buttons for JobStreet, Indeed and LinkedIn.
* In a browser the job list is smaller (backup APIs). The full list works in the Android app.
* Free AI models can be busy at times. The app moves to the next working model, or tells you to try again in a minute.
* Fit scores are only estimates from the AI.
* Old `.doc`, `.xls` and `.ppt` files cannot be read. Save them as PDF or the newer format first.

## Problems and fixes 🩹

* **`npm test` says "Vitest failed to find the runner" (Windows):** open the folder with a capital drive letter (`C:\...`, not `c:\...`) and run it again.
* **Port 8100 is already used:** close the other terminal or run `ionic serve --port 8200`.
* **The chat says the AI is busy:** wait a minute and send again. In Settings you can press Re-check to test the models.

## Privacy 🔒

There is no account and no login. Your resume, chats and settings are saved only on your device. When you use the AI, the text you send goes to the AI provider set in Settings.
