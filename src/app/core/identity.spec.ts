import { aboutAssistantAnswer, asksWhoYouAre, cleanIdentity } from './identity';

describe('identity', () => {
  it('knows when the user asks who the assistant is', () => {
    for (const t of ['Hey who are you', 'who r u?', 'what model are you', 'which AI is this', 'are you chatgpt', 'who made you', 'what is your name', 'sino ka']) {
      expect(asksWhoYouAre(t), t).toBe(true);
    }
    for (const t of ['who are you hiring for in the IT field and what skills do I need for a junior developer role there', 'find nursing jobs', 'who is hiring in cebu']) {
      expect(asksWhoYouAre(t), t).toBe(false);
    }
  });

  it('replaces the model introducing itself', () => {
    expect(cleanIdentity("I'm Claude Sonnet 4.6 from Anthropic. Ready to help.")).toBe("I'm SeeCareer AI. Ready to help.");
    expect(cleanIdentity('I am ChatGPT, a large language model made by OpenAI.')).toBe('I am SeeCareer AI.');
    expect(cleanIdentity('Hi! My name is Gemini.')).toBe('Hi! My name is SeeCareer AI.');
    expect(cleanIdentity('I was trained by Google to help.')).toBe('I was trained by Group 2 for the SeeCareer app to help.');
  });

  it('leaves normal career talk alone', () => {
    const t = 'Google and OpenAI are hiring prompt engineers. I am happy to help you apply.';
    expect(cleanIdentity(t)).toBe(t);
  });

  it('knows more ways of asking about the assistant', () => {
    for (const t of ['what model do you use?', 'ikaw ba si chatgpt', 'are you alive', 'sino gumawa sayo', 'ano pangalan mo', 'are you openai', 'what powers you']) {
      expect(asksWhoYouAre(t), t).toBe(true);
    }
  });

  it('answers questions about the assistant by itself', () => {
    expect(aboutAssistantAnswer('what can you do?')).toContain('Find jobs');
    expect(aboutAssistantAnswer('hi, how can you help me')).toContain('Resume');
    expect(aboutAssistantAnswer('ano kaya mo')).toContain('Find jobs');
    expect(aboutAssistantAnswer('is this free?')).toContain('free');
    expect(aboutAssistantAnswer('libre ba')).toContain('free');
    expect(aboutAssistantAnswer('do you save my data?')).toContain('only on your device');
    expect(aboutAssistantAnswer('is my resume safe')).toContain('only on your device');
    expect(aboutAssistantAnswer('how do you work')).toContain('free AI model');
  });

  it('leaves real career questions to the AI', () => {
    for (const t of ['what do you do as a nurse', 'do you see my resume?', 'how do you work in a team in an interview answer', 'is this job free to apply', 'what can you do with an IT degree', 'find remote jobs']) {
      expect(aboutAssistantAnswer(t), t).toBeNull();
    }
  });
});
