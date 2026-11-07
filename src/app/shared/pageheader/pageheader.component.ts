import { Component, Input } from '@angular/core';

/**
 * Reusable page header. The text changes per page:
 *   <app-page-header title="Home"></app-page-header>
 *   <app-page-header title="About Our Group"></app-page-header>
 * Buttons placed inside the tag appear on the right side of the bar.
 */
@Component({
  selector: 'app-page-header',
  templateUrl: './pageheader.component.html',
  styleUrls: ['./pageheader.component.scss'],
  standalone: false,
})
export class PageHeaderComponent {
  @Input() title = '';
  /** When set, a back button that returns to this route is shown. */
  @Input() backHref = '';
}
