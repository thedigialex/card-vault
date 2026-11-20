import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { scanOutline, searchOutline } from 'ionicons/icons';

import { AddCardService } from '../data/add-card.service';
import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { CatalogCard, rarityClass } from '../data/models';
import { CatalogBrowserComponent, OwnedFilter } from '../library/catalog-browser.component';
import { ListMarksComponent } from '../lists/list-marks.component';

@Component({
  selector: 'app-cards',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent, IonSearchbar, IonSegment, IonSegmentButton, IonButton, IonButtons,
    IonIcon, RouterLink, CatalogBrowserComponent, ListMarksComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Cards</ion-title>
        <ion-buttons slot="end">
          <ion-button routerLink="/tabs/scan">
            <ion-icon slot="start" name="scan-outline" />
            Scan
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      @if (games().length) {
        <ion-toolbar>
          <ion-segment [value]="gameId()" (ionChange)="gameId.set($any($event.detail.value))">
            @for (game of games(); track game.id) {
              <ion-segment-button [value]="game.id">{{ game.short }}</ion-segment-button>
            }
          </ion-segment>
        </ion-toolbar>
        <ion-toolbar>
          <ion-searchbar
            placeholder="Card number or name"
            [debounce]="200"
            (ionInput)="query.set($event.detail.value ?? '')"
          />
        </ion-toolbar>
        @if (!query()) {
          <ion-toolbar>
            <ion-segment [value]="filter()" (ionChange)="filter.set($any($event.detail.value))">
              <ion-segment-button value="all">All</ion-segment-button>
              <ion-segment-button value="owned">Owned</ion-segment-button>
              <ion-segment-button value="missing">Missing</ion-segment-button>
            </ion-segment>
          </ion-toolbar>
        }
      }
    </ion-header>
    <ion-content>
      @if (!games().length) {
        <div class="empty-state">
          <ion-icon name="search-outline" />
          <p>No card lists yet. Download a game to browse and add cards.</p>
          <ion-button routerLink="/tabs/games">Go to Games</ion-button>
        </div>
      } @else if (query()) {
        @if (results().length) {
          <div class="card-grid">
            @for (card of results(); track card.id) {
              <button class="card-tile" [class]="rarity(card)" (click)="adder.add(card, true, results())">
                <img [src]="card.image" [alt]="card.name" loading="lazy" />
                @if (collection.countsByCard().get(card.id); as owned) {
                  <span class="tile-badge">{{ owned }}</span>
                }
                <app-list-marks [cardId]="card.id" />
                <span class="tile-caption">{{ card.number }}</span>
                <span class="tile-caption name">{{ card.name }}</span>
                @if (card.game !== gameId()) {
                  <span class="tile-flag">{{ shortName(card.game) }}</span>
                }
              </button>
            }
          </div>
        } @else {
          <p class="empty-state">No cards match “{{ query() }}”.</p>
        }
      } @else {
        <app-catalog-browser [gameId]="gameId()" [filter]="filter()" />
      }
    </ion-content>
  `,
})
export class CardsPage {
  private readonly catalog = inject(CatalogService);
  protected readonly collection = inject(CollectionService);
  protected readonly adder = inject(AddCardService);

  protected readonly games = this.catalog.installedGames;
  protected readonly gameId = signal('');
  protected readonly query = signal('');
  protected readonly filter = signal<OwnedFilter>('all');
  protected readonly results = signal<CatalogCard[]>([]);

  protected readonly rarity = rarityClass;

  protected shortName(gameId: string): string {
    return this.games().find(game => game.id === gameId)?.short ?? gameId;
  }

  constructor() {
    addIcons({ scanOutline, searchOutline });
    effect(() => {
      const games = this.games();
      if (!games.some(g => g.id === this.gameId())) this.gameId.set(games[0]?.id ?? '');
    });
    // A typed card number should find its card whichever game is showing, so search them all.
    effect(() => {
      const gameId = this.gameId();
      const ids = this.games().map(game => game.id);
      const query = this.query();
      const ordered = [gameId, ...ids.filter(id => id !== gameId)];
      void Promise.all(ordered.map(id => this.catalog.search(id, query))).then(found => {
        if (query === this.query()) this.results.set(found.flat());
      });
    });
  }
}
