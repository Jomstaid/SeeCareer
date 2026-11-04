import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';

import { SharedModule } from '../shared/shared.module';
import { AboutPage } from './about.page';

const routes: Routes = [{ path: '', component: AboutPage }];

@NgModule({
  imports: [CommonModule, IonicModule, SharedModule, RouterModule.forChild(routes)],
  declarations: [AboutPage],
})
export class AboutPageModule {}
