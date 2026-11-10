import { Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, AlertController, IonContent, IonTextarea, ToastController } from '@ionic/angular/lazy';

import { AiService, ApiMessage, ContentPart } from '../core/ai.service';
import { AiTaskService } from '../core/aitask.service';
import { JOB_TASKS, RESUME_TASKS, TaskKey } from '../core/aitasks';
import { isLetterRequest, letterize, nameFromRequest, stripChatter, titleOf } from '../core/docclean';
import { deliverBlob, exportFile, safeFileName } from '../core/fileexport';
import { Intent, detectDesign, detectIntent, isQuestion, isResumeEdit, looksLikeJobSearch, personFromRequest, roleFromRequest, usesMyResume, wantsDifferentDesign, wantsOnlinePhoto, wantsPhotoAdded, wantsPhotoRemoved } from '../core/intent';
import { ACCEPTED_FILES, FileReadError, formatBytes, readAttachment } from '../core/filereader';
import { ChatStore } from '../core/chatstore.service';
import { DOC_LABELS, DocVerdict, jobFromText, looksLikeResume } from '../core/doccheck';
import { RecommendService } from '../core/recommend.service';
import { ACCENTS, ResumeData, ResumeTemplate, TEMPLATES, resumeToText } from '../core/resumedata';
import { buildResumeFile } from '../core/resumerender';
import { ResumeDesignService } from '../core/resumedesign.service';
import { SYSTEM_PROMPT } from '../core/defaults';
import { JobService, describeHttpError, plainText } from '../core/job.service';
import { renderMarkdown } from '../core/markdown';
import { MOCK_INTERVIEW_SYSTEM, MODES, ModeInfo, modeInfo } from '../core/modes';
import { AiError, Attachment, ChatAction, ChatMessage, ChatMode, Conversation, ExportFormat, Job, Recommendation } from '../core/models';
import { PhotoService } from '../core/photo';
import { findWebPhoto, isSearchableName } from '../core/webphoto';
import { needsWeb, personFacts, searchQuery, webContext, webLookup } from '../core/websearch';
import { OFF_TOPIC_REPLY, SCOPE_QUESTION, obviouslyCareer } from '../core/scope';
import { Place, splitPlace } from '../core/places';
import { ProviderService } from '../core/provider.service';
import { ResumeService } from '../core/resume.service';
import { SettingsService } from '../core/settings.service';
import { newId } from '../core/storage';
import { MAX_MESSAGE_LENGTH, validateMessage, validateResume } from '../core/validators';

/** Which mode each AI task belongs to. */
const TASK_MODE: Record<TaskKey, ChatMode> = {
  analyze: 'resume',
  improve: 'resume',
  skills: 'resume',
  generate: 'resume',
  match: 'match',
  cover: 'apply',
  email: 'apply',
  gap: 'gap',
  interview: 'interview',
  evaluate: 'interview',
};

const TASK_NEEDS_JOB: TaskKey[] = ['match', 'cover', 'email', 'gap', 'interview'];
const MAX_ATTACHMENTS = 5;

/** Used when the user asks for a new document: the answer becomes the file, so it must contain nothing else. */
const DOCUMENT_SYSTEM =
  'You write finished documents. Output ONLY the document in clean markdown. Do NOT add a greeting, an explanation, notes to the user, ' +
  'follow-up questions or closing remarks. Do NOT use emojis. Use only facts the user gave; for anything missing write a short [placeholder]. ' +
  'Write in the language of the request. Make it complete, professional and ready to use.\n' +
  'Choose the right shape for the document:\n' +
  '- A LETTER or EMAIL (cover letter, application, resignation, recommendation, request): use the real letter format with NO title and NO section headings. ' +
  'Write: the sender block, the date, the recipient block, "Dear [Name],", three or four body paragraphs, a closing such as "Sincerely,", then the name. ' +
  'Keep it to one page. Put each address line on its own line.\n' +
  '- A REPORT, PLAN, SCHEDULE, CHECKLIST, STUDY GUIDE or similar: use one # title, then ## section headings, short paragraphs and - bullets; ' +
  'use a table only when it really helps.';

/** Messages that ask the AI to find / recommend jobs from the resume. */
const JOB_INTENT =
  /\b(recommend|suggest|find (me )?(a |an |some |the |any )?(job|work|position|role|opening|vacanc)|find (me )?[\w\s/&-]{0,40}?\b(jobs?|work|positions?|roles?|openings?|vacanc\w+)\b|(search|look)( for)? [\w\s/&-]{0,40}?\bjobs?\b|get me (a |an )?(job|work)|jobs? (for|that|i|fit|suit|in|near|at|around)|(work|hiring|openings?|vacancies) (for|that|i|in|near|around) |i (want|need) (a |an )?(new )?(job|work)|looking for (a |an )?([\w-]+ ){0,3}(job|work)|accept(ed)?|hire[d]?|my chances?|fit(s)? me|suit(s)? me|match me|which jobs?|what jobs?|where (can|should) i apply|apply (for|to))\b/i;
const RESUME_MODES: ChatMode[] = ['resume', 'finder', 'match', 'apply', 'gap', 'interview'];

/**
 * Main page: one AI chat with six modes
 * (Resume Assistant, Job Finder, Job Matching, Application Assistant, Skills Gap, Interview Prep).
 */
@Component({
  selector: 'app-chat',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
  standalone: false,
})
export class ChatPage implements OnDestroy {
  @ViewChild(IonContent) content?: IonContent;
  @ViewChild('filePicker') filePicker?: ElementRef<HTMLInputElement>;
  @ViewChild('msgBox') textarea?: IonTextarea;

  readonly accepted = ACCEPTED_FILES;
  readonly formatBytes = formatBytes;
  /** Files waiting to be sent with the next message. */
  pending = signal<Attachment[]>([]);
  reading = signal(false);
  /** True while the user drags a file over the chat. */
  dragging = signal(false);
  /** What the AI is doing right now (shown instead of "Thinking"). */
  stepText = signal('');
  private dragDepth = 0;
  /** Pictures are kept in memory only (too big to save in history). */
  private images = new Map<string, string[]>();

  readonly modes = MODES;
  readonly maxLength = MAX_MESSAGE_LENGTH;

  chat = signal<Conversation>({ id: newId(), title: 'New chat', updated: Date.now(), messages: [] });
  mode = signal<ChatMode>('general');
  job = signal<Job | undefined>(undefined);
  mock = signal(false);
  sending = signal(false);
  elapsed = signal(0);
  historyOpen = signal(false);
  /** The resume designer (layout, colour, preview, download). */
  designerOpen = signal(false);
  designerData = signal<ResumeData | null>(null);
  designerDesign = signal<{ template: ResumeTemplate; accent: string } | null>(null);
  private designerMsgId = '';
  inputText = '';
  /** Messages written while the AI was busy; they are sent one after another when it finishes. */
  queue = signal<{ text: string; files: Attachment[]; quote?: string }[]>([]);
  /** The earlier message the next message replies to. */
  replyQuote = signal<{ id: string; text: string } | null>(null);
  /** The message being edited: sending it again replaces it and everything after it. */
  editingId = signal<string | null>(null);
  private quoteNext?: string;
  private autoNext = false;
  inputError = '';

  info = computed<ModeInfo>(() => modeInfo(this.mode()));
  hasResume = computed(() => this.resume.resume().length > 0);

