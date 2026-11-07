import { describe, expect, it } from 'vitest';

import { chatsFromBackup, chatsToBackup } from './chatbackup';
import { Conversation } from './models';

const chat = (id: string): Conversation =>
  ({
    id,
    title: 'Hello',
    updated: 1,
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ],
  }) as Conversation;

describe('chat backup', () => {
  it('round trips chats', () => {
    const back = chatsFromBackup(chatsToBackup([chat('a'), chat('b')]));
    expect(back.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('rejects files that are not a backup', () => {
    expect(() => chatsFromBackup('nope')).toThrow();
    expect(() => chatsFromBackup('{"hello":1}')).toThrow();
    expect(() => chatsFromBackup(chatsToBackup([]))).toThrow();
  });

  it('skips broken chats', () => {
    const text = JSON.stringify({ format: 'seecareer-chats', chats: [chat('a'), { id: 'x', messages: [{ role: 'bot', content: 1 }] }] });
    expect(chatsFromBackup(text).length).toBe(1);
  });
});
