import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, gift, sparkles } from 'ionicons/icons';

import { AddCardService } from '../data/add-card.service';
import { rarityRank } from '../data/card-sort';
import { CollectionService } from '../data/collection.service';
import { CatalogCard, RarityTier, rarityClass, rarityTier } from '../data/models';
import { gameName } from '../games/games';
import { MoneyPipe } from '../prices/money.pipe';
import { PriceService } from '../prices/price.service';
import { CardSrcDirective } from '../shared/card-src.directive';
import { openPack, packSize } from './pack';

type Phase = 'sealed' | 'tearing' | 'reveal' | 'summary';

/** How far across the top (as a fraction of the pack's width) a swipe must go to tear it. */
const TEAR_AT = 0.4;
const TEAR_MS = 1500;
const CHARGE_MS = 650;
const LEAVE_MS = 320;
/** A drag past this many pixels throws the card instead of counting as a tap. */
const FLICK_PX = 70;
const TAP_PX = 8;
/** Cards drawn under the top one; the rest stay in the DOM so their images load early. */
const VISIBLE_DEPTH = 3;

/** Fixed spark directions, so a hit's burst looks the same each time and costs no randomness. */
const SPARKS = Array.from({ length: 22 }, (_, i) => ({
  angle: (i * 360) / 22 + (i % 3) * 7,
  distance: 120 + ((i * 37) % 90),
  delay: (i % 5) * 0.03,
  size: 4 + (i % 4) * 2,
}));

