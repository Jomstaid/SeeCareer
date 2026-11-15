import { AfterViewInit, Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

@Directive({
  selector: '[appFitPage]',
  standalone: false,
})
export class FitPageDirective implements OnInit, AfterViewInit, OnDestroy {
  private ref = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly maxZoom = 1.45;
  private readonly minZoom = 0.85;
  private resize?: ResizeObserver;
  private mutate?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private fitting = false;
  private pending = false;

  private scrolling(on: boolean): void {
    const content = this.ref.nativeElement.closest('ion-content');
    if (content) {
      content.scrollY = on;
    }
  }

  ngOnInit(): void {
    this.scrolling(window.innerWidth < 900);
  }

  ngAfterViewInit(): void {
    const page = this.ref.nativeElement;
    const content = page.closest('ion-content');
    this.mutate = new MutationObserver(() => this.later());
    this.mutate.observe(page, { childList: true, subtree: true, characterData: true });
    if (content && typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => this.later());
      this.resize.observe(content);
      Array.from(page.children).forEach((c) => this.resize?.observe(c));
    }
    page.addEventListener('load', this.onLoad, true);
    void document.fonts?.ready.then(() => this.later());
    this.later(0);
  }

  private onLoad = (): void => this.later();

  ngOnDestroy(): void {
    this.ref.nativeElement.removeEventListener('load', this.onLoad, true);
    clearTimeout(this.timer);
    this.resize?.disconnect();
    this.mutate?.disconnect();
  }

  private later(wait = 90): void {
    if (this.fitting) {
      this.pending = true;
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fit(), wait);
  }

  private multiColumn(page: HTMLElement): boolean {
    return getComputedStyle(page).gridTemplateColumns.split(' ').length > 1;
  }

  private fit(): void {
    this.fitting = true;
    try {
      this.measure();
    } finally {
      setTimeout(() => {
        this.fitting = false;
        if (this.pending) {
          this.pending = false;
          this.later(60);
        }
      }, 120);
    }
  }

  private measure(): void {
    const page = this.ref.nativeElement;
    const content = page.closest('ion-content');
    const box = content?.shadowRoot?.querySelector('.inner-scroll') as HTMLElement | null | undefined;
    if (!content || !box) {
      return;
    }
    page.style.minHeight = '0';
    this.scrolling(false);
    const style = getComputedStyle(box);
    const available = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (!this.multiColumn(page) || available < 300) {
      page.style.zoom = '';
      page.style.minHeight = '';
      this.scrolling(window.innerWidth < 900);
      return;
    }
    let lo = this.minZoom;
    let hi = this.maxZoom;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      page.style.zoom = String(mid);
      if (box.scrollHeight <= box.clientHeight) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    page.style.zoom = String(lo);
    page.style.minHeight = `${(available - 3) / lo}px`;
    for (let i = 0; i < 12 && box.scrollHeight > box.clientHeight && lo > this.minZoom; i++) {
      lo = Math.max(this.minZoom, lo - 0.01);
      page.style.zoom = String(lo);
      page.style.minHeight = `${(available - 3) / lo}px`;
    }
    this.scrolling(box.scrollHeight > box.clientHeight + 1);
  }
}
