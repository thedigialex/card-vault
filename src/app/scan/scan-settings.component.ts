import { Component, OnInit, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';

/** Opened from the scanner; changes apply as soon as they're picked. Props are plain fields (ion-modal sets them). */
@Component({
  selector: 'app-scan-settings',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonSelect,
    IonSelectOption, IonNote, IonToggle,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Scanner settings</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="modals.dismiss()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list inset>
        <ion-item>
          <ion-select label="Game" labelPlacement="stacked" interface="action-sheet" [value]="game()" (ionChange)="pickGame($event.detail.value)">
            <ion-select-option value="auto">Auto-detect</ion-select-option>
            @for (option of games; track option.id) {
              <ion-select-option [value]="option.id">{{ option.name }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-list>
      <ion-note class="note">Auto-detect works out the game from the card's printed words. Pick one to lock the scanner to it.</ion-note>

      <ion-list inset>
        <ion-item>
          <ion-select label="File into" labelPlacement="stacked" interface="action-sheet" [value]="box()" (ionChange)="pickBox($event.detail.value)">
            <ion-select-option [value]="0">Unboxed pile</ion-select-option>
            @for (option of boxes; track option.id) {
              <ion-select-option [value]="option.id">{{ option.name }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-list>
      <ion-note class="note">
        Where each scanned copy goes. Only hand-sorted boxes are listed; auto-sorted boxes fill themselves.
      </ion-note>

      <ion-list inset>
        <ion-item>
          <ion-select label="Rescan after" labelPlacement="stacked" interface="popover" [value]="delay()" (ionChange)="pickDelay($event.detail.value)">
            @for (option of delays; track option) {
              <ion-select-option [value]="option">{{ option }} seconds</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-list>
      <ion-note class="note">In Auto mode, how long to wait after adding a card before reading the next one.</ion-note>

      <ion-list inset>
        <ion-item>
          <ion-toggle [checked]="soundOn()" (ionChange)="pickSound($event.detail.checked)">Sound</ion-toggle>
        </ion-item>
      </ion-list>
      <ion-note class="note">Beeps when a card is found or added.</ion-note>
    </ion-content>
  `,
  styles: `
    .note {
      display: block;
      margin: -6px 22px 8px;
      font-size: 12px;
      line-height: 1.4;
    }
  `,
})
export class ScanSettingsComponent implements OnInit {
  protected readonly modals = inject(ModalController);

  games: { id: string; name: string }[] = [];
  boxes: { id?: number; name: string }[] = [];
  gameChoice = 'auto';
  boxChoice = 0;
  onGame: (id: string) => void = () => undefined;
  onBox: (id: number) => void = () => undefined;
  sound = true;
  delays: number[] = [];
  delayChoice = 3;
  onDelay: (seconds: number) => void = () => undefined;
  onSound: (on: boolean) => void = () => undefined;

  protected readonly game = signal('auto');
  protected readonly box = signal(0);
  protected readonly soundOn = signal(true);
  protected readonly delay = signal(3);

  ngOnInit(): void {
    this.game.set(this.gameChoice);
    this.box.set(this.boxChoice);
    this.soundOn.set(this.sound);
    this.delay.set(this.delayChoice);
  }

  protected pickGame(id: string): void {
    this.game.set(id);
    this.onGame(id);
  }

  protected pickDelay(seconds: number): void {
    this.delay.set(seconds);
    this.onDelay(seconds);
  }

  protected pickSound(on: boolean): void {
    this.soundOn.set(on);
    this.onSound(on);
  }

  protected pickBox(id: number): void {
    this.box.set(id);
    this.onBox(id);
  }
}
