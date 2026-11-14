import { Injectable, signal, inject } from '@angular/core';

import { ChatMessage, Conversation, Job } from './models';
import { newId, readJson, removeKey, writeJson } from './storage';
import { SettingsService } from './settings.service';

const KEY = 'seecareer.chats';
const MAX_CONVERSATIONS = 30;

/** Saves chat conversations on the phone (localStorage) so they survive closing the app. */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private settings = inject(SettingsService);

  readonly conversations = signal<Conversation[]>(readJson<Conversation[]>(KEY, []));

  /** The conversation that is open in the chat page (highlighted in the side list). */
  readonly activeId = signal('');
  /** A click in the side list that the chat page has not handled yet. */
  readonly request = signal<{ kind: 'new' | 'open'; id?: string } | null>(null);

  requestNew(): void {
    this.request.set({ kind: 'new' });
  }

  requestOpen(id: string): void {
    this.request.set({ kind: 'open', id });
  }

  get(id: string): Conversation | undefined {
    return this.conversations().find((c) => c.id === id);
  }

  create(context?: string): Conversation {
    return { id: newId(), title: 'New chat', updated: Date.now(), context, messages: [] };
  }

  /** Inserts or replaces a conversation (newest first) and persists it. */
  upsert(chat: Conversation): void {
    const first = chat.messages.find((m) => m.role === 'user');
    const title = first ? (first.auto && first.attachments?.length ? first.attachments[0].name : first.content).slice(0, 48) : 'New chat';
    const updated: Conversation = { ...chat, title, updated: Date.now() };
    const rest = this.conversations().filter((c) => c.id !== chat.id);
    this.set([updated, ...rest].slice(0, MAX_CONVERSATIONS));
  }

  /** Adds chats from a backup (a chat with the same id is replaced). Returns how many were added. */
  importChats(chats: Conversation[]): number {
    const ids = new Set(chats.map((c) => c.id));
    const kept = this.conversations().filter((c) => !ids.has(c.id));
    this.set([...chats, ...kept].sort((a, b) => b.updated - a.updated).slice(0, MAX_CONVERSATIONS));
    return Math.min(chats.length, MAX_CONVERSATIONS);
  }

  remove(id: string): void {
    this.set(this.conversations().filter((c) => c.id !== id));
  }

  clearAll(): void {
    this.conversations.set([]);
    removeKey(KEY);
  }

  addMessage(chat: Conversation, message: ChatMessage): Conversation {
    return { ...chat, messages: [...chat.messages, message] };
  }

  /** Saved chats keep only a short job description so storage stays small. */
  private slim(list: Conversation[]): Conversation[] {
    const cut = (j: Job): Job => ({ ...j, description: (j.description ?? '').slice(0, 1500) });
    return list.map((c) => ({
      ...c,
      job: c.job ? cut(c.job) : undefined,
      messages: c.messages.map((m) => ({
        ...m,
        jobs: m.jobs?.map(cut),
        recs: m.recs?.map((r) => ({ ...r, job: cut(r.job) })),
      })),
    }));
  }

  private set(list: Conversation[]): void {
    this.conversations.set(list);
    if (this.settings.settings().saveHistory) {
      writeJson(KEY, this.slim(list));
    } else {
      removeKey(KEY);
    }
  }
}
