import { Injectable, inject } from '@angular/core';
import { AlertController } from '@ionic/angular/lazy';

import { AiService } from './ai.service';
import { TaskContext, TaskKey, buildTask, parseScore, stripScore } from './aitasks';
import { AiError, ChatResult } from './models';
import { ResumeService } from './resume.service';
import { SettingsService } from './settings.service';

export interface TaskOutput {
  text: string;
  score: number | null;
  model: string;
}

/** Runs the AI career tools (resume, match, cover letter, gap, interview) and handles the privacy consent. */
@Injectable({ providedIn: 'root' })
export class AiTaskService {
  private ai = inject(AiService);
  private resume = inject(ResumeService);
  private settings = inject(SettingsService);
  private alerts = inject(AlertController);


  /** Tells the user their resume goes to an external AI provider and asks once for permission. */
  async ensureConsent(): Promise<boolean> {
    if (this.resume.consent()) {
      return true;
    }
    return new Promise<boolean>(async (resolve) => {
      const alert = await this.alerts.create({
        header: 'Privacy notice',
        message:
          'To analyze your resume, its text is sent to the AI provider you set in Settings. ' +
          'SeeCareer has no account or server and keeps your resume only on this device. ' +
          'You can delete it anytime.',
        backdropDismiss: false,
        buttons: [
          { text: 'Cancel', role: 'cancel', handler: () => resolve(false) },
          {
            text: 'I agree',
            handler: () => {
              this.resume.setConsent(true);
              resolve(true);
            },
          },
        ],
      });
      await alert.present();
    });
  }

  async run(key: TaskKey, ctx: TaskContext): Promise<TaskOutput> {
    if (!(await this.ensureConsent())) {
      throw new AiError('Cancelled. The AI needs your permission to read the resume.', 'config');
    }
    const messages = buildTask(key, { ...ctx, instructions: this.settings.settings().customInstructions });
    const result: ChatResult = await this.ai.chat(messages, Math.max(this.settings.settings().maxTokens, 1000));
    const score = key === 'match' ? parseScore(result.content) : null;
    return { text: key === 'match' ? stripScore(result.content) : result.content, score, model: result.model };
  }
}
