import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, chevronDown, trophy } from 'ionicons/icons';

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
  imports: [IonIcon, ListMarksComponent, DecimalPipe, MoneyPipe],
  template: `
    @if (cards().length) {
      <div class="hud">
        <div class="hud-stat accent">
          <span>Collected</span>
          <strong>{{ totals().owned | number }}<small>/{{ totals().cards | number }}</small></strong>
        </div>
        <div class="hud-stat gold">
          <span>Sets done</span>
          <strong>{{ totals().complete }}<small>/{{ totals().sets }}</small></strong>
        </div>
        <div class="hud-stat">
          <span>Value</span>
          <strong>{{ totals().value | money }}</strong>
        </div>
      </div>
      @if (expanded().size) {
        <button class="collapse-all" (click)="collapseAll()">Collapse all</button>
      }
    }

    @for (set of visibleSets(); track set.setCode) {
      @let open = expanded().has(set.setCode);
      <button
        class="set-panel"
        [class.open]="open"
        [class.complete]="set.owned === set.cards.length"
        [attr.aria-expanded]="open"
        (click)="toggle(set.setCode)"
      >
        <span class="cover" [class.unowned]="!set.owned">
          @for (card of set.cover; track card.id; let i = $index) {
            <img [src]="card.image" alt="" loading="lazy" [style.--i]="i - (set.cover.length - 1) / 2" />
          }
        </span>
        <span class="info">
          <span class="title">
            @if (set.icon) {
              <img class="symbol" [src]="set.icon" alt="" loading="lazy" />
            }
            {{ set.title }}
          </span>
          <span class="meta">
            {{ set.setCode }} · {{ set.cards.length | number }} cards
            @if (set.value) {
              · <b>{{ set.value | money }}</b>
            }
          </span>
          <span class="progress">
            <span class="fill-bar"><span [style.width.%]="set.percent"></span></span>
            @if (set.owned === set.cards.length) {
              <span class="done"><ion-icon name="trophy" /> Complete</span>
            } @else {
              <span class="count">{{ set.owned }}/{{ set.cards.length }}</span>
            }
          </span>
        </span>
        <ion-icon class="chevron" name="chevron-down" />
      </button>

      @if (open) {
        <div class="card-grid">
          @for (card of set.visible; track card.id) {
            @let count = counts().get(card.id) ?? 0;
            <button class="card-tile" [class]="rarity(card)" [class.missing]="!count" (click)="adder.add(card, true, set.visible)">
              <img [src]="card.image" [alt]="card.name" loading="lazy" />
              @if (count) {
                <span class="tile-badge">{{ count }}</span>
              } @else {
                <span class="tile-add"><ion-icon name="add" /></span>
              }
              <app-list-marks [cardId]="card.id" />
              <span class="tile-caption">{{ card.number }}</span>
              <span class="tile-caption name">{{ card.name }}</span>
            </button>
          }
        </div>
      }
    } @empty {
      <p class="empty-state">No sets match this filter.</p>
    }
  `,
  styles: `
    .hud strong small {
      font-size: 12px;
      font-weight: 600;
      color: var(--ion-color-medium);
      -webkit-text-fill-color: var(--ion-color-medium);
    }

    .collapse-all {
      display: block;
      margin: 4px 16px 0 auto;
      padding: 4px 0;
      border: none;
      background: none;
      color: var(--ion-color-primary);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
    }

    .set-panel {
      display: flex;
      align-items: center;
      gap: 14px;
      width: calc(100% - 24px);
      margin: 10px 12px 0;
      padding: 12px 12px 12px 10px;
      border: 1px solid var(--vault-panel-edge);
      border-radius: var(--vault-radius);
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
      width: 68px;
      height: 64px;

      img {
        position: absolute;
        left: 50%;
        bottom: 0;
        width: 40px;
        aspect-ratio: var(--card-ratio);
        object-fit: cover;
        border-radius: 4px;
        background: var(--ion-background-color-step-150, #22262f);
        box-shadow: 0 2px 8px rgb(0 0 0 / 0.5);
        transform-origin: 50% 110%;
        transform: translateX(-50%) rotate(calc(var(--i) * 13deg));
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
      gap: 3px;
    }

    .title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 15px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .symbol {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      object-fit: contain;
      filter: invert(1);
      opacity: 0.85;
    }

    .meta {
      font-size: 12px;
      color: var(--ion-color-medium);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      b {
        font-weight: 700;
        color: #f7b733;
      }
    }

    .progress {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 3px;

      .fill-bar {
        flex: 1;
      }
    }

    .count,
    .done {
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      color: var(--ion-color-medium);
    }

    .done {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      color: #f7b733;
    }

    .chevron {
      flex-shrink: 0;
      font-size: 18px;
      color: var(--ion-color-medium);
      transition: transform 0.2s ease;
    }
    .open .chevron {
      transform: rotate(180deg);
    }

    .tile-add {
      position: absolute;
      top: 5px;
      right: 5px;
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 1px dashed rgb(255 255 255 / 0.45);
      color: rgb(255 255 255 / 0.7);
      font-size: 13px;
    }
  `,
})
export class CatalogBrowserComponent {
  private readonly catalog = inject(CatalogService);
  private readonly collection = inject(CollectionService);
  private readonly prices = inject(PriceService);
  protected readonly adder = inject(AddCardService);

  readonly gameId = input.required<string>();
  readonly filter = input<OwnedFilter>('all');

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
    addIcons({ add, chevronDown, trophy });
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
