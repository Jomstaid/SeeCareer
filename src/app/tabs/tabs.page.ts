import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular/lazy';

import { ChatStore } from '../core/chatstore.service';
import { Conversation } from '../core/models';
import { SettingsService } from '../core/settings.service';

interface NavItem {
  tab: string;
  path: string;
  label: string;
  /** A shorter name for the small phone tab bar. */
  short?: string;
  icon: string;
  image: string;
  darkImage: string;
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
  store = inject(ChatStore);
  settings = inject(SettingsService);
  private router = inject(Router);
  private alerts = inject(AlertController);


  readonly items: NavItem[] = [
    { tab: 'home', path: '/home', label: 'Home', icon: 'home-outline', image: 'assets/icon/nav-home.png', darkImage: 'assets/icon/dark-nav-home.png', hint: 'Start here', group: 'work' },
    { tab: 'chat', path: '/chat', label: 'Assistant', short: 'Chat', icon: 'sparkles-outline', image: 'assets/icon/nav-chat.png', darkImage: 'assets/icon/dark-nav-chat.png', hint: 'Chat, resume, matching, interview', group: 'work' },
    { tab: 'jobs', path: '/jobs', label: 'Job board', short: 'Jobs', icon: 'briefcase-outline', image: 'assets/icon/nav-jobs.png', darkImage: 'assets/icon/dark-nav-jobs.png', hint: 'Browse and search all openings', group: 'work' },
    { tab: 'settings', path: '/settings', label: 'Settings', icon: 'options-outline', image: 'assets/icon/nav-settings.png', darkImage: 'assets/icon/dark-nav-settings.png', hint: 'AI providers, theme, data', group: 'app' },
    { tab: 'about', path: '/about', label: 'About', icon: 'people-outline', image: 'assets/icon/nav-about.png', darkImage: 'assets/icon/dark-nav-about.png', hint: 'Our group', group: 'app' },
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
