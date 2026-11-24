import { CardSrcDirective } from '../shared/card-src.directive';
import { DecimalPipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { TextRecognition } from '@capacitor-mlkit/text-recognition';
import {
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
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { optionsOutline } from 'ionicons/icons';

import { BoxService } from '../boxes/box.service';
import { CatalogService } from '../data/catalog.service';
import { CollectionService } from '../data/collection.service';
import { CatalogCard, GameSet, REGULAR_PRINTING, printingLabel } from '../data/models';
import { GAMES, gameById, gameName } from '../games/games';
import { PriceService } from '../prices/price.service';
import { NotifyService } from '../shared/notify.service';
import { RepeatGuard, acceptable, afterAdd, afterFrame, emptyGuard } from './auto-scan';
import { guideInVideo } from './crop';
import { GameVote } from './game-detect';
import { NameIndex, narrowByClues } from './name-match';
import { ScanSettingsComponent } from './scan-settings.component';
import { ScanSoundService, ScanTone } from './scan-sound';

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

interface ScanRead {
  card: CatalogCard | null;
  candidates: string[];
  /** Cards sharing the card's name, best guess first, when it was recognised by name. */
  alternatives: CatalogCard[];
  /** Several of those cards fit what the camera saw equally well. */
  unsure: boolean;
}

interface AddedCard {
  card: CatalogCard;
  ownedId: number;
}

@Component({
  selector: 'app-scan',
  imports: [CardSrcDirective,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonSegment, IonSegmentButton,
    IonChip, IonItem, IonInput, IonIcon, IonSpinner, IonProgressBar, DecimalPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Scan cards</ion-title>
        <ion-buttons slot="end">
          <ion-button class="settings" [class.on]="customised()" aria-label="Scanner settings" (click)="openSettings()">
            <ion-icon slot="icon-only" name="options-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="mode()" (ionChange)="setMode($any($event.detail.value))">
          <ion-segment-button value="manual">One at a time</ion-segment-button>
          <ion-segment-button value="auto">Auto</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
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
          @if (ready() && activeGameName(); as name) {
            <div class="game-badge" [class.locked]="gameChoice() !== 'auto'">
              {{ gameChoice() === 'auto' ? 'Looks like ' + name : name }}
            </div>
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
    .game-badge {
      position: absolute;
      top: 44px;
      left: 12px;
      padding: 4px 10px;
      border-radius: 12px;
      background: rgb(91 124 250 / 0.85);
      color: #fff;
      font-size: 12px;
      font-weight: 700;

      &.locked {
        background: rgb(247 183 51 / 0.9);
        color: #1a1a1a;
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
    .settings.on {
      --color: var(--ion-color-primary);
      ion-icon {
        filter: drop-shadow(0 0 6px rgb(91 124 250 / 0.7));
      }
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
  private readonly modals = inject(ModalController);
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
  protected readonly games = GAMES;
  /** 'auto' lets the printed words decide; picking a game locks the scanner to it. */
  protected readonly gameChoice = signal('auto');
  private readonly detected = signal<string | null>(null);
  protected readonly activeGame = computed(() => (this.gameChoice() === 'auto' ? this.detected() : this.gameChoice()));
  protected readonly activeGameName = computed(() => {
    const id = this.activeGame();
    return id ? gameName(id, true) : '';
  });
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
  /** Marks the settings button when the scanner isn't on its defaults. */
  protected readonly customised = computed(() => this.gameChoice() !== 'auto' || this.targetBox() !== 0 || this.muted());
  private readonly entered = signal(false);

  private byNumber = new Map<string, CatalogCard>();
  private names = new NameIndex([]);
  private pendingAlternatives: CatalogCard[] = [];
  private pendingUnsure = false;
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
  private readonly vote = new GameVote();
  private readonly setLookups = new Map<string, Promise<GameSet | undefined>>();
  /** Sets the user said "Not now" to, by game:code, for this visit to the scanner. */
  private readonly declined = new Set<string>();
  private misses = 0;
  private readonly canvas = document.createElement('canvas');

  constructor() {
    addIcons({ optionsOutline });
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
      if (this.gameChoice() === 'auto') this.detected.set(this.vote.add(text));
      const read = this.match(text);
      this.pendingAlternatives = read.alternatives;
      this.pendingUnsure = read.unsure;
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
  private match(text: string): ScanRead {
    // Once the game is known, other games' number shapes and names can't cause a wrong match.
    const active = this.activeGame();
    const inGame = (card: CatalogCard) => !active || card.game === active;
    const candidates = (active ? [active] : this.gameIds()).flatMap(id => gameById(id)?.scanCandidates(text) ?? []);
    const sure = (card: CatalogCard): ScanRead => ({ card, candidates, alternatives: [], unsure: false });
    for (const number of candidates) {
      const card = this.byNumber.get(number);
      if (card && inGame(card)) return sure(card);
    }
    // A guessed game can be wrong; a number found in another downloaded game still counts unless locked.
    if (active && this.gameChoice() === 'auto') {
      for (const id of this.gameIds().filter(id => id !== active)) {
        for (const number of gameById(id)?.scanCandidates(text) ?? []) {
          const card = this.byNumber.get(number);
          if (card?.game === id) return sure(card);
        }
      }
    }
    const named = this.names.find(text).filter(inGame);
    if (!named.length) return { card: null, candidates, alternatives: [], unsure: false };
    // A set code or number elsewhere on the card can still say which of the same-named cards it is.
    const likely = narrowByClues(text, named);
    // Cards tend to be scanned a set at a time, so the last card's set is the best guess.
    const recentSet = this.added()[0]?.card.setCode;
    const guess = likely.find(card => card.setCode === recentSet) ?? likely[0];
    const alternatives = [guess, ...likely.filter(card => card !== guess), ...named.filter(card => !likely.includes(card))];
    return { card: guess, candidates, alternatives, unsure: likely.length > 1 };
  }

  protected async openSettings(): Promise<void> {
    const modal = await this.modals.create({
      component: ScanSettingsComponent,
      componentProps: {
        games: this.games,
        boxes: this.handSorted(),
        gameChoice: this.gameChoice(),
        boxChoice: this.targetBox(),
        onGame: (id: string) => this.chooseGame(id),
        onBox: (id: number) => this.targetBox.set(id),
        sound: !this.muted(),
        onSound: (on: boolean) => this.muted.set(!on),
        delays: this.delays,
        delayChoice: this.delay(),
        onDelay: (seconds: number) => this.delay.set(seconds),
      },
      breakpoints: [0, 0.8, 1],
      initialBreakpoint: 0.8,
    });
    await modal.present();
  }

  protected chooseGame(choice: string): void {
    this.gameChoice.set(choice);
    this.vote.reset();
    this.detected.set(null);
    this.lastUnknown = '';
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
    const active = this.activeGame();
    const reads = GAMES.filter(game => !active || game.id === active)
      .map(game => ({ game, numbers: game.scanCandidates(text) }))
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
      // Prices are a separate, slower download; let them arrive while scanning carries on.
      void this.prices.afterInstall(offer.gameId).catch(() => undefined);
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
      const name = this.activeGameName();
      this.status.set(name ? `${name} card, looking for its number…` : 'Seeing the card, looking for its number…');
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
    if (this.mode() === 'manual') this.show(card);
    else if (this.pendingUnsure) this.askWhich(card);
    else void this.autoAdd(card);
  }

  private show(card: CatalogCard): void {
    this.printing.set(REGULAR_PRINTING);
    this.alternatives.set(this.pendingAlternatives);
    this.found.set(card);
    this.status.set('Found it');
    this.beep('found');
  }

  /** Auto mode stops rather than guess between same-named cards; picking one carries on scanning. */
  private askWhich(card: CatalogCard): void {
    this.show(card);
    this.status.set(`${this.pendingAlternatives.length} sets have ${card.name}. Pick one`);
    this.beep('unsure');
  }

  private async autoAdd(card: CatalogCard): Promise<void> {
    await this.addCopy(card, REGULAR_PRINTING);
    this.guard = afterAdd(card.id);
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
    await this.addCopy(card, printingId);
    this.skip();
    await this.notify.show(`Added ${card.name} (${printingLabel(card, printingId)})`, 1200);
  }

  /** Files the copy into the chosen box; with none chosen it stays loose in the unboxed pile. */
  private async addCopy(card: CatalogCard, printingId: string): Promise<void> {
    const ownedId = await this.collection.add(card, printingId);
    const boxId = this.targetBox();
    if (boxId) await this.boxes.fileInto(ownedId, boxId);
    this.added.update(list => [{ card, ownedId }, ...list]);
  }

  private beep(tone: ScanTone): void {
    if (!this.muted()) this.sounds.play(tone);
  }
}
