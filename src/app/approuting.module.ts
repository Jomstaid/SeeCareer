import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'job/:id',
    loadChildren: () => import('./jobdetails/jobdetails.module').then((m) => m.JobDetailsPageModule),
  },
  { path: '', loadChildren: () => import('./tabs/tabs.module').then((m) => m.TabsPageModule) },
  { path: '**', redirectTo: 'home' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
