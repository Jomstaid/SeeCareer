import { detectDesign, detectFormat, detectIntent } from './intent';

describe('detectIntent: does the message ask for a file?', () => {
  it('sees a resume request, whatever the wording', () => {
    for (const msg of [
      'create me a resume',
      'can you make a resume for a fresh graduate in business administration',
      'I need a CV',
      'build my resume',
      'generate a resume for me',
      'redesign my resume',
      'please write me a resume for a nurse',
    ]) {
      expect(detectIntent(msg)?.kind, msg).toBe('resume');
    }
  });

  it('does not treat questions or reviews as file requests', () => {
    for (const msg of [
      'how do I write a resume?',
      'what should a resume include',
      'tips for my resume',
      'review my resume',
      'analyze my resume please',
      'hello',
      'find me a job',
    ]) {
      expect(detectIntent(msg), msg).toBeNull();
    }
  });

  it('picks the format from the message, PDF by default', () => {
    expect(detectIntent('create me a resume')?.format).toBe('pdf');
    expect(detectIntent('create me a resume in word')?.format).toBe('docx');
    expect(detectIntent('make a resume as docx')?.format).toBe('docx');
    expect(detectIntent('write a cover letter as a PDF')?.format).toBe('pdf');
    expect(detectFormat('save it as a text file')).toBe('txt');
    expect(detectFormat('give me markdown')).toBe('md');
  });

  it('sees other documents', () => {
    expect(detectIntent('write a cover letter for a marketing job')?.kind).toBe('document');
    expect(detectIntent('make me a weekly study schedule as pdf')?.kind).toBe('document');
    expect(detectIntent('draft a resignation letter in word')).toEqual({ kind: 'document', format: 'docx' });
  });

  it('turns the last answer into a file when asked, but only if there is one', () => {
    expect(detectIntent('make this a pdf', true)).toEqual({ kind: 'convert', format: 'pdf' });
    expect(detectIntent('download that as word', true)?.format).toBe('docx');
    expect(detectIntent('make this a pdf', false)).toBeNull();
  });

  it('reads design words from the message', () => {
    expect(detectDesign('a minimal resume in green')).toEqual({ template: 'minimal', accent: '#15803d' });
    expect(detectDesign('classic style, dark')).toEqual({ template: 'classic', accent: '#334155' });
    expect(detectDesign('create me a resume')).toEqual({});
    expect(detectIntent('make me a modern purple resume')).toEqual({ kind: 'resume', format: 'pdf', template: 'modern', accent: '#6d28d9' });
  });
});

import { isResumeEdit, looksLikeJobSearch, personFromRequest, roleFromRequest, usesMyResume, wantsDifferentDesign, wantsPhotoAdded, wantsPhotoRemoved } from './intent';

describe('resume for someone else and edits to a made resume', () => {
  it('finds who the resume is for', () => {
    expect(personFromRequest('create me resume for Jahn Paul')).toBe('Jahn Paul');
    expect(personFromRequest('make a resume for my brother')).toBe('');
    expect(personFromRequest('create me a resume')).toBeNull();
    expect(personFromRequest('create a resume for Software Engineer')).toBeNull();
    expect(personFromRequest('make a resume for me in Word')).toBeNull();
  });

  it('understands photo requests', () => {
    expect(wantsPhotoAdded('add picture')).toBe(true);
    expect(wantsPhotoAdded('put my photo on it')).toBe(true);
    expect(wantsPhotoRemoved('remove the photo')).toBe(true);
    expect(wantsPhotoAdded('remove the photo')).toBe(false);
  });

  it('treats short change requests as edits and questions as chat', () => {
    expect(isResumeEdit('add picture')).toBe(true);
    expect(isResumeEdit('make it red')).toBe(true);
    expect(isResumeEdit('add skill Python')).toBe(true);
    expect(isResumeEdit('what is a good salary for this')).toBe(false);
  });
});

describe('a person named in lowercase', () => {
  it('finds a name typed in a hurry', () => {
    expect(personFromRequest('hey create me resume for duterte with image')).toBe('duterte');
    expect(personFromRequest('make a resume for juan dela cruz')).toBe('juan dela cruz');
  });

  it('does not mistake a job or purpose for a person', () => {
    expect(personFromRequest('create me a resume for software engineering')).toBeNull();
    expect(personFromRequest('make a resume for fresh graduates in pdf')).toBeNull();
    expect(personFromRequest('create my resume for work abroad')).toBeNull();
    expect(personFromRequest('create a resume for a nurse')).toBeNull();
  });
});

describe('role and own resume', () => {
  it('finds the job a resume is asked for', () => {
    expect(roleFromRequest('create me a resume for a nurse in pdf')).toBe('nurse');
    expect(roleFromRequest('make a resume as a graphic designer')).toBe('graphic designer');
    expect(roleFromRequest('create me a resume')).toBeNull();
    expect(roleFromRequest('make a resume for a job abroad')).toBeNull();
  });

  it('knows when the user means their own saved resume', () => {
    expect(usesMyResume('update my resume and make it red')).toBe(true);
    expect(usesMyResume('create me a resume for a nurse')).toBe(false);
  });
});

describe('a plain list of jobs', () => {
  it('is a job search when it is short and just asks for jobs', () => {
    expect(looksLikeJobSearch('accountant jobs remote')).toBe(true);
    expect(looksLikeJobSearch('nursing jobs in cebu')).toBe(true);
    expect(looksLikeJobSearch('hiring in davao')).toBe(true);
  });

  it('is not a job search when it is a question or a request for writing', () => {
    expect(looksLikeJobSearch('how do I find jobs?')).toBe(false);
    expect(looksLikeJobSearch('what jobs pay the most')).toBe(false);
    expect(looksLikeJobSearch('write a cover letter for a job')).toBe(false);
    expect(looksLikeJobSearch('hello')).toBe(false);
  });
});

describe('design words', () => {
  it('maps the words people use to the seven designs', () => {
    expect(detectDesign('make it bold').template).toBe('bold');
    expect(detectDesign('i want a creative colorful resume').template).toBe('creative');
    expect(detectDesign('an executive style for a manager').template).toBe('executive');
    expect(detectDesign('something elegant in burgundy')).toEqual({ template: 'elegant', accent: '#7f1d1d' });
    expect(detectDesign('classic serif').template).toBe('classic');
    expect(detectDesign('clean and simple').template).toBe('minimal');
    expect(detectDesign('make it modern and teal')).toEqual({ template: 'modern', accent: '#0f766e' });
    expect(detectDesign('charcoal')).toEqual({ accent: '#1f2937' });
    expect(detectDesign('hello there')).toEqual({});
  });

  it('knows when the user wants another look without naming one', () => {
    expect(wantsDifferentDesign('give me a different design')).toBe(true);
    expect(wantsDifferentDesign('make it look better')).toBe(true);
    expect(wantsDifferentDesign('the layout is too plain')).toBe(true);
    expect(wantsDifferentDesign('something else please')).toBe(true);
    expect(wantsDifferentDesign('different again please')).toBe(true);
    expect(wantsDifferentDesign('another one')).toBe(true);
    expect(wantsDifferentDesign('another question about interviews')).toBe(false);
    expect(wantsDifferentDesign('add skill python')).toBe(false);
    expect(isResumeEdit('give me a different design')).toBe(true);
  });
});
