import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, trashOutline } from 'ionicons/icons';

import { boxColor } from '../boxes/box-models';
import { AddCardService } from '../data/add-card.service';
import { MoneyPipe } from '../prices/money.pipe';
import { registerListIcons } from './list-models';
import { ListCard, ListService } from './list.service';

@Component({
  selector: 'app-list',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonIcon, IonContent, RouterLink,
    MoneyPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/boxes" />
        </ion-buttons>
        <ion-title>{{ list()?.name }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="rename()" aria-label="Rename list">
            <ion-icon slot="icon-only" name="create-outline" />
          </ion-button>
          <ion-button (click)="remove()" aria-label="Delete list">
            <ion-icon slot="icon-only" name="trash-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (list(); as list) {
        <div class="hud">
          <div class="hud-stat accent">
            <span>Cards</span>
            <strong>{{ cards().length }}</strong>
          </div>
          <div class="hud-stat gold">
            <span>Value</span>
            <strong>{{ value() > 0 ? (value() | money) : '—' }}</strong>
          </div>
          <div class="hud-stat">
            <span>Unboxed</span>
            <strong>{{ loose() }}</strong>
          </div>
        </div>

        @if (cards().length) {
          @for (row of cards(); track row.entry.id) {
            <button class="row" (click)="open(row)">
              <img class="card-thumb" [src]="row.card.card.image" [alt]="row.card.card.name" loading="lazy" />
              <span class="meta">
                <strong>{{ row.card.card.name }}</strong>
                <span>{{ row.card.card.number }} · {{ row.card.card.rarity }}</span>
                <span class="where">{{ row.where }}</span>
              </span>
              <ion-icon name="trash-outline" (click)="drop($event, row)" />
            </button>
          }
        } @else {
          <div class="empty-state">
            <ion-icon [name]="list.icon" [style.color]="tint()" />
            <p>Nothing on this list yet. Open a card, tap “Lists”, and pick {{ list.name }}.</p>
            <ion-button routerLink="/tabs/cards">Find cards</ion-button>
          </div>
        }
      }
    </ion-content>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 16px;
      border: none;
      border-bottom: 1px solid var(--vault-panel-edge);
      background: none;
      color: inherit;
      text-align: left;

      .meta {
        flex: 1;
        min-width: 0;
      }
      strong {
        display: block;
        font-size: 15px;
      }
      span {
        display: block;
        font-size: 12px;
        color: var(--ion-color-medium);
      }
      .where {
        color: var(--ion-color-success);
      }
      ion-icon {
        font-size: 19px;
        color: var(--ion-color-medium);
        padding: 8px;
      }
    }
  `,
})
export class ListPage {
  private readonly lists = inject(ListService);
  private readonly cardSheets = inject(AddCardService);
  private readonly alerts = inject(AlertController);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly list = computed(() => this.lists.listById(Number(this.id())));
  protected readonly cards = computed(() => this.lists.cardsIn(Number(this.id())));
  protected readonly tint = computed(() => boxColor(this.list()?.color ?? '').front);
  protected readonly value = computed(() => this.lists.valueOf(Number(this.id())));
  protected readonly loose = computed(() => this.cards().filter(row => !row.location).length);

  constructor() {
    addIcons({ createOutline, trashOutline });
    registerListIcons();
  }

  protected async open(row: ListCard): Promise<void> {
    await this.cardSheets.openDetail(row.card, this.cards().map(entry => entry.card.card));
  }

  protected async drop(event: Event, row: ListCard): Promise<void> {
    event.stopPropagation();
    await this.lists.removeEntry(row.entry.id!);
  }

  protected async rename(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const alert = await this.alerts.create({
      header: 'Rename list',
      inputs: [{ name: 'name', type: 'text', value: list.name }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Save', role: 'confirm' },
      ],
    });
    await alert.present();
    const { data, role } = await alert.onDidDismiss<{ values: { name: string } }>();
    const name = data?.values.name?.trim();
    if (role === 'confirm' && name) await this.lists.rename(list.id!, { name });
  }

  protected async remove(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const alert = await this.alerts.create({
      header: `Delete ${list.name}?`,
      message: 'The cards stay in your library; only the list goes.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
    await this.lists.remove(list.id!);
    await this.router.navigateByUrl('/tabs/boxes');
  }
}
