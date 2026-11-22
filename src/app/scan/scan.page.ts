import { CardSrcDirective } from '../shared/card-src.directive';
import { DecimalPipe } from '@angular/common';
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
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { volumeHighOutline, volumeMuteOutline } from 'ionicons/icons';

import { BoxService } from '../boxes/box.service';
import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { CatalogCard, GameSet, REGULAR_PRINTING, printingLabel } from '../data/models';
import { GAMES, gameById } from '../games/games';
import { PriceService } from '../prices/price.service';
import { NotifyService } from '../shared/notify.service';
import { RepeatGuard, acceptable, afterAdd, afterFrame, emptyGuard } from './auto-scan';
import { guideInVideo } from './crop';
import { NameIndex } from './name-match';
import { ScanSoundService } from './scan-sound';

const FRAME_INTERVAL_MS = 600;
const FRAME_MAX_SIDE = 1600;

const MAX_SET_LOOKUPS = 3;

interface SetOffer {
  key: string;
  gameId: string;
  gameName: string;
  number: string;
  set: GameSet;
  /** The game comes as one download and isn't installed, so the whole game is fetched. */
  wholeGame: boolean;
}

interface AddedCard {
  card: CatalogCard;
  ownedId: number;
}

@Component({
  selector: 'app-scan',
  imports: [CardSrcDirective,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonContent, IonSegment, IonSegmentButton,
    IonChip, IonItem, IonInput, IonIcon, IonSelect, IonSelectOption, IonSpinner, IonProgressBar, DecimalPipe,
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
          <div
            #guide
            class="guide"
            [class.locked]="found() || cooldown() > 0"
            [class.reading]="phase() === 'reading'"
            [class.scanning]="scanning()"
          >
            <span class="laser"></span>
          </div>
          @if (scanning()) {
            <div class="live" [class.blink]="frames() % 2 === 1"><span></span> Scanning</div>
          }
          @if (ready()) {
            <div class="status-panel">
              <p class="status">
                @if (cooldown() > 0) {
                  Next card in {{ cooldown() }}…
                } @else {
                  {{ status() }}
                }
              </p>
              @if (hint() && !found() && cooldown() === 0) {
                <p class="hint">{{ hint() }}</p>
              }
            </div>
          }
          @if (added().length) {
            <div class="tally">{{ added().length }} added</div>
          }
        </div>

        @if (found(); as card) {
          <div class="result">
            <img class="card-thumb" [cardSrc]="card.image" [alt]="card.name" />
            <div class="details">
              <h2>{{ card.name }}</h2>
              <p>{{ card.number }} · {{ card.rarity }}</p>
              <p class="set">{{ card.setName }}</p>
              @if (collection.countsByCard().get(card.id); as owned) {
                <p>You own {{ owned }}</p>
              }
              @if (alternatives().length > 1) {
                <p class="alt-label">{{ alternatives().length }} cards share this name. Which one?</p>
                <div class="printings">
                  @for (alt of alternatives().slice(0, 10); track alt.id) {
                    <ion-chip [outline]="alt.id !== card.id" (click)="choose(alt)">{{ alt.number }}</ion-chip>
                  }
                </div>
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
        } @else if (offer(); as offer) {
          <div class="offer">
            <div class="offer-text">
              <strong>{{ offer.number }} is from {{ offer.set.name }}</strong>
              <p>
                {{ offer.gameName }} ·
                @if (offer.wholeGame) {
                  downloads the whole game
                } @else {
                  {{ offer.set.cardCount | number }} cards
                }
              </p>
              @if (downloading()) {
                <ion-progress-bar
                  [value]="catalog.progress()"
                  [type]="catalog.progress() === undefined ? 'indeterminate' : 'determinate'"
                />
              }
            </div>
            <div class="actions">
              <ion-button fill="outline" [disabled]="downloading()" (click)="dismissOffer(offer)">Not now</ion-button>
              <ion-button [disabled]="downloading()" (click)="acceptOffer(offer)">
                @if (downloading()) {
                  <ion-spinner name="dots" />
                } @else {
                  Download
                }
              </ion-button>
            </div>
          </div>
        } @else if (mode() === 'auto' && added().length) {
          <div class="recent">
            <div class="last">
              <img class="card-thumb" [cardSrc]="added()[0].card.image" [alt]="added()[0].card.name" />
              <div>
                <strong>{{ added()[0].card.name }}</strong>
                <p>{{ added()[0].card.number }} added</p>
              </div>
              <ion-button fill="clear" size="small" (click)="undo()">Undo</ion-button>
            </div>
            <div class="strip">
              @for (entry of added().slice(1, 8); track entry.ownedId) {
                <img class="card-thumb" [cardSrc]="entry.card.image" [alt]="entry.card.name" />
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
    .guide.reading {
      border-color: #f7b733;
    }
    .guide.locked {
      border-color: var(--ion-color-success);
    }
    .laser {
      position: absolute;
      left: 6px;
      right: 6px;
      top: 0;
      height: 2px;
      border-radius: 2px;
      background: linear-gradient(90deg, transparent, #7c9bff, transparent);
      box-shadow: 0 0 12px 2px rgb(91 124 250 / 0.7);
      opacity: 0;
    }
    .guide.scanning .laser {
      opacity: 1;
      animation: sweep 1.8s ease-in-out infinite alternate;
    }
    .guide.reading .laser {
      background: linear-gradient(90deg, transparent, #f7b733, transparent);
      box-shadow: 0 0 12px 2px rgb(247 183 51 / 0.7);
    }
    @keyframes sweep {
      from {
        top: 4%;
      }
      to {
        top: 95%;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .guide.scanning .laser {
        animation: none;
        top: 50%;
      }
    }
    .live {
      position: absolute;
      top: 12px;
      left: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 12px;
      background: rgb(0 0 0 / 0.55);
      color: #fff;
      font-size: 12px;
      font-weight: 600;

      span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #4ade80;
        transition: opacity 0.15s;
      }
      &.blink span {
        opacity: 0.3;
      }
    }
    .status-panel {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 12px;
      padding: 8px 12px;
      border-radius: 12px;
      background: rgb(0 0 0 / 0.6);
      text-align: center;
      color: #fff;

      p {
        margin: 0;
      }
      .status {
        font-weight: 600;
      }
      .hint {
        margin-top: 4px;
        font-size: 12px;
        color: #cbd5e0;
      }
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
    .result p.alt-label {
      margin-top: 6px;
      font-size: 12px;
      color: #f7b733;
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
    .offer {
      padding: 12px 16px calc(12px + var(--ion-safe-area-bottom, 0px));
      background: var(--ion-background-color, #fff);
      border-top: 2px solid #f7b733;

      strong {
        display: block;
        font-size: 15px;
      }
      p {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--ion-color-medium);
      }
      ion-progress-bar {
        margin-top: 8px;
      }
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
  private readonly prices = inject(PriceService);
  private readonly sounds = inject(ScanSoundService);
  private readonly boxes = inject(BoxService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly guideBox = viewChild.required<ElementRef<HTMLElement>>('guide');

  protected readonly native = Capacitor.isNativePlatform();
  protected readonly regular = REGULAR_PRINTING;
  protected readonly delays = [2, 3, 5, 8];

  /** Every downloaded game is searched, so the scanner never needs to be told which game a card is from. */
  protected readonly gameIds = computed(() => this.catalog.installedGames().map(game => game.id));
  protected readonly mode = signal<'manual' | 'auto'>('manual');
  protected readonly delay = signal(3);
  protected readonly muted = signal(false);
  protected readonly ready = signal(false);
  protected readonly failed = signal(false);
  protected readonly found = signal<CatalogCard | null>(null);
  /** A card from a set (or game) that isn't downloaded yet, offered for download right here. */
  protected readonly offer = signal<SetOffer | null>(null);
  protected readonly downloading = signal(false);
  /** Cards sharing the found card's name, when it was recognised by name rather than number. */
  protected readonly alternatives = signal<CatalogCard[]>([]);
  protected readonly printing = signal(REGULAR_PRINTING);
  protected readonly added = signal<AddedCard[]>([]);
  protected readonly cooldown = signal(0);
  protected readonly status = signal('Starting camera…');
  protected readonly hint = signal('');
  protected readonly phase = signal<'looking' | 'reading'>('looking');
  /** Bumped on every frame read, so the "Scanning" dot visibly ticks. */
  protected readonly frames = signal(0);
  protected readonly scanning = computed(() => this.ready() && this.native && !this.found() && this.cooldown() === 0);
  protected readonly targetBox = signal(0);
  protected readonly handSorted = computed(() => this.boxes.boxes().filter(box => !box.autoSort));
  private readonly entered = signal(false);

  private byNumber = new Map<string, CatalogCard>();
  private names = new NameIndex([]);
  private pendingAlternatives: CatalogCard[] = [];
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private starting = false;
  private lastSeen: string | null = null;
  /** The card just handled stays in view for a moment; ignore it until the camera sees something else. */
  private ignored: string | null = null;
  private guard: RepeatGuard = emptyGuard();
  private resumeAt = 0;
  private lastUnknown = '';
  private readonly setLookups = new Map<string, Promise<GameSet | undefined>>();
  /** Sets the user said "Not now" to, by game:code, for this visit to the scanner. */
  private readonly declined = new Set<string>();
  private misses = 0;
  private readonly canvas = document.createElement('canvas');

  constructor() {
    addIcons({ volumeHighOutline, volumeMuteOutline });
    // The installed games arrive from the database a moment after the page opens.
    effect(() => {
      // With no games yet, scanning still works: the first card read offers its game for download.
      if (!this.entered() || this.starting || !this.catalog.loaded()) return;
      this.starting = true;
      void this.start();
    });
    effect(() => {
      const ids = this.gameIds();
      void Promise.all(ids.map(id => this.catalog.cardsFor(id))).then(lists => {
        if (ids !== this.gameIds()) return;
        const cards = lists.flat();
        this.byNumber = new Map(cards.map(card => [card.number, card]));
        this.names = new NameIndex(cards);
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
    this.lookingStatus();
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
      // Only the guide is read: a binder page or a table full of cards would otherwise mix their text in.
      const crop = guideInVideo(
        { width: video.videoWidth, height: video.videoHeight },
        video.getBoundingClientRect(),
        this.guideBox().nativeElement.getBoundingClientRect(),
      );
      const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(crop.width, crop.height));
      this.canvas.width = Math.round(crop.width * scale);
      this.canvas.height = Math.round(crop.height * scale);
      this.canvas
        .getContext('2d')!
        .drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, this.canvas.width, this.canvas.height);
      const data = this.canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      const { uri } = await Filesystem.writeFile({ path: 'scan-frame.jpg', data, directory: Directory.Cache });
      const { text } = await TextRecognition.processImage({ path: uri });
      this.frames.update(n => n + 1);
      const read = this.match(text);
      this.pendingAlternatives = read.alternatives;
      this.consider(read.card);
      if (!read.card) {
        this.explainMiss(text, read.candidates);
        this.lookForMissingSet(text);
      }
    } catch {
      this.status.set('Could not read that frame, trying again…');
    } finally {
      this.busy = false;
    }
  }

  /** The printed number wins; the name is the fallback for numbers too small for the camera. */
  private match(text: string): { card: CatalogCard | null; candidates: string[]; alternatives: CatalogCard[] } {
    const candidates = this.gameIds().flatMap(id => gameById(id)?.scanCandidates(text) ?? []);
    for (const number of candidates) {
      const card = this.byNumber.get(number);
      if (card) return { card, candidates, alternatives: [] };
    }
    const named = this.names.find(text);
    // Auto mode can't ask which printing, so it only trusts a name that belongs to one card.
    if (named.length && (this.mode() === 'manual' || named.length === 1)) {
      return { card: named[0], candidates, alternatives: named };
    }
    return { card: null, candidates, alternatives: [] };
  }

  protected choose(card: CatalogCard): void {
    this.printing.set(REGULAR_PRINTING);
    this.found.set(card);
  }

  /**
   * A number from any game, read twice in a row, whose set isn't downloaded: look the set up in the
   * background and offer it, so nobody has to leave the scanner to fetch it.
   */
  private lookForMissingSet(text: string): void {
    if (this.offer() || this.downloading()) return;
    const installed = new Set(this.gameIds());
    const reads = GAMES.map(game => ({ game, numbers: game.scanCandidates(text) }))
      .sort((a, b) => Number(installed.has(b.game.id)) - Number(installed.has(a.game.id)))
      .flatMap(({ game, numbers }) => numbers.map(number => ({ gameId: game.id, number })))
      .filter(read => !this.byNumber.has(read.number))
      .slice(0, MAX_SET_LOOKUPS);
    const key = reads.map(read => `${read.gameId}:${read.number}`).join('|');
    const confirmed = key && key === this.lastUnknown;
    this.lastUnknown = key;
    if (confirmed) void this.offerFirstKnownSet(reads);
  }

  private async offerFirstKnownSet(reads: { gameId: string; number: string }[]): Promise<void> {
    for (const { gameId, number } of reads) {
      const prefix = `${gameId}:${number.slice(0, number.indexOf('-'))}`;
      if (this.declined.has(prefix)) continue;
      let lookup = this.setLookups.get(prefix);
      if (!lookup) {
        lookup = this.catalog.setForScan(gameId, number).catch(() => undefined);
        this.setLookups.set(prefix, lookup);
      }
      const set = await lookup;
      if (!set) continue;
      if (this.found() || this.offer() || this.downloading()) return;
      const game = gameById(gameId)!;
      const installed = this.catalog.installed().find(row => row.id === gameId);
      this.offer.set({
        key: prefix,
        gameId,
        gameName: game.name,
        number,
        set,
        wholeGame: !game.listSets && (!installed || !installed.sets),
      });
      this.status.set(`${number} isn't downloaded yet`);
      this.hint.set('');
      this.beep('ready');
      return;
    }
  }

  protected dismissOffer(offer: SetOffer): void {
    this.declined.add(offer.key);
    this.offer.set(null);
    this.lookingStatus();
  }

  protected async acceptOffer(offer: SetOffer): Promise<void> {
    this.downloading.set(true);
    this.status.set(`Downloading ${offer.wholeGame ? offer.gameName : offer.set.name}…`);
    try {
      const result = await this.catalog.addSet(offer.gameId, offer.set.code);
      if (result.priced !== undefined) await this.prices.reload();
      const game = gameById(offer.gameId);
      // Worth the Rip prices are a separate, slower download; let them arrive while scanning carries on.
      if (game?.priceGame && !game.pricesWithCatalog) void this.prices.update(offer.gameId).catch(() => undefined);
      this.setLookups.clear();
      this.offer.set(null);
      this.lastUnknown = '';
      this.lookingStatus();
      await this.notify.show(`Added ${offer.set.name}: ${result.cards.toLocaleString()} cards. Scanning again…`, 2000);
    } catch (error) {
      console.error(`Downloading ${offer.set.code} failed`, error);
      this.status.set('Download failed. Check your connection and try again.');
    } finally {
      this.downloading.set(false);
    }
  }

  /** Says what the camera did see, so a miss doesn't look like nothing is happening. */
  private explainMiss(text: string, candidates: string[]): void {
    if (this.found() || this.offer() || this.downloading() || this.resumeAt > Date.now()) return;
    this.misses++;
    if (candidates.length) {
      this.status.set(`Read ${candidates[0]}, but it isn't in your downloaded cards`);
      this.hint.set('Check its set is picked on the Games tab, or hold steady for another read.');
    } else if (text.trim()) {
      this.status.set('Seeing the card, looking for its number…');
      this.hint.set(this.misses > 8 ? 'Hold the card flat and steady so its name or number is sharp.' : '');
    } else {
      this.lookingStatus();
      this.hint.set(this.misses > 8 ? 'Fill the frame with the card, in good light.' : '');
    }
  }

  private lookingStatus(): void {
    this.status.set(this.mode() === 'auto' ? 'Auto scanning — show a card' : 'Hold a card inside the frame');
  }

  /** Needs the same card in two frames in a row, so a half-read number doesn't pop up the wrong card. */
  private consider(card: CatalogCard | null): void {
    this.guard = afterFrame(this.guard, card?.id ?? null);
    if (!card || card.id !== this.ignored) this.ignored = null;
    if (!card || card.id === this.ignored || (this.mode() === 'auto' && !acceptable(this.guard, card.id))) {
      this.lastSeen = null;
      this.phase.set('looking');
      if (card) this.lookingStatus();
      return;
    }
    this.misses = 0;
    this.hint.set('');
    if (this.lastSeen !== card.id) {
      this.lastSeen = card.id;
      this.phase.set('reading');
      this.status.set(`Reading ${this.pendingAlternatives.length ? card.name : card.number}… hold still`);
      return;
    }
    this.lastSeen = null;
    this.phase.set('looking');
    if (this.mode() === 'auto') void this.autoAdd(card);
    else this.show(card);
  }

  private show(card: CatalogCard): void {
    this.printing.set(REGULAR_PRINTING);
    this.alternatives.set(this.pendingAlternatives);
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
    const typed = (value ?? '').trim();
    const read = this.match(typed.toUpperCase());
    const card = this.byNumber.get(typed.toUpperCase()) ?? read.card ?? this.names.find(typed)[0];
    this.pendingAlternatives = read.alternatives;
    if (card) this.show(card);
    else this.status.set(`No card matches ${typed}`);
  }

  protected skip(): void {
    this.ignored = this.found()?.id ?? null;
    this.found.set(null);
    this.alternatives.set([]);
    this.misses = 0;
    this.hint.set('');
    this.lookingStatus();
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
