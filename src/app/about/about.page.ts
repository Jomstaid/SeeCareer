import { Component } from '@angular/core';

import { GroupMember } from '../core/models';
import { MEMBERS, PROJECT, TECH } from './groupinfo';

/** About Our Group: project info, members, course/year/section and each member's role. */
@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  standalone: false,
})
export class AboutPage {
  project = PROJECT;
  members: GroupMember[] = MEMBERS;
  tech = TECH;

  initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }
}
