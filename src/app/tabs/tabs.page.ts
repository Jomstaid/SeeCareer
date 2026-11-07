import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular/lazy';

import { ChatStore } from '../core/chatstore.service';
import { Conversation } from '../core/models';

interface NavItem {
  tab: string;
  path: string;
  label: string;
  icon: string;
  /** One line shown in the side navigation so each place is clear. */
  hint: string;
  group: 'work' | 'app';
}

/** Main navigation: bottom tab bar on phones/tablets, side navigation on laptops and desktops. */
@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: false,
})
export class TabsPage {
  constructor(
    public store: ChatStore,
    private router: Router,
    private alerts: AlertController,
  ) {}

  readonly items: NavItem[] = [
    { tab: 'home', path: '/home', label: 'Home', icon: 'home-outline', hint: 'Start here', group: 'work' },
    { tab: 'chat', path: '/chat', label: 'Assistant', icon: 'sparkles-outline', hint: 'Chat, resume, matching, interview', group: 'work' },
    { tab: 'jobs', path: '/jobs', label: 'Job board', icon: 'briefcase-outline', hint: 'Browse and search all openings', group: 'work' },
    { tab: 'settings', path: '/settings', label: 'Settings', icon: 'options-outline', hint: 'AI providers, theme, data', group: 'app' },
    { tab: 'about', path: '/about', label: 'About', icon: 'people-outline', hint: 'Our group', group: 'app' },
  ];

  get work(): NavItem[] {
    return this.items.filter((i) => i.group === 'work');
  }

  get app(): NavItem[] {
    return this.items.filter((i) => i.group === 'app');
  }

  /** Saved chats grouped like ChatGPT: Today, Yesterday, Earlier. */
  get groups(): { label: string; chats: Conversation[] }[] {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const day = 86400000;
    const buckets: { label: string; chats: Conversation[] }[] = [
      { label: 'Today', chats: [] },
      { label: 'Yesterday', chats: [] },
      { label: 'Earlier', chats: [] },
    ];
    for (const c of this.store.conversations()) {
      buckets[c.updated >= startOfToday ? 0 : c.updated >= startOfToday - day ? 1 : 2].chats.push(c);
    }
    return buckets.filter((b) => b.chats.length);
  }

  async newChat(): Promise<void> {
    this.store.requestNew();
    await this.router.navigateByUrl('/chat');
  }

  async openChat(c: Conversation): Promise<void> {
    this.store.requestOpen(c.id);
    await this.router.navigateByUrl('/chat');
  }

  async deleteChat(c: Conversation, event: Event): Promise<void> {
    event.stopPropagation();
    const alert = await this.alerts.create({
      header: 'Delete this chat?',
      message: `"${c.title}" will be deleted from this device. This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.store.remove(c.id);
            if (this.store.activeId() === c.id) {
              this.store.requestNew();
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
