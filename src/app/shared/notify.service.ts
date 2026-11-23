import { Injectable, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly toasts = inject(ToastController);
  private readonly alerts = inject(AlertController);

  async show(message: string, duration = 1500): Promise<void> {
    const toast = await this.toasts.create({ message, duration, position: 'top' });
    await toast.present();
  }

  /** A Cancel / `action` dialog; true when the action was tapped. `destructive` marks it as a delete. */
  async confirm(header: string, message: string, action: string, destructive = false): Promise<boolean> {
    const role = destructive ? 'destructive' : 'confirm';
    const alert = await this.alerts.create({
      header,
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: action, role },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === role;
  }
}
