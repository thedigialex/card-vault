import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
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
import { chevronBack, chevronForward, closeOutline } from 'ionicons/icons';

import { CatalogCard } from '../data/models';
import { MoneyPipe } from '../prices/money.pipe';
import { PriceService } from '../prices/price.service';

const MAX_SCALE = 6;
const DOUBLE_TAP_MS = 300;

@Component({
  selector: 'app-card-viewer',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonSegment, IonSegmentButton,
    MoneyPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>
          {{ current().name }}
          @if (deck().length > 1) {
            <small>{{ index() + 1 }} / {{ deck().length }}</small>
          }
        </ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Close" (click)="modals.dismiss()">
            <ion-icon slot="icon-only" name="close-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="tab()" (ionChange)="tab.set($any($event.detail.value))">
          <ion-segment-button value="image">Card</ion-segment-button>
          <ion-segment-button value="text">Text</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content [scrollY]="tab() === 'text'" [class.dark]="tab() === 'image'">
      @if (current(); as card) {
        @if (tab() === 'image') {
          <div
            class="stage"
            (pointerdown)="down($event)"
            (pointermove)="move($event)"
            (pointerup)="up($event)"
            (pointercancel)="up($event)"
          >
            <img
              [src]="bigImage()"
              [alt]="card.name"
              [style.transform]="'translate(' + x() + 'px,' + y() + 'px) scale(' + scale() + ')'"
            />
            @if (deck().length > 1) {
              <button class="step prev" [disabled]="index() === 0" aria-label="Previous card" (click)="step(-1)">
                <ion-icon name="chevron-back" />
              </button>
              <button class="step next" [disabled]="index() === deck().length - 1" aria-label="Next card" (click)="step(1)">
                <ion-icon name="chevron-forward" />
              </button>
            }
            @if (scale() === 1) {
              <p class="hint">
                {{ deck().length > 1 ? 'Swipe for the next card · pinch or double-tap to zoom' : 'Pinch or double-tap to zoom' }}
              </p>
            }
          </div>
        } @else {
          <div class="text">
            <h2>{{ card.name }}</h2>
            <p class="sub">{{ card.number }} · {{ card.rarity }} · {{ card.setName }}</p>

            <div class="stats">
              @for (stat of card.details?.stats ?? []; track stat.label) {
                <div class="stat">
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                </div>
              }
            </div>

            @if (card.details?.effect; as effect) {
              <h3>Effect</h3>
              <p class="body">{{ effect }}</p>
            }
            @if (card.details?.inherited; as inherited) {
              <h3>Inherited effect</h3>
              <p class="body">{{ inherited }}</p>
            }
            @if (card.details?.extra; as extra) {
              <h3>Also</h3>
              <p class="body">{{ extra }}</p>
            }
            @if (!card.details?.effect && !card.details?.inherited) {
              <p class="body muted">
                No card text stored yet. Tap Update on the Games tab to refresh the card list.
              </p>
            }

            @if (prices.rowFor(card); as row) {
              <h3>Market price</h3>
              <p class="body">{{ row.market | money }} for the regular printing.</p>
              @if (row.variants.length) {
                <ul class="variants">
                  @for (variant of row.variants; track variant.label) {
                    <li>
                      <span>{{ variant.label }}</span>
                      <strong>{{ variant.market | money }}</strong>
                    </li>
                  }
                </ul>
              }
            }
          </div>
        }
      }
    </ion-content>
  `,
  styles: `
    ion-content.dark {
      --background: #0b0b0d;
    }
    .stage {
      position: relative;
      height: 100%;
      display: grid;
      place-items: center;
      overflow: hidden;
      touch-action: none;
      img {
        max-width: 100%;
        max-height: 100%;
        transform-origin: center;
        will-change: transform;
        user-select: none;
        -webkit-user-drag: none;
      }
    }
    .step {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      display: grid;
      place-items: center;
      width: 40px;
      height: 56px;
      border: none;
      border-radius: 12px;
      background: rgb(0 0 0 / 0.45);
      color: #fff;
      ion-icon {
        font-size: 22px;
      }
    }
    .step[disabled] {
      opacity: 0.2;
    }
    .step.prev {
      left: 6px;
    }
    .step.next {
      right: 6px;
    }
    .hint {
      position: absolute;
      left: 0;
      right: 0;
      bottom: calc(10px + var(--ion-safe-area-bottom, 0px));
      margin: 0;
      text-align: center;
      font-size: 12px;
      color: #a0aec0;
    }
    .text {
      padding: 16px 16px calc(24px + var(--ion-safe-area-bottom, 0px));
      h2 {
        margin: 0;
        font-size: 20px;
      }
      h3 {
        margin: 20px 0 6px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ion-color-medium);
      }
      .sub {
        margin: 4px 0 0;
        color: var(--ion-color-medium);
        font-size: 13px;
      }
      .body {
        margin: 0;
        font-size: 15px;
        line-height: 1.55;
        white-space: pre-line;
      }
      .muted {
        color: var(--ion-color-medium);
      }
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
      gap: 8px;
      margin-top: 14px;
    }
    .stat {
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--ion-background-color-step-50, #f4f4f4);
      span {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--ion-color-medium);
      }
      strong {
        font-size: 15px;
      }
    }
    .variants {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
      li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 7px 0;
        border-top: 1px solid var(--ion-background-color-step-100, #e4e4e4);
        font-size: 14px;
      }
      span {
        color: var(--ion-color-medium);
      }
    }
  `,
})
export class CardViewerComponent implements OnInit {
  protected readonly modals = inject(ModalController);
  protected readonly prices = inject(PriceService);

  card?: CatalogCard;
  /** The cards to swipe through; defaults to just `card`. */
  cards?: CatalogCard[];

  protected readonly tab = signal<'image' | 'text'>('image');
  protected readonly index = signal(0);
  protected readonly deck = computed(() => (this.cards?.length ? this.cards : this.card ? [this.card] : []));
  protected readonly current = computed(() => this.deck()[this.index()] ?? this.card);
  protected readonly scale = signal(1);
  protected readonly x = signal(0);
  protected readonly y = signal(0);

  /** Prices ship a 430x600 scan; the catalog's own image is 300x419, so prefer the bigger one. */
  protected readonly bigImage = computed(() => {
    const card = this.current();
    if (!card) return '';
    // Never a variant's art here: that would show a different printing than the card asked for.
    return this.prices.rowFor(card)?.image ?? card.image;
  });

  private pointers = new Map<number, { x: number; y: number }>();
  private swipeFrom: { x: number; y: number } | null = null;
  private startDistance = 0;
  private startScale = 1;
  private lastTap = 0;

  constructor() {
    addIcons({ closeOutline, chevronBack, chevronForward });
  }

  ngOnInit(): void {
    const start = this.deck().findIndex(card => card.id === this.card?.id);
    if (start > 0) this.index.set(start);
  }

  protected step(by: number): void {
    const next = this.index() + by;
    if (next < 0 || next >= this.deck().length) return;
    this.index.set(next);
    this.scale.set(1);
    this.centre();
  }

  protected down(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 1) this.swipeFrom = { x: event.clientX, y: event.clientY };
    if (this.pointers.size === 2) {
      this.startDistance = this.distance();
      this.startScale = this.scale();
      return;
    }
    const now = Date.now();
    if (now - this.lastTap < DOUBLE_TAP_MS) this.toggleZoom();
    this.lastTap = now;
  }

  protected move(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size >= 2) {
      const ratio = this.distance() / (this.startDistance || 1);
      this.scale.set(Math.min(MAX_SCALE, Math.max(1, this.startScale * ratio)));
      if (this.scale() === 1) this.centre();
      return;
    }
    if (this.scale() === 1) return;
    this.x.update(value => value + (event.clientX - previous.x));
    this.y.update(value => value + (event.clientY - previous.y));
  }

  protected up(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.startDistance = 0;
    // A flick across an unzoomed card turns the page; zoomed in, the same gesture pans instead.
    const from = this.swipeFrom;
    this.swipeFrom = null;
    if (!from || this.scale() !== 1 || this.deck().length < 2) return;
    const dx = event.clientX - from.x;
    if (Math.abs(dx) > 55 && Math.abs(event.clientY - from.y) < 70) this.step(dx < 0 ? 1 : -1);
  }

  private toggleZoom(): void {
    if (this.scale() > 1) {
      this.scale.set(1);
      this.centre();
    } else {
      this.scale.set(2.6);
    }
  }

  private centre(): void {
    this.x.set(0);
    this.y.set(0);
  }

  private distance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
