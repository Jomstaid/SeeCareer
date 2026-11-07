import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: 'tabs', loadChildren: () => import('./tabs/tabs.module').then((m) => m.TabsPageModule) },
  {
    path: 'job/:id',
    loadChildren: () => import('./jobdetails/jobdetails.module').then((m) => m.JobDetailsPageModule),
  },
  { path: '', redirectTo: 'tabs/chat', pathMatch: 'full' },
  { path: '**', redirectTo: 'tabs/chat' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
