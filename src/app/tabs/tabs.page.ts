import { Component } from '@angular/core';

interface NavItem {
  tab: string;
  path: string;
  label: string;
  icon: string;
}

/** Main navigation: bottom tab bar on phones/tablets, side navigation on laptops and desktops. */
@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: false,
})
export class TabsPage {
  readonly items: NavItem[] = [
    { tab: 'chat', path: '/tabs/chat', label: 'AI Chat', icon: 'chatbubbles-outline' },
    { tab: 'home', path: '/tabs/home', label: 'Jobs', icon: 'briefcase-outline' },
    { tab: 'settings', path: '/tabs/settings', label: 'Settings', icon: 'options-outline' },
    { tab: 'about', path: '/tabs/about', label: 'About', icon: 'people-outline' },
  ];
}
