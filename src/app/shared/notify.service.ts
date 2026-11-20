import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly toasts = inject(ToastController);

  async show(message: string, duration = 1500): Promise<void> {
    const toast = await this.toasts.create({ message, duration, position: 'top' });
    await toast.present();
  }
}
