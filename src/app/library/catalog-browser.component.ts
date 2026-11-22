import { CardSrcDirective } from '../shared/card-src.directive';
import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDown, trophy } from 'ionicons/icons';

import { AddCardService } from '../data/add-card.service';
import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { CatalogCard, rarityClass } from '../data/models';
import { groupBySet } from '../data/sets';
import { ListMarksComponent } from '../lists/list-marks.component';
import { MoneyPipe } from '../prices/money.pipe';
import { PriceService } from '../prices/price.service';

export type OwnedFilter = 'all' | 'owned' | 'missing';

const COVER_SIZE = 3;

interface CatalogSet {
  setCode: string;
  title: string;
  icon?: string;
  cards: CatalogCard[];
  /** Just the cards this filter shows, so the template never filters while rendering. */
  visible: CatalogCard[];
  owned: number;
  percent: number;
  value: number;
  /** The set's best owned cards, or its first cards when none are owned yet. */
  cover: CatalogCard[];
}

/** "BT1 · Release Special Booster" reads as a title once the code (shown on its own) is dropped. */
function titleOf(setCode: string, setName: string): string {
  const prefix = `${setCode} · `;
  return setName.startsWith(prefix) ? setName.slice(prefix.length) : setName;
}

@Component({
  selector: 'app-catalog-browser',
  imports: [CardSrcDirective, IonIcon, ListMarksComponent, DecimalPipe, MoneyPipe],
  template: `
    @if (cards().length) {
      <div class="summary">
        <span><b class="accent">{{ totals().owned | number }}</b>/{{ totals().cards | number }} cards</span>
        <span><b class="gold">{{ totals().complete }}</b>/{{ totals().sets }} sets done</span>
        @if (totals().value) {
          <span class="value">{{ totals().value | money }}</span>
        }
      </div>
      <div class="controls">
        <div class="filters" role="radiogroup" aria-label="Show">
          @for (option of filters; track option.value) {
            <button
              role="radio"
              [class.on]="filter() === option.value"
              [attr.aria-checked]="filter() === option.value"
              (click)="filter.set(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>
        @if (expanded().size) {
          <button class="collapse-all" (click)="collapseAll()">Collapse all</button>
        }
      </div>
    }

    @for (set of visibleSets(); track set.setCode) {
      @let open = expanded().has(set.setCode);
      @let complete = set.owned === set.cards.length;
      <button
        class="set-row"
        [class.open]="open"
        [class.complete]="complete"
        [attr.aria-expanded]="open"
        (click)="toggle(set.setCode)"
      >
        <span class="cover" [class.unowned]="!set.owned">
          @for (card of set.cover; track card.id; let i = $index) {
            <img [cardSrc]="card.image" alt="" loading="lazy" [style.--i]="i - (set.cover.length - 1) / 2" />
          }
        </span>
        <span class="info">
          <span class="title">
            @if (set.icon) {
              <img class="symbol" [src]="set.icon" alt="" loading="lazy" />
            }
            <span class="name">{{ set.title }}</span>
          </span>
          <span class="meta">
            <span class="code">{{ set.setCode }}</span>
            @if (complete) {
              <span class="done"><ion-icon name="trophy" /> Complete</span>
            } @else {
              <span>{{ set.owned }}/{{ set.cards.length }}</span>
            }
            @if (set.value) {
              <b>{{ set.value | money }}</b>
            }
          </span>
          <span class="fill-bar"><span [style.width.%]="set.percent"></span></span>
        </span>
        <ion-icon class="chevron" name="chevron-down" />
      </button>

      @if (open) {
        <div class="card-grid">
          @for (card of set.visible; track card.id) {
            @let count = counts().get(card.id) ?? 0;
            <button class="card-tile" [class]="rarity(card)" [class.missing]="!count" (click)="adder.add(card, true, set.visible)">
              <img [cardSrc]="card.image" [alt]="card.name" loading="lazy" />
              @if (count > 1) {
                <span class="tile-badge">{{ count }}</span>
              }
              <app-list-marks [cardId]="card.id" />
              <span class="tile-caption">{{ card.number }}</span>
            </button>
          }
        </div>
      }
    } @empty {
      @if (cards().length) {
        <p class="empty-state">{{ filter() === 'owned' ? 'No cards collected yet.' : 'Nothing missing. Every set is complete!' }}</p>
      }
    }
  `,
  styles: `
    .summary {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 14px;
      padding: 12px 16px 0;
      font-size: 13px;
      color: var(--ion-color-medium);

      b {
        font-size: 16px;
        font-weight: 800;
      }
      .accent {
        color: #8ea4ff;
      }
      .gold {
        color: #f7b733;
      }
      .value {
        margin-left: auto;
        font-weight: 700;
        color: var(--ion-text-color);
      }
    }

    .controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px 2px;
    }

    .filters {
      display: inline-flex;
      padding: 3px;
      border-radius: 999px;
      background: var(--vault-panel);
      border: 1px solid var(--vault-panel-edge);

      button {
        padding: 5px 12px;
        border: none;
        border-radius: 999px;
        background: none;
        color: var(--ion-color-medium);
        font: inherit;
        font-size: 13px;
        font-weight: 600;
      }
      button.on {
        background: rgb(255 255 255 / 0.12);
        color: var(--ion-text-color);
      }
    }

    .collapse-all {
      padding: 4px 0;
      border: none;
      background: none;
      color: var(--ion-color-primary);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
    }

    .set-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: calc(100% - 24px);
      margin: 8px 12px 0;
      padding: 8px 12px 8px 8px;
      border: 1px solid var(--vault-panel-edge);
      border-radius: 12px;
      background: var(--vault-panel);
      color: inherit;
      font: inherit;
      text-align: left;
      transition: background 0.15s ease, border-color 0.15s ease;

      &:active {
        background: rgb(255 255 255 / 0.07);
      }
      &.open {
        border-color: rgb(91 124 250 / 0.45);
        background: rgb(91 124 250 / 0.08);
      }
      &.complete {
        border-color: rgb(247 183 51 / 0.5);
      }
      &.complete .fill-bar span {
        background: var(--vault-gold);
      }
      &.open + .card-grid {
        padding-top: 12px;
      }
    }

    /* Up to three cards fanned like a hand. */
    .cover {
      position: relative;
      flex-shrink: 0;
      width: 48px;
      height: 46px;

      img {
        position: absolute;
        left: 50%;
        bottom: 0;
        width: 28px;
        aspect-ratio: var(--card-ratio);
        object-fit: cover;
        border-radius: 3px;
        background: var(--ion-background-color-step-150, #22262f);
        box-shadow: 0 2px 6px rgb(0 0 0 / 0.5);
        transform-origin: 50% 110%;
        transform: translateX(-50%) rotate(calc(var(--i) * 12deg));
      }
      &.unowned img {
        opacity: 0.35;
        filter: grayscale(1);
      }
    }

    .info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .title {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      font-size: 14px;
      font-weight: 700;

      .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .symbol {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      object-fit: contain;
      filter: invert(1);
      opacity: 0.85;
    }

    .meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      color: var(--ion-color-medium);
      white-space: nowrap;

      .code {
        font-weight: 600;
      }
      b {
        margin-left: auto;
        font-weight: 700;
        color: #f7b733;
      }
    }

    .fill-bar {
      height: 3px;
    }

    .done {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-weight: 700;
      color: #f7b733;
    }

    .chevron {
      flex-shrink: 0;
      font-size: 16px;
      color: var(--ion-color-medium);
      transition: transform 0.2s ease;
    }
    .open .chevron {
      transform: rotate(180deg);
    }

    .card-grid {
      gap: 8px;
    }
  `,
})
export class CatalogBrowserComponent {
  private readonly catalog = inject(CatalogService);
  private readonly collection = inject(CollectionService);
  private readonly prices = inject(PriceService);
  protected readonly adder = inject(AddCardService);

