import { Component, computed, inject, signal, OnInit } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';

import { DEFAULT_COLOR, boxColor } from '../boxes/box-models';
import { ColorPickerComponent } from '../boxes/color-picker.component';
import { NotifyService } from '../shared/notify.service';
import { CardList, LIST_ICONS, registerListIcons } from './list-models';

export type ListDraft = Pick<CardList, 'name' | 'icon' | 'color'>;

@Component({
  selector: 'app-list-form',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonInput, IonFooter,
    IonIcon, ColorPickerComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ list ? 'Edit list' : 'New list' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="modals.dismiss()">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="preview">
        <span class="badge"><ion-icon [name]="icon()" /></span>
        <h2>{{ name() || 'Untitled' }}</h2>
      </div>

      <ion-list inset>
        <ion-item>
          <ion-input label="Name" labelPlacement="stacked" placeholder="Deck, Favorites, Rare cards…" [value]="name()" (ionInput)="name.set($event.detail.value ?? '')" />
        </ion-item>
      </ion-list>

      <h3 class="form-section">Icon</h3>
      <div class="icons">
        @for (option of icons; track option) {
          <button
            class="icon"
            [class.picked]="icon() === option"
            [attr.aria-label]="option"
            [attr.aria-pressed]="icon() === option"
            (click)="icon.set(option)"
          >
            <ion-icon [name]="option" />
          </button>
        }
      </div>

      <app-color-picker [(value)]="color" />

      @if (list) {
        <ion-button class="form-delete" fill="clear" color="danger" expand="block" (click)="remove()">
          <ion-icon slot="start" name="trash-outline" />
          Delete list
        </ion-button>
      }
    </ion-content>
    <ion-footer class="form-footer">
      <ion-toolbar>
        <ion-button expand="block" [disabled]="!valid()" (click)="save()">{{ list ? 'Save changes' : 'Create list' }}</ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: `
    .preview {
      padding: 24px 16px 4px;
      text-align: center;
      h2 {
        margin: 12px 0 0;
        font-size: 18px;
        font-weight: 700;
      }
    }
    .badge {
      display: inline-grid;
      place-items: center;
      width: 72px;
      height: 72px;
      border-radius: 20px;
      background: var(--tint);
      box-shadow: 0 6px 22px color-mix(in srgb, var(--tint) 45%, transparent);
      ion-icon {
        font-size: 36px;
        color: #fff;
      }
    }
    .icons {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 0 20px;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 12px;
      border: 1px solid var(--vault-panel-edge);
      background: var(--vault-panel);
      color: var(--ion-color-medium);
      ion-icon {
        font-size: 21px;
      }
    }
    .icon.picked {
      border-color: var(--tint, var(--ion-text-color));
      background: color-mix(in srgb, var(--tint) 30%, transparent);
      color: var(--ion-text-color);
    }
  `,
  host: { '[style.--tint]': 'tint()' },
})
export class ListFormComponent implements OnInit {
  protected readonly modals = inject(ModalController);
  private readonly notify = inject(NotifyService);

  list?: CardList;
  suggested: ListDraft = { name: 'Deck', icon: 'layers', color: DEFAULT_COLOR };

  protected readonly icons = Object.keys(LIST_ICONS);

  protected readonly name = signal('');
  protected readonly icon = signal('layers');
  protected readonly color = signal(DEFAULT_COLOR);

  protected readonly tint = computed(() => boxColor(this.color()).front);
  protected readonly valid = computed(() => this.name().trim() !== '');

  constructor() {
    addIcons({ trashOutline });
    registerListIcons();
  }

  ngOnInit(): void {
    const start = this.list ?? this.suggested;
    this.name.set(start.name);
    this.icon.set(start.icon);
    this.color.set(start.color);
  }

  protected save(): void {
    const draft: ListDraft = { name: this.name().trim(), icon: this.icon(), color: this.color() };
    void this.modals.dismiss(draft, 'save');
  }

  protected async remove(): Promise<void> {
    const message = 'The cards stay in your library; only the list goes.';
    if (await this.notify.confirm(`Delete ${this.list?.name}?`, message, 'Delete', true)) {
      void this.modals.dismiss(null, 'delete');
    }
  }
}
