import { CardSrcDirective } from '../shared/card-src.directive';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDown, chevronForward, createOutline, trashOutline } from 'ionicons/icons';

import { AddCardService } from '../data/add-card.service';
import { NotifyService } from '../shared/notify.service';
import { LibraryEntry } from '../data/collection.service';
import { rarityClass } from '../data/models';
import { ListMarksComponent } from '../lists/list-marks.component';
import { MoneyPipe } from '../prices/money.pipe';
import { Box3dComponent } from './box-3d.component';
import { rowWord } from './box-models';
import { BoxFormComponent } from './box-form.component';
import { BoxDraft, BoxService } from './box.service';

/** A drop list holds its row number; UNBOXED means the loose pile. */
const UNBOXED = -1;

@Component({
  selector: 'app-box',
  imports: [CardSrcDirective,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonIcon, IonContent, Box3dComponent,
    CdkDropListGroup, CdkDropList, CdkDrag, ListMarksComponent, MoneyPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/boxes" />
        </ion-buttons>
        <ion-title>{{ box()?.name }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="edit()" aria-label="Edit box">
            <ion-icon slot="icon-only" name="create-outline" />
          </ion-button>
          <ion-button (click)="remove()" aria-label="Delete box">
            <ion-icon slot="icon-only" name="trash-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (box(); as box) {
        <div class="hero">
          <app-box-3d
            [shape]="shape()"
            [colorId]="box.color"
            [fill]="stats().used / stats().capacity"
            [rowFills]="stats().fills"
            [label]="box.name"
            [interactive]="true"
            [scale]="0.7"
          />
          <div class="meta">
            <h2>{{ stats().model }}</h2>
            <p>{{ box.rows }} {{ rowName(box.rows !== 1) }} × {{ box.rowCapacity }} cards</p>
            <div class="fill-bar"><span [style.width.%]="(stats().used / stats().capacity) * 100"></span></div>
            <p>{{ stats().used }} of {{ stats().capacity }} slots</p>
            @if (stats().value > 0) {
              <p class="value">Worth {{ stats().value | money }}</p>
            }
            <span class="pill">{{ box.autoSort ? 'Sorted automatically' : 'Hand-sorted' }}</span>
          </div>
        </div>

        <div class="mode">
          @if (box.autoSort) {
            <p>Cards are filed in set order.</p>
            <ion-button size="small" fill="outline" (click)="setAutoSort(false)">Arrange by hand</ion-button>
          } @else {
            <p>Hold a card for a moment, then drag it to another {{ rowName(false) }} or to the pile.</p>
            <ion-button size="small" fill="clear" (click)="setAutoSort(true)">Sort automatically</ion-button>
          }
        </div>

        <div cdkDropListGroup>
          @for (row of rows(); track row.row) {
            <button class="section-head toggle" (click)="toggle(row.row)">
              <h2>
                <ion-icon [name]="open().has(row.row) ? 'chevron-down' : 'chevron-forward'" />
                {{ stats().rowTitle }} {{ row.row + 1 }}
              </h2>
              <span>{{ row.range || 'Empty' }} · {{ row.entries.length }}/{{ box.rowCapacity }}</span>
            </button>
            @if (open().has(row.row)) {
              <div
                class="card-grid drop"
                cdkDropList
                cdkDropListOrientation="mixed"
                [cdkDropListData]="row.row"
                [cdkDropListDisabled]="box.autoSort"
                (cdkDropListDropped)="dropped($event)"
              >
                @for (slot of row.entries; track slot.entry.owned.id; let i = $index) {
                  <div
                    class="card-tile"
                    [class]="slot.rarity"
                    cdkDrag
                    [cdkDragData]="slot.entry.owned.id"
                    [cdkDragStartDelay]="dragDelay"
                    (click)="inspect(slot.entry, row.entries)"
                  >
                    <img [cardSrc]="slot.entry.card.image" [alt]="slot.entry.card.name" loading="lazy" />
                    <span class="tile-flag">#{{ i + 1 }}</span>
                    <app-list-marks [ownedId]="slot.entry.owned.id" />
                    <span class="tile-caption">{{ slot.entry.card.number }}</span>
                  </div>
                } @empty {
                  <p class="drop-hint">Drop cards here</p>
                }
              </div>
            }
          }

          @if (!box.autoSort) {
            <div class="section-head">
              <h2>Unboxed pile</h2>
              <span>{{ pile().length }}</span>
            </div>
            <div
              class="card-grid drop pile"
              cdkDropList
              cdkDropListOrientation="mixed"
              [cdkDropListData]="unboxed"
              (cdkDropListDropped)="dropped($event)"
            >
              @for (slot of pile(); track slot.entry.owned.id) {
                <div
                  class="card-tile"
                  [class]="slot.rarity"
                  cdkDrag
                  [cdkDragData]="slot.entry.owned.id"
                  [cdkDragStartDelay]="dragDelay"
                  (click)="inspect(slot.entry, pile())"
                >
                  <img [cardSrc]="slot.entry.card.image" [alt]="slot.entry.card.name" loading="lazy" />
                  <app-list-marks [ownedId]="slot.entry.owned.id" />
                  <span class="tile-caption">{{ slot.entry.card.number }}</span>
                </div>
              } @empty {
                <p class="drop-hint">Nothing loose — drop a card here to take it out</p>
              }
            </div>
          }
        </div>
      }
    </ion-content>
  `,
  styles: `
    .hero {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      app-box-3d {
        width: 46%;
        flex-shrink: 0;
      }
      h2 {
        margin: 0;
        font-size: 16px;
      }
      p {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--ion-color-medium);
      }
      .fill-bar {
        margin: 10px 0 6px;
      }
      .value {
        color: var(--ion-color-success);
        font-weight: 600;
      }
      .pill {
        margin-top: 8px;
      }
    }
    .meta {
      min-width: 0;
    }
    .mode {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 16px 4px;
      p {
        flex: 1;
        margin: 0;
        font-size: 12px;
        color: var(--ion-color-medium);
      }
      ion-button {
        flex-shrink: 0;
        --padding-start: 10px;
        --padding-end: 10px;
      }
    }
    .drop {
      min-height: 76px;
    }
    .drop.pile {
      margin: 0 16px 24px;
      padding: 10px;
      border-radius: var(--vault-radius);
      border: 1px dashed var(--vault-panel-edge);
      background: var(--vault-panel);
    }
    .drop-hint {
      grid-column: 1 / -1;
      margin: 0;
      padding: 18px 4px;
      text-align: center;
      font-size: 12px;
      color: var(--ion-color-medium);
    }
  `,
})
export class BoxPage {
  private readonly boxes = inject(BoxService);
  private readonly cards = inject(AddCardService);
  private readonly modals = inject(ModalController);
  private readonly alerts = inject(AlertController);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly box = computed(() => this.boxes.boxById(Number(this.id())));
  protected readonly stats = computed(() => this.boxes.statsOf(Number(this.id())));
  protected readonly shape = computed(() => this.stats().shape);
  protected readonly open = signal(new Set<number>([0]));

  protected readonly rows = computed(() =>
    this.boxes.rowsOf(Number(this.id())).map(row => {
      const entries = row.ownedIds
        .map(id => this.boxes.entry(id))
        .filter((entry): entry is LibraryEntry => !!entry)
        .map(entry => ({ entry, rarity: rarityClass(entry.card) }));
      const first = entries.at(0)?.entry.card.number;
      const last = entries.at(-1)?.entry.card.number;
      return { row: row.row, entries, range: first ? (first === last ? first : `${first} – ${last}`) : '' };
    }),
  );

  protected readonly pile = computed(() =>
    this.boxes.unboxed().map(entry => ({ entry, rarity: rarityClass(entry.card) })),
  );

  constructor() {
    addIcons({ chevronDown, chevronForward, createOutline, trashOutline });
  }

  protected rowName(plural: boolean): string {
    return rowWord(this.shape(), plural);
  }

  protected toggle(row: number): void {
    this.open.update(open => {
      const next = new Set(open);
      if (!next.delete(row)) next.add(row);
      return next;
    });
  }

  protected readonly unboxed = UNBOXED;
  /** Touch needs a hold before a drag, or the gesture is read as a scroll. */
  protected readonly dragDelay = { touch: 160, mouse: 0 };

  protected async setAutoSort(autoSort: boolean): Promise<void> {
    const box = this.box();
    if (!box) return;
    const { id, order, ...draft } = box;
    await this.boxes.update(id!, { ...draft, autoSort });
    await this.notify.show(autoSort ? 'Sorting this box by set order.' : 'Drag cards to arrange this box.', 1600);
  }

  protected async dropped(event: CdkDragDrop<number>): Promise<void> {
    const ownedId = event.item.data as number;
    const target = event.container.data;
    if (target === UNBOXED) {
      await this.boxes.unbox(ownedId);
      return;
    }
    const box = this.box();
    if (!box) return;
    const full = this.rows().find(row => row.row === target)?.entries.length ?? 0;
    if (event.previousContainer !== event.container && full >= box.rowCapacity) {
      await this.notify.show(`That ${this.rowName(false)} is full.`, 1400);
      return;
    }
    await this.boxes.place(ownedId, box.id!, target, event.currentIndex);
  }

  /** A drag swallows its own click, so this only fires on a real tap. */
  protected async inspect(entry: LibraryEntry, around: { entry: LibraryEntry }[] = []): Promise<void> {
    await this.cards.openDetail(entry, around.map(row => row.entry.card));
  }

  protected async edit(): Promise<void> {
    const box = this.box();
    if (!box) return;
    const modal = await this.modals.create({ component: BoxFormComponent, componentProps: { box } });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<BoxDraft>();
    if (role === 'save' && data) await this.boxes.update(box.id!, data);
  }

  protected async remove(): Promise<void> {
    const box = this.box();
    if (!box) return;
    const alert = await this.alerts.create({
      header: `Delete ${box.name}?`,
      message: 'Your cards stay in your library and go back to the unboxed pile.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
    await this.boxes.remove(box.id!);
    await this.router.navigateByUrl('/tabs/boxes');
  }
}
