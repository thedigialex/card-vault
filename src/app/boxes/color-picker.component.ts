import { Component, computed, linkedSignal, model, signal } from '@angular/core';
import { IonInput, IonItem, IonList } from '@ionic/angular';

import { BOX_COLORS, Hsv, boxColor, hexToHsv, hsvToHex, normalizeHex } from './box-models';

/** The shared palette plus any #rrggbb, for boxes and lists. */
@Component({
  selector: 'app-color-picker',
  imports: [IonList, IonItem, IonInput],
  template: `
    <h3 class="form-section">Color</h3>
    <div class="swatches">
      @for (option of colors; track option.id) {
        <button
          class="swatch"
          [class.picked]="value() === option.id"
          [style.background]="option.front"
          [attr.aria-label]="option.name"
          [attr.aria-pressed]="value() === option.id"
          (click)="value.set(option.id)"
        ></button>
      }
      <button
        class="swatch custom"
        [class.picked]="isCustom()"
        [style.background]="isCustom() ? hex() : null"
        aria-label="Color wheel"
        [attr.aria-expanded]="wheelOpen()"
        (click)="wheelOpen.set(!wheelOpen())"
      ></button>
    </div>

    @if (wheelOpen()) {
      <div class="wheel-panel">
        <div
          class="wheel"
          [style.--dim]="1 - hsv().v"
          (pointerdown)="grab($event)"
          (pointermove)="drag($event)"
          (pointerup)="release($event)"
          (pointercancel)="release($event)"
        >
          <span class="marker" [style.left.%]="marker().x" [style.top.%]="marker().y" [style.background]="hex()"></span>
        </div>
        <div class="brightness" [style.--full]="fullBright()">
          <span>Brightness</span>
          <input
            type="range"
            min="0"
            max="100"
            aria-label="Brightness"
            [value]="round(hsv().v * 100)"
            (input)="setHsv({ v: +$any($event.target).value / 100 })"
          />
        </div>
      </div>
    }

    <ion-list inset>
      <ion-item>
        <span slot="start" class="hex-dot" [style.background]="hex()"></span>
        <ion-input
          label="Hex"
          labelPlacement="stacked"
          placeholder="#ffffff"
          maxlength="7"
          autocapitalize="off"
          [value]="hex()"
          (ionInput)="setHex($event.detail.value)"
        />
      </ion-item>
    </ion-list>
  `,
  styles: `
    :host {
      display: block;
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
    .swatch.custom {
      background: conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
    }
    .wheel-panel {
      margin: 16px 16px 0;
      padding: 18px 16px 14px;
      border-radius: var(--vault-radius);
      border: 1px solid var(--vault-panel-edge);
      background: var(--vault-panel);
    }
    /* Angle = hue (clockwise from red at the top), distance from the middle = saturation. */
    .wheel {
      position: relative;
      width: min(100%, 240px);
      aspect-ratio: 1;
      margin: 0 auto;
      border-radius: 50%;
      background:
        radial-gradient(closest-side, #fff, rgb(255 255 255 / 0)),
        conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
      box-shadow: 0 4px 18px rgb(0 0 0 / 0.45);
      touch-action: none;
      &::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: #000;
        opacity: var(--dim);
        pointer-events: none;
      }
    }
    .marker {
      position: absolute;
      z-index: 1;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 3px solid #fff;
      box-shadow: 0 1px 6px rgb(0 0 0 / 0.6);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .brightness {
      margin-top: 16px;
      span {
        display: block;
        margin-bottom: 6px;
        font-size: 12px;
        color: var(--ion-color-medium);
      }
      input {
        width: 100%;
        height: 14px;
        margin: 0;
        border-radius: 7px;
        background: linear-gradient(to right, #000, var(--full));
        appearance: none;
        -webkit-appearance: none;
      }
      input::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 3px solid #fff;
        background: transparent;
        box-shadow: 0 1px 6px rgb(0 0 0 / 0.6);
      }
      input::-moz-range-thumb {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid #fff;
        background: transparent;
        box-shadow: 0 1px 6px rgb(0 0 0 / 0.6);
      }
    }
    .hex-dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgb(255 255 255 / 0.2);
    }
  `,
})
export class ColorPickerComponent {
  /** A BOX_COLORS id or a #rrggbb hex. */
  readonly value = model.required<string>();

  protected readonly colors = BOX_COLORS;
  protected readonly hex = computed(() => boxColor(this.value()).front);
  protected readonly isCustom = computed(() => this.value().startsWith('#'));
  protected readonly wheelOpen = signal(false);

  /** Keeps the wheel's own hue while it still produces the same hex (black or grey would otherwise reset it to red). */
  protected readonly hsv = linkedSignal<string, Hsv>({
    source: this.hex,
    computation: (hex, previous) => (previous && hsvToHex(previous.value) === hex ? previous.value : hexToHsv(hex)),
  });

  protected readonly marker = computed(() => {
    const { h, s } = this.hsv();
    const angle = (h * Math.PI) / 180;
    return { x: 50 + 50 * s * Math.sin(angle), y: 50 - 50 * s * Math.cos(angle) };
  });
  protected readonly fullBright = computed(() => hsvToHex({ ...this.hsv(), v: 1 }));

  protected readonly round = Math.round;

  protected setHsv(change: Partial<Hsv>): void {
    const next = { ...this.hsv(), ...change };
    this.hsv.set(next);
    this.value.set(hsvToHex(next));
  }

  protected grab(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.pick(event);
  }

  protected drag(event: PointerEvent): void {
    if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) this.pick(event);
  }

  protected release(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }

  private pick(event: PointerEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = event.clientX - rect.left - radius;
    const dy = event.clientY - rect.top - radius;
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / radius);
    // Picking on a black wheel would show nothing, so the first touch brings the brightness up.
    this.setHsv({ h, s, v: this.hsv().v < 0.15 ? 1 : this.hsv().v });
  }

  /** Only a full six-digit hex counts, so "#abc" on the way to "#abcdef" doesn't flash a color. */
  protected setHex(value: string | null | undefined): void {
    const typed = (value ?? '').trim();
    if (/^#?[0-9a-f]{6}$/i.test(typed)) this.value.set(normalizeHex(typed)!);
  }
}
