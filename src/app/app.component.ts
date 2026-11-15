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

  constructor() {
    this.ai.startAutoCheck();
  }

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

  @HostListener('window:dragover', ['$event'])
  @HostListener('window:drop', ['$event'])
  blockFileNavigation(e: DragEvent): void {
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
      e.preventDefault();
    }
  }
}
