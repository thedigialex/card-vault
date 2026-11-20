import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { TextRecognition } from '@capacitor-mlkit/text-recognition';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { volumeHighOutline, volumeMuteOutline } from 'ionicons/icons';

import { BoxService } from '../boxes/box.service';
import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { CatalogCard, REGULAR_PRINTING, printingLabel } from '../data/models';
import { gameById } from '../games/games';
import { NotifyService } from '../shared/notify.service';
import { RepeatGuard, acceptable, afterAdd, afterFrame, emptyGuard } from './auto-scan';
import { ScanSoundService } from './scan-sound';

const FRAME_INTERVAL_MS = 600;
const FRAME_MAX_SIDE = 1600;

interface AddedCard {
  card: CatalogCard;
  ownedId: number;
}

@Component({
  selector: 'app-scan',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonContent, IonSegment, IonSegmentButton,
    IonChip, IonItem, IonInput, IonIcon, IonSelect, IonSelectOption, IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/add" />
        </ion-buttons>
        <ion-title>Scan cards</ion-title>
        <ion-buttons slot="end">
          <ion-button [attr.aria-label]="muted() ? 'Unmute' : 'Mute'" (click)="muted.set(!muted())">
            <ion-icon slot="icon-only" [name]="muted() ? 'volume-mute-outline' : 'volume-high-outline'" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="mode()" (ionChange)="setMode($any($event.detail.value))">
          <ion-segment-button value="manual">One at a time</ion-segment-button>
          <ion-segment-button value="auto">Auto</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      <ion-toolbar>
        <ion-item lines="none">
          <ion-select label="File into" labelPlacement="fixed" interface="action-sheet" [value]="targetBox()" (ionChange)="targetBox.set($event.detail.value)">
            <ion-select-option [value]="0">Unboxed pile</ion-select-option>
            @for (box of handSorted(); track box.id) {
              <ion-select-option [value]="box.id">{{ box.name }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-toolbar>
      @if (mode() === 'auto') {
        <ion-toolbar>
          <ion-item lines="none">
            <ion-select label="Rescan after" labelPlacement="fixed" interface="popover" [value]="delay()" (ionChange)="delay.set($event.detail.value)">
              @for (option of delays; track option) {
                <ion-select-option [value]="option">{{ option }} seconds</ion-select-option>
              }
            </ion-select>
          </ion-item>
        </ion-toolbar>
      }
    </ion-header>
    <ion-content [scrollY]="false">
      <div class="layout">
        <div class="viewfinder">
          <video #video playsinline muted [class.live]="ready()"></video>
          @if (!ready()) {
            <div class="starting">
              @if (!failed()) {
                <ion-spinner name="crescent" />
              }
              <p>{{ status() }}</p>
            </div>
          }
          <div class="guide" [class.locked]="found() || cooldown() > 0"></div>
          @if (ready()) {
            <p class="status">
              @if (cooldown() > 0) {
                Next card in {{ cooldown() }}…
              } @else {
                {{ status() }}
              }
            </p>
          }
          @if (added().length) {
            <div class="tally">{{ added().length }} added</div>
          }
        </div>

        @if (found(); as card) {
          <div class="result">
            <img class="card-thumb" [src]="card.image" [alt]="card.name" />
            <div class="details">
              <h2>{{ card.name }}</h2>
              <p>{{ card.number }} · {{ card.rarity }}</p>
              <p class="set">{{ card.setName }}</p>
              @if (collection.countsByCard().get(card.id); as owned) {
                <p>You own {{ owned }}</p>
              }
              @if (card.printings.length) {
                <div class="printings">
                  <ion-chip [outline]="printing() !== regular" (click)="printing.set(regular)">Regular</ion-chip>
                  @for (p of card.printings; track p.id) {
                    <ion-chip [outline]="printing() !== p.id" (click)="printing.set(p.id)">{{ p.label }}</ion-chip>
                  }
                </div>
              }
              <div class="actions">
                <ion-button fill="outline" (click)="skip()">Not this</ion-button>
                <ion-button (click)="add(card)">Add</ion-button>
              </div>
            </div>
          </div>
        } @else if (mode() === 'auto' && added().length) {
          <div class="recent">
            <div class="last">
              <img class="card-thumb" [src]="added()[0].card.image" [alt]="added()[0].card.name" />
              <div>
                <strong>{{ added()[0].card.name }}</strong>
                <p>{{ added()[0].card.number }} added</p>
              </div>
              <ion-button fill="clear" size="small" (click)="undo()">Undo</ion-button>
            </div>
            <div class="strip">
              @for (entry of added().slice(1, 8); track entry.ownedId) {
                <img class="card-thumb" [src]="entry.card.image" [alt]="entry.card.name" />
              }
            </div>
          </div>
        } @else if (!native) {
          <ion-item class="manual">
            <ion-input
              label="Card number"
              labelPlacement="stacked"
              placeholder="BT1-084"
              (keyup.enter)="manual($any($event.target).value)"
            />
          </ion-item>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .layout {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .viewfinder {
      position: relative;
      flex: 1;
      min-height: 0;
      background: #000;
      overflow: hidden;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      transition: opacity 0.25s;
    }
    video.live {
      opacity: 1;
    }
    .starting {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: #cbd5e0;
      text-align: center;
      padding: 0 24px;
      p {
        margin: 0;
      }
    }
    .guide {
      position: absolute;
      inset: 0;
      margin: auto;
      width: min(70%, 320px);
      aspect-ratio: var(--card-ratio);
      border: 3px solid rgb(255 255 255 / 0.8);
      border-radius: 12px;
      box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.35);
      transition: border-color 0.2s;
    }
    .guide.locked {
      border-color: var(--ion-color-success);
    }
    .status {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 12px;
      margin: 0;
      text-align: center;
      color: #fff;
      text-shadow: 0 1px 3px #000;
    }
    .tally {
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 4px 10px;
      border-radius: 12px;
      background: rgb(0 0 0 / 0.55);
      color: #fff;
      font-size: 12px;
    }
    .result {
      display: flex;
      gap: 12px;
      padding: 12px 16px calc(12px + var(--ion-safe-area-bottom, 0px));
      background: var(--ion-background-color, #fff);
      img {
        width: 96px;
        flex-shrink: 0;
      }
      h2 {
        margin: 0 0 4px;
        font-size: 18px;
      }
      p {
        margin: 0 0 2px;
        font-size: 14px;
        color: var(--ion-color-medium);
      }
    }
    .details {
      flex: 1;
      min-width: 0;
    }
    .printings {
      display: flex;
      flex-wrap: wrap;
      ion-chip {
        font-size: 12px;
        height: 26px;
      }
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 6px;
    }
    .recent {
      padding: 10px 16px calc(10px + var(--ion-safe-area-bottom, 0px));
      background: var(--ion-background-color, #fff);
    }
    .last {
      display: flex;
      align-items: center;
      gap: 12px;
      img {
        width: 42px;
      }
      div {
        flex: 1;
        min-width: 0;
      }
      p {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--ion-color-medium);
      }
    }
    .strip {
      display: flex;
      gap: 6px;
      margin-top: 8px;
      img {
        width: 30px;
        opacity: 0.65;
      }
    }
    .manual {
      padding-bottom: var(--ion-safe-area-bottom, 0px);
    }
  `,
})
export class ScanPage {
  protected readonly catalog = inject(CatalogService);
  protected readonly collection = inject(CollectionService);
  private readonly notify = inject(NotifyService);
  private readonly sounds = inject(ScanSoundService);
  private readonly boxes = inject(BoxService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly native = Capacitor.isNativePlatform();
  protected readonly regular = REGULAR_PRINTING;
  protected readonly delays = [2, 3, 5, 8];

  protected readonly gameId = computed(() => this.catalog.installedGames()[0]?.id ?? '');
  protected readonly mode = signal<'manual' | 'auto'>('manual');
  protected readonly delay = signal(3);
  protected readonly muted = signal(false);
  protected readonly ready = signal(false);
  protected readonly failed = signal(false);
  protected readonly found = signal<CatalogCard | null>(null);
  protected readonly printing = signal(REGULAR_PRINTING);
  protected readonly added = signal<AddedCard[]>([]);
  protected readonly cooldown = signal(0);
  protected readonly status = signal('Starting camera…');
  protected readonly targetBox = signal(0);
  protected readonly handSorted = computed(() => this.boxes.boxes().filter(box => !box.autoSort));
  private readonly entered = signal(false);

  private byNumber = new Map<string, CatalogCard>();
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private starting = false;
  private lastSeen: string | null = null;
  /** The card just handled stays in view for a moment; ignore it until the camera sees something else. */
  private ignored: string | null = null;
  private guard: RepeatGuard = emptyGuard();
  private resumeAt = 0;
  private readonly canvas = document.createElement('canvas');

  constructor() {
    addIcons({ volumeHighOutline, volumeMuteOutline });
    // The installed games arrive from the database a moment after the page opens.
    effect(() => {
      if (!this.entered() || this.starting || !this.catalog.loaded()) return;
      if (!this.gameId()) {
        this.failed.set(true);
        this.status.set('Download a game on the Games tab first.');
        return;
      }
      this.starting = true;
      void this.start();
    });
    effect(() => {
      const gameId = this.gameId();
      if (!gameId) return;
      void this.catalog.cardsFor(gameId).then(cards => {
        if (gameId === this.gameId()) this.byNumber = new Map(cards.map(card => [card.number, card]));
      });
    });
  }

  ionViewDidEnter(): void {
    this.entered.set(true);
  }

  private async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch {
      this.failed.set(true);
      this.status.set('Camera permission is needed to scan.');
      return;
    }
    const video = this.video().nativeElement;
    video.srcObject = this.stream;
    await video.play();
    this.ready.set(true);
    if (!this.native) {
      this.status.set('Card reading works in the Android app. Type a number below.');
      return;
    }
    this.status.set('Hold a card inside the frame');
    this.timer = setInterval(() => void this.tick(), FRAME_INTERVAL_MS);
  }

  ionViewWillLeave(): void {
    this.entered.set(false);
    this.starting = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.ready.set(false);
  }

  protected setMode(mode: 'manual' | 'auto'): void {
    this.mode.set(mode);
    this.found.set(null);
    this.guard = emptyGuard();
    this.resumeAt = 0;
    this.cooldown.set(0);
    this.beep('ready');
  }

  private async tick(): Promise<void> {
    const waiting = Math.max(0, Math.ceil((this.resumeAt - Date.now()) / 1000));
    this.cooldown.set(waiting);
    if (waiting > 0) return;
    await this.readFrame();
  }

  private async readFrame(): Promise<void> {
    const video = this.video().nativeElement;
    if (this.busy || this.found() || !video.videoWidth) return;
    this.busy = true;
    try {
      const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
      this.canvas.width = Math.round(video.videoWidth * scale);
      this.canvas.height = Math.round(video.videoHeight * scale);
      this.canvas.getContext('2d')!.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
      const data = this.canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      const { uri } = await Filesystem.writeFile({ path: 'scan-frame.jpg', data, directory: Directory.Cache });
      const { text } = await TextRecognition.processImage({ path: uri });
      this.consider(this.match(text));
    } catch {
      this.status.set('Could not read that frame, trying again…');
    } finally {
      this.busy = false;
    }
  }

  private match(text: string): CatalogCard | null {
    const game = gameById(this.gameId());
    for (const number of game?.scanCandidates(text) ?? []) {
      const card = this.byNumber.get(number);
      if (card) return card;
    }
    return null;
  }

  /** Needs the same card in two frames in a row, so a half-read number doesn't pop up the wrong card. */
  private consider(card: CatalogCard | null): void {
    this.guard = afterFrame(this.guard, card?.id ?? null);
    if (!card || card.id !== this.ignored) this.ignored = null;
    if (!card || card.id === this.ignored || (this.mode() === 'auto' && !acceptable(this.guard, card.id))) {
      this.lastSeen = null;
      this.status.set(this.mode() === 'auto' ? 'Auto scanning — show a card' : 'Hold a card inside the frame');
      return;
    }
    if (this.lastSeen !== card.id) {
      this.lastSeen = card.id;
      this.status.set(`Reading ${card.number}…`);
      return;
    }
    this.lastSeen = null;
    if (this.mode() === 'auto') void this.autoAdd(card);
    else this.show(card);
  }

  private show(card: CatalogCard): void {
    this.printing.set(REGULAR_PRINTING);
    this.found.set(card);
    this.status.set('Found it');
    this.beep('found');
  }

  private async autoAdd(card: CatalogCard): Promise<void> {
    const ownedId = await this.collection.add(card, REGULAR_PRINTING);
    await this.fileAway(ownedId);
    this.guard = afterAdd(card.id);
    this.added.update(list => [{ card, ownedId }, ...list]);
    this.resumeAt = Date.now() + this.delay() * 1000;
    this.cooldown.set(this.delay());
    this.status.set(`Added ${card.number}`);
    this.beep('found');
  }

  protected async undo(): Promise<void> {
    const [last, ...rest] = this.added();
    if (!last) return;
    await this.collection.remove(last.ownedId);
    this.added.set(rest);
    this.guard = emptyGuard();
    this.beep('undo');
    await this.notify.show(`Removed ${last.card.name}`, 1200);
  }

  protected manual(value: string): void {
    const number = (value ?? '').trim().toUpperCase();
    const card = this.byNumber.get(number) ?? this.match(number);
    if (card) this.show(card);
    else this.status.set(`No card numbered ${number}`);
  }

  protected skip(): void {
    this.ignored = this.found()?.id ?? null;
    this.found.set(null);
    this.status.set('Hold a card inside the frame');
  }

  protected async add(card: CatalogCard): Promise<void> {
    const printingId = this.printing();
    const ownedId = await this.collection.add(card, printingId);
    await this.fileAway(ownedId);
    this.added.update(list => [{ card, ownedId }, ...list]);
    this.skip();
    await this.notify.show(`Added ${card.name} (${printingLabel(card, printingId)})`, 1200);
  }

  /** Nothing chosen leaves the card loose in the unboxed pile. */
  private async fileAway(ownedId: number): Promise<void> {
    const boxId = this.targetBox();
    if (boxId) await this.boxes.fileInto(ownedId, boxId);
  }

  private beep(tone: 'found' | 'ready' | 'undo'): void {
    if (!this.muted()) this.sounds.play(tone);
  }
}
