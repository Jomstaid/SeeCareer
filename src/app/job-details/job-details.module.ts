import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';

import { SharedModule } from '../shared/shared.module';
import { JobDetailsPage } from './job-details.page';

const routes: Routes = [{ path: '', component: JobDetailsPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, SharedModule, RouterModule.forChild(routes)],
  declarations: [JobDetailsPage],
})
export class JobDetailsPageModule {}
