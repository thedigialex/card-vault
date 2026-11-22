import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonSearchbar, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { searchOutline } from 'ionicons/icons';

import { AddCardService } from '../data/add-card.service';
import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { CatalogCard, rarityClass } from '../data/models';
import { CatalogBrowserComponent } from '../library/catalog-browser.component';
import { ListMarksComponent } from '../lists/list-marks.component';
import { CardSrcDirective } from '../shared/card-src.directive';

@Component({
  selector: 'app-cards',
  imports: [
    CardSrcDirective, IonHeader, IonToolbar, IonContent, IonSearchbar, IonButton, IonIcon, RouterLink,
    CatalogBrowserComponent, ListMarksComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar class="games-bar">
        @if (games().length) {
          <div class="game-chips" role="tablist">
            @for (game of games(); track game.id) {
              <button
                role="tab"
                class="game-chip"
                [class.on]="game.id === gameId()"
                [attr.aria-selected]="game.id === gameId()"
                (click)="pick(game.id)"
              >
                {{ game.short }}
              </button>
            }
          </div>
        } @else {
          <span class="page-title">Cards</span>
        }
      </ion-toolbar>
      @if (games().length) {
        <ion-toolbar class="search-bar">
          <ion-searchbar
            [placeholder]="'Search ' + currentName() + ' by name or number'"
            [debounce]="200"
            [value]="query()"
            (ionInput)="query.set($event.detail.value ?? '')"
          />
        </ion-toolbar>
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
          <p class="result-count">{{ results().length }}{{ results().length >= 60 ? '+' : '' }} cards</p>
          <div class="card-grid">
            @for (card of results(); track card.id) {
              <button class="card-tile" [class]="rarity(card)" (click)="adder.add(card, true, results())">
                <img [cardSrc]="card.image" [alt]="card.name" loading="lazy" />
                @if (collection.countsByCard().get(card.id); as owned) {
                  <span class="tile-badge">{{ owned }}</span>
                }
                <app-list-marks [cardId]="card.id" />
                <span class="tile-caption name">{{ card.name }}</span>
                <span class="tile-caption number">{{ card.number }}</span>
              </button>
            }
          </div>
        } @else {
          <p class="empty-state">No {{ currentName() }} cards match “{{ query() }}”.</p>
        }
      } @else {
        <app-catalog-browser [gameId]="gameId()" />
      }
    </ion-content>
  `,
  styles: `
    .games-bar {
      --min-height: 52px;
    }

    .page-title {
      padding: 0 16px;
      font-size: 20px;
      font-weight: 700;
    }

    /* Scrolls sideways, so any number of games fits without squeezing their names. */
    .game-chips {
      display: flex;
      gap: 8px;
      padding: 8px 16px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .game-chip {
      flex-shrink: 0;
      padding: 7px 14px;
      border: 1px solid var(--vault-panel-edge);
      border-radius: 999px;
      background: var(--vault-panel);
      color: var(--ion-color-medium);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      transition: background 0.15s ease, color 0.15s ease;

      &.on {
        border-color: transparent;
        background: var(--vault-accent);
        color: #fff;
        box-shadow: var(--vault-glow);
      }
    }

    .search-bar {
      --min-height: 0;
      padding-bottom: 4px;

      ion-searchbar {
        padding-top: 0;
        padding-bottom: 0;
      }
    }

    .result-count {
      margin: 10px 16px 8px;
      font-size: 12px;
      color: var(--ion-color-medium);
    }

    .tile-caption.name {
      margin-top: 4px;
    }
    .tile-caption.number {
      margin-top: 0;
      font-size: 10px;
    }
  `,
})
export class CardsPage {
  private readonly catalog = inject(CatalogService);
  protected readonly collection = inject(CollectionService);
  protected readonly adder = inject(AddCardService);

  protected readonly games = this.catalog.installedGames;
  protected readonly gameId = signal('');
  protected readonly query = signal('');
  protected readonly results = signal<CatalogCard[]>([]);

  protected readonly currentName = computed(() => this.games().find(game => game.id === this.gameId())?.short ?? '');

  protected readonly rarity = rarityClass;

  constructor() {
    addIcons({ searchOutline });
    effect(() => {
      const games = this.games();
      if (!games.some(g => g.id === this.gameId())) this.gameId.set(games[0]?.id ?? '');
    });
    effect(() => {
      const gameId = this.gameId();
      const query = this.query();
      void this.catalog.search(gameId, query).then(found => {
        if (query === this.query() && gameId === this.gameId()) this.results.set(found);
      });
    });
  }

  protected pick(gameId: string): void {
    this.gameId.set(gameId);
  }
}
