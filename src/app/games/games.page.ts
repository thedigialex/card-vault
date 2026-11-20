import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';

import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { NotifyService } from '../shared/notify.service';
import { PriceService } from '../prices/price.service';
import { GAMES, gameById } from './games';
import { SetPickerComponent } from './set-picker.component';

@Component({
  selector: 'app-games',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton, IonSpinner,
    IonProgressBar, IonCheckbox, DatePipe, DecimalPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Games</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list inset>
        <ion-item>
          <ion-checkbox [checked]="withPrices()" (ionChange)="withPrices.set($event.detail.checked)">
            <ion-label>
              <h3>Include prices</h3>
              <p>Fetches TCGplayer market prices with the card list, where a game has them.</p>
            </ion-label>
          </ion-checkbox>
        </ion-item>
      </ion-list>

      <ion-list inset>
        @for (row of rows(); track row.game.id) {
          <ion-item>
            <ion-label>
              <h2>{{ row.game.name }}</h2>
              @if (row.installed; as installed) {
                <p>
                  @if (installed.sets?.length) {
                    {{ installed.sets!.length }} sets ·
                  }
                  {{ installed.cardCount | number }} cards · updated {{ installed.installedAt | date: 'mediumDate' }}</p>
                @if (installed.pricesUpdatedAt) {
                  <p>{{ installed.pricedCards | number }} priced · {{ installed.pricesUpdatedAt | date: 'mediumDate' }}</p>
                } @else if (row.game.priceGame || row.game.pricesWithCatalog) {
                  <p>No prices yet</p>
                } @else {
                  <p>No price source for this game yet</p>
                }
              } @else {
                <p>Not downloaded</p>
              }
              <ion-note>{{ row.game.sources }}</ion-note>
              @if (busy() === row.game.id) {
                <ion-progress-bar [value]="progress()" [type]="progress() === undefined ? 'indeterminate' : 'determinate'" />
                <p class="step">{{ step() }}</p>
              }
            </ion-label>
            <div class="actions" slot="end">
              @if (row.game.listSets && row.installed?.sets?.length) {
                <ion-button size="small" fill="clear" [disabled]="busy() !== null" (click)="pickSets(row.game.id)">Sets</ion-button>
              }
              <ion-button fill="outline" [disabled]="busy() !== null" (click)="update(row.game.id)">
                @if (busy() === row.game.id) {
                  <ion-spinner name="dots" />
                } @else {
                  {{ row.installed ? 'Update' : row.game.listSets ? 'Choose sets' : 'Download' }}
                }
              </ion-button>
            </div>
          </ion-item>
        }
      </ion-list>

      <p class="ion-padding-horizontal hint">
        Card data is downloaded once and kept on this device; your collection never leaves the phone.
        Prices are TCGplayer market snapshots from worththerip.com (Magic's come from Scryfall).
      </p>
    </ion-content>
  `,
  styles: `
    .hint {
      color: var(--ion-color-medium);
      font-size: 13px;
    }
    .step {
      font-size: 12px;
    }
    ion-progress-bar {
      margin-top: 6px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
  `,
})
export class GamesPage {
  protected readonly catalog = inject(CatalogService);
  protected readonly prices = inject(PriceService);
  private readonly notify = inject(NotifyService);
  private readonly modals = inject(ModalController);
  private readonly collection = inject(CollectionService);

  protected readonly withPrices = signal(true);
  protected readonly step = signal('');
  protected readonly busy = computed(() => this.catalog.installing() ?? this.prices.updating());
  protected readonly progress = computed(() =>
    this.prices.updating() ? this.prices.progress() : this.catalog.progress(),
  );

  protected readonly rows = computed(() =>
    GAMES.map(game => ({ game, installed: this.catalog.installed().find(i => i.id === game.id) })),
  );

  /** Games downloaded set by set ask which sets first; sets with owned cards can't be dropped. */
  protected async pickSets(gameId: string): Promise<void> {
    const installed = this.catalog.installed().find(game => game.id === gameId);
    const locked = new Set(
      this.collection
        .entries()
        .filter(entry => entry.card.game === gameId)
        .map(entry => entry.card.setCode.toLowerCase()),
    );
    const modal = await this.modals.create({
      component: SetPickerComponent,
      componentProps: { gameId, selected: installed?.sets ?? [], locked: [...locked] },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<string[]>();
    if (role === 'save' && data) await this.update(gameId, data);
  }

  protected async update(gameId: string, sets?: string[]): Promise<void> {
    const game = gameById(gameId);
    const installed = this.catalog.installed().find(row => row.id === gameId);
    if (game?.listSets && !sets && !installed?.sets?.length) return this.pickSets(gameId);

    const parts: string[] = [];
    let failed = false;
    try {
      this.step.set(sets || installed?.sets ? 'Downloading sets…' : 'Downloading cards…');
      const result = await this.catalog.install(gameId, { sets, withPrices: this.withPrices() });
      parts.push(`${result.cards.toLocaleString()} cards`);
      if (result.priced !== undefined) {
        parts.push(`${result.priced.toLocaleString()} priced`);
        await this.prices.reload();
      }
    } catch (error) {
      console.error(`Installing ${gameId} failed`, error);
      failed = true;
    }

    const priced = game?.priceGame;
    if (!failed && this.withPrices() && priced) {
      try {
        this.step.set('Fetching prices…');
        const count = await this.prices.update(gameId);
        parts.push(`${count.toLocaleString()} priced`);
      } catch {
        parts.push('prices failed');
      }
    }
    this.step.set('');

    await this.notify.show(
      failed ? 'Download failed. Check your connection and try again.' : `Updated: ${parts.join(' · ')}.`,
      2500,
    );
  }
}
