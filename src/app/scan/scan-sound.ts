import { Injectable } from '@angular/core';

export type ScanTone = 'found' | 'ready' | 'undo';

/** Short synthesized blips: two notes per tone, so the app ships no audio files. */
const TONES: Record<ScanTone, number[]> = {
  found: [880, 1320],
  ready: [660, 660],
  undo: [520, 330],
};

@Injectable({ providedIn: 'root' })
export class ScanSoundService {
  private context?: AudioContext;

  play(tone: ScanTone): void {
    try {
      this.context ??= new AudioContext();
      // A context created before the first tap starts suspended.
      void this.context.resume();
      TONES[tone].forEach((frequency, index) => this.blip(frequency, index * 0.09));
    } catch {
      // No audio on this device; scanning works without it.
    }
  }

  private blip(frequency: number, delay: number): void {
    const context = this.context!;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.1);
  }
}
