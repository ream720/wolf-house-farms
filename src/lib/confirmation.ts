import { ui, type Locale } from '../i18n/index.ts';
import type { PaymentMethod } from './orders.ts';

export function confirmationInstructions(method: PaymentMethod, locale: Locale) {
  const t = ui(locale);
  if (method === 'cash') {
    return { title:t.cashMailNextSteps, body:t.cashMailNextStepsBody, showMailingAddress:true };
  }
  const body = method === 'cashapp' ? t.cashAppNextStepsBody
    : method === 'apple_pay' ? t.applePayNextStepsBody : t.nextStepsBody;
  return { title:t.nextSteps, body, showMailingAddress:false };
}
