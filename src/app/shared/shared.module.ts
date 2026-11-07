import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';
import { IonicModule } from '@ionic/angular/lazy';

import { FitPageDirective } from './fitpage/fitpage.directive';
import { FeatureListComponent } from './featurelist/featurelist.component';
import { JobCardComponent } from './jobcard/jobcard.component';
import { PageHeaderComponent } from './pageheader/pageheader.component';
import { RecCarouselComponent } from './reccarousel/reccarousel.component';
import { ResumeDesignerComponent } from './resumedesigner/resumedesigner.component';
import { ResumePreviewComponent } from './resumepreview/resumepreview.component';

/** Components used by more than one page. */
@NgModule({
  imports: [CommonModule, FormsModule, IonicModule],
  declarations: [FitPageDirective, PageHeaderComponent, JobCardComponent, FeatureListComponent, RecCarouselComponent, ResumePreviewComponent, ResumeDesignerComponent],
  exports: [FitPageDirective, PageHeaderComponent, JobCardComponent, FeatureListComponent, RecCarouselComponent, ResumePreviewComponent, ResumeDesignerComponent],
})
export class SharedModule {}
