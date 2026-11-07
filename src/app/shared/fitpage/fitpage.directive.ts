import { AfterViewInit, Directive, ElementRef, OnDestroy } from '@angular/core';

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
export class FitPageDirective implements AfterViewInit, OnDestroy {
  /** The most the content may be enlarged. */
  private readonly maxZoom = 1.45;
  /** The least the content may be shrunk (for large text on a small screen). */
  private readonly minZoom = 0.6;
  private resize?: ResizeObserver;
  private mutate?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private ref: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const page = this.ref.nativeElement;
    const content = page.closest('ion-content');
    this.mutate = new MutationObserver(() => this.later());
    this.mutate.observe(page, { childList: true, subtree: true, characterData: true });
    if (content && typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => this.later());
      this.resize.observe(content);
    }
    this.later(0);
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    this.resize?.disconnect();
    this.mutate?.disconnect();
  }

  private later(wait = 90): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fit(), wait);
  }

  private fit(): void {
    const page = this.ref.nativeElement;
    const content = page.closest('ion-content');
    // the scrolling box inside the content: its own sizes are in the same units whatever the text size is
    const box = content?.shadowRoot?.querySelector('.inner-scroll') as HTMLElement | null | undefined;
    if (!content || !box) {
      return;
    }
    page.style.minHeight = '0';
    // the header floats over the top of a full-screen content, so that padding is not free space
    const style = getComputedStyle(box);
    const available = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (window.innerWidth < 1000 || available < 300) {
      page.style.zoom = '';
      page.style.minHeight = '';
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
  }
}