@Component({
  selector: 'app-pack-opening',
  imports: [CardSrcDirective, IonContent, IonButton, IonIcon, MoneyPipe],
  template: `
    <ion-content [fullscreen]="true" [scrollY]="phase() === 'summary'">
      <div class="stage" [attr.data-phase]="phase()" [attr.data-hit]="hit()">
        <div class="rays" aria-hidden="true"></div>
        <button class="close" (click)="done()" aria-label="Close"><ion-icon name="close" /></button>

        @if (phase() === 'sealed' || phase() === 'tearing') {
          <div class="pack-wrap">
            <p class="eyebrow">{{ packs() > 1 ? 'Pack #' + packs() : game }}</p>
            <div
              class="pack"
              [class.tearing]="phase() === 'tearing'"
              [class.pulling]="tear() > 0 && phase() === 'sealed'"
              [style.--hue]="hue"
              [style.--tear]="tear()"
              (pointerdown)="tearStart($event)"
              (pointermove)="tearMove($event)"
              (pointerup)="tearEnd()"
              (pointercancel)="tearEnd()"
            >
              <div class="peek" aria-hidden="true">
                @for (n of [0, 1, 2]; track n) {
                  <span class="mini-back" [style.--n]="n"></span>
                }
              </div>
              <div class="pack-body">
                <span class="game">{{ game }}</span>
                <div class="window">
                  @if (cover) {
                    <img [cardSrc]="cover.image" alt="" />
                  }
                  <span class="foil"></span>
                </div>
                <strong class="code">{{ setCode }}</strong>
                <span class="title">{{ title }}</span>
                <span class="count">{{ size }} cards</span>
              </div>
              <div class="pack-top">
                <span class="tear-line"></span>
                @if (phase() === 'sealed' && tear() === 0) {
                  <span class="finger" aria-hidden="true"></span>
                }
              </div>
              <span class="escape" aria-hidden="true"></span>
            </div>
            <p class="prompt">Swipe along the top to tear it open</p>
            <ion-button fill="clear" size="small" (click)="rip()">or tap to open</ion-button>
          </div>
        }

        @if (phase() === 'reveal') {
          <div class="reveal">
            <div class="topbar">
              <button class="skip" (click)="phase.set('summary')">Skip</button>
              <div class="dots" [attr.aria-label]="'Card ' + (index() + 1) + ' of ' + pulls().length">
                @for (card of pulls(); track $index; let i = $index) {
                  <i [class]="dotClass(card, i)"></i>
                }
              </div>
            </div>

            <div
              class="stack"
              role="button"
              tabindex="0"
              [attr.aria-label]="flipped() ? 'Next card' : 'Flip card'"
              (pointerdown)="grab($event)"
              (pointermove)="drag($event)"
              (pointerup)="release()"
              (pointercancel)="release()"
              (keydown.enter)="advance()"
              (keydown.space)="advance(); $event.preventDefault()"
            >
              @for (card of pulls(); track $index; let i = $index) {
                @if (i >= index()) {
                  @let depth = i - index();
                  <div
                    class="pcard"
                    [class.top]="depth === 0"
                    [class.hidden]="depth > visibleDepth"
                    [class.flipped]="depth === 0 && flipped()"
                    [class.charging]="depth === 0 && charging()"
                    [class.leaving]="depth === 0 && leaving()"
                    [class.dragging]="depth === 0 && dragging()"
                    [attr.data-tier]="tierOf(card)"
                    [style.--depth]="depth"
                    [style.--dx.px]="depth === 0 ? offset().x : 0"
                    [style.--dy.px]="depth === 0 ? offset().y : 0"
                    [style.--rot]="(depth === 0 ? offset().x / 14 : 0) + 'deg'"
                    [style.--tx]="toss().x + '%'"
                    [style.--ty]="toss().y + '%'"
                    [style.--tr]="toss().r + 'deg'"
                    [style.z-index]="100 - depth"
                  >
                    <div class="face back"><span class="emblem"></span><span class="brand">CARD VAULT</span></div>
                    <div class="face front">
                      <img [cardSrc]="card.image" [alt]="card.name" />
                      <span class="shine"></span>
                      <span class="burst"></span>
                    </div>
                  </div>
                }
              }
              @if (hit(); as tier) {
                <div class="sparks" [attr.data-tier]="tier" aria-hidden="true">
                  @for (spark of sparks; track $index) {
                    <i
                      [style.--a]="spark.angle + 'deg'"
                      [style.--d]="spark.distance + 'px'"
                      [style.--s]="spark.size + 'px'"
                      [style.animation-delay]="spark.delay + 's'"
                    ></i>
                  }
                </div>
              }
            </div>

            <div class="caption" [class.on]="flipped() && !leaving()">
              @if (current(); as card) {
                <strong>{{ card.name }}</strong>
                <span class="tags">
                  <span>{{ card.number }}</span>
                  @if (card.rarity) {
                    <b class="rarity" [attr.data-tier]="tierOf(card)">★ {{ card.rarity }}</b>
                  }
                  @if (!owned(card)) {
                    <b class="new">NEW</b>
                  }
                  @if (prices.priceOf(card); as value) {
                    <b class="price">{{ value | money }}</b>
                  }
                </span>
              }
            </div>
            <p class="tap">{{ flipped() ? 'Flick it away or tap for the next card' : 'Tap to flip' }}</p>
          </div>
        }

        @if (phase() === 'summary') {
          <div class="summary">
            <h1><ion-icon name="sparkles" /> {{ setCode }} pulls</h1>
            <div class="hud">
              <div class="hud-stat accent">
                <span>New</span>
                <strong>{{ newCount() }}</strong>
              </div>
              <div class="hud-stat gold">
                <span>Pack value</span>
                <strong>{{ value() > 0 ? (value() | money) : '—' }}</strong>
              </div>
              <div class="hud-stat">
                <span>Best</span>
                <strong>{{ best()?.rarity || '—' }}</strong>
              </div>
            </div>
            @if (best(); as card) {
              <button class="best" [attr.data-tier]="tierOf(card)" (click)="view(card)">
                <img [cardSrc]="card.image" [alt]="card.name" />
                <span>Best pull: <b>{{ card.name }}</b></span>
              </button>
            }
            <div class="card-grid">
              @for (card of pulls(); track $index) {
                <button class="card-tile" [class]="rarityClassOf(card)" (click)="view(card)" [style.animation-delay]="$index * 40 + 'ms'">
                  <img [cardSrc]="card.image" [alt]="card.name" loading="lazy" />
                  @if (!owned(card)) {
                    <span class="new-flag">NEW</span>
                  }
                  <span class="tile-caption">{{ card.number }}</span>
                </button>
              }
            </div>
            <div class="actions">
              <ion-button expand="block" (click)="again()"><ion-icon slot="start" name="gift" /> Rip another</ion-button>
              <ion-button expand="block" fill="outline" (click)="done()">Done</ion-button>
            </div>
            <p class="fine">Just for fun: nothing here is added to your vault.</p>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    ion-content {
      --background: radial-gradient(circle at 50% 38%, #222a4d 0%, #0b0e18 72%);
    }
    .stage {
      position: relative;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: calc(env(safe-area-inset-top, 0px) + 56px) 16px calc(env(safe-area-inset-bottom, 0px) + 20px);
      overflow: hidden;
    }
    .stage[data-phase='summary'] {
      justify-content: flex-start;
      overflow: visible;
    }
    .close {
      position: absolute;
      top: calc(env(safe-area-inset-top, 0px) + 8px);
      right: 10px;
      z-index: 200;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      background: rgb(255 255 255 / 0.08);
      color: var(--ion-text-color);
      font-size: 22px;
      display: grid;
      place-items: center;
    }
    .rays {
      position: absolute;
      inset: -50%;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.5s ease;
      background: repeating-conic-gradient(rgb(247 183 51 / 0.22) 0 8deg, transparent 8deg 22deg);
      mask: radial-gradient(circle, #000 0 20%, transparent 46%);
      animation: spin 14s linear infinite;
    }
    .stage[data-hit] .rays {
      opacity: 1;
    }
    .stage[data-hit='ultra'] .rays {
      background: repeating-conic-gradient(
        rgb(255 80 160 / 0.28) 0 8deg,
        transparent 8deg 15deg,
        rgb(80 200 255 / 0.28) 15deg 23deg,
        transparent 23deg 30deg,
        rgb(200 120 255 / 0.3) 30deg 38deg,
        transparent 38deg 45deg
      );
      animation-duration: 7s;
    }

    /* ---------- sealed pack ---------- */
    .pack-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .eyebrow {
      margin: 0 0 14px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--ion-color-medium);
    }
    .pack {
      --top: 15%;
      position: relative;
      width: min(68vw, 290px);
      aspect-ratio: 0.6;
      container-type: size;
      touch-action: none;
      user-select: none;
      animation: sway 4s ease-in-out infinite;
      filter: drop-shadow(0 22px 34px rgb(0 0 0 / 0.6));
    }
    .pack.pulling {
      animation: none;
      transform: rotate(calc(var(--tear) * 2deg));
    }
    .pack-top,
    .pack-body {
      position: absolute;
      left: 0;
      right: 0;
      z-index: 1;
      /* Both halves paint one gradient sized to the whole pack, so the tear line shows no seam. */
      background: linear-gradient(
        160deg,
        hsl(var(--hue) 85% 62%) 0%,
        hsl(calc(var(--hue) + 40) 75% 40%) 45%,
        hsl(calc(var(--hue) + 80) 80% 18%) 100%
      );
      background-size: 100% 100cqh;
      overflow: hidden;
    }
    .pack-top::before,
    .pack-body::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      background:
        linear-gradient(115deg, transparent 30%, rgb(255 255 255 / 0.4) 45%, transparent 60%) 0 0 / 260% 100%,
        repeating-linear-gradient(60deg, rgb(255 255 255 / 0.05) 0 2px, transparent 2px 7px);
      animation: sheen 3.6s ease-in-out infinite;
    }
    .pack-top {
      top: 0;
      height: var(--top);
      z-index: 2;
      border-radius: 8px 8px 0 0;
      background-position: top;
      transform-origin: 0% 100%;
      transform: rotate(calc(var(--tear) * -6deg)) translateY(calc(var(--tear) * -6px));
      mask:
        conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) top / 9px 6px repeat-x,
        linear-gradient(#000 0 0) bottom / 100% calc(100% - 6px) no-repeat;
    }
    .tear-line {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 2px;
      background: repeating-linear-gradient(90deg, rgb(255 255 255 / 0.6) 0 6px, transparent 6px 11px);
    }
    .tear-line::after {
      content: '';
      position: absolute;
      inset: -1px auto -1px 0;
      width: calc(var(--tear) * 100%);
      background: #fff;
      box-shadow: 0 0 12px 3px rgb(255 255 255 / 0.85);
    }
    .finger {
      position: absolute;
      bottom: -9px;
      left: 6%;
      z-index: 2;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgb(255 255 255 / 0.9);
      box-shadow: 0 0 0 6px rgb(255 255 255 / 0.25), 0 0 18px rgb(255 255 255 / 0.8);
      animation: swipe-hint 2.2s ease-in-out infinite;
    }
    .pack-body {
      top: var(--top);
      bottom: 0;
      border-radius: 0 0 8px 8px;
      background-position: bottom;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 7% 9% 10%;
      gap: 4px;
      mask:
        conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / 9px 6px repeat-x,
        linear-gradient(#000 0 0) top / 100% calc(100% - 6px) no-repeat;
    }
    .game {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .window {
      position: relative;
      width: 100%;
      flex: 1;
      min-height: 0;
      margin: 4px 0;
      border-radius: 12px;
      overflow: hidden;
      background: rgb(0 0 0 / 0.3);
      box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.4), 0 6px 18px rgb(0 0 0 / 0.35);
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: 50% 22%;
        transform: scale(1.15);
      }
    }
    .foil {
      position: absolute;
      inset: 0;
      background: linear-gradient(125deg, rgb(255 95 162 / 0.35), rgb(255 211 110 / 0.25), rgb(110 200 255 / 0.35), rgb(195 139 255 / 0.35));
      background-size: 300% 300%;
      mix-blend-mode: overlay;
      animation: holo 5s linear infinite;
    }
    .code {
      font-size: 36px;
      font-weight: 900;
      line-height: 1;
      text-shadow: 0 2px 0 rgb(0 0 0 / 0.35), 0 0 18px rgb(255 255 255 / 0.4);
    }
    .title {
      font-size: 13px;
      font-weight: 700;
      text-align: center;
      line-height: 1.2;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .count {
      font-size: 11px;
      opacity: 0.75;
    }
    .peek {
      position: absolute;
      left: 12%;
      right: 12%;
      top: calc(var(--top) + 3%);
      aspect-ratio: var(--card-ratio);
      z-index: 0;
    }
    .mini-back {
      position: absolute;
      inset: 0;
      border-radius: 6px;
      border: 4px solid #1b2550;
      background: radial-gradient(circle at 50% 45%, #2b3a7a, #0a0f24);
      box-shadow: 0 -4px 14px rgb(0 0 0 / 0.5);
      transform: translateY(calc(var(--n) * 4px));
    }
    .escape {
      position: absolute;
      left: 5%;
      right: 5%;
      top: var(--top);
      z-index: 3;
      height: 0;
      border-radius: 50%;
      background: radial-gradient(ellipse, #fff 0%, rgb(255 240 200 / 0.6) 40%, transparent 70%);
      opacity: 0;
      pointer-events: none;
    }
    .prompt {
      margin: 24px 0 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--ion-color-medium);
    }
    .pack.tearing {
      animation: shake 0.22s ease-in-out 2;
    }
    .pack.tearing .pack-top {
      animation: rip 0.55s cubic-bezier(0.3, 0.6, 0.4, 1) forwards;
    }
    .pack.tearing .escape {
      animation: escape 0.8s 0.25s ease-out forwards;
    }
    .pack.tearing .mini-back {
      animation: pull-out 0.7s calc(0.45s + var(--n) * 0.08s) cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
    }
    .pack.tearing .pack-body {
      animation: drop 0.45s 1s ease-in forwards;
    }
    .pack.tearing .peek {
      animation: lift 0.4s 1.05s ease-in forwards;
    }

    /* ---------- reveal ---------- */
    .reveal {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    }
    .topbar {
      position: absolute;
      top: calc(env(safe-area-inset-top, 0px) + 8px);
      left: 10px;
      right: 60px;
      height: 40px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .skip {
      padding: 7px 14px;
      border: none;
      border-radius: 999px;
      background: rgb(255 255 255 / 0.08);
      color: var(--ion-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
    }
    .dots {
      flex: 1;
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 5px;
      i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgb(255 255 255 / 0.15);
        transition: background 0.3s ease, transform 0.3s ease;
      }
      .now {
        background: #fff;
        transform: scale(1.35);
      }
      .seen {
        background: #8ea4ff;
      }
      .seen.rare {
        background: #f7b733;
        box-shadow: 0 0 6px #f7b733;
      }
      .seen.ultra {
        background: linear-gradient(135deg, #ff5fa2, #6ec8ff);
        box-shadow: 0 0 6px #c38bff;
      }
    }
    .stack {
      position: relative;
      width: min(76vw, 330px);
      aspect-ratio: var(--card-ratio);
      perspective: 1400px;
      touch-action: none;
      outline: none;
      animation: rise 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.15);
    }
    .pcard {
      position: absolute;
      inset: 0;
      transform-style: preserve-3d;
      transform: translateY(calc(var(--depth) * -8px)) scale(calc(1 - var(--depth) * 0.04));
      transition: transform 0.55s cubic-bezier(0.3, 1.3, 0.5, 1), opacity 0.3s ease;
    }
    .pcard.hidden {
      opacity: 0;
    }
    .pcard.flipped {
      transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) rotateY(180deg) scale(1.03);
    }
    .pcard.dragging {
      transition: none;
    }
    .pcard.charging {
      animation: charge 0.65s ease-in;
    }
    .pcard.leaving {
      transform: translate(var(--tx), var(--ty)) rotate(var(--tr)) rotateY(180deg);
      opacity: 0;
      transition: transform 0.32s ease-in, opacity 0.32s ease-in;
    }
    .face {
      position: absolute;
      inset: 0;
      border-radius: 4.5% / 3.3%;
      overflow: hidden;
      backface-visibility: hidden;
      box-shadow: 0 14px 34px rgb(0 0 0 / 0.6);
    }
    .back {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10%;
      border: 8px solid #1b2550;
      background:
        repeating-linear-gradient(45deg, rgb(255 255 255 / 0.035) 0 6px, transparent 6px 12px),
        radial-gradient(circle at 50% 45%, #2b3a7a 0%, #121a3a 60%, #0a0f24 100%);
      outline: 2px solid rgb(142 164 255 / 0.45);
      outline-offset: -14px;
    }
    .emblem {
      width: 46%;
      aspect-ratio: 1;
      border-radius: 50%;
      border: 3px solid #8ea4ff;
      background:
        repeating-conic-gradient(rgb(255 255 255 / 0.55) 0 3deg, transparent 3deg 30deg),
        radial-gradient(circle, #a855f7 0 16%, #5b7cfa 17% 30%, #1b2550 31% 62%, #0d1430 63%);
      box-shadow: 0 0 22px rgb(91 124 250 / 0.5);
    }
    .brand {
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.3em;
      color: #8ea4ff;
    }
    .pcard.top:not(.flipped)[data-tier='rare'] .back {
      animation: tease-gold 1.1s ease-in-out infinite;
    }
    .pcard.top:not(.flipped)[data-tier='ultra'] .back {
      animation: tease-ultra 0.9s ease-in-out infinite;
    }
    .front {
      transform: rotateY(180deg);
      background: #111;
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }
    .shine,
    .burst {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .pcard[data-tier='rare'] .shine {
      background: linear-gradient(115deg, transparent 25%, rgb(255 220 140 / 0.55) 45%, transparent 60%) 0 0 / 250% 100%;
      mix-blend-mode: soft-light;
      animation: sheen 2.4s ease-in-out infinite;
    }
    .pcard[data-tier='ultra'] .shine {
      background: linear-gradient(115deg, #ff5fa2, #ffd36e, #6effc8, #6ec8ff, #c38bff, #ff5fa2) 0 0 / 300% 300%;
      mix-blend-mode: color-dodge;
      opacity: 0.45;
      animation: holo 3s linear infinite;
    }
    .pcard.flipped:not([data-tier='common']) .burst {
      background: radial-gradient(circle, #fff 0%, rgb(255 255 255 / 0) 70%);
      animation: flash 0.7s 0.15s ease-out both;
    }
    .pcard.flipped[data-tier='rare'] .front {
      box-shadow: 0 0 0 2px #f7b733, 0 0 36px 6px rgb(247 183 51 / 0.6);
    }
    .pcard.flipped[data-tier='ultra'] .front {
      box-shadow: 0 0 0 2px #c38bff, 0 0 46px 10px rgb(195 139 255 / 0.65);
    }
    .sparks {
      position: absolute;
      left: 50%;
      top: 50%;
      z-index: 150;
      pointer-events: none;
      i {
        position: absolute;
        width: var(--s);
        height: var(--s);
        margin: calc(var(--s) / -2);
        border-radius: 50%;
        background: #ffd36e;
        box-shadow: 0 0 8px #ffd36e;
        opacity: 0;
        animation: spark 0.9s 0.15s ease-out both;
      }
    }
    .sparks[data-tier='ultra'] i:nth-child(3n) {
      background: #ff5fa2;
      box-shadow: 0 0 8px #ff5fa2;
    }
    .sparks[data-tier='ultra'] i:nth-child(3n + 1) {
      background: #6ec8ff;
      box-shadow: 0 0 8px #6ec8ff;
    }
    .caption {
      min-height: 58px;
      margin-top: 22px;
      padding: 10px 16px;
      border-radius: 14px;
      background: rgb(255 255 255 / 0.05);
      border: 1px solid rgb(255 255 255 / 0.08);
      text-align: center;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      strong {
        display: block;
        font-size: 18px;
      }
    }
    .caption.on {
      opacity: 1;
      transform: none;
      transition-delay: 0.3s;
    }
    .tags {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 13px;
      color: var(--ion-color-medium);
      b {
        padding: 1px 8px;
        border-radius: 999px;
        font-size: 11px;
        background: rgb(255 255 255 / 0.1);
        color: var(--ion-text-color);
      }
      .rarity[data-tier='rare'] {
        background: var(--vault-gold);
        color: #2a1a00;
      }
      .rarity[data-tier='ultra'] {
        background: linear-gradient(90deg, #ff5fa2, #c38bff, #6ec8ff);
        color: #1a0b2a;
      }
      .new {
        background: var(--vault-accent);
      }
      .price {
        color: #f7b733;
      }
    }
    .tap {
      margin: 10px 0 0;
      font-size: 12px;
      color: var(--ion-color-medium);
    }

    /* ---------- summary ---------- */
    .summary {
      width: 100%;
      max-width: 520px;
      text-align: center;
      h1 {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 4px;
        font-size: 22px;
        font-weight: 800;
        ion-icon {
          color: #f7b733;
        }
      }
      .hud {
        margin: 8px 0 16px;
      }
      .card-grid {
        margin-top: 16px;
        text-align: left;
      }
      .card-tile {
        animation: deal 0.35s ease-out both;
      }
    }
    .best {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      font-size: 13px;
      img {
        width: min(42vw, 180px);
        aspect-ratio: var(--card-ratio);
        object-fit: cover;
        border-radius: 8px;
        box-shadow: 0 10px 26px rgb(0 0 0 / 0.6);
        animation: rise 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2);
      }
    }
    .best[data-tier='rare'] img {
      box-shadow: 0 0 0 2px #f7b733, 0 0 30px 4px rgb(247 183 51 / 0.5);
    }
    .best[data-tier='ultra'] img {
      box-shadow: 0 0 0 2px #c38bff, 0 0 36px 8px rgb(195 139 255 / 0.55);
    }
    .new-flag {
      position: absolute;
      top: 5px;
      left: 5px;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--vault-accent);
      color: #fff;
      font-size: 10px;
      font-weight: 800;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 18px 16px 0;
    }
    .fine {
      margin: 12px 0 0;
      font-size: 12px;
      color: var(--ion-color-medium);
    }

    @keyframes sway {
      50% { transform: translateY(-8px) rotate(-1.2deg); }
    }
    @keyframes sheen {
      from { background-position: 130% 0, 0 0; }
      to { background-position: -130% 0, 0 0; }
    }
    @keyframes holo {
      to { background-position: 300% 300%; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes swipe-hint {
      0%, 15% { left: 6%; opacity: 0; }
      25% { opacity: 1; }
      75% { left: 82%; opacity: 1; }
      90%, 100% { left: 82%; opacity: 0; }
    }
    @keyframes shake {
      25% { transform: translateX(-4px) rotate(-1.5deg); }
      75% { transform: translateX(4px) rotate(1.5deg); }
    }
    @keyframes rip {
      to { transform: translate(60%, -170%) rotate(34deg); opacity: 0; }
    }
    @keyframes escape {
      0% { opacity: 0; height: 0; }
      40% { opacity: 1; height: 30%; transform: translateY(-20%); }
      100% { opacity: 0; height: 90%; transform: translateY(-45%); }
    }
    @keyframes pull-out {
      to { transform: translateY(calc(-62% - var(--n) * 6%)) rotate(calc((var(--n) - 1) * 6deg)); }
    }
    @keyframes drop {
      to { transform: translateY(80%); opacity: 0; }
    }
    @keyframes lift {
      to { transform: translateY(-20%) scale(1.3); opacity: 0; }
    }
    @keyframes rise {
      from { transform: translateY(-18%) scale(0.8); opacity: 0; }
    }
    @keyframes charge {
      0% { transform: none; }
      20% { transform: rotate(-3deg) scale(1.02); }
      40% { transform: rotate(3deg) scale(1.04); }
      60% { transform: rotate(-4deg) scale(1.06); }
      80% { transform: rotate(4deg) scale(1.08); }
      100% { transform: scale(1.1); }
    }
    @keyframes flash {
      0% { opacity: 0; transform: scale(0.4); }
      30% { opacity: 1; }
      100% { opacity: 0; transform: scale(1.8); }
    }
    @keyframes spark {
      0% { opacity: 1; transform: rotate(var(--a)) translateX(0); }
      100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scale(0.3); }
    }
    @keyframes tease-gold {
      50% { box-shadow: 0 0 26px 4px rgb(247 183 51 / 0.55); }
    }
    @keyframes tease-ultra {
      50% { box-shadow: 0 0 32px 8px rgb(195 139 255 / 0.65); }
    }
    @keyframes deal {
      from { transform: translateY(16px) scale(0.92); opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .pack,
      .finger,
      .rays,
      .foil,
      .pack-top::before,
      .pack-body::before,
      .shine,
      .back,
      .pcard.charging,
      .sparks {
        animation: none !important;
      }
    }
  `,
})
export class PackOpeningComponent implements OnInit {
  private readonly modals = inject(ModalController);
  private readonly collection = inject(CollectionService);
  protected readonly prices = inject(PriceService);
  private readonly viewer = inject(AddCardService);
  private readonly destroyRef = inject(DestroyRef);

