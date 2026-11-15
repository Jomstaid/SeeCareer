import { asksWhoYouAre, cleanIdentity } from './identity';

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
});
