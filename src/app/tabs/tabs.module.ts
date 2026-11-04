import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';

import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      { path: 'home', loadChildren: () => import('../home/home.module').then((m) => m.HomePageModule) },
      { path: 'chat', loadChildren: () => import('../chat/chat.module').then((m) => m.ChatPageModule) },
      { path: 'settings', loadChildren: () => import('../settings/settings.module').then((m) => m.SettingsPageModule) },
      { path: 'about', loadChildren: () => import('../about/about.module').then((m) => m.AboutPageModule) },
      { path: '', redirectTo: 'chat', pathMatch: 'full' },
    ],
  },
];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [TabsPage],
})
export class TabsPageModule {}
