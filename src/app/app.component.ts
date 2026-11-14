import { AfterViewInit, Component, HostListener, inject } from '@angular/core';

import { AiService } from './core/ai.service';
import { SettingsService } from './core/settings.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements AfterViewInit {
  private settings = inject(SettingsService);
  private ai = inject(AiService);

  // Creating the service here applies the saved theme as soon as the app starts.
  constructor() {
    this.ai.startAutoCheck(); // keeps the list of working models up to date by itself
  }

  /** Fades the front page away once the app is ready. It always shows for a moment, so the animation is seen. */
  ngAfterViewInit(): void {
    const splash = document.getElementById('splash');
    if (!splash) {
      return;
    }
    const shown = Date.now() - ((window as unknown as { __splashAt?: number }).__splashAt ?? Date.now());
    setTimeout(() => {
      splash.classList.add('done');
      setTimeout(() => splash.remove(), 600);
    }, Math.max(0, 2300 - shown));
  }

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
