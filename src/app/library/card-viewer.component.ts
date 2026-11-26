import { CardSrcDirective } from '../shared/card-src.directive';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
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

import { CatalogCard, rarityTier } from '../data/models';
import { MoneyPipe } from '../prices/money.pipe';
import { PriceService } from '../prices/price.service';

const MAX_SCALE = 6;
const DOUBLE_TAP_MS = 300;
/** A finger that moves less than this is a tap, not a drag. */
const TAP_SLOP = 12;
/** A swipe turns the card after this far, or after a quick flick of FLICK_MIN at FLICK_SPEED px/ms. */
const SWIPE_MIN = 45;
const FLICK_MIN = 20;
const FLICK_SPEED = 0.35;
/** Degrees the card leans at the very edge of a touch. */
const MAX_TILT = 15;
/** Degrees of phone tilt that lean the card all the way. */
const GYRO_RANGE = 28;

/** -1..1 across the card, from its centre. */
interface Lean {
  nx: number;
  ny: number;
}

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

@Component({
  selector: 'app-card-viewer',
  imports: [CardSrcDirective,
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
            @for (shown of [card]; track shown.id) {
              <div class="deal" [attr.data-from]="dealFrom()">
                <div
                  class="card"
                  [class.tracking]="tracking()"
                  [attr.data-tier]="tier()"
                  [style.transform]="transform()"
                  [style.--gx.%]="light().x"
                  [style.--gy.%]="light().y"
                  [style.--glow]="light().strength"
                  [style.--sx.px]="light().shadowX"
                  [style.--sy.px]="light().shadowY"
                >
                  <img [cardSrc]="bigImage()" [alt]="shown.name" draggable="false" />
                  @if (tier() !== 'common') {
                    <span class="holo"></span>
                    <span class="shimmer"></span>
                  }
                  @if (tier() === 'ultra') {
                    <span class="glitter"></span>
                  }
                  <span class="glare"></span>
                </div>
                @if (tier() !== 'common') {
                  <span class="rarity" [attr.data-tier]="tier()">★ {{ shown.rarity }}</span>
                }
              </div>
            }
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
      container-type: size;
      perspective: 1100px;
    }
    .deal {
      --w: min(92cqw, 80cqh * 63 / 88);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      animation: deal-up 420ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
    }
    .deal[data-from='right'] {
      animation-name: deal-right;
    }
    .deal[data-from='left'] {
      animation-name: deal-left;
    }
    @keyframes deal-up {
      from {
        opacity: 0;
        transform: translateY(40px) scale(0.86) rotateX(24deg);
      }
    }
    @keyframes deal-right {
      from {
        opacity: 0;
        transform: translateX(70%) rotate(9deg) rotateY(-35deg);
      }
    }
    @keyframes deal-left {
      from {
        opacity: 0;
        transform: translateX(-70%) rotate(-9deg) rotateY(35deg);
      }
    }
    .card {
      position: relative;
      width: var(--w);
      aspect-ratio: 63 / 88;
      border-radius: calc(var(--w) * 0.045);
      overflow: hidden;
      transform-origin: center;
      will-change: transform;
      box-shadow: var(--sx, 0px) calc(var(--sy, 0px) + 16px) 38px rgb(0 0 0 / 0.65);
      transition:
        transform 520ms cubic-bezier(0.2, 1.5, 0.4, 1),
        box-shadow 520ms ease;
      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        user-select: none;
        -webkit-user-drag: none;
        pointer-events: none;
      }
    }
    /* Under a finger the card tracks it closely; let go and it springs back. */
    .card.tracking {
      transition:
        transform 70ms linear,
        box-shadow 70ms linear;
    }
    .glare,
    .holo,
    .glitter,
    .shimmer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: var(--glow, 0);
      transition: opacity 300ms ease;
    }
    .glare {
      background: radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgb(255 255 255 / 0.42), rgb(255 255 255 / 0) 50%);
      mix-blend-mode: screen;
    }
    .holo {
      background: linear-gradient(
        115deg,
        transparent 18%,
        rgb(255 0 140 / 0.45) 34%,
        rgb(0 230 255 / 0.45) 46%,
        rgb(255 240 0 / 0.45) 58%,
        rgb(160 80 255 / 0.45) 70%,
        transparent 84%
      );
      background-size: 260% 260%;
      background-position: var(--gx, 50%) var(--gy, 50%);
      mix-blend-mode: color-dodge;
      opacity: calc(var(--glow, 0) * 0.75);
    }
    /* Rares get a gold foil instead of the rainbow. */
    .card[data-tier='rare'] .holo {
      background-image: linear-gradient(
        115deg,
        transparent 25%,
        rgb(255 190 60 / 0.55) 40%,
        rgb(255 240 190 / 0.7) 50%,
        rgb(255 160 30 / 0.55) 60%,
        transparent 75%
      );
      mix-blend-mode: soft-light;
      opacity: var(--glow, 0);
    }
    /* Ultras sparkle where the light falls: three dot grids of prime sizes, so no pattern shows. */
    .glitter {
      background-image:
        radial-gradient(circle, #fff 0 1px, transparent 1.6px),
        radial-gradient(circle, #fff 0 1.2px, transparent 2px),
        radial-gradient(circle, #ffe9a8 0 0.8px, transparent 1.4px);
      background-size: 23px 29px, 41px 37px, 17px 19px;
      background-position:
        calc(var(--gx, 50%) * 0.2) calc(var(--gy, 50%) * 0.3),
        calc(var(--gx, 50%) * -0.3) calc(var(--gy, 50%) * 0.2),
        calc(var(--gy, 50%) * 0.25) calc(var(--gx, 50%) * -0.2);
      mix-blend-mode: screen;
      mask-image: radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), #000, transparent 65%);
      opacity: calc(var(--glow, 0) * 0.95);
    }
    /* A slow light sweep, so a rare shines even when nobody is touching it. */
    .shimmer {
      background: linear-gradient(105deg, rgb(255 255 255 / 0) 40%, rgb(255 255 255 / 0.35) 50%, rgb(255 255 255 / 0) 60%);
      background-size: 300% 100%;
      background-repeat: no-repeat;
      mix-blend-mode: screen;
      opacity: 1;
      animation: viewer-sweep 6s ease-in-out infinite;
    }
    .card[data-tier='ultra'] .shimmer {
      background-image: linear-gradient(
        105deg,
        rgb(255 255 255 / 0) 32%,
        rgb(255 60 170 / 0.4) 43%,
        rgb(80 230 255 / 0.4) 50%,
        rgb(255 235 80 / 0.4) 57%,
        rgb(255 255 255 / 0) 68%
      );
      animation-duration: 4.5s;
    }
    @keyframes viewer-sweep {
      0%,
      50% {
        background-position: 130% 0;
      }
      85%,
      100% {
        background-position: -30% 0;
      }
    }
    .rarity {
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      white-space: nowrap;
    }
    .rarity[data-tier='rare'] {
      color: #f7c95a;
      border: 1px solid rgb(247 183 51 / 0.6);
      background: rgb(247 183 51 / 0.12);
      box-shadow: 0 0 14px rgb(247 183 51 / 0.25);
    }
    .rarity[data-tier='ultra'] {
      color: #fff;
      background: linear-gradient(90deg, #ff4fb4, #ffb84f, #4fffd2, #4fa8ff, #b44fff);
      box-shadow: 0 0 16px rgb(168 85 247 / 0.5);
      text-shadow: 0 1px 2px rgb(0 0 0 / 0.45);
      animation: viewer-rainbow 6s linear infinite;
    }
    @keyframes viewer-rainbow {
      to {
        filter: hue-rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .deal {
        animation: none;
      }
      .card {
        transition: none;
      }
      .shimmer,
      .rarity {
        animation: none;
      }
      .shimmer {
        display: none;
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
    return card.imageLarge ?? this.prices.rowFor(card)?.image ?? card.image;
  });

  protected readonly tier = computed(() => rarityTier(this.current()!));
  protected readonly dealFrom = signal<'up' | 'left' | 'right'>('up');
  private readonly touch = signal<Lean | null>(null);
  private readonly gyro = signal<Lean>({ nx: 0, ny: 0 });
  private readonly dragX = signal(0);
  /** Any finger down: zoom, pan and tilt follow it directly instead of springing. */
  protected readonly tracking = signal(false);
  protected readonly held = computed(() => !!this.touch() && this.scale() === 1);
  private readonly lean = computed<Lean>(() => (this.scale() > 1 ? { nx: 0, ny: 0 } : (this.touch() ?? this.gyro())));

  protected readonly transform = computed(() => {
    const { nx, ny } = this.lean();
    const lift = this.held() ? 1.04 : 1;
    const drag = this.dragX();
    return (
      `translate(${this.x() + drag}px, ${this.y()}px) scale(${this.scale() * lift}) ` +
      `rotateX(${-ny * MAX_TILT}deg) rotateY(${nx * MAX_TILT}deg) rotate(${drag * 0.035}deg)`
    );
  });

  /** Where the light catches the card, and how strongly: full under a finger, gentler from the phone's tilt. */
  protected readonly light = computed(() => {
    const { nx, ny } = this.lean();
    const strength = this.held() ? 1 : Math.min(1, Math.hypot(nx, ny) * 1.4) * 0.8;
    return { x: 50 + nx * 50, y: 50 + ny * 50, strength, shadowX: -nx * 18, shadowY: -ny * 14 };
  });

  private pointers = new Map<number, { x: number; y: number }>();
  private cardRect: DOMRect | null = null;
  private gyroBase: { beta: number; gamma: number } | null = null;
  private swipeFrom: { x: number; y: number; at: number } | null = null;
  private startDistance = 0;
  private startScale = 1;
  /** The last finger lifted without moving, for spotting a double-tap. */
  private lastTap: { x: number; y: number; at: number } | null = null;

  constructor() {
    addIcons({ closeOutline, chevronBack, chevronForward });
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const listener = (event: DeviceOrientationEvent) => this.tilted(event);
      addEventListener('deviceorientation', listener);
      inject(DestroyRef).onDestroy(() => removeEventListener('deviceorientation', listener));
    }
  }

  ngOnInit(): void {
    const start = this.deck().findIndex(card => card.id === this.card?.id);
    if (start > 0) this.index.set(start);
  }

  /** The phone's lean relative to how it's being held; the rest position drifts so any grip feels level. */
  private tilted({ beta, gamma }: DeviceOrientationEvent): void {
    if (beta === null || gamma === null) return;
    const base = (this.gyroBase ??= { beta, gamma });
    base.beta += (beta - base.beta) * 0.015;
    base.gamma += (gamma - base.gamma) * 0.015;
    const target = { nx: clamp((gamma - base.gamma) / GYRO_RANGE), ny: clamp(-(beta - base.beta) / GYRO_RANGE) };
    const now = this.gyro();
    // Smoothed, so sensor jitter doesn't make the card shiver.
    const next = { nx: now.nx + (target.nx - now.nx) * 0.25, ny: now.ny + (target.ny - now.ny) * 0.25 };
    if (Math.abs(next.nx - now.nx) + Math.abs(next.ny - now.ny) > 0.004) this.gyro.set(next);
  }

  private leanAt(event: PointerEvent): void {
    const rect = this.cardRect;
    if (!rect) return;
    this.touch.set({
      nx: clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)),
      ny: clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)),
    });
  }

  protected step(by: number): void {
    const next = this.index() + by;
    if (next < 0 || next >= this.deck().length) return;
    this.dealFrom.set(by > 0 ? 'right' : 'left');
    this.dragX.set(0);
    this.index.set(next);
    this.scale.set(1);
    this.centre();
  }

  protected down(event: PointerEvent): void {
    // The arrow buttons handle their own taps; tapped quickly they'd otherwise read as a double-tap.
    if ((event.target as HTMLElement).closest('.step')) return;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 1) {
      this.swipeFrom = { x: event.clientX, y: event.clientY, at: event.timeStamp };
      this.cardRect = (event.currentTarget as HTMLElement).querySelector('.card')?.getBoundingClientRect() ?? null;
      if (this.scale() === 1) this.leanAt(event);
    }
    if (this.pointers.size === 2) {
      // A pinch is never a swipe, even when one finger lifts well to the side.
      this.swipeFrom = null;
      this.touch.set(null);
      this.dragX.set(0);
      this.startDistance = this.distance();
      this.startScale = this.scale();
    }
  }

  protected move(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.tracking.set(true);

    if (this.pointers.size >= 2) {
      const ratio = this.distance() / (this.startDistance || 1);
      this.scale.set(Math.min(MAX_SCALE, Math.max(1, this.startScale * ratio)));
      if (this.scale() === 1) this.centre();
      return;
    }
    if (this.scale() === 1) {
      this.leanAt(event);
      // The card follows a sideways drag (only a little when there's nowhere to swipe to).
      if (this.swipeFrom) this.dragX.set((event.clientX - this.swipeFrom.x) * (this.deck().length > 1 ? 0.85 : 0.2));
      return;
    }
    this.x.update(value => value + (event.clientX - previous.x));
    this.y.update(value => value + (event.clientY - previous.y));
  }

  protected up(event: PointerEvent): void {
    // A cancelled touch can report 0,0; its last move is where the finger really was.
    const last = this.pointers.get(event.pointerId);
    const end = event.type === 'pointercancel' && last ? last : { x: event.clientX, y: event.clientY };
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.startDistance = 0;
    if (!this.pointers.size) {
      this.tracking.set(false);
      this.touch.set(null);
      this.dragX.set(0);
    }
    const from = this.swipeFrom;
    this.swipeFrom = null;
    if (!from || this.pointers.size) return;
    const dx = end.x - from.x;
    const dy = end.y - from.y;

    if (Math.hypot(dx, dy) < TAP_SLOP) {
      // Only two taps in one spot zoom, so quick swipes one after another never do.
      const tap = this.lastTap;
      const double = tap && event.timeStamp - tap.at < DOUBLE_TAP_MS && Math.hypot(end.x - tap.x, end.y - tap.y) < 40;
      this.lastTap = double ? null : { ...end, at: event.timeStamp };
      if (double) this.toggleZoom();
      return;
    }
    this.lastTap = null;

    // A sideways swipe across an unzoomed card turns the page; zoomed in, the same gesture pans instead.
    if (this.scale() !== 1 || this.deck().length < 2 || Math.abs(dx) < Math.abs(dy)) return;
    const speed = Math.abs(dx) / Math.max(1, event.timeStamp - from.at);
    if (Math.abs(dx) >= SWIPE_MIN || (Math.abs(dx) >= FLICK_MIN && speed >= FLICK_SPEED)) this.step(dx < 0 ? 1 : -1);
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