  /** Small status text under the header. */
  status = computed(() => {
    const ready = this.providers.workingModels().length;
    if (!this.providers.enabled().length) {
      return { ok: false, text: 'No AI provider enabled. Open Settings.' };
    }
    if (this.ai.scanning()) {
      return { ok: true, text: 'Checking AI models…' };
    }
    return ready
      ? { ok: true, text: `AI ready · ${ready} model${ready > 1 ? 's' : ''}` }
      : { ok: true, text: 'AI picks the best model on your first message' };
  });

  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private ai: AiService,
    private tasks: AiTaskService,
    public store: ChatStore,
    public providers: ProviderService,
    public settings: SettingsService,
    public resume: ResumeService,
    private jobs: JobService,
    private route: ActivatedRoute,
    private router: Router,
    private toast: ToastController,
    private alerts: AlertController,
    private sheets: ActionSheetController,
    private rec: RecommendService,
    private photos: PhotoService,
    private design: ResumeDesignService,
  ) {
    // the chat list in the side navigation: open a chat, or start a new one
    effect(() => {
      const r = this.store.request();
      if (!r) {
        return;
      }
      untracked(() => {
        this.store.request.set(null);
        if (this.sending()) {
          return;
        }
        if (r.kind === 'new') {
          this.newChat();
        } else {
          const c = r.id ? this.store.get(r.id) : undefined;
          if (c) {
            this.openConversation(c);
          }
        }
      });
    });
    effect(() => this.store.activeId.set(this.chat().id));
  }

  ionViewWillEnter(): void {
    const params = this.route.snapshot.queryParamMap;
    const jobId = Number(params.get('jobId'));
    const task = params.get('task') as TaskKey | null;
    const mode = params.get('mode') as ChatMode | null;
    if (jobId) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.startFromJob(jobId, task);
    } else if (mode && (mode === 'general' || this.modes.some((m) => m.key === mode))) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.selectMode(mode);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  // ---------- template helpers ----------
  html(m: ChatMessage): string {
    return renderMarkdown(m.content);
  }

  trackMessage(_: number, m: ChatMessage): string {
    return m.id;
  }

  isLast(m: ChatMessage): boolean {
    const list = this.chat().messages;
    return list[list.length - 1]?.id === m.id && !this.sending();
  }

  get remaining(): number {
    return this.maxLength - this.inputText.length;
  }

  scoreLabel(score: number): string {
    return score >= 75 ? 'Strong match' : score >= 50 ? 'Partial match' : 'Low match';
  }

  scoreClass(score: number): string {
    return score >= 75 ? 'good' : score >= 50 ? 'mid' : 'low';
  }

  actionLabel(task: TaskKey): string {
    return [...RESUME_TASKS, ...JOB_TASKS].find((t) => t.key === task)?.label ?? task;
  }

  // ---------- conversation handling ----------
  newChat(): void {
    if (this.sending()) {
      return;
    }
    this.chat.set({ id: newId(), title: 'New chat', updated: Date.now(), messages: [] });
    this.mode.set('general');
    this.job.set(undefined);
    this.mock.set(false);
    this.pending.set([]);
    this.queue.set([]);
    this.editingId.set(null);
    this.replyQuote.set(null);
    this.inputText = '';
    this.inputError = '';
  }

  openConversation(c: Conversation): void {
    c.messages.forEach((m) => {
      m.jobs?.forEach((j) => this.jobs.remember(j));
      m.recs?.forEach((r) => this.jobs.remember(r.job));
    });
    if (c.job) {
      this.jobs.remember(c.job);
    }
    this.chat.set(c);
    this.mode.set(c.mode ?? 'general');
    this.job.set(c.job);
    this.mock.set(false);
    this.historyOpen.set(false);
    this.scrollDown();
  }

  async deleteConversation(c: Conversation, event: Event): Promise<void> {
    event.stopPropagation();
    const alert = await this.alerts.create({
      header: 'Delete this chat?',
      message: `"${c.title}" will be deleted from this device. This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.store.remove(c.id);
            if (this.chat().id === c.id) {
              this.newChat();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  /** Opened from Job Details ("Match with my resume", "Cover letter"...). */
  private async startFromJob(id: number, task: TaskKey | null): Promise<void> {
    const job = this.jobs.peek(id) ?? (await this.jobs.getJob(id).catch(() => undefined));
    if (!job) {
      return;
    }
    this.chat.set({ id: newId(), title: 'New chat', updated: Date.now(), messages: [] });
    this.job.set(job);
    this.mock.set(false);
    this.mode.set(task ? TASK_MODE[task] : 'match');
    this.push({
      role: 'assistant',
      content: `You picked **${job.title}** at ${job.company_name}.`,
    });
    if (task) {
      await this.runTask(task);
    } else {
      this.showJobActions();
    }
  }

  /** The feature switcher (Ionic segment) changed. */
  onMode(value: string | number | null | undefined): void {
    const key = String(value ?? 'general') as ChatMode;
    if (key !== this.mode()) {
      this.selectMode(key);
    }
  }

  selectMode(key: ChatMode): void {
    if (this.sending()) {
      return;
    }
    this.mode.set(key);
    this.mock.set(false);
    // picking another feature replaces the last "what I can do" message instead of piling up more of them
    const kept = [...this.chat().messages];
    while (kept.length && kept[kept.length - 1].intro) {
      kept.pop();
    }
    if (kept.length !== this.chat().messages.length) {
      this.chat.set({ ...this.chat(), messages: kept });
    }
    const info = modeInfo(key);
    if (key === 'general') {
      this.persist();
      return;
    }
    let actions = info.actions;
    if (this.job()) {
      actions = actions.filter((a) => a.mode !== 'finder');
    }
    this.push({ role: 'assistant', content: info.intro, actions, intro: true });
    this.scrollDown();
  }

  private showJobActions(): void {
    this.push({
      role: 'assistant',
      content: 'What would you like to do with this job?',
      actions: [
        { label: 'Match score', icon: 'speedometer', task: 'match' },
        { label: 'Cover letter', icon: 'document', task: 'cover' },
        { label: 'Skills gap', icon: 'trending-up', task: 'gap' },
        { label: 'Interview prep', icon: 'chatbubbles', task: 'interview' },
      ],
    });
    this.scrollDown();
  }

  selectJob(job: Job): void {
    this.jobs.remember(job);
    this.job.set(job);
    this.push({ role: 'assistant', content: `Selected **${job.title}** at ${job.company_name}.` });
    this.showJobActions();
  }

  clearJob(): void {
    this.job.set(undefined);
    this.mock.set(false);
  }

  openJob(job: Job): void {
    this.jobs.remember(job);
    this.router.navigate(['/job', job.id]);
  }

  useStarter(text: string): void {
    this.inputText = text;
    this.inputError = '';
  }

  // ---------- actions (buttons under assistant messages) ----------
  async onAction(a: ChatAction, m?: ChatMessage): Promise<void> {
    if (a.url) {
      window.open(a.url, '_blank', 'noopener');
      return;
    }
    if (this.sending()) {
      return;
    }
    if (a.command === 'download' && a.format && m) {
      const target = a.data ? this.chat().messages.find((x) => x.id === a.data) ?? m : m;
      await this.download(target, a.format);
    } else if (a.command === 'downloadResume' && (a.format === 'pdf' || a.format === 'docx') && m?.resume) {
      await this.downloadResume(m, a.format);
    } else if (a.command === 'saveResume' && a.data) {
      this.saveAsResume(a.data);
    } else if (a.command === 'more' && a.data) {
      const { q, page } = JSON.parse(a.data) as { q: string; page: number };
      await this.searchJobs(q, page, false);
    } else if (a.command === 'design' && m?.resume) {
      this.openDesigner(m);
    } else if (a.command === 'pickPhoto') {
      this.pickPhoto();
    } else if (a.command === 'findPhotoOnline' && m?.resume) {
      await this.editResume('add a photo from the internet', [], m);
    } else if (a.command === 'recommend') {
      await this.recommendFromSaved();
    } else if (a.command === 'askAnyway') {
      await this.askAnyway();
    } else if (a.command === 'useJob' && a.data) {
      const shown = this.recentJobs(30).find((j) => String(j.id) === a.data);
      if (shown) {
        this.selectJob(shown);
      } else {
        this.selectJob(jobFromText(a.data.replace(/^role:/, '')));
      }
    } else if (a.command === 'resume') {
      this.pickResume();
    } else if (a.command === 'mock') {
      await this.startMock();
    } else if (a.mode) {
      this.selectMode(a.mode);
    } else if (a.task) {
      await this.runTask(a.task);
    }
  }

  /** The jobs shown in this chat recently (search results and recommendations), newest first, without repeats. */
  private recentJobs(max = 10): Job[] {
    const seen = new Set<number>();
    const out: Job[] = [];
    for (const m of [...this.chat().messages].reverse()) {
      const list = [...(m.jobs ?? []), ...(m.recs ?? []).map((r) => r.job)];
      for (const j of list) {
        if (!seen.has(j.id)) {
          seen.add(j.id);
          out.push(j);
        }
      }
      if (out.length >= max) {
        break;
      }
    }
    return out.slice(0, max);
  }

  /** The recent jobs as text for the AI, with their links, so it can answer questions about them. */
  private recentJobsContext(): string {
    const jobs = this.recentJobs();
    if (!jobs.length) {
      return '';
    }
    const lines = jobs.map(
      (j, i) =>
        `${i + 1}. ${j.title} at ${j.company_name}. Place: ${j.candidate_required_location || 'not listed'}. Type: ${j.job_type || 'not listed'}. ` +
        `Pay: ${j.salary || 'not listed'}. Apply: ${j.url || 'no link'}. About: ${plainText(j.description, 220)}`,
    );
    return `RECENT JOB RESULTS (the jobs this user is looking at, newest search first):\n${lines.join('\n')}`;
  }

  /** Checks the resume / job that a feature needs; tells the user what is missing. */
  private ready(needsResume: boolean, needsJob: boolean): boolean {
    if (needsResume && !this.hasResume()) {
      this.push({
        role: 'assistant',
        content: 'I need your resume first. It stays on this device.',
        actions: [{ label: 'Add resume', icon: 'create', command: 'resume' }],
      });
      this.scrollDown();
      return false;
    }
    if (needsJob && !this.job()) {
      const recent = this.recentJobs(4);
      const lastSearch = [...this.chat().messages].reverse().find((m) => m.role === 'user' && !m.auto && m.content.length < 80 && !isQuestion(m.content))?.content;
      const actions: ChatAction[] = recent.map((j) => ({ label: `${j.title} - ${j.company_name}`.slice(0, 48), icon: 'briefcase', command: 'useJob' as const, data: String(j.id) }));
      if (lastSearch && !recent.length) {
        actions.push({ label: `Use "${lastSearch.slice(0, 30)}"`, icon: 'create', command: 'useJob', data: `role:${lastSearch}` });
      }
      actions.push({ label: 'Find a job', icon: 'search', mode: 'finder' });
      this.push({
        role: 'assistant',
        content: recent.length ? 'Which job is this for? Pick one of the jobs I just showed, or find another.' : 'Which job is this for? Search for one and tap **Select**.',
        actions,
      });
      this.scrollDown();
      return false;
    }
    return true;
  }

  async runTask(task: TaskKey): Promise<void> {
    this.mode.set(TASK_MODE[task]);
    if (!this.ready(true, TASK_NEEDS_JOB.includes(task))) {
      return;
    }
    this.push({ role: 'user', content: this.actionLabel(task) });
    if (task === 'generate') {
      await this.designResume();
      return;
    }
    await this.busy(async () => {
      const out = await this.tasks.run(task, { resume: this.resume.resume(), job: this.job() });
      this.push({
        role: 'assistant',
        content: out.text,
        model: out.model,
        score: out.score ?? undefined,
        actions: this.followUps(task, out.text),
      });
    });
  }

  // ---------- make a file straight from a request ----------
  /**
   * The user asked for a file ("create me a resume", "write a cover letter as Word", "make this a pdf").
   * The app writes it, builds the real PDF or Word file and downloads it right away, without asking questions.
   */
  private async handleCreate(text: string, files: Attachment[], intent: Intent): Promise<void> {
    this.pending.set([]);
    const id = newId();
    const pictures = files.flatMap((f) => f.images ?? []);
    if (pictures.length) {
      this.images.set(id, pictures);
    }
    const message: ChatMessage = {
      id,
      role: 'user',
      content: text,
      time: Date.now(),
      quote: this.takeQuote(),
      auto: this.takeAuto(),
      attachments: files.map(({ images, preview, ...rest }) => rest),
    };
    this.chat.set({ ...this.chat(), messages: [...this.chat().messages, message] });
    if (intent.kind === 'convert') {
      await this.convertLast(intent);
    } else if (intent.kind === 'resume') {
      await this.createResume(text, files, pictures, intent);
    } else {
      await this.createDocument(text, files, pictures, intent);
    }
  }

  private otherFormats(id: string, current: string): ChatAction[] {
    const all: { format: ExportFormat; label: string; icon: string }[] = [
      { format: 'pdf', label: 'Get PDF', icon: 'document' },
      { format: 'docx', label: 'Get Word', icon: 'document-text' },
    ];
    return all.filter((f) => f.format !== current).map((f) => ({ label: f.label, icon: f.icon, command: 'download', format: f.format, data: id }));
  }

  /** "make this a pdf": the last answer becomes a file, no AI needed. */
  private async convertLast(intent: Intent): Promise<void> {
    const source = [...this.chat().messages].reverse().find((m) => m.role === 'assistant' && !m.error && m.content.length > 40);
    if (!source) {
      this.push({ role: 'assistant', content: 'There is nothing to turn into a file yet. Ask me to write something first.' });
      return;
    }
    await this.busy(async () => {
      this.stepText.set('Creating your file…');
      const doc = stripChatter(source.content);
      const note = await exportFile(intent.format, titleOf(doc) ?? `SeeCareer ${new Date().toISOString().slice(0, 10)}`, doc);
      this.push({ role: 'assistant', content: 'Done. I turned my last answer into a file.', fileNote: note, actions: this.otherFormats(source.id, intent.format) });
    });
  }

  /** A new document (cover letter, report, schedule...): written clean, then built and downloaded. */
  private async createDocument(text: string, files: Attachment[], pictures: string[], intent: Intent): Promise<void> {
    await this.busy(async () => {
      this.stepText.set('Writing your document…');
      const fileText = files
        .filter((f) => f.text)
        .map((f) => `[File: ${f.name}]\n${f.text}`)
        .join('\n\n');
      let extra = '';
      const job = this.job();
      if (job) {
        extra += `\n\nSelected job: ${job.title} at ${job.company_name}. ${plainText(job.description, 1200)}`;
      }
      if (this.hasResume() && /\b(my|for me|i am|i'm|mine)\b/i.test(text) && (await this.tasks.ensureConsent())) {
        extra += `\n\nThe user's resume:\n${this.resume.resume().slice(0, 5000)}`;
      }
      const instructions = this.settings.settings().customInstructions.trim();
      const system = DOCUMENT_SYSTEM + (instructions ? `\nExtra instructions from the user: ${instructions}` : '');
      const body = text + (fileText ? `\n\nFILES:\n${fileText}` : '') + extra;
      const content: string | ContentPart[] = pictures.length
        ? [{ type: 'text', text: body }, ...pictures.slice(0, 3).map((url): ContentPart => ({ type: 'image_url', image_url: { url } }))]
        : body;
      const result = await this.ai.chat([{ role: 'system', content: system }, { role: 'user', content }], 2000, { temperature: 0.4 });
      const cleaned = stripChatter(result.content);
      const letter = isLetterRequest(text);
      const doc = letter ? letterize(cleaned) : cleaned;
      if (doc.length < 20) {
        throw new AiError('The AI did not write a document. Please try again.', 'models');
      }
      const title = (letter ? undefined : titleOf(doc)) ?? nameFromRequest(text);
      this.stepText.set('Creating your file…');
      const note = await exportFile(intent.format, title, doc);
      const id = newId();
      this.push({ id, role: 'assistant', content: doc, model: result.model, fileNote: note, actions: this.otherFormats(id, intent.format) });
    });
  }

  /** A designed resume from the request, a file the user attached, a photo of a resume, or the saved resume. */
  private async createResume(text: string, files: Attachment[], pictures: string[], intent: Intent): Promise<void> {
    await this.busy(async () => {
      const fileText = files
        .filter((f) => f.text)
        .map((f) => f.text)
        .join('\n\n');
      let info = fileText;
      let source = files.length ? 'your file' : '';
      const person = personFromRequest(text); // "for Jahn Paul": not the user's own resume
      const forRole = !!roleFromRequest(text) && !usesMyResume(text); // "for a nurse": a resume for that job, not the saved one
      if (!info && !pictures.length && this.hasResume() && person === null && !forRole) {
        info = this.resume.resume();
        source = 'your saved resume';
      }
      // for a well-known person the app looks them up, so the resume holds real facts instead of placeholders
      let publicFacts = false;
      if (!info && !pictures.length && person) {
        this.stepText.set(`Looking up ${person} online…`);
        const facts = await personFacts(person);
        if (facts) {
          info = `Facts about ${facts.title} from Wikipedia (${facts.url}):\n${facts.text}`;
          source = 'Wikipedia';
          publicFacts = true;
        }
      }
      const hasInfo = !!info || pictures.length > 0;
      if (hasInfo && !publicFacts && !(await this.tasks.ensureConsent())) {
        throw new AiError('Cancelled. The AI needs your permission to read the resume.', 'config');
      }
      this.stepText.set('Designing your resume…');
      const lookIn = [...pictures, ...files.flatMap((f) => (f.preview ? [f.preview] : []))];
      const [out, photo] = await Promise.all([
        this.design.fromInput({
          text: info,
          images: pictures,
          request: text,
          instructions: this.settings.settings().customInstructions,
          person: person || undefined,
        }),
        hasInfo && lookIn.length ? this.photos.findPhoto(lookIn) : Promise.resolve(null),
      ]);
      const d: ResumeData = photo ? { ...out.data, photo } : { ...out.data };
      // what the user asked for wins, then what suits their field, then the default
      const template = intent.template ?? d.design?.template ?? 'modern';
      const accent = intent.accent ?? d.design?.accent ?? ACCENTS[0].hex;
      const format = intent.format === 'docx' ? 'docx' : 'pdf';
      // the app has no web access of its own for the AI, so a photo "from the internet" is searched here
      let webNote = '';
      let needPhoto = false;
      if ((wantsPhotoAdded(text) || wantsOnlinePhoto(text)) && !d.photo) {
        this.stepText.set('Looking for a photo online…');
        const web = await findWebPhoto(d.name);
        if (web) {
          d.photo = await this.photos.fromPicture(web);
          webNote = ` I added the Wikipedia photo of ${d.name}.`;
        } else {
          needPhoto = true;
          webNote = isSearchableName(d.name) ? ` I could not find a public photo of ${d.name} online, so use the button to choose one.` : ' Use the button to choose a photo.';
        }
      }
      const label = TEMPLATES.find((t) => t.key === template)?.label ?? 'Modern';
      const actions: ChatAction[] = this.resumeActions(format);
      const fromUpload = files.length > 0 || pictures.length > 0;
      if (needPhoto) {
        actions.unshift({ label: 'Choose photo', icon: 'image', command: 'pickPhoto' });
      } else if (d.photo && webNote) {
        actions.push({ label: 'Use my own photo', icon: 'image', command: 'pickPhoto' });
      }
      if (fromUpload) {
        this.resume.save(resumeToText(d).slice(0, 12000));
      } else if (hasInfo && !publicFacts) {
        actions.push({ label: 'Use as my resume', icon: 'save', command: 'saveResume', data: resumeToText(d) });
      }
      this.push({
        role: 'assistant',
        model: out.model,
        resume: d,
        resumeDesign: { template, accent },
        resumeFormat: format,
        content: hasInfo
          ? `Done. I made ${publicFacts ? `a resume for ${d.name}` : 'your resume'} from ${source} in the ${label} design${photo ? ', with your photo' : ''}.${webNote} Use a button below to download it, or open the designer to change the layout, colour or wording.`
          : `I did not have ${person ? person + "'s" : 'your'} details yet, so I made a ready-to-fill **template** in the ${label} design with [placeholders].${webNote} ` +
            `Send ${person ? 'their' : 'your'} details or a resume file and I will fill it in. You can also say "add picture", "make it red" or "add skill Python", then download it with a button below.`,
        actions,
      });
    });
  }

  private designOf(d: ResumeData): { template: ResumeTemplate; accent: string } {
    return { template: d.design?.template ?? 'modern', accent: d.design?.accent ?? ACCENTS[0].hex };
  }

  private async downloadResume(m: ChatMessage, format: 'pdf' | 'docx'): Promise<void> {
    const d = m.resume;
    if (!d) {
      return;
    }
    const design = m.resumeDesign ?? this.designOf(d);
    let message: string;
    try {
      message = await deliverBlob(await buildResumeFile(format, d, design.template, design.accent), `${safeFileName(d.name)} Resume.${format}`);
    } catch {
      message = 'Could not create the file.';
    }
    const t = await this.toast.create({ message, duration: 2200, position: 'top' });
    await t.present();
  }

  /** The designer's layout or colour changed: remember it on the message. */
  onDesignChanged(design: { template: ResumeTemplate; accent: string }): void {
    this.designerDesign.set(design);
    this.chat.set({
      ...this.chat(),
      messages: this.chat().messages.map((m) => (m.id === this.designerMsgId ? { ...m, resumeDesign: design } : m)),
    });
    this.persist();
  }

  // ---------- resume designer ----------
  /** Turns the saved resume into a designed one: the AI returns structured data, the app lays it out. */
  private async designResume(): Promise<void> {
    await this.busy(async () => {
      if (!(await this.tasks.ensureConsent())) {
        throw new AiError('Cancelled. The AI needs your permission to read the resume.', 'config');
      }
      this.stepText.set('Designing your resume…');
      const out = await this.design.fromText(this.resume.resume(), this.settings.settings().customInstructions);
      const d = out.data;
      const msg = this.push({
        role: 'assistant',
        model: out.model,
        resume: d,
        resumeDesign: this.designOf(d),
        content:
          `Your resume is ready: **${d.name}**${d.title ? ', ' + d.title : ''}. It has ${d.experience.length} job${d.experience.length === 1 ? '' : 's'}, ` +
          `${d.education.length} education entr${d.education.length === 1 ? 'y' : 'ies'} and ${d.skills.reduce((n, g) => n + g.items.length, 0)} skills.\n\n` +
          'Open the designer to pick a layout and colour, ask me to change anything, and download it as PDF or Word.',
        resumeFormat: 'pdf',
        actions: [...this.resumeActions('pdf'), { label: 'Use as my resume', icon: 'save', command: 'saveResume', data: resumeToText(d) }],
      });
      this.openDesigner(msg);
    });
  }

  openDesigner(m: ChatMessage): void {
    if (!m.resume) {
      return;
    }
    this.designerMsgId = m.id;
    this.designerData.set(m.resume);
    this.designerDesign.set(m.resumeDesign ?? this.designOf(m.resume));
    this.designerOpen.set(true);
  }

  /** The AI changed the resume inside the designer: keep the chat message in sync. */
  onDesignerChanged(d: ResumeData): void {
    this.designerData.set(d);
    this.chat.set({
      ...this.chat(),
      messages: this.chat().messages.map((m) => (m.id === this.designerMsgId ? { ...m, resume: d } : m)),
    });
    this.persist();
  }

  onDesignerSave(text: string): void {
    this.saveAsResume(text);
  }

  /** What to offer after an answer: the next useful steps, never a dead end. */
  private followUps(task: TaskKey, text = ''): ChatAction[] {
    const resumeTool = (key: TaskKey, label: string, icon: string): ChatAction => ({ label, icon, task: key });
    const jobTools = (skip: TaskKey[]): ChatAction[] =>
      JOB_TASKS.filter((t) => !skip.includes(t.key)).map((t) => ({ label: t.label, icon: t.icon.replace('-outline', ''), task: t.key }));
    const findJobs: ChatAction = { label: 'Find jobs I can get', icon: 'rocket', command: 'recommend' };
    switch (task) {
      case 'analyze':
        return [resumeTool('improve', 'Improve wording', 'color-wand'), resumeTool('skills', 'Extract skills', 'list'), resumeTool('generate', 'Design my resume', 'color-palette'), findJobs];
      case 'skills':
        return [resumeTool('analyze', 'Analyze', 'search'), resumeTool('improve', 'Improve wording', 'color-wand'), resumeTool('generate', 'Design my resume', 'color-palette'), findJobs];
      case 'generate':
      case 'improve':
        return [
          { label: 'Download PDF', icon: 'document', command: 'download', format: 'pdf' },
          { label: 'Download Word', icon: 'document-text', command: 'download', format: 'docx' },
          { label: 'Use as my resume', icon: 'save', command: 'saveResume', data: text },
          resumeTool('generate', 'Design my resume', 'color-palette'),
        ];
      case 'match':
        return jobTools(['match']);
      case 'cover':
      case 'email':
        return [{ label: 'Download PDF', icon: 'document', command: 'download', format: 'pdf' }, ...jobTools([task])];
      case 'gap':
        return jobTools(['gap']);
      case 'interview':
        return [{ label: 'Start mock interview', icon: 'mic', command: 'mock' }, ...jobTools(['interview'])];
      default:
        return [];
    }
  }

  private async startMock(): Promise<void> {
    this.mode.set('interview');
    if (!this.ready(true, true)) {
      return;
    }
    this.mock.set(true);
    this.push({ role: 'user', content: 'Start mock interview' });
    await this.busy(async () => {
      const result = await this.ai.chat(await this.contextMessages(), this.settings.settings().maxTokens);
      this.push({ role: 'assistant', content: result.content, model: result.model });
    });
  }

  // ---------- Job Finder ----------
  private async searchJobs(query: string, page = 0, echo = true): Promise<void> {
    if (echo) {
      this.push({ role: 'user', content: query });
    }
    this.sending.set(true);
    this.elapsed.set(0);
    this.scrollDown();
    try {
      const result = await this.jobs.getJobs(query, page);
      const top = result.jobs.slice(0, 8);
      if (top.length) {
        const from = page * 20 + 1;
        this.push({
          role: 'assistant',
          content:
            page === 0
              ? `I found **${result.total.toLocaleString()}** openings for “${query}”${
                  result.place ? (result.loose ? `. None are only for ${result.place}, so these are remote jobs that also accept people there` : ` hiring in ${result.place}`) : ''
                }. Here are the first ${top.length}. Tap **Select** to match, apply or practice for one.`
              : `More openings for “${query}” (results ${from}–${from + top.length - 1}):`,
          jobs: top,
          actions: [
            ...(result.hasMore ? [{ label: 'Show more jobs', icon: 'add', command: 'more', data: JSON.stringify({ q: query, page: page + 1 }) } as ChatAction] : []),
            ...(page === 0 ? this.localSearches(splitPlace(query).query, splitPlace(query).place) : []),
          ],
        });
      } else {
        this.push({
          role: 'assistant',
          content:
            page === 0
              ? `No remote openings found${splitPlace(query).query ? ` for “${splitPlace(query).query}”` : ''}${splitPlace(query).place ? ` in ${splitPlace(query).place!.label}` : ''}.` +
                (splitPlace(query).place ? ' My job feed only lists remote jobs, so for on-site work near that place use these searches.' : ' Try a simpler keyword like “developer” or “design”.')
              : 'No more openings for this search.',
          actions: page === 0 ? this.localSearches(splitPlace(query).query, splitPlace(query).place) : [],
        });
      }
    } catch (e) {
      this.push({ role: 'assistant', content: describeHttpError(e), error: true });
    } finally {
      this.sending.set(false);
      this.persist();
      this.scrollDown();
    }
  }

  // ---------- attachments (upload any file) ----------
  async openAttachMenu(): Promise<void> {
    const sheet = await this.sheets.create({
      header: 'Add to chat',
      buttons: [
        { text: 'Upload file (PDF, Word, image, text)', icon: 'attach', handler: () => this.filePicker?.nativeElement.click() },
        { text: this.hasResume() ? 'Upload a new resume' : 'Upload my resume', icon: 'document-text', handler: () => this.pickResume() },
        ...(this.hasResume() ? [{ text: 'Forget my saved resume', icon: 'trash', role: 'destructive', handler: () => this.forgetResume() }] : []),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  /** True when the file picker was opened for "upload my resume": the file is sent as soon as it is read. */
  private resumePick = false;
  private photoPick = false;

  /** Opens the file picker straight away. The chosen file is read, checked and remembered as the user's resume. */
  pickResume(): void {
    this.resumePick = true;
    this.filePicker?.nativeElement.click();
  }

  forgetResume(): void {
    this.resume.clear();
    this.push({ role: 'assistant', content: 'I forgot your saved resume. Upload a new one any time.' });
    this.persist();
    this.scrollDown();
  }

  async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const asResume = this.resumePick;
    this.resumePick = false;
    const asPhoto = this.photoPick;
    this.photoPick = false;
    if (asPhoto) {
      if (files[0] && !this.sending()) {
        await this.applyPhotoFile(files[0]);
      }
      return;
    }
    await this.addFiles(files);
    if (asResume && this.pending().length && !this.inputText.trim()) {
      await this.send(); // just the file: no words are added to the chat
    }
  }

  // ---------- drag & drop and paste ----------
  private hasFiles(e: DragEvent): boolean {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files');
  }

  @HostListener('dragenter', ['$event'])
  onDragEnter(e: DragEvent): void {
    if (this.hasFiles(e)) {
      e.preventDefault();
      this.dragDepth++;
      this.dragging.set(true);
    }
  }

  @HostListener('dragover', ['$event'])
  onDragOver(e: DragEvent): void {
    if (this.hasFiles(e)) {
      e.preventDefault(); // required, otherwise the browser refuses the drop
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    }
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(e: DragEvent): void {
    if (this.hasFiles(e)) {
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (!this.dragDepth) {
        this.dragging.set(false);
      }
    }
  }

  @HostListener('drop', ['$event'])
  async onDrop(e: DragEvent): Promise<void> {
    if (!this.hasFiles(e)) {
      return;
    }
    e.preventDefault();
    this.dragDepth = 0;
    this.dragging.set(false);
    await this.addFiles(Array.from(e.dataTransfer?.files ?? []));
  }

  /** Pasting a screenshot or file into the message box attaches it. */
  async onPaste(e: ClipboardEvent): Promise<void> {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      await this.addFiles(files);
    }
  }

  /** Reads files (from the picker, drag & drop or paste) and queues them for the next message. */
  private async addFiles(files: File[]): Promise<void> {
    if (!files.length || this.sending()) {
      return;
    }
    const room = MAX_ATTACHMENTS - this.pending().length;
    if (room <= 0) {
      this.inputError = `You can attach up to ${MAX_ATTACHMENTS} files at once.`;
      return;
    }
    this.reading.set(true);
    this.inputError = '';
    const problems: string[] = [];
    for (const file of files.slice(0, room)) {
      try {
        const att = await readAttachment(file);
        this.pending.update((list) => [...list, att]);
      } catch (e) {
        problems.push(e instanceof FileReadError ? e.message : `Could not read "${file.name}".`);
      }
    }
    if (files.length > room) {
      problems.push(`Only ${MAX_ATTACHMENTS} files can be attached at once.`);
    }
    this.reading.set(false);
    this.inputError = problems.join(' ');
  }

  removePending(id: string): void {
    this.pending.update((list) => list.filter((a) => a.id !== id));
  }

  imagesOf(m: ChatMessage): string[] {
    return this.images.get(m.id) ?? [];
  }

  attachmentIcon(a: Attachment): string {
    return a.kind === 'pdf' ? 'document' : a.kind === 'docx' ? 'document-text' : a.kind === 'image' ? 'image' : a.kind === 'other' ? 'document-attach' : 'code-slash';
  }

  private saveAsResume(text: string): void {
    const problem = validateResume(text);
    if (problem) {
      this.push({ role: 'assistant', content: `That text can't be saved as your resume: ${problem}` });
      return;
    }
    if (!looksLikeResume(text)) {
      this.push({
        role: 'assistant',
        content: "That text doesn't look like a real resume (no contact details, work history or sections), so I did not save it as your resume.",
        actions: [{ label: 'Add my resume', icon: 'create', command: 'resume' }],
      });
      return;
    }
    this.resume.save(text);
    this.push({
      role: 'assistant',
      content: 'Saved as your resume on this device.',
      actions: [
        { label: 'Analyze', icon: 'search', task: 'analyze' },
        { label: 'Find jobs I can get', icon: 'rocket', command: 'recommend' },
        { label: 'Design my resume', icon: 'color-palette', task: 'generate' },
      ],
    });
    this.persist();
    this.scrollDown();
  }


  // ---------- changing the resume that was just made ----------
  /** The resume made in the last few messages, so "add picture" or "make it red" know what to change. */
  private recentResume(): ChatMessage | undefined {
    return this.chat()
      .messages.slice(-3)
      .reverse()
      .find((m) => m.role === 'assistant' && !!m.resume);
  }

  private formatOf(m: ChatMessage, text: string): 'pdf' | 'docx' {
    if (/\b(word|docx?)\b/i.test(text)) {
      return 'docx';
    }
    if (/\bpdf\b/i.test(text)) {
      return 'pdf';
    }
    return m.resumeFormat ?? (/\.docx\b/i.test(m.fileNote ?? '') ? 'docx' : 'pdf');
  }

  /** The buttons under a made resume: download it in the format asked for first, the other format second, and the designer. */
  private resumeActions(format: 'pdf' | 'docx'): ChatAction[] {
    const other = format === 'pdf' ? 'docx' : 'pdf';
    const name = (f: string) => (f === 'pdf' ? 'PDF' : 'Word');
    return [
      { label: `Download ${name(format)}`, icon: 'download', command: 'downloadResume', format },
      { label: `Download ${name(other)}`, icon: 'document-text', command: 'downloadResume', format: other },
      { label: 'Open designer', icon: 'color-palette', command: 'design' },
    ];
  }

  /** Shows the changed resume in the chat. Nothing is downloaded until the user taps a download button. */
  private async deliverResume(d: ResumeData, template: ResumeTemplate, accent: string, format: 'pdf' | 'docx', model: string | undefined, content: string): Promise<void> {
    const withDesign = { ...d, design: { ...d.design, template, accent } };
    this.push({
      role: 'assistant',
      model,
      resume: withDesign,
      resumeDesign: { template, accent },
      resumeFormat: format,
      content,
      actions: this.resumeActions(format),
    });
  }

  private async editResume(text: string, files: Attachment[], last: ChatMessage): Promise<void> {
    this.pending.set([]);
    const id = newId();
    const pictures = files.flatMap((f) => f.images ?? []);
    if (pictures.length) {
      this.images.set(id, pictures);
    }
    this.chat.set({
      ...this.chat(),
      messages: [
        ...this.chat().messages,
        { id, role: 'user', content: text, time: Date.now(), quote: this.takeQuote(), auto: this.takeAuto(), attachments: files.map(({ images, preview, ...rest }) => rest) },
      ],
    });
    const base = last.resume!;
    const design = last.resumeDesign ?? this.designOf(base);
    const format = this.formatOf(last, text);
    await this.busy(async () => {
      let d = base;
      let template = design.template;
      let accent = design.accent;
      let model: string | undefined = last.model;
      let said = '';
      if (wantsPhotoRemoved(text)) {
        const { photo, ...rest } = d;
        d = rest;
        said = 'I took the photo off your resume. Download the new version below.';
      } else if (wantsPhotoAdded(text)) {
        let picture = pictures[0];
        let from = 'your photo';
        if (!picture && isSearchableName(d.name)) {
          this.stepText.set('Looking for a photo online…');
          const web = await findWebPhoto(d.name);
          if (web) {
            picture = web;
            from = `the Wikipedia photo of ${d.name}`;
          } else {
            this.push({
              role: 'assistant',
              content: isSearchableName(d.name)
                ? `I looked for a public photo of ${d.name} on Wikipedia and found none. Choose a picture yourself and I will place it.`
                : 'I need the person\'s full name to search for a photo online. Tell me the name, or choose a picture yourself.',
              actions: [{ label: 'Choose photo', icon: 'image', command: 'pickPhoto' }],
            });
            return;
          }
        }
        if (!picture) {
          this.push({
            role: 'assistant',
            content: 'Sure. Choose the picture you want on your resume, attach it here and say "use this as my photo", or I can look for a public photo of a well-known person online.',
            actions: [
              { label: 'Choose photo', icon: 'image', command: 'pickPhoto' },
              ...(isSearchableName(d.name) ? [{ label: 'Find one online', icon: 'globe', command: 'findPhotoOnline' } as ChatAction] : []),
            ],
          });
          return;
        }
        this.stepText.set('Placing your photo…');
        d = { ...d, photo: await this.photos.fromPicture(picture) };
        said = `I added ${from}. Download the new version below.`;
      } else {
        const look = detectDesign(text);
        if (look.template) {
          template = look.template;
        }
        if (look.accent) {
          accent = look.accent;
        }
        const designOnly = (look.template || look.accent) && text.length < 45;
        if (wantsDifferentDesign(text) && !look.template) {
          // the user wants another look but named none: the designer picks one that suits this person
          this.stepText.set('Choosing a new design…');
          const pick = await this.design.chooseDesign(d, text, { template, accent });
          template = pick.template;
          accent = look.accent ?? pick.accent;
          said = `I switched to the ${TEMPLATES.find((t) => t.key === template)?.label} design${pick.reason ? ': ' + pick.reason.replace(/\.$/, '') : ''}. Download it below, or say "different" again for another look.`;
        } else if (designOnly) {
          said = `I changed the design to ${TEMPLATES.find((t) => t.key === template)?.label ?? 'your choice'}. Download the new version below.`;
        } else {
          if (!(await this.tasks.ensureConsent())) {
            throw new AiError('Cancelled. The AI needs your permission to read the resume.', 'config');
          }
          this.stepText.set('Updating your resume…');
          const out = await this.design.refine(d, text);
          d = out.data;
          model = out.model;
          said = 'Done. I updated your resume. Download the new version below.';
        }
      }
      await this.deliverResume(d, template, accent, format, model, said);
    });
  }

  /** The "Choose photo" button: pick a picture and put it on the resume that was just made. */
  pickPhoto(): void {
    this.photoPick = true;
    this.filePicker?.nativeElement.click();
  }

  private async applyPhotoFile(file: File): Promise<void> {
    const last = this.chat().messages.slice().reverse().find((m) => m.role === 'assistant' && !!m.resume);
    if (!last?.resume) {
      return;
    }
    this.push({ role: 'user', content: `Use "${file.name}" as my photo` });
    await this.busy(async () => {
      this.stepText.set('Placing your photo…');
      const picture = (await readAttachment(file)).images?.[0];
      if (!picture) {
        throw new AiError('That file is not a picture. Choose a JPG or PNG photo.', 'config');
      }
      const design = last.resumeDesign ?? this.designOf(last.resume!);
      const d = { ...last.resume!, photo: await this.photos.fromPicture(picture) };
      await this.deliverResume(d, design.template, design.accent, this.formatOf(last, ''), last.model, 'I added your photo. Download the new version below.');
    });
  }

  /** The "Get Word / Get PDF" buttons under a made file. */
  private async download(m: ChatMessage, format: ExportFormat): Promise<void> {
    const raw = stripChatter(m.content);
    const body = /^\s*dear\b/im.test(raw) ? letterize(raw) : raw; // a letter has no title and no headings
    const company = this.job()?.company_name;
    const title = titleOf(body) ?? (/^\s*dear\b/im.test(body) ? `Cover letter${company ? ' ' + company : ''}` : `SeeCareer ${new Date().toISOString().slice(0, 10)}`);
    let message: string;
    try {
      message = await exportFile(format, title, body);
    } catch {
      message = 'Could not create the file.';
    }
    const t = await this.toast.create({ message, duration: 2200, position: 'top' });
    await t.present();
  }

  // ---------- sending free text ----------
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    } else if (event.key === 'Escape') {
      if (this.sending()) {
        this.stop();
      } else if (this.editingId() || this.replyQuote()) {
        this.cancelContext();
      }
    } else if (event.key === 'ArrowUp' && !this.inputText && !this.sending()) {
      const last = [...this.chat().messages].reverse().find((m) => m.role === 'user');
      if (last) {
        event.preventDefault();
        this.startEdit(last);
      }
    }
  }

  /** Stops the answer that is being written. Messages waiting in the queue are still sent afterwards. */
  stop(): void {
    if (this.sending()) {
      this.ai.cancelAll();
      this.stepText.set('Stopping…');
    }
  }

  removeQueued(index: number): void {
    this.queue.update((q) => q.filter((_, i) => i !== index));
  }

  /** The next message answers this one. */
  startReply(m: ChatMessage): void {
    const text = m.content.replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!text) {
      return;
    }
    this.editingId.set(null);
    this.replyQuote.set({ id: m.id, text });
    this.focusInput();
  }

  /** Puts a sent message back in the box. Sending it again replaces it and everything after it. */
  startEdit(m: ChatMessage): void {
    if (this.sending() || m.role !== 'user') {
      return;
    }
    this.replyQuote.set(null);
    this.editingId.set(m.id);
    this.inputText = m.content;
    this.inputError = '';
    const pictures = [...this.imagesOf(m)];
    this.pending.set(
      (m.attachments ?? []).map((a) => {
        const own: string[] = [];
        if (a.kind === 'image' && pictures.length) {
          own.push(pictures.shift()!);
        } else if (!a.text && pictures.length) {
          own.push(...pictures.splice(0));
        }
        return own.length ? { ...a, images: own } : a;
      }),
    );
    this.focusInput();
  }

  cancelContext(): void {
    if (this.editingId()) {
      this.inputText = '';
      this.pending.set([]);
    }
    this.editingId.set(null);
    this.replyQuote.set(null);
  }

  /** When a sent message is being edited: drop it and everything after it before it is sent again. */
  private applyEdit(): void {
    const id = this.editingId();
    if (!id) {
      return;
    }
    this.editingId.set(null);
    const list = this.chat().messages;
    const at = list.findIndex((m) => m.id === id);
    if (at >= 0) {
      list.slice(at).forEach((m) => this.images.delete(m.id));
      this.chat.set({ ...this.chat(), messages: list.slice(0, at) });
    }
  }

  private focusInput(): void {
    setTimeout(() => this.textarea?.setFocus?.(), 50);
  }

  /** Sends the next queued message once the AI is free. */
  private drainQueue(): void {
    setTimeout(() => {
      const next = this.queue()[0];
      if (!next || this.sending()) {
        return;
      }
      this.queue.update((q) => q.slice(1));
      this.quoteNext = next.quote;
      void this.dispatch(next.text, next.files);
    }, 0);
  }

  async send(): Promise<void> {
    if (this.reading()) {
      return;
    }
    const files = this.pending();
    let text = this.inputText.trim();
    if (this.sending()) {
      // the AI is working: keep the message and send it as soon as the AI is free
      if ((!text && !files.length) || text.startsWith('/')) {
        return;
      }
      if (!text) {
        text = files.length === 1 ? 'Please read this file and tell me what it says.' : 'Please read these files.';
      }
      this.inputError = validateMessage(text);
      if (this.inputError) {
        return;
      }
      this.queue.update((q) => [...q, { text, files, quote: this.replyQuote()?.text }]);
      this.inputText = '';
      this.pending.set([]);
      this.replyQuote.set(null);
      this.scrollDown();
      return;
    }
    if (text.startsWith('/') && !files.length && (await this.runCommand(text))) {
      return;
    }
    if (!text && files.length) {
      text = files.length === 1 ? 'Please read this file and tell me what it says.' : 'Please read these files.';
      this.autoNext = true; // the user sent only a file: the app's own wording is not shown in the bubble
    }
    this.inputError = validateMessage(text);
    if (this.inputError) {
      this.autoNext = false;
      return;
    }
    this.inputText = '';
    this.quoteNext = this.replyQuote()?.text;
    this.replyQuote.set(null);
    this.applyEdit();
    await this.dispatch(text, files);
  }

  /** Sends one message (typed now, or taken from the queue) and gets the answer. */
  private async dispatch(text: string, files: Attachment[]): Promise<void> {
    // "create me a resume", "write a cover letter as Word", "make this a pdf": make the file and download it
    const hasPrior = this.chat().messages.some((x) => x.role === 'assistant' && !x.error && x.content.length > 40);
    const intent = detectIntent(text, hasPrior);
    if (intent) {
      await this.handleCreate(text, files, intent);
      return;
    }

    const lastResume = this.recentResume();
    const onlyPictures = files.every((f) => f.kind === 'image');
    if (lastResume && isResumeEdit(text) && (!files.length || (onlyPictures && wantsPhotoAdded(text)))) {
      await this.editResume(text, files, lastResume);
      return;
    }

    if (files.length) {
      await this.sendWithFiles(text, files);
      return;
    }
    // a request to find work ("can you find me something in cebu") is still a search; other questions, and words that point at
    // the jobs on screen ("give me the links of those jobs"), are answered from the jobs that were shown
    const wantsNew = /\b(find|search|look(ing)? for|show me|get me|recommend|suggest|need a job|want a job|hiring|vacanc\w+)\b/i.test(text);
    const pointsAtShown = /\b(those|these|them|above|first one|second one|third one|that job|this job|that one)\b/i.test(text);
    const question = !wantsNew && (isQuestion(text) || pointsAtShown);
    if (question && (this.mode() === 'finder' || this.recentJobs(1).length)) {
      await this.answerFromChat(text);
      return;
    }
    if ((JOB_INTENT.test(text) && text.length > 12) || (looksLikeJobSearch(text) && !this.job())) {
      this.push({ role: 'user', content: text });
      // every chat has its own focus: the saved resume is used only when the user asks for it
      const aboutResume = /\b(resume|cv|curriculum vitae)\b/i.test(text);
      if (aboutResume && !this.hasResume()) {
        this.ready(true, false);
        return;
      }
      if (!aboutResume) {
        await this.busy(async () => {
          await this.runRecommend('', [], undefined, this.requestText(text), false, false);
        });
        return;
      }
      await this.busy(async () => {
        if (!looksLikeResume(this.resume.resume())) {
          this.push({
            role: 'assistant',
            content: "The text saved as your resume doesn't look like a real resume. Please add your real resume first.",
            actions: [{ label: 'Edit resume', icon: 'create', command: 'resume' }],
          });
          return;
        }
        await this.runRecommend(this.resume.resume(), [], undefined, this.requestText(text));
      });
      return;
    }
    if (this.mode() === 'finder') {
      // a whole sentence ("can you find something in the philippines") is a request to understand; a few words are a keyword search
      const sentence = text.trim().split(/\s+/).length > 4 || /\b(can you|could you|please|something|specific\w*|looking|want|need|find)\b/i.test(text);
      if (sentence) {
        this.push({ role: 'user', content: text });
        await this.busy(async () => {
          await this.runRecommend('', [], undefined, this.requestText(text), false, false);
        });
        return;
      }
      await this.searchJobs(text);
      return;
    }
    const info = this.info();
    this.push({ role: 'user', content: text });
    await this.busy(async () => {
      // a lookup-style question that is not about work (who is..., latest news...) is declined before anything is searched
      if (needsWeb(text) && !obviouslyCareer(text) && !(await this.onTopic(text))) {
        this.push({
          role: 'assistant',
          content: OFF_TOPIC_REPLY,
          actions: [
            { label: 'Find jobs', icon: 'search', mode: 'finder' },
            { label: 'Resume Assistant', icon: 'document-text', mode: 'resume' },
            { label: 'Interview prep', icon: 'chatbubbles', mode: 'interview' },
          ],
        });
        return;
      }
      let web = '';
      if (needsWeb(text)) {
        this.stepText.set('Searching the web…');
        const pages = await webLookup(searchQuery(text) || text);
        web = pages.length
          ? `WEB RESULTS (Wikipedia, searched just now for the user's last message):\n${webContext(pages)}`
          : 'WEB RESULTS: the search found nothing for the last message. Say so briefly, then help from what you know.';
      }
      const result = await this.ai.chat(await this.contextMessages(web), Math.max(this.settings.settings().maxTokens, web ? 1000 : 0));
      this.push({ role: 'assistant', content: result.content, model: result.model });
    });
  }

  /** Answers a question in the chat, knowing the jobs that were just shown (so it can talk about them and give their links). */
  private async answerFromChat(text: string): Promise<void> {
    this.push({ role: 'user', content: text });
    await this.busy(async () => {
      if (needsWeb(text) && !obviouslyCareer(text) && !(await this.onTopic(text))) {
        this.push({ role: 'assistant', content: OFF_TOPIC_REPLY });
        return;
      }
      const result = await this.ai.chat(await this.contextMessages(), Math.max(this.settings.settings().maxTokens, 900));
      this.push({ role: 'assistant', content: result.content, model: result.model });
    });
  }

  /** The quick check: is this message about work or careers? When the check itself fails the message is let through. */
  private async onTopic(text: string): Promise<boolean> {
    try {
      this.stepText.set('Checking your question…');
      const r = await this.ai.chat([{ role: 'system', content: SCOPE_QUESTION }, { role: 'user', content: text.slice(0, 400) }], 700, { fast: true, temperature: 0 });
      return !/^\W*no\b/i.test(r.content.trim());
    } catch {
      return true;
    }
  }

  /** True when the user wants resume/job help (so a non-resume file should be refused). */
  private jobIntent(text: string): boolean {
    return RESUME_MODES.includes(this.mode()) || JOB_INTENT.test(text);
  }

  /** Sends a message with attached files: checks what the files are, then answers. */
  private async sendWithFiles(text: string, files: Attachment[]): Promise<void> {
    this.pending.set([]);
    const id = newId();
    const pictures = files.flatMap((f) => f.images ?? []);
    if (pictures.length) {
      this.images.set(id, pictures);
    }
    const message: ChatMessage = {
      id,
      role: 'user',
      content: text,
      time: Date.now(),
      quote: this.takeQuote(),
      auto: this.takeAuto(),
      attachments: files.map(({ images, preview, ...rest }) => rest),
    };
    this.chat.set({ ...this.chat(), messages: [...this.chat().messages, message] });
    const docText = files.filter((f) => f.text).map((f) => f.text).join('\n\n');
    const names = files.map((f) => f.name).join(', ');

    await this.busy(async () => {
      if (!docText && !pictures.length) {
        // nothing to read in it: skip the resume check and just reply, briefly
        await this.replyAboutFiles({ type: 'job_related', confidence: 0, reason: '', source: 'rules' }, undefined, '', []);
        return;
      }
      this.stepText.set('Checking your file…');
      const verdict = await this.rec.classify(docText, pictures, names);
      const info = { type: verdict.type, label: DOC_LABELS[verdict.type], confidence: verdict.confidence, reason: verdict.reason };
      const wantsJobs = JOB_INTENT.test(text);
      let remembered = false;
      if (verdict.type === 'resume') {
        remembered = await this.remember(docText, pictures);
      }

      if (verdict.type === 'not_job_related' && this.jobIntent(text)) {
        this.push({
          role: 'assistant',
          verdict: info,
          content:
            `This doesn't look like a resume. It looks like **${verdict.reason.replace(/\.$/, '').toLowerCase() || 'something not related to jobs'}**.\n\n` +
            'I only use real resumes and job documents for matching and job recommendations, so I did not use it. ' +
            'Upload your resume (PDF, Word or a clear photo) and I will find jobs you can be accepted for.',
          actions: [
            { label: 'Add my resume', icon: 'create', command: 'resume' },
            { label: 'Ask about this file anyway', icon: 'help-circle', command: 'askAnyway' },
          ],
        });
        return;
      }
      if (verdict.type === 'job_posting') {
        this.push({
          role: 'assistant',
          verdict: info,
          content: 'This looks like a **job posting**, not a resume. I can use it as the job to match your resume against.',
          actions: [
            { label: 'Use as the job', icon: 'briefcase', command: 'useJob', data: docText },
            { label: 'Ask about this file', icon: 'help-circle', command: 'askAnyway' },
          ],
        });
        return;
      }
      if (verdict.type === 'resume' && (wantsJobs || this.mode() === 'finder')) {
        await this.runRecommend(docText, pictures, info, this.requestText(text), remembered);
        return;
      }
      await this.replyAboutFiles(verdict, info, docText, pictures, remembered);
    });
  }

  /** Normal AI answer about the attached files, with resume buttons when it is a resume. */
  private async replyAboutFiles(
    verdict: DocVerdict,
    info: ChatMessage['verdict'],
    docText: string,
    pictures: string[],
    remembered = false,
  ): Promise<void> {
    this.stepText.set('Reading your file…');
    const hint =
      verdict.type === 'resume'
        ? ''
        : `The attached file is a ${DOC_LABELS[verdict.type].toLowerCase()}. Respond to it on its own terms: say briefly what it is and what you can do with it (review it, improve it, rewrite it, summarize it, turn it into a PDF or Word file). ` +
          'Do not compare it to a resume and do not say it is the wrong kind of file.';
    const result = await this.ai.chat(await this.contextMessages(hint), Math.max(this.settings.settings().maxTokens, 1000));
    const actions: ChatAction[] = [];
    if (verdict.type === 'resume') {
      actions.push(
        { label: 'Find jobs I can get', icon: 'rocket', command: 'recommend' },
        { label: 'Design my resume', icon: 'color-palette', task: 'generate' },
      );
    }
    const note = verdict.type === 'resume' && remembered ? '\n\n_I saved this as your resume, so I will remember it in every chat. Upload a new one any time to replace it._' : '';
    this.push({ role: 'assistant', content: result.content + note, model: result.model, actions, verdict: info });
  }

  /**
   * Saves a resume the user sent so the assistant remembers it from now on.
   * A photo of a resume is first written out as text. Returns false when nothing could be saved.
   */
  private async remember(docText: string, pictures: string[]): Promise<boolean> {
    try {
      let text = docText;
      if (!text && pictures.length) {
        this.stepText.set('Remembering your resume…');
        text = await this.rec.transcribe(pictures);
      }
      text = text.trim().slice(0, 12000);
      if (!text || validateResume(text)) {
        return false;
      }
      this.resume.save(text);
      return true;
    } catch {
      return false;
    }
  }

  /** The user's wishes for the job search: this message plus the last few they wrote ("I want to work in Cebu"). */
  private requestText(text: string): string {
    const earlier = this.chat()
      .messages.filter((m) => m.role === 'user' && m.content && m.content !== text)
      .slice(-3)
      .map((m) => m.content.slice(0, 300));
    return [...earlier, text].join('\n');
  }

  async askAnyway(): Promise<void> {
    await this.busy(async () => {
      const result = await this.ai.chat(await this.contextMessages(), Math.max(this.settings.settings().maxTokens, 1000));
      this.push({ role: 'assistant', content: result.content, model: result.model });
    });
  }

  // ---------- job recommendations ----------
  /** Uses the saved resume (asks for one if missing). */
  async recommendFromSaved(): Promise<void> {
    this.mode.set('finder');
    if (!this.ready(true, false)) {
      return;
    }
    this.push({ role: 'user', content: 'Find jobs I can get accepted for' });
    await this.busy(async () => {
      if (!looksLikeResume(this.resume.resume())) {
        const v = await this.rec.classify(this.resume.resume());
        if (v.type !== 'resume') {
          this.push({
            role: 'assistant',
            content: `The text saved as your resume doesn't look like a real resume (${v.reason}). Please add your real resume.`,
            actions: [{ label: 'Edit resume', icon: 'create', command: 'resume' }],
          });
          return;
        }
      }
      await this.runRecommend(this.resume.resume(), [], undefined);
    });
  }

  private async runRecommend(resumeText: string, pictures: string[], info?: ChatMessage['verdict'], request = '', remembered = false, fromResume = true): Promise<void> {
    if (fromResume && !(await this.tasks.ensureConsent())) {
      this.push({ role: 'assistant', content: 'OK. I need your permission to read the resume before I can recommend jobs.' });
      return;
    }
    const out = await this.rec.recommend(resumeText, pictures, (t) => this.stepText.set(t), request);
    if (!out.recs.length) {
      const role = out.profile.titles[0] ?? '';
      this.push({
        role: 'assistant',
        verdict: info,
        content:
          (out.searched === 0
            ? `I found no remote openings${role ? ` for ${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role}` : ''}${out.profile.place ? ` in ${out.profile.place.city ? out.profile.place.city + ', ' : ''}${out.profile.place.label}` : ''}. `
            : `I looked through **${out.searched}** live openings${out.profile.place ? ` for ${out.profile.place.city ? out.profile.place.city + ', ' : ''}${out.profile.place.label}` : ''} and none of them fits ${role ? `${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role}` : 'this profile'} well enough to recommend. `) +
          'My job feed lists remote jobs only, so the buttons below open Indeed, LinkedIn and JobStreet already searching for you. You can also browse the full job board.',
        actions: [...this.localSearches(role, out.profile.place), { label: 'Browse the job board', icon: 'briefcase', mode: 'finder' }],
      });
      return;
    }
    const top = out.recs[0];
    this.push({
      role: 'assistant',
      verdict: info,
      recs: out.recs,
      content:
        (fromResume
          ? `I read your resume (${out.profile.summary || out.profile.titles[0]}) and checked`
          : `Based on what you told me (${out.profile.summary || out.profile.titles[0]}), I checked`) +
        ` **${out.searched}** live openings` +
        (out.profile.place
          ? out.loose
            ? ` for **${out.profile.place.label}**. There were none only for ${out.profile.place.label}, so these are remote jobs that also accept people there. `
            : ` hiring in **${out.profile.place.label}**. `
          : '. ') +
        (out.profile.place?.city ? `My job feed has remote jobs only, so for work in ${out.profile.place.city} itself the buttons below open Indeed, LinkedIn and JobStreet already searching there. ` : '') +
        (remembered ? 'I saved your resume, so you do not need to send it again. ' : '') +
        (out.recs.length === 1 ? 'Here is the **best fit**' : `Here are the **${out.recs.length} best fits**, strongest first`) +
        (top ? ` (top match: **${top.job.title}**, ${top.score}% fit)` : '') +
        '. Swipe through them.\n\n' +
        '_The fit % is my estimate from your skills vs. the job. It is not a guarantee, but jobs with a high fit are the ones to apply for first._',
      actions: [
        { label: 'Find more jobs', icon: 'search', mode: 'finder' },
        ...this.localSearches(out.profile.titles[0] ?? '', out.profile.place),
        ...(fromResume ? [{ label: 'Improve my resume', icon: 'color-wand', task: 'improve' } as ChatAction] : []),
      ],
    });
  }

  /**
   * The job feed has remote jobs only. For on-site work near a place the user named, these buttons open the
   * big job sites already searching for that role and place.
   */
  private localSearches(role: string, place: Place | null | undefined): ChatAction[] {
    if (!place) {
      return [];
    }
    const where = place.city ? `${place.city}, ${place.label}` : place.label;
    const q = encodeURIComponent(role.trim());
    const w = encodeURIComponent(where);
    const slug = (t: string) => t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const host = place.code === 'US' ? 'www' : place.code.toLowerCase();
    const links: ChatAction[] = [
      { label: 'Indeed', icon: 'open', url: `https://${host}.indeed.com/jobs?q=${q}&l=${w}` },
      { label: 'LinkedIn', icon: 'open', url: `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${w}` },
    ];
    if (place.code === 'PH') {
      const area = slug(place.city ?? place.label);
      links.unshift({ label: 'JobStreet', icon: 'open', url: role.trim() ? `https://ph.jobstreet.com/${slug(role)}-jobs/in-${area}` : `https://ph.jobstreet.com/jobs/in-${area}` });
    }
    return links.map((l) => ({ ...l, label: `${l.label}: ${role.trim() || 'jobs'} in ${where}` }));
  }

  skillPct(r: Recommendation): number {
    const total = r.matched.length + r.missing.length;
    return total ? Math.round((r.matched.length / total) * 100) : r.score;
  }

  async retry(): Promise<void> {
    if (this.sending()) {
      return;
    }
    this.chat.set({ ...this.chat(), messages: this.chat().messages.filter((m) => !m.error) });
    await this.busy(async () => {
      const result = await this.ai.chat(await this.contextMessages(), this.settings.settings().maxTokens);
      this.push({ role: 'assistant', content: result.content, model: result.model });
    });
  }

  /** Builds what is sent to the AI: instructions, resume/job context for this mode, and recent messages. */
  private async contextMessages(extraSystem = ''): Promise<ApiMessage[]> {
    const info = this.info();
    const job = this.job();
    let system = SYSTEM_PROMPT + '\n\nReply in the language the user writes in (English unless they write in another language), not in the language of an attached file.';
    if (extraSystem) {
      system += `\n\n${extraSystem}`;
    }
    const extra = this.settings.settings().customInstructions.trim();
    if (extra) {
      system += `\n\nExtra instructions from the user: ${extra}`;
    }
    if (this.mock()) {
      system += `\n\n${MOCK_INTERVIEW_SYSTEM}`;
    } else if (info.system) {
      system += `\n\n${info.system}`;
    }
    if (info.needsJob && !job && !this.mock()) {
      system += "\n\nNo job is selected. Work from the role or company the user names in their messages. If they name none, ask which role they mean in one short question.";
    }
    if (job && this.mode() !== 'finder') {
      system +=
        `\n\nSelected job: ${job.title} at ${job.company_name} (${job.category}, ${job.job_type}). ` +
        `Description: ${plainText(job.description, 1500)}`;
    }
    const shownJobs = this.recentJobsContext();
    if (shownJobs) {
      system += `\n\n${shownJobs}`;
    }
    const wantsResume = (info.needsResume || this.mock()) && this.hasResume();
    const recentUser = this.chat().messages.filter((m) => m.role === 'user').slice(-3).map((m) => m.content).join(' ');
    const asked = this.hasResume() && this.resume.consent() && /\b(my|saved|the)\s+(resume|cv)\b|\bfrom my (resume|cv)\b/i.test(recentUser);
    if ((wantsResume && (await this.tasks.ensureConsent())) || asked) {
      system +=
        `\n\nThe user's saved resume is below. Use it because this conversation is about it. ` +
        `Do NOT mention their name or details beyond what the request needs. If you need more information from them, ask a short question.\n${this.resume.resume().slice(0, 6000)}`;
    }
    const recent = this.chat().messages.filter((m) => !m.error && m.content).slice(-20);
    const lastUser = [...recent].reverse().find((m) => m.role === 'user');
    const history = recent.map((m): ApiMessage => {
      if (m.role !== 'user') {
        return { role: 'assistant', content: m.content.slice(0, 3000) };
      }
      let body = (m.quote ? `(The user is replying to this earlier message: "${m.quote}")\n` : '') + m.content.slice(0, 3000);
      for (const a of m.attachments ?? []) {
        body += a.text
          ? `\n\n[Attached file: ${a.name}]\n${a.text}`
          : a.note
            ? `\n\n[Attached file: ${a.note}]`
            : `\n\n[Attached ${a.kind === 'image' ? 'image' : 'scanned file'}: ${a.name}]`;
      }
      const pictures = m === lastUser ? this.imagesOf(m) : [];
      if (!pictures.length) {
        return { role: 'user', content: body };
      }
      const parts: ContentPart[] = [
        { type: 'text', text: body },
        ...pictures.map((url): ContentPart => ({ type: 'image_url', image_url: { url } })),
      ];
      return { role: 'user', content: parts };
    });
    if (recent.some((m) => m.attachments?.length)) {
      system += '\n\nThe user can attach files. Read their content carefully and answer about it.';
    }
    if (recent.some((m) => m.attachments?.some((a) => a.note && !a.text && a.kind !== 'image'))) {
      system +=
        '\n\nSome attached files could not be shown to you; only their name, type and size are known. Do not explain limitations and do not list file types. ' +
        'Reply in one or two short sentences: say what the file seems to be from its name and type, and ask in one line what the user would like to do with it.';
    }
    return [{ role: 'system', content: system }, ...history];
  }

  // ---------- shared plumbing ----------
  private push(m: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content'>): ChatMessage {
    const message: ChatMessage = { id: newId(), time: Date.now(), ...m };
    if (m.role === 'user') {
      message.quote = this.takeQuote();
      message.auto = this.takeAuto();
    }
    this.chat.set({ ...this.chat(), messages: [...this.chat().messages, message] });
    return message;
  }

  private takeAuto(): boolean | undefined {
    const a = this.autoNext;
    this.autoNext = false;
    return a || undefined;
  }

  private takeQuote(): string | undefined {
    const q = this.quoteNext;
    this.quoteNext = undefined;
    return q;
  }

  private persist(): void {
    this.store.upsert({ ...this.chat(), mode: this.mode(), job: this.job() });
  }

  /** Runs an AI call with the "thinking" indicator and turns failures into a retryable error message. */
  private async busy(work: () => Promise<void>): Promise<void> {
    this.sending.set(true);
    this.elapsed.set(0);
    this.stepText.set('');
    clearInterval(this.timer);
    this.timer = setInterval(() => this.elapsed.update((n) => n + 1), 1000);
    this.scrollDown();
    try {
      await work();
    } catch (e) {
      if (e instanceof AiError && e.kind === 'cancelled') {
        this.push({ role: 'assistant', content: 'Stopped.' });
      } else if (e instanceof AiError && e.kind === 'needinfo') {
        this.push({ role: 'assistant', content: e.message }); // the AI needs more information: it simply asks
      } else {
        const message = e instanceof AiError ? e.message : 'Something went wrong. Please try again.';
        this.push({ role: 'assistant', content: message, error: true });
      }
    } finally {
      clearInterval(this.timer);
      this.sending.set(false);
      this.persist();
      this.scrollDown();
      this.drainQueue();
    }
  }

  private async runCommand(text: string): Promise<boolean> {
    const command = text.split(/\s+/)[0].toLowerCase();
    switch (command) {
      case '/new':
        this.newChat();
        return true;
      case '/clear':
        this.chat.set({ ...this.chat(), messages: [] });
        this.inputText = '';
        return true;
      case '/resume':
        this.inputText = '';
        this.pickResume();
        return true;
      case '/settings':
        this.inputText = '';
        await this.router.navigate(['/settings']);
        return true;
      case '/help':
        this.inputText = '';
        this.push({
          role: 'assistant',
          content:
            '**What I can do**\n' +
            'Pick a feature from the tabs above: Resume, Find jobs, Match, Apply, Skills gap or Interview. Or just ask me about your career.\n\n' +
            '**Commands**\n' +
            '- `/new` start a new chat\n' +
            '- `/clear` clear this chat\n' +
            '- `/resume` add or update your resume\n' +
            '- `/settings` open Settings\n\n' +
            '**Files**\n' +
            'Drop a file into the chat, or use the clip button, and I will read it.',
        });
        this.scrollDown();
        return true;
      default:
        return false;
    }
  }

  async copy(m: ChatMessage): Promise<void> {
    let message = 'Copied';
    try {
      await navigator.clipboard.writeText(m.content);
    } catch {
      message = 'Could not copy';
    }
    const t = await this.toast.create({ message, duration: 1200, position: 'top' });
    await t.present();
  }

  private scrollDown(): void {
    setTimeout(() => this.content?.scrollToBottom(250), 60);
  }
}
