import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, ellipseOutline } from 'ionicons/icons';

import { boxColor } from '../boxes/box-models';
import { registerListIcons } from './list-models';
import { ListService } from './list.service';

/** Past this many lists a search box earns its space. */
const SEARCH_FROM = 7;

/** Every list as one tappable row, so any number of lists fits; taps apply straight away. */
@Component({
  selector: 'app-list-picker',
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonSearchbar, IonIcon],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Lists</ion-title>
        <ion-buttons slot="end">
          <ion-button strong (click)="modals.dismiss()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
      @if (searchable()) {
        <ion-toolbar>
          <ion-searchbar placeholder="Find a list" [debounce]="100" (ionInput)="query.set($event.detail.value ?? '')" />
        </ion-toolbar>
      }
    </ion-header>
    <ion-content>
      @for (row of rows(); track row.id) {
        <button class="list-row" [class.on]="row.on" [style.--tint]="row.tint" (click)="toggle(row.id)">
          <span class="badge"><ion-icon [name]="row.icon" /></span>
          <span class="text">
            <strong>{{ row.name }}</strong>
            <small>{{ row.count }} {{ row.count === 1 ? 'card' : 'cards' }}</small>
          </span>
          <ion-icon class="check" [name]="row.on ? 'checkmark-circle' : 'ellipse-outline'" />
        </button>
      } @empty {
        <p class="empty-state">No lists match.</p>
      }
    </ion-content>
  `,
  styles: `
    .list-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 16px;
      border: none;
      border-bottom: 1px solid var(--vault-panel-edge);
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;

      &.on {
        background: color-mix(in srgb, var(--tint) 14%, transparent);
      }
    }
    .badge {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--tint) 30%, transparent);
      font-size: 17px;
    }
    .text {
      flex: 1;
      min-width: 0;

      strong,
      small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      small {
        margin-top: 2px;
        font-size: 12px;
        color: var(--ion-color-medium);
      }
    }
    .check {
      flex-shrink: 0;
      font-size: 22px;
      color: var(--ion-color-medium);
    }
    .on .check {
      color: var(--tint);
    }
  `,
})
export class ListPickerComponent {
  protected readonly modals = inject(ModalController);
  private readonly lists = inject(ListService);

  ownedId!: number;

  protected readonly query = signal('');
  protected readonly searchable = computed(() => this.lists.lists().length >= SEARCH_FROM);

  protected readonly rows = computed(() => {
    const on = this.lists.listsByOwned().get(this.ownedId) ?? [];
    const counts = this.lists.countsByList();
    const text = this.query().trim().toLowerCase();
    return this.lists
      .lists()
      .filter(list => !text || list.name.toLowerCase().includes(text))
      .map(list => ({
        id: list.id!,
        name: list.name,
        icon: list.icon,
        tint: boxColor(list.color).front,
        count: counts.get(list.id!) ?? 0,
        on: on.includes(list.id!),
      }));
  });

  constructor() {
    addIcons({ checkmarkCircle, ellipseOutline });
    registerListIcons();
  }

  protected async toggle(listId: number): Promise<void> {
    await this.lists.toggle(listId, this.ownedId);
  }
}
