import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { IonSegment, IonSegmentButton } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, cubeOutline, layersOutline, swapHorizontal } from 'ionicons/icons';

import { CollectionService } from '../data/collection.service';
import { gameById } from '../games/games';
import { MoneyPipe } from '../prices/money.pipe';
import { PriceService } from '../prices/price.service';
import { LIST_PRESETS, registerListIcons } from '../lists/list-models';
import { ListService } from '../lists/list.service';
import { Box3dComponent } from './box-3d.component';
import { boxColor } from './box-models';
import { BoxFormComponent } from './box-form.component';
import { BoxDraft, BoxService } from './box.service';

@Component({
  selector: 'app-boxes',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonSegment, IonSegmentButton,
    RouterLink, Box3dComponent, DecimalPipe, MoneyPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Vault</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="view() === 'boxes' ? create() : createList()" [attr.aria-label]="view() === 'boxes' ? 'New box' : 'New list'">
            <ion-icon slot="icon-only" name="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="view()" (ionChange)="view.set($any($event.detail.value))">
          <ion-segment-button value="boxes">Boxes</ion-segment-button>
          <ion-segment-button value="lists">Lists</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="hud">
        <div class="hud-stat accent">
          <span>Cards</span>
          <strong>{{ collection.entries().length | number }}</strong>
        </div>
        <div class="hud-stat gold">
          <span>Value</span>
          <strong>{{ prices.collectionValue() > 0 ? (prices.collectionValue() | money) : '—' }}</strong>
        </div>
        <div class="hud-stat">
          <span>Boxes</span>
          <strong>{{ boxes.boxes().length }}</strong>
        </div>
      </div>

      @if (view() === 'boxes') {
      @if (boxes.moves().length) {
        <a class="banner" routerLink="/tabs/boxes/moves">
          <ion-icon name="swap-horizontal" />
          <div>
            <strong>{{ boxes.moves().length }} {{ boxes.moves().length === 1 ? 'card needs' : 'cards need' }} placing</strong>
            <p>Tap for step-by-step moves</p>
          </div>
        </a>
      }

      @if (boxes.unboxed().length) {
        <a class="banner pile" routerLink="/tabs/boxes/unboxed">
          <ion-icon name="layers-outline" />
          <div>
            <strong>{{ boxes.unboxed().length | number }} in the unboxed pile</strong>
            <p>Scanned cards land here until you file them</p>
          </div>
        </a>
      }

      @if (summary().length) {
        <div class="box-grid">
          @for (row of summary(); track row.box.id) {
            <a class="box-cell" [routerLink]="['/tabs/boxes', row.box.id]">
              <app-box-3d
                [shape]="row.shape"
                [colorId]="row.box.color"
                [fill]="row.used / row.capacity"
                [rowFills]="row.fills"
                [label]="row.box.name"
                [scale]="0.62"
              />
              <h2>{{ row.box.name }}</h2>
              <p class="model">{{ row.model }}</p>
              <div class="fill-bar"><span [style.width.%]="(row.used / row.capacity) * 100"></span></div>
              <p class="count">
                {{ row.used | number }} / {{ row.capacity | number }}
                @if (row.value > 0) {
                  · {{ row.value | money }}
                }
              </p>
              <div class="tags">
                @if (!row.box.autoSort) {
                  <span class="pill">Hand-sorted</span>
                }
                @if (row.game) {
                  <span class="pill">{{ row.game }}</span>
                }
              </div>
            </a>
          }
        </div>
      } @else {
        <div class="empty-state">
          <ion-icon name="cube-outline" />
          <p>Add a box that matches your real one, and the app will tell you where every card goes.</p>
          <ion-button (click)="create()">Add a box</ion-button>
        </div>
      }
      } @else {
      @if (listRows().length) {
        <div class="box-grid">
          @for (row of listRows(); track row.list.id) {
            <a class="list-cell" [routerLink]="['/tabs/boxes/lists', row.list.id]" [style.--tint]="row.tint">
              <span class="badge"><ion-icon [name]="row.list.icon" /></span>
              <h2>{{ row.list.name }}</h2>
              <p>
                {{ row.count }} {{ row.count === 1 ? 'card' : 'cards' }}
                @if (row.value > 0) {
                  · {{ row.value | money }}
                }
              </p>
            </a>
          }
        </div>
      } @else {
        <div class="empty-state">
          <ion-icon name="layers-outline" />
          <p>Make a list for a deck, your favourites, or the cards you want to watch.</p>
          <ion-button (click)="createList()">New list</ion-button>
        </div>
      }
      <p class="hint">A list holds copies you own, and shows which box each one sits in.</p>
      }
    </ion-content>
  `,
  styles: `
    .banner {
      display: flex;
      align-items: center;
      gap: 14px;
      margin: 12px 16px 0;
      padding: 13px 16px;
      border-radius: var(--vault-radius);
      background: var(--vault-accent);
      color: #fff;
      text-decoration: none;
      box-shadow: var(--vault-glow);

      ion-icon {
        font-size: 24px;
        flex-shrink: 0;
      }
      p {
        margin: 2px 0 0;
        font-size: 12px;
        opacity: 0.88;
      }
    }
    .banner.pile {
      background: var(--vault-panel);
      border: 1px solid var(--vault-panel-edge);
      box-shadow: none;
      color: inherit;
    }
    .box-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 14px;
      padding: 16px;
    }
    .list-cell {
      display: block;
      padding: 16px 14px;
      border-radius: var(--vault-radius);
      background: linear-gradient(150deg, color-mix(in srgb, var(--tint) 34%, transparent), var(--vault-panel));
      border: 1px solid var(--vault-panel-edge);
      color: inherit;
      text-decoration: none;

      h2 {
        margin: 10px 0 0;
        font-size: 16px;
        font-weight: 700;
      }
      p {
        margin: 3px 0 0;
        font-size: 12px;
        color: var(--ion-color-medium);
      }
    }
    .badge {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--tint);
      box-shadow: 0 4px 14px rgb(0 0 0 / 0.4);
      ion-icon {
        font-size: 21px;
        color: #fff;
      }
    }
    .hint {
      margin: 4px 20px 24px;
      font-size: 13px;
      color: var(--ion-color-medium);
    }
    .box-cell {
      display: block;
      padding: 14px 14px 12px;
      border-radius: var(--vault-radius);
      background: var(--vault-panel);
      border: 1px solid var(--vault-panel-edge);
      color: inherit;
      text-decoration: none;

      h2 {
        margin: 10px 0 0;
        font-size: 15px;
        font-weight: 700;
      }
      p {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--ion-color-medium);
      }
      .fill-bar {
        margin-top: 8px;
      }
      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }
    }
  `,
})
export class BoxesPage {
  protected readonly boxes = inject(BoxService);
  protected readonly collection = inject(CollectionService);
  protected readonly prices = inject(PriceService);
  private readonly modals = inject(ModalController);
  private readonly alerts = inject(AlertController);
  protected readonly lists = inject(ListService);

  protected readonly summary = computed(() =>
    this.boxes.boxes().map(box => ({
      box,
      game: box.game ? (gameById(box.game)?.name ?? box.game) : '',
      ...this.boxes.statsOf(box.id!),
    })),
  );

  protected readonly view = signal<'boxes' | 'lists'>('boxes');

  protected readonly listRows = computed(() => {
    const counts = this.lists.countsByList();
    return this.lists.lists().map(list => ({
      list,
      tint: boxColor(list.color).front,
      count: counts.get(list.id!) ?? 0,
      value: this.lists.valueOf(list.id!),
    }));
  });

  constructor() {
    addIcons({ add, cubeOutline, layersOutline, swapHorizontal });
    registerListIcons();
  }

  protected async createList(): Promise<void> {
    const taken = new Set(this.lists.lists().map(list => list.name.toLowerCase()));
    const preset = LIST_PRESETS.find(option => !taken.has(option.name.toLowerCase())) ?? LIST_PRESETS[0];
    const alert = await this.alerts.create({
      header: 'New list',
      inputs: [{ name: 'name', type: 'text', placeholder: 'Deck, Favourites, Rare cards…', value: preset.name }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Create', role: 'confirm' },
      ],
    });
    await alert.present();
    const { data, role } = await alert.onDidDismiss<{ values: { name: string } }>();
    const name = data?.values.name?.trim();
    if (role !== 'confirm' || !name) return;
    const match = LIST_PRESETS.find(option => option.name.toLowerCase() === name.toLowerCase());
    await this.lists.create(name, match?.icon ?? 'layers', match?.color ?? 'blue');
  }

  protected async create(): Promise<void> {
    const modal = await this.modals.create({
      component: BoxFormComponent,
      componentProps: { suggestedName: `Box ${this.boxes.boxes().length + 1}` },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<BoxDraft>();
    if (role === 'save' && data) await this.boxes.add(data);
  }
}
