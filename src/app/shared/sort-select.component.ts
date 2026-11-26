import { Component, input, output } from '@angular/core';
import { IonSelect, IonSelectOption } from '@ionic/angular';

import { DEFAULT_SORT, SortId, SortOption } from '../data/card-sort';

/** The "sort by" picker that boxes and lists share; the host places it. */
@Component({
  selector: 'app-sort-select',
  imports: [IonSelect, IonSelectOption],
  template: `
    <ion-select
      [label]="label()"
      interface="action-sheet"
      [interfaceOptions]="{ header: header() }"
      [value]="value() ?? defaultSort"
      (ionChange)="picked.emit($event.detail.value)"
    >
      @for (option of options(); track option.id) {
        <ion-select-option [value]="option.id">{{ option.label }}</ion-select-option>
      }
    </ion-select>
  `,
  styles: `
    :host {
      display: block;
    }
    ion-select {
      padding: 2px 14px;
      border-radius: var(--vault-radius);
      border: 1px solid var(--vault-panel-edge);
      background: var(--vault-panel);
      font-size: 14px;
    }
  `,
})
export class SortSelectComponent {
  readonly options = input.required<SortOption[]>();
  readonly value = input<SortId | undefined>();
  readonly label = input('Sort by');
  readonly header = input('Sort by');
  readonly picked = output<SortId>();

  protected readonly defaultSort = DEFAULT_SORT;
}
