import { CardSrcDirective } from '../shared/card-src.directive';
import { Component, computed, inject } from '@angular/core';
import {
  ActionSheetController,
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { layersOutline } from 'ionicons/icons';

import { AddCardService } from '../data/add-card.service';
import { LibraryEntry } from '../data/collection.service';
import { rarityClass } from '../data/models';
import { ListMarksComponent } from '../lists/list-marks.component';
import { NotifyService } from '../shared/notify.service';
import { BoxService } from './box.service';

@Component({
  selector: 'app-unboxed',
  imports: [CardSrcDirective, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonIcon, ListMarksComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/boxes" />
        </ion-buttons>
        <ion-title>Unboxed pile</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (entries().length) {
        <div class="section-head">
          <h2>{{ entries().length }} {{ entries().length === 1 ? 'card' : 'cards' }}</h2>
          <span>{{ canFile() ? 'Tap one to file it' : 'Tap one to view it' }}</span>
        </div>
        <div class="card-grid">
          @for (slot of entries(); track slot.entry.owned.id) {
            <button class="card-tile" [class]="slot.rarity" (click)="file(slot.entry)">
              <img [cardSrc]="slot.entry.card.image" [alt]="slot.entry.card.name" loading="lazy" />
              <app-list-marks [ownedId]="slot.entry.owned.id" />
              <span class="tile-caption">{{ slot.entry.card.number }}</span>
            </button>
          }
        </div>
      } @else {
        <div class="empty-state">
          <ion-icon name="layers-outline" />
          <p>Nothing loose. Scanned cards land here when they aren't filed into a box.</p>
        </div>
      }
    </ion-content>
  `,
})
export class UnboxedPage {
  private readonly boxes = inject(BoxService);
  private readonly sheets = inject(ActionSheetController);
  private readonly cards = inject(AddCardService);
  private readonly notify = inject(NotifyService);

  protected readonly entries = computed(() =>
    this.boxes.unboxed().map(entry => ({ entry, rarity: rarityClass(entry.card) })),
  );
  protected readonly canFile = computed(() => this.boxes.boxes().some(box => !box.autoSort));

  constructor() {
    addIcons({ layersOutline });
  }

  protected async file(entry: LibraryEntry): Promise<void> {
    const hand = this.boxes.boxes().filter(box => !box.autoSort);
    const view = () => this.cards.openDetail(entry, this.entries().map(row => row.entry.card));
    if (!hand.length) return view();

    const sheet = await this.sheets.create({
      header: `${entry.card.name} · ${entry.card.number}`,
      buttons: [
        { text: 'View card', data: { action: 'view' } },
        ...hand.map(box => ({ text: `File into ${box.name}`, data: { action: 'file', boxId: box.id } })),
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<{ action: string; boxId?: number }>();

    if (data?.action === 'view') return view();
    if (data?.action !== 'file' || !data.boxId) return;

    const filed = await this.boxes.fileInto(entry.owned.id!, data.boxId);
    await this.notify.show(filed ? `Filed into ${this.boxes.boxById(data.boxId)?.name}` : 'That box is full.');
  }
}
