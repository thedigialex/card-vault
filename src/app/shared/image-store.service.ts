import { Injectable, inject } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

import { VaultDb } from '../data/db';

/** YGOPRODeck asks apps to pull each image once and keep it, and sends no CORS headers for a fetch. */
const STORED_HOSTS = ['images.ygoprodeck.com'];
const MAX_PARALLEL = 4;

function base64ToBlob(data: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0));
  return new Blob([bytes], { type });
}

@Injectable({ providedIn: 'root' })
export class ImageStore {
  private readonly db = inject(VaultDb);
  private readonly ready = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();
  private readonly queue: (() => void)[] = [];
  private running = 0;

  /** Only the native app can save them (the browser is stopped by CORS), so ng serve shows the remote image. */
  stores(url: string): boolean {
    if (!url || !Capacitor.isNativePlatform()) return false;
    try {
      return STORED_HOSTS.includes(new URL(url).host);
    } catch {
      return false;
    }
  }

  cached(url: string): string | undefined {
    return this.ready.get(url);
  }

  /** A local object URL for the image, downloading it the first time it's needed. */
  src(url: string): Promise<string> {
    const hit = this.ready.get(url);
    if (hit) return Promise.resolve(hit);
    let job = this.pending.get(url);
    if (!job) {
      job = this.load(url).finally(() => this.pending.delete(url));
      this.pending.set(url, job);
    }
    return job;
  }

  private async load(url: string): Promise<string> {
    let stored = await this.db.images.get(url);
    if (!stored) {
      const blob = await this.limited(() => this.download(url));
      if (!blob) return url;
      stored = { url, blob, savedAt: Date.now() };
      await this.db.images.put(stored);
    }
    const local = URL.createObjectURL(stored.blob);
    this.ready.set(url, local);
    return local;
  }

  private async download(url: string): Promise<Blob | null> {
    try {
      const response = await CapacitorHttp.get({ url, responseType: 'blob' });
      if (response.status !== 200 || typeof response.data !== 'string') return null;
      const type = (response.headers['Content-Type'] ?? response.headers['content-type'] ?? 'image/jpeg') as string;
      return base64ToBlob(response.data, type);
    } catch {
      return null;
    }
  }

  /** A box or set page can ask for a hundred images at once; a few at a time keeps under the site's rate limit. */
  private async limited<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= MAX_PARALLEL) await new Promise<void>(resolve => this.queue.push(resolve));
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }
}
