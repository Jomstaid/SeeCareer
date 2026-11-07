import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';

import { SharedModule } from '../shared/shared.module';
import { JobsPage } from './jobs.page';

const routes: Routes = [{ path: '', component: JobsPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, SharedModule, RouterModule.forChild(routes)],
  declarations: [JobsPage],
})
export class JobsPageModule {}
