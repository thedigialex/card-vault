import { Injectable, inject } from '@angular/core';
import { ActionSheetController, ModalController } from '@ionic/angular';

import { LibraryEntry, CollectionService } from './collection.service';
import { NotifyService } from '../shared/notify.service';
import { CatalogCard, REGULAR_PRINTING, printingLabel } from './models';

/** Sentinel the printing sheet returns when the tap was about reading the card, not owning it. */
const VIEW = '__view__';

@Injectable({ providedIn: 'root' })
export class AddCardService {
  private readonly collection = inject(CollectionService);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly notify = inject(NotifyService);
  private readonly modals = inject(ModalController);

  /** The detail sheet, opened the same way from boxes, the pile and lists. */
  async openDetail(entry: LibraryEntry, siblings: CatalogCard[] = []): Promise<void> {
    const { CardDetailComponent } = await import('../library/card-detail.component');
    const modal = await this.modals.create({
      component: CardDetailComponent,
      componentProps: { card: entry.card, printingId: entry.owned.printingId, siblings },
      breakpoints: [0, 0.8, 1],
      initialBreakpoint: 0.8,
    });
    await modal.present();
  }

  /** The full-card viewer; `siblings` are the cards around it to swipe through. */
  async view(card: CatalogCard, siblings?: CatalogCard[]): Promise<void> {
    const { CardViewerComponent } = await import('../library/card-viewer.component');
    const modal = await this.modals.create({ component: CardViewerComponent, componentProps: { card, cards: siblings } });
    await modal.present();
  }

  /** `confirm` asks even for single-printing cards, for screens where a stray tap shouldn't add a card. */
  async add(card: CatalogCard, confirm = false, siblings?: CatalogCard[]): Promise<void> {
    const printingId = card.printings.length || confirm ? await this.pickPrinting(card) : REGULAR_PRINTING;
    if (printingId === null) return;
    if (printingId === VIEW) return this.view(card, siblings);
    await this.collection.add(card, printingId);
    await this.notify.show(`Added ${card.name} (${card.number}, ${printingLabel(card, printingId)})`);
  }

  private async pickPrinting(card: CatalogCard): Promise<string | null> {
    const owned = this.collection.countsByCard().get(card.id) ?? 0;
    const sheet = await this.actionSheets.create({
      header: `${card.name} · ${card.number}`,
      subHeader: owned ? `You own ${owned}. Add another?` : 'Add to your library?',
      buttons: [
        { text: 'View card', data: VIEW },
        { text: card.printings.length ? 'Add regular' : 'Add', data: REGULAR_PRINTING },
        ...card.printings.map(p => ({ text: p.note ? `${p.label} – ${p.note}` : p.label, data: p.id })),
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<string | null>();
    return data ?? null;
  }
}
