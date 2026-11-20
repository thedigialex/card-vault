import { Component, computed, inject, signal, OnInit } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';

import { CatalogService } from '../data/catalog.service';
import { gameById } from '../games/games';
import { Box3dComponent } from './box-3d.component';
import { BOX_COLORS, BOX_MODELS, CUSTOM_MODEL, DEFAULT_COLOR, boxModel, rowWord, sizeOf } from './box-models';
import { BoxDraft } from './box.service';
import { Box } from './layout';

@Component({
  selector: 'app-box-form',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonInput, IonSelect,
    IonSelectOption, IonLabel, IonToggle, Box3dComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="modals.dismiss()">Cancel</ion-button>
        </ion-buttons>
        <ion-title>{{ box ? 'Edit box' : 'New box' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button strong [disabled]="!valid()" (click)="save()">Save</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="preview">
        <app-box-3d [shape]="model().shape" [colorId]="color()" [fill]="0.6" [rowFills]="previewFills()" [label]="name()" [interactive]="true" [scale]="0.85" />
        <p class="capacity">Holds {{ size().toLocaleString() }} cards</p>
      </div>

      <ion-list inset>
        <ion-item>
          <ion-select label="Model" labelPlacement="stacked" interface="action-sheet" [value]="modelId()" (ionChange)="modelId.set($event.detail.value)">
            @for (option of models; track option.id) {
              <ion-select-option [value]="option.id">{{ option.name }} — {{ option.note }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-input label="Label" labelPlacement="stacked" placeholder="Digimon BT1–BT5" [value]="name()" (ionInput)="name.set($event.detail.value ?? '')" />
        </ion-item>
        @if (modelId() === customModel) {
          <ion-item>
            <ion-input
              label="Rows"
              labelPlacement="stacked"
              type="number"
              inputmode="numeric"
              min="1"
              [value]="rows()"
              (ionInput)="rows.set(toNumber($event.detail.value))"
            />
          </ion-item>
          <ion-item>
            <ion-input
              label="Cards per row"
              labelPlacement="stacked"
              type="number"
              inputmode="numeric"
              min="1"
              [value]="rowCapacity()"
              (ionInput)="rowCapacity.set(toNumber($event.detail.value))"
            />
          </ion-item>
        } @else {
          <ion-item lines="none">
            <ion-label>
              <h3>Size</h3>
              <p>{{ model().rows }} {{ rowName(model().rows !== 1) }} × {{ model().rowCapacity }} cards</p>
            </ion-label>
          </ion-item>
        }
        <ion-item>
          <ion-toggle [checked]="autoSort()" (ionChange)="autoSort.set($event.detail.checked)">
            <ion-label>
              <h3>Sort automatically</h3>
              <p>Off lets you drag cards into any slot yourself.</p>
            </ion-label>
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-select label="Holds" labelPlacement="stacked" interface="action-sheet" [value]="game()" (ionChange)="game.set($event.detail.value)">
            <ion-select-option value="">Any game</ion-select-option>
            @for (option of games(); track option.id) {
              <ion-select-option [value]="option.id">{{ option.name }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-list>

      <h3 class="section">Colour</h3>
      <div class="swatches">
        @for (option of colors; track option.id) {
          <button
            class="swatch"
            [class.picked]="color() === option.id"
            [style.background]="option.front"
            [attr.aria-label]="option.name"
            [attr.aria-pressed]="color() === option.id"
            (click)="color.set(option.id)"
          ></button>
        }
      </div>
      <p class="hint">Boxes fill in the order you create them: the first box gets the lowest set numbers.</p>
    </ion-content>
  `,
  styles: `
    .preview {
      padding: 20px 16px 4px;
      text-align: center;
      app-box-3d {
        max-width: 220px;
        margin: 0 auto;
      }
    }
    .capacity {
      margin: 8px 0 0;
      color: var(--ion-color-medium);
      font-size: 14px;
    }
    .section {
      margin: 20px 20px 8px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ion-color-medium);
    }
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 0 20px;
    }
    .swatch {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid transparent;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
      padding: 0;
    }
    .swatch.picked {
      border-color: var(--ion-text-color);
      transform: scale(1.12);
    }
    .hint {
      margin: 20px;
      color: var(--ion-color-medium);
      font-size: 13px;
    }
  `,
})
export class BoxFormComponent implements OnInit {
  protected readonly modals = inject(ModalController);
  private readonly catalog = inject(CatalogService);

  box?: Box;
  suggestedName = 'Box 1';

  protected readonly models = BOX_MODELS;
  protected readonly colors = BOX_COLORS;
  protected readonly customModel = CUSTOM_MODEL;

  protected readonly name = signal('');
  protected readonly modelId = signal('storage-800');
  protected readonly color = signal(DEFAULT_COLOR);
  protected readonly rows = signal(1);
  protected readonly rowCapacity = signal(100);
  protected readonly game = signal('');
  protected readonly autoSort = signal(true);

  protected readonly model = computed(() => boxModel(this.modelId()));
  protected readonly size = computed(() => {
    const { rows, rowCapacity } = sizeOf(this.modelId(), this.rows(), this.rowCapacity());
    return rows * rowCapacity;
  });
  protected readonly games = computed(() =>
    this.catalog.installed().map(g => ({ id: g.id, name: gameById(g.id)?.name ?? g.id })),
  );
  protected readonly previewFills = computed(() => {
    const { rows } = sizeOf(this.modelId(), this.rows(), this.rowCapacity());
    return Array.from({ length: Math.min(rows, 8) }, (_, row) => (row === 0 ? 0.75 : row === 1 ? 0.4 : 0.15));
  });
  protected readonly valid = computed(() => this.name().trim() !== '' && this.size() >= 1);

  ngOnInit(): void {
    const box = this.box;
    this.name.set(box?.name ?? this.suggestedName);
    if (!box) return;
    this.modelId.set(box.model);
    this.color.set(box.color);
    this.rows.set(box.rows);
    this.rowCapacity.set(box.rowCapacity);
    this.game.set(box.game);
    this.autoSort.set(box.autoSort);
  }

  protected rowName(plural: boolean): string {
    return rowWord(this.model().shape, plural);
  }

  protected toNumber(value: string | null | undefined): number {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  protected save(): void {
    const draft: BoxDraft = {
      name: this.name().trim(),
      ...sizeOf(this.modelId(), this.rows(), this.rowCapacity()),
      game: this.game(),
      model: this.modelId(),
      color: this.color(),
      autoSort: this.autoSort(),
    };
    void this.modals.dismiss(draft, 'save');
  }
}
