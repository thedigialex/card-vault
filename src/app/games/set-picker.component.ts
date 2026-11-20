import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, ellipseOutline, lockClosed } from 'ionicons/icons';

import { GameSet } from '../data/models';
import { gameById } from './games';

/** Modal props arrive as plain fields (Ionic assigns them), so no signal inputs here. */
@Component({
  selector: 'app-set-picker',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonFooter, IonSearchbar, IonSegment,
    IonSegmentButton, IonIcon, IonSpinner, DecimalPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="modals.dismiss()">Cancel</ion-button>
        </ion-buttons>
        <ion-title>Choose sets</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Set name or code" [debounce]="150" (ionInput)="query.set($event.detail.value ?? '')" />
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="scope()" (ionChange)="scope.set($any($event.detail.value))">
          <ion-segment-button value="main">Main sets</ion-segment-button>
          <ion-segment-button value="all">All</ion-segment-button>
          <ion-segment-button value="picked">Picked ({{ picked().size }})</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (failed()) {
        <p class="empty-state">Couldn't load the set list. Check your connection and try again.</p>
      } @else if (!sets().length) {
        <div class="empty-state"><ion-spinner /></div>
      } @else {
        @for (group of groups(); track group.year) {
          <h3 class="year">{{ group.year }}</h3>
          @for (set of group.sets; track set.code) {
            @let locked = lockedSet.has(set.code);
            <button class="set-row" [class.on]="picked().has(set.code)" [disabled]="locked" (click)="toggle(set.code)">
              @if (set.icon) {
                <img class="symbol" [src]="set.icon" alt="" loading="lazy" />
              } @else {
                <span class="symbol"></span>
              }
              <span class="text">
                <strong>{{ set.name }}</strong>
                <small>{{ set.code.toUpperCase() }} · {{ set.cardCount | number }} cards · {{ kindLabel(set.kind) }}</small>
              </span>
              <ion-icon [name]="locked ? 'lock-closed' : picked().has(set.code) ? 'checkmark-circle' : 'ellipse-outline'" />
            </button>
          }
        } @empty {
          <p class="empty-state">No sets match.</p>
        }
        @if (lockedSet.size) {
          <p class="hint"><ion-icon name="lock-closed" /> Sets you own cards from stay downloaded.</p>
        }
      }
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <span class="total" slot="start">{{ picked().size }} sets · ~{{ cardTotal() | number }} cards</span>
        <ion-buttons slot="end">
          <ion-button strong fill="solid" color="primary" [disabled]="!picked().size" (click)="done()">Download</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: `
    .year {
      position: sticky;
      top: 0;
      z-index: 1;
      margin: 0;
      padding: 10px 16px 6px;
      font-size: 12px;
      letter-spacing: 0.08em;
      color: var(--ion-color-medium);
      background: var(--ion-background-color);
    }
    .set-row {
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
        background: rgb(91 124 250 / 0.12);
      }
      &:disabled {
        opacity: 1;
      }
      ion-icon {
        flex-shrink: 0;
        font-size: 22px;
        color: var(--ion-color-medium);
      }
      &.on ion-icon {
        color: var(--ion-color-primary);
      }
    }
    .symbol {
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      object-fit: contain;
      filter: invert(1);
      opacity: 0.85;
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
    .hint {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 12px 16px 24px;
      font-size: 13px;
      color: var(--ion-color-medium);
    }
    .total {
      padding-left: 16px;
      font-size: 13px;
      color: var(--ion-color-medium);
    }
  `,
})
export class SetPickerComponent implements OnInit {
  protected readonly modals = inject(ModalController);

  gameId = '';
  selected: string[] = [];
  /** Sets the user owns cards from; dropping them would hide those cards. */
  locked: string[] = [];

  protected lockedSet = new Set<string>();
  protected readonly sets = signal<GameSet[]>([]);
  protected readonly failed = signal(false);
  protected readonly picked = signal(new Set<string>());
  protected readonly query = signal('');
  protected readonly scope = signal<'main' | 'all' | 'picked'>('main');

  protected readonly groups = computed(() => {
    const text = this.query().trim().toLowerCase();
    const scope = this.scope();
    const picked = this.picked();
    const shown = this.sets().filter(
      set =>
        (scope === 'all' || (scope === 'main' ? set.main : picked.has(set.code))) &&
        (!text || set.name.toLowerCase().includes(text) || set.code.toLowerCase().startsWith(text)),
    );
    const groups: { year: string; sets: GameSet[] }[] = [];
    for (const set of shown) {
      const year = set.releasedAt.slice(0, 4) || 'Undated';
      if (groups.at(-1)?.year !== year) groups.push({ year, sets: [] });
      groups.at(-1)!.sets.push(set);
    }
    return groups;
  });

  protected readonly cardTotal = computed(() => {
    const picked = this.picked();
    return this.sets().reduce((sum, set) => sum + (picked.has(set.code) ? set.cardCount : 0), 0);
  });

  constructor() {
    addIcons({ checkmarkCircle, ellipseOutline, lockClosed });
  }

  async ngOnInit(): Promise<void> {
    this.lockedSet = new Set(this.locked);
    this.picked.set(new Set([...this.selected, ...this.locked]));
    try {
      const sets = (await gameById(this.gameId)?.listSets?.()) ?? [];
      this.sets.set([...sets].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt)));
    } catch {
      this.failed.set(true);
    }
  }

  protected kindLabel(kind: string): string {
    return kind.replace(/_/g, ' ');
  }

  protected toggle(code: string): void {
    this.picked.update(picked => {
      const next = new Set(picked);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  }

  protected done(): void {
    void this.modals.dismiss([...this.picked()], 'save');
  }
}
