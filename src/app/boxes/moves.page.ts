import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonItem,
  IonItemDivider,
  IonItemGroup,
  IonLabel,
  IonList,
  IonNote,
  IonThumbnail,
  IonTitle,
  IonToolbar,
  IonIcon,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline } from 'ionicons/icons';

import { BoxService } from './box.service';
import { Move } from './layout';

interface MoveStep {
  move: Move;
  name: string;
  number: string;
  image: string;
  action: string;
  where: string;
}

@Component({
  selector: 'app-moves',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonList, IonItemGroup, IonItemDivider,
    IonItem, IonLabel, IonNote, IonThumbnail, IonCheckbox, IonFooter, IonButton, IonIcon,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/boxes" />
        </ion-buttons>
        <ion-title>Moves ({{ done().size }}/{{ boxes.moves().length }})</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        @for (group of groups(); track group.title) {
          <ion-item-group>
            <ion-item-divider sticky>
              <ion-label>{{ group.title }}</ion-label>
              <ion-note slot="end">{{ group.steps.length }}</ion-note>
            </ion-item-divider>
            @for (step of group.steps; track step.move.ownedId) {
              <ion-item [class.done]="done().has(step.move.ownedId)">
                <ion-thumbnail slot="start">
                  <img class="card-thumb" [src]="step.image" [alt]="step.name" loading="lazy" />
                </ion-thumbnail>
                <ion-label class="ion-text-wrap">
                  <h2>{{ step.name }} · {{ step.number }}</h2>
                  <p>{{ step.action }}</p>
                  <p>{{ step.where }}</p>
                </ion-label>
                <ion-checkbox
                  slot="end"
                  aria-label="Done"
                  [checked]="done().has(step.move.ownedId)"
                  (ionChange)="mark(step.move.ownedId, $event.detail.checked)"
                />
              </ion-item>
            }
          </ion-item-group>
        } @empty {
          <div class="empty-state">
            <ion-icon name="checkmark-circle-outline" />
            <p>Every card is where it belongs.</p>
          </div>
        }
      </ion-list>
    </ion-content>
    @if (boxes.moves().length) {
      <ion-footer>
        <ion-toolbar>
          <ion-button expand="block" class="ion-padding-horizontal" (click)="finish()">I've made these moves</ion-button>
        </ion-toolbar>
      </ion-footer>
    }
  `,
  styles: `
    ion-thumbnail {
      --size: auto;
      width: 48px;
    }
    .done {
      opacity: 0.45;
    }
  `,
})
export class MovesPage {
  protected readonly boxes = inject(BoxService);
  private readonly router = inject(Router);

  protected readonly done = signal(new Set<number>());

  constructor() {
    addIcons({ checkmarkCircleOutline });
  }

  protected readonly groups = computed(() => {
    const groups = new Map<string, MoveStep[]>();
    for (const move of this.boxes.moves()) {
      const entry = this.boxes.entry(move.ownedId);
      if (!entry) continue;
      const title = move.to
        ? this.boxes.describe({ boxId: move.to.boxId, row: move.to.row })
        : 'Take out (no room)';
      const after = move.after === null ? undefined : this.boxes.entry(move.after);
      const step: MoveStep = {
        move,
        name: entry.card.name,
        number: entry.card.number,
        image: entry.card.image,
        action: move.from
          ? `${move.to ? 'Move' : 'Take'} it from ${this.boxes.describe(move.from)}`
          : 'New card',
        where: move.to
          ? `#${move.to.position + 1}, ${after ? `right after ${after.card.name} (${after.card.number})` : 'at the front of the row'}`
          : 'Add a box or make one bigger to fit it.',
      };
      const steps = groups.get(title) ?? [];
      steps.push(step);
      groups.set(title, steps);
    }
    return [...groups].map(([title, steps]) => ({ title, steps }));
  });

  protected mark(ownedId: number, checked: boolean): void {
    this.done.update(done => {
      const next = new Set(done);
      if (checked) next.add(ownedId);
      else next.delete(ownedId);
      return next;
    });
  }

  protected async finish(): Promise<void> {
    await this.boxes.confirmMoves();
    await this.router.navigateByUrl('/tabs/boxes');
  }
}
