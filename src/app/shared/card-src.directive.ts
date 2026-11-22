import { Directive, effect, inject, input, signal } from '@angular/core';

import { ImageStore } from './image-store.service';

/** `<img [cardSrc]="card.image">`: a plain src, except for sources whose images must be kept on the phone. */
@Directive({
  selector: 'img[cardSrc]',
  host: { '[attr.src]': 'src() || null' },
})
export class CardSrcDirective {
  readonly cardSrc = input<string | null | undefined>('');

  private readonly store = inject(ImageStore);
  protected readonly src = signal('');

  constructor() {
    effect(onCleanup => {
      const url = this.cardSrc() ?? '';
      if (!this.store.stores(url)) {
        this.src.set(url);
        return;
      }
      let current = true;
      onCleanup(() => (current = false));
      this.src.set(this.store.cached(url) ?? '');
      void this.store.src(url).then(local => {
        if (current) this.src.set(local);
      });
    });
  }
}
