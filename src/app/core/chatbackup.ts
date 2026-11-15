import { Conversation } from './models';

const FORMAT = 'seecareer-chats';

export function chatsToBackup(chats: Conversation[]): string {
  return JSON.stringify({ format: FORMAT, version: 1, exported: new Date().toISOString(), chats }, null, 2);
}

function isChat(c: unknown): c is Conversation {
  const chat = c as Conversation | null;
  return (
    !!chat &&
    typeof chat.id === 'string' &&
    chat.id.length > 0 &&
    Array.isArray(chat.messages) &&
    chat.messages.every((m) => typeof m?.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
  );
}

export function chatsFromBackup(text: string): Conversation[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a SeeCareer chat backup.');
  }
  const marked = Array.isArray(data) || (data as { format?: string } | null)?.format === FORMAT;
  const list = Array.isArray(data) ? data : (data as { chats?: unknown } | null)?.chats;
  if (!marked || !Array.isArray(list)) {
    throw new Error('This file is not a SeeCareer chat backup.');
  }
  const valid = list.filter(isChat);
  if (!valid.length) {
    throw new Error('No chats were found in this file.');
  }
  return valid.map((c) => ({
    ...c,
    title: typeof c.title === 'string' ? c.title : 'Imported chat',
    updated: typeof c.updated === 'number' ? c.updated : Date.now(),
  }));
}
