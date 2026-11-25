import { CardSrcDirective } from '../shared/card-src.directive';
import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, trashOutline } from 'ionicons/icons';

import { boxColor } from '../boxes/box-models';
import { BoxService } from '../boxes/box.service';
import { AddCardService } from '../data/add-card.service';
import { DEFAULT_SORT, SortId, sortEntries, sortOptionsFor, sortValue } from '../data/card-sort';
import { CatalogCard } from '../data/models';
import { stacksOf } from '../data/stacks';
import { MoneyPipe } from '../prices/money.pipe';
import { PriceService } from '../prices/price.service';
import { ListDraft, ListFormComponent } from './list-form.component';
import { registerListIcons } from './list-models';
import { ListCard, ListService } from './list.service';

@Component({
  selector: 'app-list',
  imports: [CardSrcDirective,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonIcon, IonContent, RouterLink,
    IonSelect, IonSelectOption, MoneyPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/boxes" />
        </ion-buttons>
        <ion-title>{{ list()?.name }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="edit()" aria-label="Edit list">
            <ion-icon slot="icon-only" name="create-outline" />
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
          <ion-select
            class="sort"
            label="Sort by"
            interface="action-sheet"
            [interfaceOptions]="{ header: 'Sort this list by' }"
            [value]="list.sortBy ?? 'set'"
            (ionChange)="sortBy($event.detail.value)"
          >
            @for (option of sortOptions(); track option.id) {
              <ion-select-option [value]="option.id">{{ option.label }}</ion-select-option>
            }
          </ion-select>
          @for (row of rows(); track row.first.entry.id) {
            <button class="row" (click)="open(row.first)">
              <span class="thumb">
                <img class="card-thumb" [cardSrc]="row.first.card.card.image" [alt]="row.first.card.card.name" loading="lazy" />
                @if (row.copies.length > 1) {
                  <span class="count">{{ row.copies.length }}</span>
                }
              </span>
              <span class="meta">
                <strong>{{ row.first.card.card.name }}</strong>
                <span>{{ row.first.card.card.number }} · {{ row.detail }}</span>
                <span class="where">{{ row.where }}</span>
              </span>
              <ion-icon
                name="trash-outline"
                [attr.aria-label]="row.copies.length > 1 ? 'Take one copy off the list' : 'Take off the list'"
                (click)="drop($event, row.copies.at(-1)!)"
              />
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
    .sort {
      margin: 4px 16px 6px;
      padding: 2px 14px;
      width: auto;
      border-radius: var(--vault-radius);
      border: 1px solid var(--vault-panel-edge);
      background: var(--vault-panel);
      font-size: 14px;
    }
    .thumb {
      position: relative;
      flex-shrink: 0;
      display: flex;
    }
    .row .count {
      position: absolute;
      top: -6px;
      right: -8px;
      min-width: 20px;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--vault-accent);
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      text-align: center;
      box-shadow: 0 1px 4px rgb(0 0 0 / 0.5);
    }
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
  private readonly modals = inject(ModalController);
  private readonly router = inject(Router);
  private readonly prices = inject(PriceService);
  private readonly boxes = inject(BoxService);

  readonly id = input.required<string>();

  protected readonly list = computed(() => this.lists.listById(Number(this.id())));
  protected readonly cards = computed(() => this.lists.cardsIn(Number(this.id())));
  protected readonly tint = computed(() => boxColor(this.list()?.color ?? '').front);
  protected readonly value = computed(() => this.lists.valueOf(Number(this.id())));
  protected readonly loose = computed(() => this.cards().filter(row => !row.location).length);

  private readonly priceOf = (card: CatalogCard) => this.prices.priceOf(card);

  protected readonly sortOptions = computed(() => sortOptionsFor(this.cards().map(row => row.card.card)));

  /** A list isn't a physical place, so every copy of a card stacks, wherever the copies sit. */
  protected readonly rows = computed(() => {
    const sortBy = this.list()?.sortBy;
    const sorted = sortEntries(this.cards(), sortBy, this.priceOf, row => row.card);
    return stacksOf(sorted, row => row.card, false).map(stack => {
      const first = stack.items[0];
      const shown = sortBy && sortBy !== DEFAULT_SORT && sortBy !== 'added' && sortBy !== 'name';
      return {
        first,
        copies: stack.items,
        detail: shown ? sortValue(sortBy, first.card.card, this.priceOf) : first.card.card.rarity,
        where: this.whereAll(stack.items),
      };
    });
  });

  constructor() {
    addIcons({ createOutline, trashOutline });
    registerListIcons();
  }

  /** "BT1 binder · Row 1 · #14–16" when the copies sit together, else the first place and a count. */
  private whereAll(copies: ListCard[]): string {
    const spots = copies.map(row => row.location);
    const first = spots[0];
    const together = first && spots.every(spot => spot && spot.boxId === first.boxId && spot.row === first.row);
    if (together) {
      const slots = spots.map(spot => spot!.position + 1).sort((a, b) => a - b);
      const run = slots.every((slot, i) => i === 0 || slot === slots[i - 1] + 1);
      const numbers = slots.length === 1 ? `${slots[0]}` : run ? `${slots[0]}–${slots.at(-1)}` : slots.join(', #');
      return `${this.boxes.describe({ boxId: first.boxId, row: first.row })} · #${numbers}`;
    }
    const places = [...new Set(copies.map(row => row.where))];
    return places.length > 1 ? `${places[0]} +${places.length - 1} more` : places[0];
  }

  protected async sortBy(sortBy: SortId): Promise<void> {
    const list = this.list();
    if (list && (list.sortBy ?? DEFAULT_SORT) !== sortBy) await this.lists.update(list.id!, { sortBy });
  }

  protected async open(row: ListCard): Promise<void> {
    await this.cardSheets.openDetail(row.card, this.rows().map(stack => stack.first.card.card));
  }

  protected async drop(event: Event, row: ListCard): Promise<void> {
    event.stopPropagation();
    await this.lists.removeEntry(row.entry.id!);
  }

  protected async edit(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const modal = await this.modals.create({ component: ListFormComponent, componentProps: { list } });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<ListDraft>();
    if (role === 'save' && data) await this.lists.update(list.id!, data);
    if (role === 'delete') {
      await this.lists.remove(list.id!);
      await this.router.navigateByUrl('/tabs/boxes');
    }
  }
}
