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
import { stacksOf } from '../data/stacks';
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
          <h2>{{ total() }} {{ total() === 1 ? 'card' : 'cards' }}</h2>
          <span>{{ canFile() ? 'Tap one to file it' : 'Tap one to view it' }}</span>
        </div>
        <div class="card-grid">
          @for (slot of entries(); track slot.entry.owned.id) {
            <button class="card-tile" [class]="slot.rarity" (click)="file(slot.entry, slot.copies)">
              <img [cardSrc]="slot.entry.card.image" [alt]="slot.entry.card.name" loading="lazy" />
              @if (slot.copies.length > 1) {
                <span class="tile-badge">{{ slot.copies.length }}</span>
              }
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

  protected readonly total = computed(() => this.boxes.unboxed().length);
  protected readonly entries = computed(() =>
    stacksOf(this.boxes.unboxed(), entry => entry, false).map(stack => ({
      entry: stack.items[0],
      copies: stack.items.map(entry => entry.owned.id!),
      rarity: rarityClass(stack.items[0].card),
    })),
  );
  protected readonly canFile = computed(() => this.boxes.boxes().some(box => !box.autoSort));

  constructor() {
    addIcons({ layersOutline });
  }

  protected async file(entry: LibraryEntry, copies: number[]): Promise<void> {
    const hand = this.boxes.boxes().filter(box => !box.autoSort);
    const view = () => this.cards.openDetail(entry, this.entries().map(row => row.entry.card));
    if (!hand.length) return view();

    const many = copies.length > 1;
    const sheet = await this.sheets.create({
      header: `${entry.card.name} · ${entry.card.number}${many ? ` · ×${copies.length}` : ''}`,
      buttons: [
        { text: 'View card', data: { action: 'view' } },
        ...hand.flatMap(box => [
          { text: `File ${many ? 'one ' : ''}into ${box.name}`, data: { action: 'file', boxId: box.id, all: false } },
          ...(many ? [{ text: `File all ${copies.length} into ${box.name}`, data: { action: 'file', boxId: box.id, all: true } }] : []),
        ]),
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<{ action: string; boxId?: number; all?: boolean }>();

    if (data?.action === 'view') return view();
    if (data?.action !== 'file' || !data.boxId) return;

    const wanted = data.all ? copies : copies.slice(0, 1);
    const filed = await this.boxes.fileInto(wanted, data.boxId);
    const name = this.boxes.boxById(data.boxId)?.name;
    await this.notify.show(
      !filed ? 'That box is full.' : filed < wanted.length ? `Only ${filed} fit into ${name}.` : `Filed ${filed > 1 ? `${filed} ` : ''}into ${name}`,
    );
  }
}
