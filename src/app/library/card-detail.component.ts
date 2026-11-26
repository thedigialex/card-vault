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
import { addOutline, chevronForward, expandOutline, trashOutline } from 'ionicons/icons';

import { BoxService } from '../boxes/box.service';
import { boxColor } from '../boxes/box-models';
import { registerListIcons } from '../lists/list-models';
import { ListService } from '../lists/list.service';
import { AddCardService } from '../data/add-card.service';
import { CollectionService } from '../data/collection.service';
import { CatalogCard, REGULAR_PRINTING, printingLabel } from '../data/models';
import { NotifyService } from '../shared/notify.service';
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

        @if (lists.lists().length && listCopy() !== undefined) {
          <div class="section-head">
            <h2>Lists</h2>
            @if (copies().length > 1) {
              <span>This copy</span>
            }
          </div>
          <button class="list-summary" (click)="pickLists()">
            <span class="chips">
              @for (list of onLists(); track list.id) {
                <span class="pill on" [style.--tint]="list.tint"><ion-icon [name]="list.icon" /> {{ list.name }}</span>
              } @empty {
                <span class="none">Not on a list yet</span>
              }
            </span>
            <span class="edit">{{ onLists().length ? 'Change' : 'Add to list' }}<ion-icon name="chevron-forward" /></span>
          </button>
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
    .list-summary {
      display: flex;
      align-items: center;
      gap: 12px;
      width: calc(100% - 32px);
      margin: 0 16px;
      padding: 10px 12px;
      border: 1px solid var(--vault-panel-edge);
      border-radius: var(--vault-radius);
      background: var(--vault-panel);
      color: inherit;
      font: inherit;
      text-align: left;
    }
    .chips {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .none {
      font-size: 13px;
      color: var(--ion-color-medium);
    }
    .edit {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--ion-color-primary);
    }
  `,
})
export class CardDetailComponent {
  protected readonly modals = inject(ModalController);
  private readonly collection = inject(CollectionService);
  private readonly boxes = inject(BoxService);
  private readonly adder = inject(AddCardService);
  private readonly notify = inject(NotifyService);
  protected readonly prices = inject(PriceService);
  protected readonly lists = inject(ListService);

  card?: CatalogCard;
  /** Limits the list to one printing; without it every copy of the card is shown. */
  printingId?: string;
  /** The copy that was tapped, which list changes apply to. */
  ownedId?: number;
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
    addIcons({ addOutline, chevronForward, expandOutline, trashOutline });
    registerListIcons();
  }

  protected async remove(ownedId: number): Promise<void> {
    await this.collection.remove(ownedId);
    if (!this.copies().length) await this.modals.dismiss();
  }

  /** A list holds one copy: the one tapped, or the first copy when opened from the card itself. */
  protected readonly listCopy = computed(() => {
    const copies = this.copies();
    return copies.find(copy => copy.ownedId === this.ownedId)?.ownedId ?? copies[0]?.ownedId;
  });

  protected readonly onLists = computed(() => {
    const copy = this.listCopy();
    const on = copy === undefined ? [] : this.lists.listsOf(copy);
    return this.lists
      .lists()
      .filter(list => on.includes(list.id!))
      .map(list => ({ id: list.id!, name: list.name, icon: list.icon, tint: boxColor(list.color).front }));
  });

  protected async pickLists(): Promise<void> {
    const ownedId = this.listCopy();
    if (ownedId === undefined) return;
    const { ListPickerComponent } = await import('../lists/list-picker.component');
    const modal = await this.modals.create({
      component: ListPickerComponent,
      componentProps: { ownedId },
      breakpoints: [0, 0.6, 1],
      initialBreakpoint: 0.6,
    });
    await modal.present();
  }

  protected view(card: CatalogCard): Promise<void> {
    return this.adder.view(card, this.siblings);
  }

  /** Same printing as the copy tapped; a copy in a hand-sorted box gets its twin filed beside it. */
  protected async addAnother(card: CatalogCard): Promise<void> {
    const tapped = this.ownedId ?? this.listCopy();
    const printingId =
      this.printingId ?? this.collection.entriesByOwned().get(tapped ?? -1)?.owned.printingId ?? REGULAR_PRINTING;
    const ownedId = await this.collection.add(card, printingId);
    const boxId = tapped === undefined ? undefined : this.boxes.locationOf(tapped)?.boxId;
    if (boxId !== undefined && !this.boxes.boxById(boxId)?.autoSort) await this.boxes.fileInto([ownedId], boxId);
    await this.notify.show(`Added another ${card.name} (${printingLabel(card, printingId)})`, 1400);
  }
}
