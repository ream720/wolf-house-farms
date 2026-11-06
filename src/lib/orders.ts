import { offers, getStrain, isOfferAvailable, SHIPPING_CENTS } from '../data/catalog.ts';
import { validCheckoutForm, type CartItem } from './reservation.ts';
import { POLICY_VERSION, policyUI } from '../data/policies.ts';
import { isCashByMailReady } from '../data/payments.ts';

export const paymentMethods = { cashapp: 'Cash App', apple_pay: 'Apple Pay', cash: 'Cash by mail' } as const;
const legacyPaymentMethods = { paypal: 'PayPal', zelle: 'Zelle' } as const;
export type PaymentMethod = keyof typeof paymentMethods | keyof typeof legacyPaymentMethods;
export function paymentMethodLabel(method: PaymentMethod, locale: 'en' | 'es' = 'en') {
  if (method === 'cash' && locale === 'es') return 'Efectivo por correo';
  return ({...paymentMethods,...legacyPaymentMethods})[method];
}
export const paymentStatuses = ['pending', 'requested', 'paid', 'refunded'] as const;
export const fulfillmentStatuses = ['unfulfilled', 'packing', 'shipped', 'delivered', 'cancelled'] as const;
export interface Customer { name: string; email: string; address: string; city: string; state: string; zip: string }
export interface OrderItem { id: string; strain: string; name: string; pack: string; quantity: number; unitCents: number }
export interface OrderDetails {
  customer: Customer;
  payment: { method: PaymentMethod; account: string };
  items: OrderItem[];
  subtotal: number; shipping: number; total: number;
}
export interface Order extends OrderDetails {
  id: string; reference: string; created_at: string; updated_at: string; version: number;
  locale: 'en' | 'es'; payment_status: typeof paymentStatuses[number];
  fulfillment_status: typeof fulfillmentStatuses[number];
  tracking: string; carrier: string; notes: string;
}
export class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function cleanText(value: unknown, max: number, min = 0): string {
  if (typeof value !== 'string') throw new OrderError('Invalid text field.');
  const text = value.trim();
  if (text.length < min || text.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new OrderError('Invalid text field.');
  return text;
}
export function parseCustomer(raw: unknown): Customer {
  if (!raw || typeof raw !== 'object') throw new OrderError('Contact and delivery details are required.');
  const input = raw as Record<string, unknown>;
  const customer = Object.fromEntries(Object.entries({name:120,email:254,address:160,city:100,state:2,zip:10}).map(([k,max]) => [k, cleanText(input[k], max, 2)])) as unknown as Customer;
  if (!validCheckoutForm({ ...customer, terms: true }) || !US_STATES.has(customer.state)) throw new OrderError('Check the contact and US delivery details.');
  return customer;
}
const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
export function parsePayment(raw: unknown, previousMethod?: PaymentMethod): OrderDetails['payment'] {
  if (!raw || typeof raw !== 'object') throw new OrderError('Choose a payment method and enter your account.');
  const { method, account } = raw as Record<string, unknown>;
  const retainedLegacy = typeof method === 'string' && Object.hasOwn(legacyPaymentMethods, method) && method === previousMethod;
  if (typeof method !== 'string' || (!Object.hasOwn(paymentMethods, method) && !retainedLegacy)) throw new OrderError('Choose a supported payment method.');
  // Cash has no payment-app account. Ignore stale values from a previous choice.
  if (method === 'cash') return {method, account:''};
  const value = cleanText(account, 254, 2);
  if (method === 'cashapp' && !/^\$?[a-zA-Z0-9_]{1,20}$/.test(value)) throw new OrderError('Enter your Cash App $Cashtag.');
  if (['zelle','apple_pay'].includes(method) && !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^\+?[\d ().-]{7,25}$/.test(value) && value.replace(/\D/g, '').length >= 10)) throw new OrderError('Enter the email address or phone number registered to this payment method.');
  return { method: method as PaymentMethod, account: value };
}
export function buildOrderDetails(raw: Record<string, unknown>, previous?: Order): OrderDetails {
  const customer = parseCustomer(raw.customer);
  const payment = parsePayment(raw.payment, previous?.payment.method);
  if (payment.method === 'cash' && previous?.payment.method !== 'cash' && !isCashByMailReady()) {
    throw new OrderError('Cash by mail is a preview until WHF confirms its P.O. Box address. Choose Cash App or Apple Pay.');
  }
  if (!Array.isArray(raw.cart) || !raw.cart.length || raw.cart.length > 30) throw new OrderError('Your bag is empty or invalid.');
  // Preserve the agreed price/pack for existing lines during admin edits, even if an offer is retired.
  const seen = new Set<string>();
  const items = raw.cart.map((input: unknown): OrderItem => {
    if (!input || typeof input !== 'object') throw new OrderError('Invalid order item.');
    const item = input as CartItem;
    if (seen.has(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1) throw new OrderError('Invalid order quantity.');
    seen.add(item.id);
    const old = previous?.items.find(line => line.id === item.id);
    const offer = offers.find(o => o.id === item.id);
    if (old) {
      if (item.quantity > old.quantity && (!offer || !isOfferAvailable(offer))) throw new OrderError('This selection is no longer available.');
      if (item.quantity > Math.max(old.quantity, offer?.max ?? 0)) throw new OrderError('Quantity exceeds the limit.');
      return { ...old, quantity: item.quantity };
    }
    if (!offer || !isOfferAvailable(offer) || item.quantity > offer.max) throw new OrderError('A selection is unavailable or exceeds its quantity limit.');
    return { id: offer.id, strain: offer.strain, name: getStrain(offer.strain).name, pack: '10 seeds per pack', quantity: item.quantity, unitCents: offer.cents };
  });
  const subtotal = items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0);
  const shipping = previous?.shipping ?? SHIPPING_CENTS;
  return { customer, payment, items, subtotal, shipping, total: subtotal + shipping };
}
/** Admin edits never rewrite the original agreement. */
export function buildPublicOrderDetails(raw: Record<string, unknown>) {
  if (raw.terms !== true || raw.policyVersion !== POLICY_VERSION) {
    throw new OrderError('Please read and accept the current order terms.');
  }
  const statement = (p: typeof policyUI.en | typeof policyUI.es) =>
    `${p.checkoutAgreement} ${p.terms}, ${p.ordering} ${p.and} ${p.privacy}.`;
  return {
    ...buildOrderDetails(raw),
    agreement: {
      accepted: true, version: POLICY_VERSION,
      // Order.locale records the first submission's language. Keep this snapshot
      // stable across language switches so the same request ID remains retryable.
      statements: { en: statement(policyUI.en), es: statement(policyUI.es) },
    },
  };
}
export function validateWorkflow(payment: unknown, fulfillment: unknown, tracking: string) {
  if (!paymentStatuses.includes(payment as never) || !fulfillmentStatuses.includes(fulfillment as never)) throw new OrderError('Invalid order status.');
  if (['packing','shipped','delivered'].includes(String(fulfillment)) && payment !== 'paid') throw new OrderError('Confirm payment before fulfillment.');
  if (['shipped','delivered'].includes(String(fulfillment)) && !tracking) throw new OrderError('Add tracking before marking the order shipped.');
}