  readonly gameId = input.required<string>();

  protected readonly filter = signal<OwnedFilter>('all');
  protected readonly filters: { value: OwnedFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'owned', label: 'Owned' },
    { value: 'missing', label: 'Missing' },
  ];

  protected readonly cards = signal<CatalogCard[]>([]);
  protected readonly expanded = signal(new Set<string>());
  protected readonly counts = this.collection.countsByCard;

  /** Every set of the game, before the owned/missing filter. */
  private readonly allSets = computed<CatalogSet[]>(() => {
    const counts = this.counts();
    return groupBySet(this.cards(), card => card).map(group => {
      const owned = group.items.filter(card => counts.has(card.id));
      const cover = owned.length
        ? [...owned].sort((a, b) => (this.prices.priceOf(b) ?? 0) - (this.prices.priceOf(a) ?? 0)).slice(0, COVER_SIZE)
        : group.items.slice(0, COVER_SIZE);
      return {
        setCode: group.setCode,
        title: titleOf(group.setCode, group.setName),
        icon: group.items[0]?.setIcon,
        cards: group.items,
        visible: group.items,
        owned: owned.length,
        percent: (owned.length / group.items.length) * 100,
        value: owned.reduce((sum, card) => sum + (this.prices.priceOf(card) ?? 0) * (counts.get(card.id) ?? 0), 0),
        cover,
      };
    });
  });

  protected readonly visibleSets = computed<CatalogSet[]>(() => {
    const filter = this.filter();
    if (filter === 'all') return this.allSets();
    const counts = this.counts();
    return this.allSets()
      .map(set => ({ ...set, visible: set.cards.filter(card => (filter === 'owned') === counts.has(card.id)) }))
      .filter(set => set.visible.length > 0);
  });

  protected readonly totals = computed(() => {
    const sets = this.allSets();
    return {
      sets: sets.length,
      complete: sets.filter(set => set.owned === set.cards.length).length,
      cards: this.cards().length,
      owned: sets.reduce((sum, set) => sum + set.owned, 0),
      value: sets.reduce((sum, set) => sum + set.value, 0),
    };
  });

  constructor() {
    addIcons({ chevronDown, trophy });
    // Another game's open sets mean nothing here.
    effect(() => {
      this.gameId();
      this.expanded.set(new Set());
    });
    effect(() => {
      const gameId = this.gameId();
      this.catalog.installed();
      void this.catalog.cardsFor(gameId).then(cards => {
        if (gameId === this.gameId()) this.cards.set(cards);
      });
    });
  }

  protected readonly rarity = rarityClass;

  protected collapseAll(): void {
    this.expanded.set(new Set());
  }

  protected toggle(setCode: string): void {
    this.expanded.update(open => {
      const next = new Set(open);
      if (!next.delete(setCode)) next.add(setCode);
      return next;
    });
  }
}
