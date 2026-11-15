import { Injectable, signal, inject } from '@angular/core';

import { ChatMessage, Conversation, Job } from './models';
import { newId, readJson, removeKey, writeJson } from './storage';
import { SettingsService } from './settings.service';

const KEY = 'seecareer.chats';
const maxConversations = 30;

@Injectable({ providedIn: 'root' })
export class ChatStore {
  private settings = inject(SettingsService);

  readonly conversations = signal<Conversation[]>(readJson<Conversation[]>(KEY, []));

  readonly activeId = signal('');
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

  upsert(chat: Conversation): void {
    const first = chat.messages.find((m) => m.role === 'user');
    const title = first ? (first.auto && first.attachments?.length ? first.attachments[0].name : first.content).slice(0, 48) : 'New chat';
    const updated: Conversation = { ...chat, title, updated: Date.now() };
    const rest = this.conversations().filter((c) => c.id !== chat.id);
    this.set([updated, ...rest].slice(0, maxConversations));
  }

  importChats(chats: Conversation[]): number {
    const ids = new Set(chats.map((c) => c.id));
    const kept = this.conversations().filter((c) => !ids.has(c.id));
    this.set([...chats, ...kept].sort((a, b) => b.updated - a.updated).slice(0, maxConversations));
    return Math.min(chats.length, maxConversations);
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
