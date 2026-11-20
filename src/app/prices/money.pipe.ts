import { Pipe, PipeTransform } from '@angular/core';

import { formatPrice } from './prices';

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | undefined | null): string {
    return formatPrice(value);
  }
}
