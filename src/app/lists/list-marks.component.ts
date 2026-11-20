import { Component, computed, inject, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { boxColor } from '../boxes/box-models';
import { registerListIcons } from './list-models';
import { ListService } from './list.service';

const SHOWN = 2;

@Component({
  selector: 'app-list-marks',
  imports: [IonIcon],
  template: `
    @if (marks().length) {
      <span class="marks" [attr.aria-label]="label()">
        @for (mark of marks().slice(0, shown); track mark.id) {
          <i [style.background]="mark.tint"><ion-icon [name]="mark.icon" /></i>
        }
        @if (marks().length > shown) {
          <i class="more">+{{ marks().length - shown }}</i>
        }
      </span>
    }
  `,
  styles: `
    .marks {
      position: absolute;
      right: 4px;
      bottom: 22px;
      display: flex;
      gap: 3px;
    }
    i {
      display: grid;
      place-items: center;
      width: 17px;
      height: 17px;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgb(0 0 0 / 0.55);
      font-size: 9px;
      font-style: normal;
      font-weight: 800;
      color: #fff;
    }
    .more {
      background: rgb(0 0 0 / 0.7);
    }
    ion-icon {
      font-size: 10px;
      color: #fff;
    }
  `,
})
export class ListMarksComponent {
  private readonly lists = inject(ListService);

  /** Marks for one copy; `cardId` instead marks any copy of that card. */
  readonly ownedId = input<number>();
  readonly cardId = input<string>();

  protected readonly shown = SHOWN;

  protected readonly marks = computed(() => {
    const ids = this.ownedId() !== undefined ? this.lists.listsOf(this.ownedId()!) : this.lists.listsOfCard(this.cardId() ?? '');
    return ids
      .map(id => this.lists.listById(id))
      .filter(list => !!list)
      .map(list => ({ id: list.id!, icon: list.icon, tint: boxColor(list.color).front }));
  });

  protected readonly label = computed(() => {
    const count = this.marks().length;
    return `On ${count} ${count === 1 ? 'list' : 'lists'}`;
  });

  constructor() {
    registerListIcons();
  }
}