  // Ionic sets componentProps as plain properties, so these can't be signal inputs.
  gameId = '';
  setCode = '';
  title = '';
  cards: CatalogCard[] = [];

  protected game = '';
  protected size = 10;
  protected hue = 220;
  protected cover?: CatalogCard;
  protected readonly visibleDepth = VISIBLE_DEPTH;
  protected readonly sparks = SPARKS;

  protected readonly phase = signal<Phase>('sealed');
  protected readonly pulls = signal<CatalogCard[]>([]);
  protected readonly index = signal(0);
  protected readonly flipped = signal(false);
  protected readonly charging = signal(false);
  protected readonly leaving = signal(false);
  protected readonly dragging = signal(false);
  protected readonly offset = signal({ x: 0, y: 0 });
  protected readonly toss = signal({ x: -130, y: -20, r: -24 });
  protected readonly tear = signal(0);
  protected readonly packs = signal(1);

  protected readonly current = computed(() => this.pulls()[this.index()]);
  protected readonly hit = computed<RarityTier | null>(() => {
    const card = this.current();
    if (this.phase() !== 'reveal' || !this.flipped() || !card) return null;
    const tier = rarityTier(card);
    return tier === 'common' ? null : tier;
  });

  protected readonly value = computed(() => this.prices.valueOf(this.pulls()));
  protected readonly newCount = computed(() => new Set(this.pulls().filter(card => !this.owned(card)).map(card => card.id)).size);
  protected readonly best = computed((): CatalogCard | undefined =>
    [...this.pulls()].sort(
      (a, b) => rarityRank(b) - rarityRank(a) || (this.prices.priceOf(b) ?? 0) - (this.prices.priceOf(a) ?? 0),
    )[0],
  );

