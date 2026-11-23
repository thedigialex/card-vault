import { CardSrcDirective } from '../shared/card-src.directive';
import { Component, computed, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, expandOutline, trashOutline } from 'ionicons/icons';

import { BoxService } from '../boxes/box.service';
import { boxColor } from '../boxes/box-models';
import { registerListIcons } from '../lists/list-models';
import { ListService } from '../lists/list.service';
import { AddCardService } from '../data/add-card.service';
import { CollectionService } from '../data/collection.service';
import { CatalogCard, printingLabel } from '../data/models';
import { MoneyPipe } from '../prices/money.pipe';
import { PriceService } from '../prices/price.service';

@Component({
  selector: 'app-card-detail',
  imports: [CardSrcDirective,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonLabel, IonNote, IonIcon,
    MoneyPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ card?.name }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="modals.dismiss()">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (card; as card) {
        <div class="hero">
          <button class="art" (click)="view(card)" aria-label="View full card">
            <img [cardSrc]="card.image" [alt]="card.name" />
            <span class="zoom"><ion-icon name="expand-outline" /> Full card</span>
          </button>
          <div>
            <h2>{{ card.name }}</h2>
            <p>{{ card.number }} · {{ card.rarity }}</p>
            <p>{{ card.setName }}</p>
            @if (card.color) {
              <p>{{ card.color }} {{ card.type }}</p>
            }
            @if (prices.priceOf(card); as price) {
              <p class="price">{{ price | money }} each</p>
            }
          </div>
        </div>

        @if (lists.lists().length) {
          <div class="section-head">
            <h2>Lists</h2>
            <span>Tap to add or remove</span>
          </div>
          <div class="list-chips">
            @for (option of listOptions(); track option.list.id) {
              <button
                class="pill"
                [class.on]="option.on"
                [style.--tint]="option.tint"
                (click)="toggleList(option.list.id!)"
              >
                <ion-icon [name]="option.list.icon" />
                {{ option.list.name }}
              </button>
            }
          </div>
        }

        <div class="section-head">
          <h2>Your copies</h2>
          <span>{{ copies().length }}</span>
        </div>
        <ion-list>
          @for (copy of copies(); track copy.ownedId) {
            <ion-item>
              <ion-label>
                <h3>{{ copy.printing }}</h3>
                <p>{{ copy.location }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" color="danger" aria-label="Remove copy" (click)="remove(copy.ownedId)">
                <ion-icon slot="icon-only" name="trash-outline" />
              </ion-button>
            </ion-item>
          } @empty {
            <ion-item lines="none">
              <ion-note>You don't own this card yet.</ion-note>
            </ion-item>
          }
        </ion-list>

        <div class="actions">
          <ion-button expand="block" fill="outline" (click)="addAnother(card)">
            <ion-icon slot="start" name="add-outline" />
            Add another copy
          </ion-button>
        </div>
      }
    </ion-content>
  `,
  styles: `
    .hero {
      display: flex;
      gap: 16px;
      padding: 16px;
      .art {
        padding: 0;
        border: none;
        background: none;
        width: 38%;
        max-width: 150px;
        flex-shrink: 0;
      }
      .zoom {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        color: var(--ion-color-primary);
        ion-icon {
          vertical-align: -2px;
        }
      }
      .price {
        margin-top: 6px;
        color: var(--ion-color-success);
        font-weight: 600;
        font-size: 15px;
      }
      img {
        width: 100%;
        aspect-ratio: var(--card-ratio);
        object-fit: cover;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgb(0 0 0 / 0.3);
      }
      h2 {
        margin: 0 0 6px;
        font-size: 18px;
      }
      p {
        margin: 0 0 3px;
        font-size: 13px;
        color: var(--ion-color-medium);
      }
    }
    .actions {
      padding: 12px 16px calc(16px + var(--ion-safe-area-bottom, 0px));
    }
    .list-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0 16px;
    }
  `,
})
export class CardDetailComponent {
  protected readonly modals = inject(ModalController);
  private readonly collection = inject(CollectionService);
  private readonly boxes = inject(BoxService);
  private readonly adder = inject(AddCardService);
  protected readonly prices = inject(PriceService);
  protected readonly lists = inject(ListService);

  card?: CatalogCard;
  /** Limits the list to one printing; without it every copy of the card is shown. */
  printingId?: string;
  /** Cards to swipe through in the full-card view. */
  siblings?: CatalogCard[];

  protected readonly copies = computed(() =>
    this.collection
      .entries()
      .filter(e => e.card.id === this.card?.id && (this.printingId === undefined || e.owned.printingId === this.printingId))
      .map(e => {
        const location = this.boxes.locationOf(e.owned.id!);
        return {
          ownedId: e.owned.id!,
          printing: printingLabel(e.card, e.owned.printingId),
          location: location ? this.boxes.describe(location) : 'Not in a box',
        };
      }),
  );

  constructor() {
    addIcons({ addOutline, expandOutline, trashOutline });
    registerListIcons();
  }

  protected async remove(ownedId: number): Promise<void> {
    await this.collection.remove(ownedId);
    if (!this.copies().length) await this.modals.dismiss();
  }

  protected readonly listOptions = computed(() => {
    const first = this.copies()[0]?.ownedId;
    const on = first === undefined ? [] : (this.lists.listsByOwned().get(first) ?? []);
    return this.lists.lists().map(list => ({ list, tint: boxColor(list.color).front, on: on.includes(list.id!) }));
  });

  /** A list holds one copy; marking from here uses the first copy of this printing. */
  protected async toggleList(listId: number): Promise<void> {
    const first = this.copies()[0]?.ownedId;
    if (first !== undefined) await this.lists.toggle(listId, first);
  }

  protected view(card: CatalogCard): Promise<void> {
    return this.adder.view(card, this.siblings);
  }

  protected async addAnother(card: CatalogCard): Promise<void> {
    await this.adder.add(card, true);
  }
}
