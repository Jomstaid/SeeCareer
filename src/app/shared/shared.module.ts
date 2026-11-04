import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';
import { IonicModule } from '@ionic/angular/lazy';

import { FeatureListComponent } from './feature-list/feature-list.component';
import { JobCardComponent } from './job-card/job-card.component';
import { PageHeaderComponent } from './page-header/page-header.component';
import { RecCarouselComponent } from './rec-carousel/rec-carousel.component';
import { ResumeSheetComponent } from './resume-sheet/resume-sheet.component';

/** Components used by more than one page. */
@NgModule({
  imports: [CommonModule, FormsModule, IonicModule],
  declarations: [PageHeaderComponent, JobCardComponent, ResumeSheetComponent, FeatureListComponent, RecCarouselComponent],
  exports: [PageHeaderComponent, JobCardComponent, ResumeSheetComponent, FeatureListComponent, RecCarouselComponent],
})
export class SharedModule {}
