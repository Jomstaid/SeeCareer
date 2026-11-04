import { Component, HostListener } from '@angular/core';

import { SettingsService } from './core/settings.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  // Creating the service here applies the saved theme as soon as the app starts.
  constructor(private settings: SettingsService) {}

  /**
   * A file dropped anywhere that is not the chat would make the browser open it and leave the app.
   * The chat page handles its own drops; everywhere else we simply ignore them.
   */
  @HostListener('window:dragover', ['$event'])
  @HostListener('window:drop', ['$event'])
  blockFileNavigation(e: DragEvent): void {
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
      e.preventDefault();
    }
  }
}
