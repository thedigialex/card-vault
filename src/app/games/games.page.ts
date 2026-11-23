import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  AlertController,
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

import { BackupError, VaultBackup } from '../backup/backup';
import { BackupService } from '../backup/backup.service';
import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { ImageStore, ImageUsage } from '../shared/image-store.service';
import { NotifyService } from '../shared/notify.service';
import { PriceService } from '../prices/price.service';
import { GAMES, gameById } from './games';
import { SetPick, SetPickerComponent } from './set-picker.component';

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
              @if (row.installed || !row.game.listSets) {
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

      <ion-list inset>
        <ion-item>
          <ion-label>
            <h3>Back up my vault</h3>
            <p>Your cards, boxes and lists in one file, saved to Downloads. Share sends it to Drive, email or another app.</p>
          </ion-label>
          <div class="actions" slot="end">
            <ion-button fill="outline" [disabled]="busy() !== null || restoring()" (click)="exportVault()">Export</ion-button>
            <ion-button size="small" fill="clear" [disabled]="busy() !== null || restoring()" (click)="shareVault()">Share</ion-button>
          </div>
        </ion-item>
        <ion-item>
          <ion-label>
            <h3>Restore a backup</h3>
            @if (restoring()) {
              <p class="step">{{ step() }}</p>
              <ion-progress-bar type="indeterminate" />
            } @else {
              <p>Replaces the cards, boxes and lists on this phone. Missing card lists download first.</p>
            }
          </ion-label>
          <ion-button slot="end" fill="outline" [disabled]="busy() !== null || restoring()" (click)="picker.click()">
            @if (restoring()) {
              <ion-spinner name="dots" />
            } @else {
              Import
            }
          </ion-button>
          <input #picker type="file" hidden (change)="importVault(picker)" />
        </ion-item>
      </ion-list>

      @if (imageUsage(); as usage) {
        <ion-list inset>
          <ion-item>
            <ion-label>
              <h3>Saved card images</h3>
              <p>{{ usage.files | number }} images · {{ usage.bytes / 1048576 | number: '1.0-1' }} MB</p>
              <ion-note>Card pictures are kept on the phone after they first show, so they open instantly and offline.</ion-note>
            </ion-label>
            <ion-button slot="end" fill="clear" color="danger" [disabled]="!usage.files" (click)="clearImages()">Clear</ion-button>
          </ion-item>
        </ion-list>
      }

      <p class="ion-padding-horizontal hint">
        Card data is downloaded once and kept on this device; your collection never leaves the phone.
        Prices are TCGplayer market snapshots from worththerip.com. Magic's come from Scryfall; Yu-Gi-Oh! sets
        Worth the Rip doesn't cover use YGOPRODeck's prices.
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
  private readonly images = inject(ImageStore);
  private readonly backup = inject(BackupService);
  private readonly alerts = inject(AlertController);
  protected readonly restoring = signal(false);

  protected readonly withPrices = signal(true);
  protected readonly imageUsage = signal<ImageUsage | null>(null);
  protected readonly step = signal('');
  protected readonly busy = computed(() => this.catalog.installing() ?? this.prices.updating());
  protected readonly progress = computed(() =>
    this.prices.updating() ? this.prices.progress() : this.catalog.progress(),
  );

  protected readonly rows = computed(() =>
    GAMES.map(game => ({ game, installed: this.catalog.installed().find(i => i.id === game.id) })),
  );

  ionViewWillEnter(): void {
    if (Capacitor.isNativePlatform()) void this.images.usage().then(usage => this.imageUsage.set(usage));
  }

  protected async exportVault(): Promise<void> {
    try {
      const path = await this.backup.save();
      await this.notify.show(`Backup saved to ${path}`, 3500);
    } catch (error) {
      console.error('Export failed', error);
      await this.notify.show("Couldn't save the backup file.", 2500);
    }
  }

  protected async shareVault(): Promise<void> {
    try {
      await this.backup.share();
    } catch (error) {
      console.error('Share failed', error);
      await this.notify.show("Couldn't share the backup file.", 2500);
    }
  }

  protected async importVault(picker: HTMLInputElement): Promise<void> {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;

    let backup: VaultBackup;
    try {
      backup = await this.backup.read(file);
    } catch (error) {
      await this.notify.show(error instanceof BackupError ? error.message : "Couldn't read that file.", 3000);
      return;
    }

    const made = backup.exportedAt ? new Date(backup.exportedAt).toLocaleDateString() : 'an unknown date';
    const counts = [
      `${backup.cards.length.toLocaleString()} cards`,
      `${backup.boxes.length} boxes`,
      `${backup.lists.length} lists`,
    ].join(', ');
    const here = this.collection.entries().length;
    const alert = await this.alerts.create({
      header: 'Restore this backup?',
      message: `Made ${made}: ${counts}.${here ? ` The ${here.toLocaleString()} cards on this phone, and its boxes and lists, will be replaced.` : ''}`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Restore', role: 'confirm' },
      ],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm') return;

    this.restoring.set(true);
    try {
      const result = await this.backup.restore(backup, text => this.step.set(text));
      const notes = [`Restored ${result.cards.toLocaleString()} cards.`];
      if (result.unmatched) notes.push(`${result.unmatched} aren't in the downloaded card lists yet.`);
      if (result.failedGames.length) notes.push(`Couldn't download ${result.failedGames.join(', ')}; try Update.`);
      await this.notify.show(notes.join(' '), 4000);
    } catch (error) {
      console.error('Restore failed', error);
      await this.notify.show('Restore failed. Check your connection and try again.', 3000);
    } finally {
      this.restoring.set(false);
      this.step.set('');
    }
  }

  protected async clearImages(): Promise<void> {
    await this.images.clear();
    this.imageUsage.set(await this.images.usage());
    await this.notify.show('Saved images cleared. They download again as cards show.', 2500);
  }

  /** Games downloaded set by set ask which sets first; sets with owned cards can't be dropped. */
  protected async pickSets(gameId: string): Promise<void> {
    const installed = this.catalog.installed().find(game => game.id === gameId);
    const locked = new Set(
      this.collection
        .entries()
        .filter(entry => entry.card.game === gameId)
        .map(entry => entry.card.setCode),
    );
    const wholeGame = !gameById(gameId)?.listSets;
    const modal = await this.modals.create({
      component: SetPickerComponent,
      componentProps: {
        gameId,
        selected: installed?.sets ?? [],
        locked: [...locked],
        allPicked: wholeGame && !!installed && !installed.sets,
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<SetPick>();
    if (role === 'save' && data) await this.update(gameId, wholeGame && data.all ? 'all' : data.sets);
  }

  protected async update(gameId: string, sets?: string[] | 'all'): Promise<void> {
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
        // A game with a second price step reports one combined count after it.
        if (!game?.priceGame) parts.push(`${result.priced.toLocaleString()} priced`);
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
