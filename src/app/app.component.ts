import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { ImageStore } from './shared/image-store.service';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app><ion-router-outlet /></ion-app>`,
})
export class AppComponent {
  // Starts reading the saved-image index now, before the first card grid asks for it.
  private readonly images = inject(ImageStore);
}
