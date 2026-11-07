import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ModeInfo } from '../../core/modes';
import { ChatMode } from '../../core/models';

/** The six AI features as a list. One column on phones, two on tablets and desktops. */
@Component({
  selector: 'app-feature-list',
  templateUrl: './featurelist.component.html',
  styleUrls: ['./featurelist.component.scss'],
  standalone: false,
})
export class FeatureListComponent {
  @Input({ required: true }) features: ModeInfo[] = [];
  @Output() pick = new EventEmitter<ChatMode>();
}