  private timers: ReturnType<typeof setTimeout>[] = [];
  private tearFrom: { x: number; width: number } | null = null;
  private grabFrom: { x: number; y: number } | null = null;

  constructor() {
    addIcons({ close, gift, sparkles });
    this.destroyRef.onDestroy(() => this.timers.forEach(clearTimeout));
  }

  ngOnInit(): void {
    this.game = gameName(this.gameId);
    this.size = packSize(this.gameId);
    this.hue = [...this.setCode].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
    this.cover = [...this.cards].sort((a, b) => rarityRank(b) - rarityRank(a))[0];
    this.pulls.set(openPack(this.cards, this.size));
  }

  protected readonly tierOf = rarityTier;
  protected readonly rarityClassOf = rarityClass;

  protected dotClass(card: CatalogCard, i: number): string {
    if (i === this.index()) return 'now';
    return i < this.index() ? `seen ${rarityTier(card)}` : '';
  }

  protected owned(card: CatalogCard): boolean {
    return this.collection.countsByCard().has(card.id);
  }

  protected tearStart(event: PointerEvent): void {
    if (this.phase() !== 'sealed') return;
    const pack = event.currentTarget as HTMLElement;
    pack.setPointerCapture(event.pointerId);
    this.tearFrom = { x: event.clientX, width: pack.getBoundingClientRect().width };
  }

