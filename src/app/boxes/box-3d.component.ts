import { Component, computed, input, linkedSignal, signal } from '@angular/core';

import { BoxColor, BoxShape, boxColor } from './box-models';

interface Dimensions {
  w: number;
  h: number;
  d: number;
}

/** Design sizes in px; the whole box is scaled to fit wherever it is used. */
const SIZES: Record<BoxShape, Dimensions> = {
  storage: { w: 190, h: 86, d: 112 },
  deck: { w: 78, h: 118, d: 58 },
  binder: { w: 150, h: 186, d: 34 },
};

const DEFAULT_TILT = -20;
const DEFAULT_TURN = -32;
const BINDER_TURN = 34;
const WALL = 6;
const MAX_LANES = 8;

@Component({
  selector: 'app-box-3d',
  host: { '[class.interactive]': 'interactive()' },
  template: `
    <div
      class="scene"
      [style.--w.px]="dims().w"
      [style.--h.px]="dims().h"
      [style.--d.px]="dims().d"
      [style.--scale]="scale()"
      [style.--front]="color().front"
      [style.--top]="color().top"
      [style.--side]="color().side"
      [style.height.px]="sceneHeight()"
    >
      <div
        class="box"
        [class.spinning]="dragging()"
        [style.transform]="'scale(' + scale() + ') rotateX(' + tilt() + 'deg) rotateY(' + turn() + 'deg)'"
        (pointerdown)="grab($event)"
        (pointermove)="drag($event)"
        (pointerup)="release($event)"
        (pointercancel)="release($event)"
      >
        @switch (shape()) {
          @case ('storage') {
            <div class="face bottom"></div>
            <div class="face back"></div>
            <div class="face left"></div>
            <div class="face right"></div>
            @for (lane of lanes(); track lane.row) {
              @if (lane.fill > 0) {
                <div class="lane" [style.--fill]="lane.fill" [style.--ld.px]="laneDepth()" [style.--lz.px]="lane.z">
                  <div class="face l-top"></div>
                  <div class="face l-front"></div>
                  <div class="face l-right"></div>
                </div>
              }
            }
            @for (wall of dividers(); track wall) {
              <div class="face divider" [style.--dz.px]="wall"></div>
            }
            <div class="face front">
              <span class="plate">{{ label() }}</span>
            </div>
          }
          @case ('deck') {
            <div class="face bottom"></div>
            <div class="face back"></div>
            <div class="face left"></div>
            <div class="face right"></div>
            <div class="face top"></div>
            <div class="face front">
              <span class="plate">{{ label() }}</span>
              <span class="seam"></span>
            </div>
          }
          @default {
            <div class="face bottom"></div>
            <div class="face back"></div>
            <div class="face left spine">
              <i></i><i></i><i></i>
            </div>
            <div class="face right pages" [style.--fill]="filled()"></div>
            <div class="face top"></div>
            <div class="face front">
              <span class="plate">{{ label() }}</span>
            </div>
          }
        }
      </div>
      <div class="ground"></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      touch-action: pan-y;
    }
    .scene {
      position: relative;
      display: grid;
      place-items: center;
      perspective: 760px;
    }
    .box {
      position: relative;
      width: var(--w);
      height: var(--h);
      transform-style: preserve-3d;
      will-change: transform;
    }
    .box:not(.spinning) {
      transition: transform 0.35s ease-out;
    }
    :host(.interactive) .box {
      cursor: grab;
    }
    .face {
      position: absolute;
      background: var(--front);
      backface-visibility: visible;
    }
    .front,
    .back {
      width: var(--w);
      height: var(--h);
    }
    .front {
      transform: translateZ(calc(var(--d) / 2));
      display: grid;
      place-items: center;
    }
    .back {
      background: var(--side);
      transform: rotateY(180deg) translateZ(calc(var(--d) / 2));
    }
    .left,
    .right {
      width: var(--d);
      height: var(--h);
      left: calc((var(--w) - var(--d)) / 2);
      background: var(--side);
    }
    .left {
      transform: rotateY(-90deg) translateZ(calc(var(--w) / 2));
    }
    .right {
      transform: rotateY(90deg) translateZ(calc(var(--w) / 2));
      background: var(--top);
      filter: brightness(0.86);
    }
    .top,
    .bottom {
      width: var(--w);
      height: var(--d);
      top: calc((var(--h) - var(--d)) / 2);
      background: var(--top);
    }
    .top {
      transform: rotateX(90deg) translateZ(calc(var(--h) / 2));
    }
    .bottom {
      background: #1a202c;
      transform: rotateX(-90deg) translateZ(calc(var(--h) / 2));
    }
    .plate {
      max-width: 78%;
      padding: 3px 7px;
      border-radius: 4px;
      background: rgb(255 255 255 / 0.85);
      color: #1a202c;
      font-size: 9px;
      font-weight: 700;
      line-height: 1.2;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* One lane of cards per row of the real box, each standing on edge and as long as that row is full. */
    .lane {
      position: absolute;
      left: ${WALL}px;
      bottom: 0;
      width: var(--sw);
      height: var(--sh);
      transform: translateZ(var(--lz));
      transform-style: preserve-3d;
      --sw: calc((var(--w) - ${WALL * 2}px) * var(--fill));
      --sh: calc(var(--h) * 0.9);
      --sd: calc(var(--ld) - 2px);
    }
    .l-top {
      width: var(--sw);
      height: var(--sd);
      top: calc((var(--sh) - var(--sd)) / 2);
      background: repeating-linear-gradient(90deg, #f7fafc 0 2px, #a0aec0 2px 3px);
      transform: rotateX(90deg) translateZ(calc(var(--sh) / 2));
    }
    .l-front {
      width: var(--sw);
      height: var(--sh);
      background: linear-gradient(#edf2f7, #cbd5e0);
      transform: translateZ(calc(var(--sd) / 2));
    }
    .l-right {
      width: var(--sd);
      height: var(--sh);
      left: calc((var(--sw) - var(--sd)) / 2);
      background: repeating-linear-gradient(90deg, #e2e8f0 0 2px, #a0aec0 2px 3px);
      transform: rotateY(90deg) translateZ(calc(var(--sw) / 2));
    }
    /* Cardboard walls between the rows. */
    .divider {
      width: calc(var(--w) - ${WALL * 2}px);
      height: calc(var(--h) * 0.72);
      left: ${WALL}px;
      top: calc(var(--h) * 0.28);
      background: var(--top);
      filter: brightness(0.78);
      transform: translateZ(var(--dz));
    }

    .seam {
      position: absolute;
      left: 0;
      right: 0;
      top: 26%;
      height: 2px;
      background: rgb(0 0 0 / 0.25);
    }
    .spine {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 14px;
      i {
        width: 9px;
        height: 9px;
        border: 2px solid #e2e8f0;
        border-radius: 50%;
      }
    }
    .pages {
      background: linear-gradient(90deg, #f7fafc, #cbd5e0);
      opacity: calc(0.25 + 0.75 * var(--fill));
    }
    .ground {
      position: absolute;
      bottom: 6%;
      width: 60%;
      height: 14px;
      border-radius: 50%;
      background: rgb(0 0 0 / 0.35);
      filter: blur(7px);
    }
  `,
})
export class Box3dComponent {
  readonly shape = input<BoxShape>('storage');
  readonly colorId = input<string>('blue');
  readonly fill = input(0);
  /** How full each row is, 0..1; its length is how many rows the box has. */
  readonly rowFills = input<number[]>([]);
  readonly label = input('Box');
  readonly scale = input(1);
  readonly interactive = input(false);

