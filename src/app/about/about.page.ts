import { Component, inject } from '@angular/core';

import { GroupMember } from '../core/models';
import { SettingsService } from '../core/settings.service';
import { APIS, MEMBERS, PROJECT, TECH } from './groupinfo';

/** About Our Group: project info, members, course/year/section and each member's role. */
@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  standalone: false,
})
export class AboutPage {
  settings = inject(SettingsService);
  project = PROJECT;
  members: GroupMember[] = MEMBERS;
  tech = TECH;
  apis = APIS;
}
