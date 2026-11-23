import { CardSrcDirective } from '../shared/card-src.directive';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { toggled } from '../shared/toggled';
import { chevronDown, chevronForward, createOutline } from 'ionicons/icons';

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
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonIcon, IonContent, IonSegment,
    IonSegmentButton, Box3dComponent,
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
          <p>{{ stats().model }} · {{ box.rows }} {{ rowName(box.rows !== 1) }} × {{ box.rowCapacity }}</p>
        </div>

        <div class="hud">
          <div class="hud-stat accent">
            <span>Filled</span>
            <strong>{{ stats().used }}<small>/{{ stats().capacity }}</small></strong>
          </div>
          <div class="hud-stat gold">
            <span>Value</span>
            <strong>{{ stats().value > 0 ? (stats().value | money) : '—' }}</strong>
          </div>
        </div>

        <div class="mode">
          <ion-segment [value]="box.autoSort ? 'auto' : 'hand'" (ionChange)="setAutoSort($event.detail.value === 'auto')">
            <ion-segment-button value="auto">Auto sort</ion-segment-button>
            <ion-segment-button value="hand">By hand</ion-segment-button>
          </ion-segment>
          <p>
            {{ box.autoSort ? 'Cards are filed in set order.' : 'Hold a card, then drag it to another ' + rowName(false) + ' or the pile.' }}
          </p>
        </div>

        <div cdkDropListGroup>
          @for (row of rows(); track row.row) {
            <button class="row-head" [class.open]="open().has(row.row)" (click)="toggle(row.row)">
              <ion-icon [name]="open().has(row.row) ? 'chevron-down' : 'chevron-forward'" />
              <div class="row-title">
                <h2>{{ stats().rowTitle }} {{ row.row + 1 }}</h2>
                <p>{{ row.range || 'Empty' }}</p>
              </div>
              <div class="row-fill">
                <span>{{ row.entries.length }}/{{ box.rowCapacity }}</span>
                <div class="fill-bar"><span [style.width.%]="(row.entries.length / box.rowCapacity) * 100"></span></div>
              </div>
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
                    <app-list-marks [ownedId]="slot.entry.owned.id" />
                    <span class="tile-caption"><b>{{ i + 1 }}</b> {{ slot.entry.card.number }}</span>
                  </div>
                } @empty {
                  <p class="drop-hint">Drop cards here</p>
                }
              </div>
            }
          }

          @if (!box.autoSort) {
            <div class="section-head pile-head">
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
      padding: 8px 16px 0;
      text-align: center;
      app-box-3d {
        display: block;
        width: min(62%, 240px);
        margin: 0 auto;
      }
      p {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--ion-color-medium);
      }
    }
    .hud-stat small {
      font-size: 13px;
      font-weight: 600;
      color: var(--ion-color-medium);
      -webkit-text-fill-color: var(--ion-color-medium);
    }
    .mode {
      margin: 12px 16px 8px;
      p {
        margin: 8px 2px 0;
        font-size: 12px;
        text-align: center;
        color: var(--ion-color-medium);
      }
    }
    .row-head {
      display: flex;
      align-items: center;
      gap: 12px;
      width: calc(100% - 32px);
      margin: 10px 16px 0;
      padding: 12px 14px;
      border-radius: var(--vault-radius);
      border: 1px solid var(--vault-panel-edge);
      background: var(--vault-panel);
      color: inherit;
      font: inherit;
      text-align: left;
      > ion-icon {
        flex-shrink: 0;
        font-size: 16px;
        color: var(--ion-color-medium);
      }
      h2 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
      }
      p {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--ion-color-medium);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
    .row-head.open {
      margin-bottom: 10px;
    }
    .row-title {
      flex: 1;
      min-width: 0;
    }
    .row-fill {
      flex-shrink: 0;
      width: 64px;
      text-align: right;
      font-size: 12px;
      font-weight: 600;
      color: var(--ion-color-medium);
      .fill-bar {
        height: 4px;
        margin-top: 5px;
      }
    }
    .tile-caption b {
      color: var(--ion-text-color);
      font-weight: 700;
    }
    .pile-head {
      padding-top: 22px;
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
    addIcons({ chevronDown, chevronForward, createOutline });
  }

  protected rowName(plural: boolean): string {
    return rowWord(this.shape(), plural);
  }

  protected toggle(row: number): void {
    this.open.update(open => toggled(open, row));
  }

  protected readonly unboxed = UNBOXED;
  /** Touch needs a hold before a drag, or the gesture is read as a scroll. */
  protected readonly dragDelay = { touch: 160, mouse: 0 };

  protected async setAutoSort(autoSort: boolean): Promise<void> {
    const box = this.box();
    if (!box || box.autoSort === autoSort) return;
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
    if (role === 'delete') {
      await this.boxes.remove(box.id!);
      await this.router.navigateByUrl('/tabs/boxes');
    }
  }
}
