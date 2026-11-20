import { Component } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { albums, cube, gameController, scan } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="boxes">
          <ion-icon name="cube" />
          <ion-label>Boxes</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="cards">
          <ion-icon name="albums" />
          <ion-label>Cards</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="scan">
          <ion-icon name="scan" />
          <ion-label>Scan</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="games">
          <ion-icon name="game-controller" />
          <ion-label>Games</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {
  constructor() {
    addIcons({ cube, albums, scan, gameController });
  }
}
