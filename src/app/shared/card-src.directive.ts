import { Directive, effect, inject, input, signal } from '@angular/core';

import { ImageStore } from './image-store.service';

/**
 * `<img [cardSrc]="card.image">`: shows the copy saved on the phone when there is one. Otherwise it shows
 * the remote image and saves it once it has actually loaded (so lazy images never seen aren't fetched);
 * hosts that forbid hotlinking are downloaded first and only ever shown from the phone.
 */
@Directive({
  selector: 'img[cardSrc]',
  host: {
    '[attr.src]': 'src() || null',
    '(load)': 'loaded()',
  },
})
export class CardSrcDirective {
  readonly cardSrc = input<string | null | undefined>('');

  private readonly store = inject(ImageStore);
  protected readonly src = signal('');
  private keepOnLoad = '';

  constructor() {
    effect(onCleanup => {
      const url = this.cardSrc() ?? '';
      this.keepOnLoad = '';
      if (!this.store.active(url)) {
        this.src.set(url);
        return;
      }
      if (!this.store.indexed()) {
        this.src.set('');
        return;
      }
      const local = this.store.localSrc(url);
      if (local) {
        this.src.set(local);
        return;
      }
      if (!this.store.mustStore(url)) {
        this.keepOnLoad = url;
        this.src.set(url);
        return;
      }
      let current = true;
      onCleanup(() => (current = false));
      this.src.set('');
      void this.store.save(url).then(saved => {
        if (current) this.src.set(saved ?? url);
      });
    });
  }

  protected loaded(): void {
    if (!this.keepOnLoad) return;
    void this.store.save(this.keepOnLoad);
    this.keepOnLoad = '';
  }
}
