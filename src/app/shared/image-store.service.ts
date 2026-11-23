import { Injectable, inject, signal } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

import { VaultDb } from '../data/db';

/** YGOPRODeck asks apps to pull each image once and keep it, and sends no CORS headers for a fetch. */
const MUST_STORE_HOSTS = ['images.ygoprodeck.com'];
const DIR = 'card-images';
const MAX_PARALLEL = 4;

/** cyrb53: a stable short file name per URL. */
function hashOf(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The WebView's local server picks the content type from the extension. */
function fileNameOf(url: string): string {
  const ext = /\.(webp|jpe?g|png|gif|avif)$/i.exec(new URL(url).pathname)?.[1]?.toLowerCase() ?? 'jpg';
  return `${hashOf(url)}.${ext}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface ImageUsage {
  files: number;
  bytes: number;
}

/**
 * Card images kept as files on the phone. The index of saved files loads once at startup, so a saved
 * image's local URL is known synchronously and the first frame already has the picture.
 */
@Injectable({ providedIn: 'root' })
export class ImageStore {
  private readonly db = inject(VaultDb);
  private readonly native = Capacitor.isNativePlatform();
  private readonly files = new Set<string>();
  private readonly pending = new Map<string, Promise<string | undefined>>();
  private readonly queue: (() => void)[] = [];
  private running = 0;
  private base = '';

  /** False until the saved-file index is read; images wait on it rather than flash the remote copy. */
  readonly indexed = signal(!this.native);

  constructor() {
    if (this.native) void this.loadIndex();
  }

  /** The browser (ng serve) can't save cross-origin images, so it always shows the remote one. */
  active(url: string | null | undefined): url is string {
    return this.native && !!url && /^https?:/.test(url);
  }

  mustStore(url: string): boolean {
    try {
      return MUST_STORE_HOSTS.includes(new URL(url).host);
    } catch {
      return false;
    }
  }

  /** The on-phone URL when this image is already saved. */
  localSrc(url: string): string | undefined {
    const name = fileNameOf(url);
    return this.files.has(name) ? Capacitor.convertFileSrc(`${this.base}/${name}`) : undefined;
  }

  /** Saves the image once; resolves to its on-phone URL, or undefined when the download failed. */
  save(url: string): Promise<string | undefined> {
    const hit = this.localSrc(url);
    if (hit) return Promise.resolve(hit);
    let job = this.pending.get(url);
    if (!job) {
      job = this.limited(() => this.download(url)).finally(() => this.pending.delete(url));
      this.pending.set(url, job);
    }
    return job;
  }

  async usage(): Promise<ImageUsage> {
    if (!this.native) return { files: 0, bytes: 0 };
    try {
      const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Data });
      return { files: files.length, bytes: files.reduce((sum, file) => sum + (file.size ?? 0), 0) };
    } catch {
      return { files: 0, bytes: 0 };
    }
  }

  async clear(): Promise<void> {
    if (!this.native) return;
    try {
      await Filesystem.rmdir({ path: DIR, directory: Directory.Data, recursive: true });
    } catch {
      // Nothing saved yet.
    }
    this.files.clear();
  }

  private async loadIndex(): Promise<void> {
    try {
      const { uri } = await Filesystem.getUri({ path: DIR, directory: Directory.Data });
      this.base = uri.replace(/\/+$/, '');
      try {
        const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Data });
        for (const file of files) if (!file.name.endsWith('.part')) this.files.add(file.name);
      } catch {
        await Filesystem.mkdir({ path: DIR, directory: Directory.Data, recursive: true });
      }
      await this.migrateBlobs();
    } catch (error) {
      console.error('Image index failed', error);
    } finally {
      this.indexed.set(true);
    }
  }

  /** Images used to be blobs in IndexedDB; move them to files once. */
  private async migrateBlobs(): Promise<void> {
    const rows = await this.db.images.toArray();
    if (!rows.length) return;
    for (const row of rows) {
      try {
        await this.write(fileNameOf(row.url), await blobToBase64(row.blob));
      } catch {
        // Unreadable row; it will download again when shown.
      }
    }
    await this.db.images.clear();
  }

  private async download(url: string): Promise<string | undefined> {
    try {
      const response = await CapacitorHttp.get({ url, responseType: 'blob' });
      if (response.status !== 200 || typeof response.data !== 'string' || !response.data) return undefined;
      await this.write(fileNameOf(url), response.data);
      return this.localSrc(url);
    } catch {
      return undefined;
    }
  }

  /** Written under a temporary name first, so a crash mid-write never leaves a half image behind. */
  private async write(name: string, base64: string): Promise<void> {
    const part = `${DIR}/${name}.part`;
    await Filesystem.writeFile({ path: part, data: base64, directory: Directory.Data, recursive: true });
    await Filesystem.rename({ from: part, to: `${DIR}/${name}`, directory: Directory.Data, toDirectory: Directory.Data });
    this.files.add(name);
  }

  /** A box or set page can ask for a hundred images at once; a few at a time keeps under the sites' rate limits. */
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
