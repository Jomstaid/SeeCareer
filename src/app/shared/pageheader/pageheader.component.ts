import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  templateUrl: './pageheader.component.html',
  styleUrls: ['./pageheader.component.scss'],
  standalone: false,
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() backHref = '';
}
