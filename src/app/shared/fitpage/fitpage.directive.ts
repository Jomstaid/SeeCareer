import { AfterViewInit, Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Makes a page fill the whole screen on a big display, with no empty space and no scrolling:
 * the page content is scaled up (like browser zoom) as far as it still fits the height, up to a limit.
 * It re-fits when the window changes size and when the content changes (for example a list that loads).
 * On phones and small windows it does nothing, and the page scrolls as usual.
 */
@Directive({
  selector: '[appFitPage]',
  standalone: false,
})
export class FitPageDirective implements OnInit, AfterViewInit, OnDestroy {
  private ref = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The most the content may be enlarged. */
  private readonly maxZoom = 1.45;
  /** The least the content may be shrunk (for large text on a small screen). */
  private readonly minZoom = 0.45;
  private resize?: ResizeObserver;
  private mutate?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private fitting = false;

  /** Turns the page's own scrolling on or off (a scrollbar must not flash while the page is being fitted). */
  private scrolling(on: boolean): void {
    const content = this.ref.nativeElement.closest('ion-content');
    if (content) {
      content.scrollY = on;
    }
  }

  ngOnInit(): void {
    // before the first paint: on a wide screen the page will be fitted, so it must not show a scrollbar even for a moment
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
      // the columns grow when an image or a font finishes loading
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
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fit(), wait);
  }

  /** Only a page laid out in two or more columns is fitted; a single column (phone) scrolls as usual. */
  private multiColumn(page: HTMLElement): boolean {
    return getComputedStyle(page).gridTemplateColumns.split(' ').length > 1;
  }

  private fit(): void {
    this.fitting = true;
    try {
      this.measure();
    } finally {
      // the observers report this fit's own changes a moment later: ignore them
      setTimeout(() => (this.fitting = false), 120);
    }
  }

  private measure(): void {
    const page = this.ref.nativeElement;
    const content = page.closest('ion-content');
    // the scrolling box inside the content: its own sizes are in the same units whatever the text size is
    const box = content?.shadowRoot?.querySelector('.inner-scroll') as HTMLElement | null | undefined;
    if (!content || !box) {
      return;
    }
    page.style.minHeight = '0';
    // while measuring, a scrollbar must not appear and disappear (that made the page flicker)
    this.scrolling(false);
    // the header floats over the top of a full-screen content, so that padding is not free space
    const style = getComputedStyle(box);
    const available = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (!this.multiColumn(page) || available < 300) {
      page.style.zoom = '';
      page.style.minHeight = '';
      // a phone scrolls normally; on a wide screen this is only a page that is still opening, so keep it still
      this.scrolling(window.innerWidth < 900);
      return;
    }
    // the biggest zoom whose content still fits (a short binary search); big text shrinks the page a little
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
    // the little height that is left is taken up by the stretching cards
    page.style.minHeight = `${(available - 3) / lo}px`;
    // rounding can leave a pixel or two over: step down until nothing scrolls
    for (let i = 0; i < 12 && box.scrollHeight > box.clientHeight && lo > this.minZoom; i++) {
      lo = Math.max(this.minZoom, lo - 0.01);
      page.style.zoom = String(lo);
      page.style.minHeight = `${(available - 3) / lo}px`;
    }
    // scrolling comes back only when even the smallest size does not fit
    this.scrolling(box.scrollHeight > box.clientHeight + 1);
  }
}