  protected readonly tilt = signal(DEFAULT_TILT);
  /** Resets when the shape changes — a binder shows its spine — but a drag can still turn it. */
  protected readonly turn = linkedSignal<number>(() => (this.shape() === 'binder' ? BINDER_TURN : DEFAULT_TURN));
  protected readonly dragging = signal(false);

  protected readonly color = computed<BoxColor>(() => boxColor(this.colorId()));
  protected readonly filled = computed(() => Math.min(1, Math.max(0, this.fill())));
  protected readonly dims = computed(() => SIZES[this.shape()]);
  protected readonly rowCount = computed(() => Math.max(1, Math.min(MAX_LANES, this.rowFills().length || 1)));
  protected readonly laneDepth = computed(() => (this.dims().d - WALL * 2) / this.rowCount());
  protected readonly lanes = computed(() => {
    const interior = this.dims().d - WALL * 2;
    const depth = this.laneDepth();
    return this.rowFills()
      .slice(0, MAX_LANES)
      .map((fill, row) => ({
        row,
        fill: Math.min(1, Math.max(0, fill)),
        z: Math.round(interior / 2 - depth * (row + 0.5)),
      }));
  });
  protected readonly dividers = computed(() => {
    const interior = this.dims().d - WALL * 2;
    const depth = this.laneDepth();
    return Array.from({ length: this.rowCount() - 1 }, (_, i) => Math.round(interior / 2 - depth * (i + 1)));
  });
  protected readonly sceneHeight = computed(() => {
    const { h, d } = this.dims();
    return Math.round((h + d * 0.85 + 26) * this.scale());
  });

  private last: { x: number; y: number } | null = null;

  protected grab(event: PointerEvent): void {
    if (!this.interactive()) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.last = { x: event.clientX, y: event.clientY };
    this.dragging.set(true);
  }

  protected drag(event: PointerEvent): void {
    if (!this.last) return;
    const dx = event.clientX - this.last.x;
    const dy = event.clientY - this.last.y;
    this.last = { x: event.clientX, y: event.clientY };
    this.turn.update(value => value + dx * 0.45);
    this.tilt.update(value => Math.min(16, Math.max(-78, value - dy * 0.35)));
  }

  protected release(event: PointerEvent): void {
    if (!this.last) return;
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.last = null;
    this.dragging.set(false);
  }
}
