import { Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, IonContent, ToastController } from '@ionic/angular/lazy';

import { AiService, ApiMessage, ContentPart } from '../core/ai.service';
import { AiTaskService } from '../core/ai-task.service';
import { JOB_TASKS, RESUME_TASKS, TaskKey } from '../core/ai-tasks';
import { EXPORT_LABELS, exportFile } from '../core/file-export';
import { ACCEPTED_FILES, FileReadError, formatBytes, readAttachment } from '../core/file-reader';
import { ChatStore } from '../core/chat-store.service';
import { DOC_LABELS, DocVerdict, jobFromText, looksLikeResume } from '../core/doc-check';
import { RecommendService } from '../core/recommend.service';
import { SYSTEM_PROMPT } from '../core/defaults';
import { JobService, describeHttpError, plainText } from '../core/job.service';
import { renderMarkdown } from '../core/markdown';
import { MOCK_INTERVIEW_SYSTEM, MODES, ModeInfo, modeInfo } from '../core/modes';
import { AiError, Attachment, ChatAction, ChatMessage, ChatMode, Conversation, ExportFormat, Job, Recommendation } from '../core/models';
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

/** Messages that ask the AI to find / recommend jobs from the resume. */
const JOB_INTENT =
  /\b(recommend|suggest|find (me )?(a |an |some |the |any )?(job|work|position|role|opening|vacanc)|get me (a |an )?(job|work)|jobs? (for|that|i|fit|suit)|work (for|that|i) |accept(ed)?|hire[d]?|my chances?|fit(s)? me|suit(s)? me|match me|which jobs?|what jobs?|where (can|should) i apply|apply (for|to))\b/i;
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
  resumeOpen = signal(false);
  inputText = '';
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
    private sheets: ActionSheetController,
    private rec: RecommendService,
  ) {}

  ionViewWillEnter(): void {
    const params = this.route.snapshot.queryParamMap;
    const jobId = Number(params.get('jobId'));
    const task = params.get('task') as TaskKey | null;
    if (jobId) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.startFromJob(jobId, task);
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

  deleteConversation(c: Conversation, event: Event): void {
    event.stopPropagation();
    this.store.remove(c.id);
    if (this.chat().id === c.id) {
      this.newChat();
    }
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
    const info = modeInfo(key);
    if (key === 'general') {
      return;
    }
    let actions = info.actions;
    if (this.job()) {
      actions = actions.filter((a) => a.mode !== 'finder');
    }
    this.push({ role: 'assistant', content: info.intro, actions });
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

  onResumeChanged(saved: boolean): void {
    this.push({
      role: 'assistant',
      content: saved
        ? 'Resume saved on this phone. What would you like to do with it?'
        : 'Your resume was deleted from this phone.',
      actions: saved
        ? [
            { label: 'Analyze', icon: 'search', task: 'analyze' },
            { label: 'Improve wording', icon: 'color-wand', task: 'improve' },
            { label: 'Find jobs I can get', icon: 'rocket', command: 'recommend' },
            { label: 'Extract skills', icon: 'list', task: 'skills' },
          ]
        : [],
    });
    this.persist();
    this.scrollDown();
  }

  // ---------- actions (buttons under assistant messages) ----------
  async onAction(a: ChatAction, m?: ChatMessage): Promise<void> {
    if (this.sending()) {
      return;
    }
    if (a.command === 'download' && a.format && m) {
      await this.download(m, a.format);
    } else if (a.command === 'saveResume' && a.data) {
      this.saveAsResume(a.data);
    } else if (a.command === 'more' && a.data) {
      const { q, page } = JSON.parse(a.data) as { q: string; page: number };
      await this.searchJobs(q, page, false);
    } else if (a.command === 'recommend') {
      await this.recommendFromSaved();
    } else if (a.command === 'askAnyway') {
      await this.askAnyway();
    } else if (a.command === 'useJob' && a.data) {
      this.selectJob(jobFromText(a.data));
    } else if (a.command === 'resume') {
      this.resumeOpen.set(true);
    } else if (a.command === 'mock') {
      await this.startMock();
    } else if (a.mode) {
      this.selectMode(a.mode);
    } else if (a.task) {
      await this.runTask(a.task);
    }
  }

  /** Checks the resume / job that a feature needs; tells the user what is missing. */
  private ready(needsResume: boolean, needsJob: boolean): boolean {
    if (needsResume && !this.hasResume()) {
      this.push({
        role: 'assistant',
        content: 'I need your resume first. It stays on this phone.',
        actions: [{ label: 'Add resume', icon: 'create', command: 'resume' }],
      });
      this.scrollDown();
      return false;
    }
    if (needsJob && !this.job()) {
      this.push({
        role: 'assistant',
        content: 'Choose a job first. Search for one and tap **Select**.',
        actions: [{ label: 'Find a job', icon: 'search', mode: 'finder' }],
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

  private followUps(task: TaskKey, text = ''): ChatAction[] {
    switch (task) {
      case 'generate':
      case 'improve':
        return [
          { label: 'Download PDF', icon: 'document', command: 'download', format: 'pdf' },
          { label: 'Download Word', icon: 'document-text', command: 'download', format: 'docx' },
          { label: 'Use as my resume', icon: 'save', command: 'saveResume', data: text },
        ];
      case 'match':
        return [
          { label: 'Cover letter', icon: 'document', task: 'cover' },
          { label: 'Skills gap', icon: 'trending-up', task: 'gap' },
        ];
      case 'cover':
      case 'email':
        return [
          { label: 'Download PDF', icon: 'document', command: 'download', format: 'pdf' },
          { label: task === 'cover' ? 'Email draft' : 'Cover letter', icon: 'mail', task: task === 'cover' ? 'email' : 'cover' },
          { label: 'Interview prep', icon: 'chatbubbles', task: 'interview' },
        ];
      case 'gap':
        return [{ label: 'Interview prep', icon: 'chatbubbles', task: 'interview' }];
      case 'interview':
        return [{ label: 'Start mock interview', icon: 'mic', command: 'mock' }];
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
              ? `I found **${result.total.toLocaleString()}** openings for “${query}”. Here are the first ${top.length}. Tap **Select** to match, apply or practice for one.`
              : `More openings for “${query}” (results ${from}–${from + top.length - 1}):`,
          jobs: top,
          actions: result.hasMore
            ? [{ label: 'Show more jobs', icon: 'add', command: 'more', data: JSON.stringify({ q: query, page: page + 1 }) }]
            : [],
        });
      } else {
        this.push({
          role: 'assistant',
          content:
            page === 0
              ? `No openings found for “${query}”. Try a simpler keyword like “developer” or “design”.`
              : 'No more openings for this search.',
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
        { text: this.hasResume() ? 'Edit my resume' : 'Add my resume', icon: 'document-text', handler: () => this.resumeOpen.set(true) },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.addFiles(files);
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
    return a.kind === 'pdf' ? 'document' : a.kind === 'docx' ? 'document-text' : a.kind === 'image' ? 'image' : 'code-slash';
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
      content: 'Saved as your resume on this phone.',
      actions: [
        { label: 'Analyze', icon: 'search', task: 'analyze' },
        { label: 'Find jobs I can get', icon: 'rocket', command: 'recommend' },
        { label: 'Generate resume PDF', icon: 'document', task: 'generate' },
      ],
    });
    this.persist();
    this.scrollDown();
  }

  // ---------- downloads (generate files) ----------
  async openDownload(m: ChatMessage): Promise<void> {
    const formats: ExportFormat[] = ['pdf', 'docx', 'txt', 'md'];
    const sheet = await this.sheets.create({
      header: 'Download this answer as',
      buttons: [
        ...formats.map((f) => ({ text: EXPORT_LABELS[f], handler: () => void this.download(m, f) })),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async download(m: ChatMessage, format: ExportFormat): Promise<void> {
    const heading = /^#\s+(.+)$/m.exec(m.content)?.[1];
    const title = heading ? `${heading} Resume` : `SeeCareer ${new Date().toISOString().slice(0, 10)}`;
    let message: string;
    try {
      message = await exportFile(format, title, m.content);
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
    }
  }

  async send(): Promise<void> {
    if (this.sending()) {
      return;
    }
    if (this.reading()) {
      return;
    }
    const files = this.pending();
    let text = this.inputText.trim();
    if (text.startsWith('/') && !files.length && (await this.runCommand(text))) {
      return;
    }
    if (!text && files.length) {
      text = files.length === 1 ? 'Please read this file and tell me what it says.' : 'Please read these files.';
    }
    this.inputError = validateMessage(text);
    if (this.inputError) {
      return;
    }
    this.inputText = '';

    if (files.length) {
      await this.sendWithFiles(text, files);
      return;
    }
    if (JOB_INTENT.test(text) && text.length > 12 && (this.hasResume() || /resume|cv/i.test(text))) {
      this.push({ role: 'user', content: text });
      if (!this.hasResume()) {
        this.ready(true, false);
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
        await this.runRecommend(this.resume.resume(), [], undefined);
      });
      return;
    }
    if (this.mode() === 'finder') {
      await this.searchJobs(text);
      return;
    }
    const info = this.info();
    if (info.needsJob && !this.job() && !this.mock()) {
      this.push({ role: 'user', content: text });
      this.ready(false, true);
      return;
    }
    this.push({ role: 'user', content: text });
    await this.busy(async () => {
      const result = await this.ai.chat(await this.contextMessages(), this.settings.settings().maxTokens);
      this.push({ role: 'assistant', content: result.content, model: result.model });
    });
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
      attachments: files.map(({ images, ...rest }) => rest),
    };
    this.chat.set({ ...this.chat(), messages: [...this.chat().messages, message] });
    const docText = files.filter((f) => f.text).map((f) => f.text).join('\n\n');
    const names = files.map((f) => f.name).join(', ');

    await this.busy(async () => {
      this.stepText.set('Checking your file…');
      const verdict = await this.rec.classify(docText, pictures, names);
      const info = { type: verdict.type, label: DOC_LABELS[verdict.type], confidence: verdict.confidence, reason: verdict.reason };
      const wantsJobs = JOB_INTENT.test(text);

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
        await this.runRecommend(docText, pictures, info);
        return;
      }
      await this.replyAboutFiles(verdict, info, docText, pictures);
    });
  }

  /** Normal AI answer about the attached files, with resume buttons when it is a resume. */
  private async replyAboutFiles(
    verdict: DocVerdict,
    info: ChatMessage['verdict'],
    docText: string,
    pictures: string[],
  ): Promise<void> {
    this.stepText.set('Reading your file…');
    const result = await this.ai.chat(await this.contextMessages(), Math.max(this.settings.settings().maxTokens, 1000));
    const actions: ChatAction[] = [];
    if (verdict.type === 'resume') {
      if (docText) {
        actions.push({ label: 'Save as my resume', icon: 'save', command: 'saveResume', data: docText });
      } else if (pictures.length) {
        actions.push({ label: 'Save this text as my resume', icon: 'save', command: 'saveResume', data: result.content });
      }
      actions.push(
        { label: 'Find jobs I can get', icon: 'rocket', command: 'recommend' },
        { label: 'Generate resume PDF', icon: 'document', task: 'generate' },
      );
    }
    this.push({ role: 'assistant', content: result.content, model: result.model, actions, verdict: info });
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

  private async runRecommend(resumeText: string, pictures: string[], info?: ChatMessage['verdict']): Promise<void> {
    if (!(await this.tasks.ensureConsent())) {
      this.push({ role: 'assistant', content: 'OK. I need your permission to read the resume before I can recommend jobs.' });
      return;
    }
    const out = await this.rec.recommend(resumeText, pictures, (t) => this.stepText.set(t));
    const top = out.recs[0];
    this.push({
      role: 'assistant',
      verdict: info,
      recs: out.recs,
      content:
        `I read your resume (${out.profile.summary || out.profile.titles[0]}) and checked **${out.searched}** live openings. ` +
        `Here are the **${out.recs.length} best fits**, strongest first` +
        (top ? ` (top match: **${top.job.title}**, ${top.score}% fit)` : '') +
        '. Swipe through them.\n\n' +
        '_The fit % is my estimate from your skills vs. the job. It is not a guarantee, but jobs with a high fit are the ones to apply for first._',
      actions: [
        { label: 'Find more jobs', icon: 'search', mode: 'finder' },
        { label: 'Improve my resume', icon: 'color-wand', task: 'improve' },
      ],
    });
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
  private async contextMessages(): Promise<ApiMessage[]> {
    const info = this.info();
    const job = this.job();
    let system = SYSTEM_PROMPT;
    const extra = this.settings.settings().customInstructions.trim();
    if (extra) {
      system += `\n\nExtra instructions from the user: ${extra}`;
    }
    if (this.mock()) {
      system += `\n\n${MOCK_INTERVIEW_SYSTEM}`;
    } else if (info.system) {
      system += `\n\n${info.system}`;
    }
    if (job && this.mode() !== 'finder') {
      system +=
        `\n\nSelected job: ${job.title} at ${job.company_name} (${job.category}, ${job.job_type}). ` +
        `Description: ${plainText(job.description, 1500)}`;
    }
    const wantsResume = (info.needsResume || this.mock()) && this.hasResume();
    if (wantsResume && (await this.tasks.ensureConsent())) {
      system += `\n\nThe user's resume:\n${this.resume.resume().slice(0, 6000)}`;
    }
    const recent = this.chat().messages.filter((m) => !m.error && m.content).slice(-20);
    const lastUser = [...recent].reverse().find((m) => m.role === 'user');
    const history = recent.map((m): ApiMessage => {
      if (m.role !== 'user') {
        return { role: 'assistant', content: m.content.slice(0, 3000) };
      }
      let body = m.content.slice(0, 3000);
      for (const a of m.attachments ?? []) {
        body += a.text
          ? `\n\n[Attached file: ${a.name}]\n${a.text}`
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
    return [{ role: 'system', content: system }, ...history];
  }

  // ---------- shared plumbing ----------
  private push(m: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content'>): void {
    const message: ChatMessage = { id: newId(), time: Date.now(), ...m };
    this.chat.set({ ...this.chat(), messages: [...this.chat().messages, message] });
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
      const message = e instanceof AiError ? e.message : 'Something went wrong. Please try again.';
      this.push({ role: 'assistant', content: message, error: true });
    } finally {
      clearInterval(this.timer);
      this.sending.set(false);
      this.persist();
      this.scrollDown();
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
        this.resumeOpen.set(true);
        return true;
      case '/settings':
        this.inputText = '';
        await this.router.navigate(['/tabs/settings']);
        return true;
      case '/help':
        this.inputText = '';
        this.push({
          role: 'assistant',
          content:
            '**Commands**\n- `/new` new chat\n- `/clear` clear this chat\n- `/resume` add or edit your resume\n- `/settings` open Settings\n\n' +
            'Pick a mode above to use the Resume Assistant, Job Finder, Job Matching, Application Assistant, Skills Gap or Interview Prep.',
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
