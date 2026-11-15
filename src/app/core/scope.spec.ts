import { looksLikeNonsense, obviouslyCareer } from './scope';

describe('scope', () => {
  it('spots keyboard mashing and random letters', () => {
    for (const t of ['asdfgh', 'jsjsjsjs', 'qwerty', '???', '...', 'aaaaaaa', 'hjkl hjkl', 'xcvbnm', 'sdfsdfsdf', 'kjhgfdsa', 'bcdfgh']) {
      expect(looksLikeNonsense(t), t).toBe(true);
    }
  });

  it('does not treat real messages as nonsense', () => {
    for (const t of ['hi', 'ok', 'thanks', 'salamat po', 'html css js', 'QA jobs', 'C++', 'pls help', 'cv', 'web developer in Manila', 'asdf jobs', 'kumusta', 'lol', 'rhythm', 'I need a job', '?? find me jobs']) {
      expect(looksLikeNonsense(t), t).toBe(false);
    }
  });

  it('knows career words', () => {
    expect(obviouslyCareer('help me with my resume')).toBe(true);
    expect(obviouslyCareer('who won the game last night')).toBe(false);
  });
});