  protected tearMove(event: PointerEvent): void {
    if (!this.tearFrom) return;
    this.tear.set(Math.min(1, Math.max(0, (event.clientX - this.tearFrom.x) / this.tearFrom.width)));
    if (this.tear() >= 1) this.tearEnd();
  }

  protected tearEnd(): void {
    if (!this.tearFrom) return;
    this.tearFrom = null;
    if (this.tear() >= TEAR_AT) this.rip();
    else this.tear.set(0);
  }

  protected rip(): void {
    if (this.phase() !== 'sealed') return;
    this.tear.set(1);
    this.phase.set('tearing');
    this.later(TEAR_MS, () => this.phase.set('reveal'));
  }

  protected grab(event: PointerEvent): void {
    if (this.leaving() || this.charging()) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.grabFrom = { x: event.clientX, y: event.clientY };
  }

  /** Only a face-up card follows the finger; a face-down one just waits for the tap. */
  protected drag(event: PointerEvent): void {
    if (!this.grabFrom || !this.flipped()) return;
    this.dragging.set(true);
    this.offset.set({ x: event.clientX - this.grabFrom.x, y: event.clientY - this.grabFrom.y });
  }

  protected release(): void {
    if (!this.grabFrom) return;
    this.grabFrom = null;
    this.dragging.set(false);
    const { x, y } = this.offset();
    const distance = Math.hypot(x, y);
    if (distance < TAP_PX) {
      this.offset.set({ x: 0, y: 0 });
      this.advance();
    } else if (distance > FLICK_PX) {
      this.throwCard(x / distance, y / distance);
    } else {
      this.offset.set({ x: 0, y: 0 });
    }
  }

