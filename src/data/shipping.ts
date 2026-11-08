import { ui, type Locale } from '../i18n/index.ts';

export const shippingMethods = { standard: 1500, expedited: 3000 } as const;
export type ShippingMethod = keyof typeof shippingMethods;
export function isShippingMethod(value: unknown): value is ShippingMethod {
  return typeof value === 'string' && Object.hasOwn(shippingMethods, value);
}
// Saved orders retain their agreed shipping charge, including legacy custom rates.
export function shippingLabel(cents: number, locale: Locale = 'en') {
  const t = ui(locale);
  return cents === shippingMethods.expedited ? t.expeditedShipping : cents === shippingMethods.standard ? t.standardShipping : t.shipping;
}
