import { offers, isOfferAvailable, SHIPPING_CENTS } from "../data/catalog.ts";
export interface CartItem {
  id: string;
  quantity: number;
}
export function normalizeCart(raw: unknown, { allowUnavailable = false } = {}): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const found = new Set<string>();
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const offer = offers.find((o) => o.id === item.id);
    if (
      !offer ||
      (!allowUnavailable && !isOfferAvailable(offer)) ||
      found.has(offer.id) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > offer.max
    )
      return [];
    found.add(offer.id);
    return [{ id: offer.id, quantity: item.quantity }];
  });
}
export function calculateTotals(cart: CartItem[], options = { allowUnavailable: false }) {
  const clean = normalizeCart(cart, options);
  const subtotal = clean.reduce(
    (sum, item) =>
      sum + offers.find((o) => o.id === item.id)!.cents * item.quantity,
    0,
  );
  const shipping = clean.length ? SHIPPING_CENTS : 0;
  return { subtotal, shipping, total: subtotal + shipping };
}
export function validCheckoutForm(data: Record<string, string | boolean>) {
  return (
    ["name", "address", "city"].every(
      (key) =>
        typeof data[key] === "string" && String(data[key]).trim().length >= 2,
    ) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email || "")) &&
    /^[A-Z]{2}$/.test(String(data.state || "")) &&
    /^\d{5}(-\d{4})?$/.test(String(data.zip || "")) &&
    data.terms === true
  );
}
