import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';

import { SharedModule } from '../shared/shared.module';
import { ChatPage } from './chat.page';

const routes: Routes = [{ path: '', component: ChatPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, SharedModule, RouterModule.forChild(routes)],
  declarations: [ChatPage],
})
export class ChatPageModule {}
