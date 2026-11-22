import { Component, computed, model } from '@angular/core';
import { IonInput, IonItem, IonList } from '@ionic/angular';

import { BOX_COLORS, boxColor, normalizeHex } from './box-models';

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
      <label class="swatch custom" [class.picked]="isCustom()" [style.background]="isCustom() ? hex() : null">
        <input type="color" aria-label="Pick any color" [value]="hex()" (input)="value.set($any($event.target).value)" />
      </label>
    </div>
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
      position: relative;
      background: conic-gradient(#f56565, #ecc94b, #48bb78, #4299e1, #9f7aea, #ed64a6, #f56565);
      input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        border: 0;
        padding: 0;
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

  /** Only a full six-digit hex counts, so "#abc" on the way to "#abcdef" doesn't flash a color. */
  protected setHex(value: string | null | undefined): void {
    const typed = (value ?? '').trim();
    if (/^#?[0-9a-f]{6}$/i.test(typed)) this.value.set(normalizeHex(typed)!);
  }
}
