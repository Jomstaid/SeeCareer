import { Conversation } from './models';

/** Marks a file as a SeeCareer chat backup, so other JSON files are not imported by mistake. */
const FORMAT = 'seecareer-chats';

/** Turns the chats into the text of a backup file. */
export function chatsToBackup(chats: Conversation[]): string {
  return JSON.stringify({ format: FORMAT, version: 1, exported: new Date().toISOString(), chats }, null, 2);
}

/** True when the value looks like a chat: an id and a list of messages with a role and text. */
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

/** Reads a backup file. Returns the valid chats, or throws an Error with a plain message. */
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