  protected advance(): void {
    if (this.leaving() || this.charging()) return;
    if (!this.flipped()) {
      // A hit shakes and charges up before it turns over.
      if (rarityTier(this.current()) === 'common') {
        this.flipped.set(true);
        return;
      }
      this.charging.set(true);
      this.later(CHARGE_MS, () => {
        this.charging.set(false);
        this.flipped.set(true);
      });
      return;
    }
    this.throwCard(-0.95, -0.3);
  }

  private throwCard(dx: number, dy: number): void {
    this.toss.set({ x: dx * 160, y: dy * 160, r: dx * 28 });
    this.leaving.set(true);
    this.later(LEAVE_MS, () => {
      this.leaving.set(false);
      this.flipped.set(false);
      this.offset.set({ x: 0, y: 0 });
      if (this.index() + 1 >= this.pulls().length) this.phase.set('summary');
      else this.index.update(index => index + 1);
    });
  }

  protected again(): void {
    this.pulls.set(openPack(this.cards, this.size));
    this.index.set(0);
    this.flipped.set(false);
    this.tear.set(0);
    this.packs.update(count => count + 1);
    this.phase.set('sealed');
  }

  protected async view(card: CatalogCard): Promise<void> {
    await this.viewer.view(card, this.pulls());
  }

  protected done(): void {
    void this.modals.dismiss();
  }

  private later(ms: number, run: () => void): void {
    this.timers.push(setTimeout(run, ms));
  }
}
