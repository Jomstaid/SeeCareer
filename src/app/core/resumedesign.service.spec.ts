import { TestBed } from '@angular/core/testing';

import { AiService } from './ai.service';
import { normalizeResume } from './resumedata';
import { ResumeDesignService } from './resumedesign.service';

const GOOD = JSON.stringify({ name: 'Ana Reyes', title: 'Designer', summary: 'Creative designer with 3 years of experience.', experience: [{ role: 'Designer', company: 'Studio X', dates: '2022 - 2025', bullets: ['Designed 20 logos'] }] });

function setup(replies: string[]) {
  const calls: { content: unknown }[][] = [];
  const fake = {
    chat: async (messages: { content: unknown }[]) => {
      calls.push(messages);
      return { content: replies.shift() ?? '', model: 'test-model', providerName: 'p' };
    },
  };
  TestBed.configureTestingModule({ providers: [{ provide: AiService, useValue: fake }] });
  return { service: TestBed.inject(ResumeDesignService), calls };
}

describe('ResumeDesignService', () => {
  it('turns the AI answer into structured resume data', async () => {
    const { service, calls } = setup([GOOD]);
    const out = await service.fromText('Ana Reyes, designer at Studio X 2022-2025', 'Keep it short');
    expect(out.data.name).toBe('Ana Reyes');
    expect(out.data.experience[0].bullets).toEqual(['Designed 20 logos']);
    expect(out.model).toBe('test-model');
    expect(calls.length).toBe(1);
    const prompt = JSON.stringify(calls[0]);
    expect(prompt).toContain('Keep it short'); // the user's own instructions reach the AI
    expect(prompt).toContain('Never invent'); // and the no-invention rule
  });

  it('asks again when the first answer is not valid resume JSON', async () => {
    const { service, calls } = setup(['Sure! Here is your resume: great job.', '```json\n' + GOOD + '\n```']);
    const out = await service.fromText('Ana Reyes designer');
    expect(out.data.name).toBe('Ana Reyes');
    expect(calls.length).toBe(2);
    expect(JSON.stringify(calls[1])).toContain('not usable');
  });

  it('gives up with an error when the AI never returns a resume', async () => {
    const { service } = setup(['no', 'still no']);
    await expect(service.fromText('x')).rejects.toThrow();
  });

  it('sends the current resume and the change request when refining', async () => {
    const { service, calls } = setup([GOOD]);
    const current = normalizeResume(JSON.parse(GOOD));
    const out = await service.refine(current, 'make it fit one page');
    const prompt = JSON.stringify(calls[0]);
    expect(prompt).toContain('make it fit one page');
    expect(prompt).toContain('Ana Reyes');
    expect(out.data.name).toBe('Ana Reyes');
  });
});
