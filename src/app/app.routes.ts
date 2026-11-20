import { Routes } from '@angular/router';

import { TabsPage } from './tabs/tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      { path: 'boxes', loadComponent: () => import('./boxes/boxes.page').then(m => m.BoxesPage) },
      { path: 'boxes/moves', loadComponent: () => import('./boxes/moves.page').then(m => m.MovesPage) },
      { path: 'boxes/unboxed', loadComponent: () => import('./boxes/unboxed.page').then(m => m.UnboxedPage) },
      { path: 'boxes/lists/:id', loadComponent: () => import('./lists/list.page').then(m => m.ListPage) },
      { path: 'boxes/:id', loadComponent: () => import('./boxes/box.page').then(m => m.BoxPage) },
      { path: 'cards', loadComponent: () => import('./cards/cards.page').then(m => m.CardsPage) },
      { path: 'scan', loadComponent: () => import('./scan/scan.page').then(m => m.ScanPage) },
      { path: 'games', loadComponent: () => import('./games/games.page').then(m => m.GamesPage) },
      { path: '', redirectTo: 'boxes', pathMatch: 'full' },
    ],
  },
  { path: 'scan', redirectTo: 'tabs/scan' },
  { path: 'tabs/lists', redirectTo: 'tabs/boxes' },
  { path: '', redirectTo: 'tabs/boxes', pathMatch: 'full' },
];
