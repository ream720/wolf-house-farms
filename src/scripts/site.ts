import { initializeAgeEntry } from "../lib/age-entry";
import { ui, money, type Locale } from "../i18n/index";
import { offers, getStrain, isOfferAvailable } from "../data/catalog";
import {
  normalizeCart,
  calculateTotals,
  validCheckoutForm,
  type CartItem,
} from "../lib/reservation";
import { pathFor } from "../lib/routes";
import { paymentMethods, parsePayment, type OrderItem, type OrderDetails } from '../lib/orders';
import { POLICY_VERSION } from '../data/policies';

const locale: Locale = document.body.dataset.locale === "es" ? "es" : "en";
const t = ui(locale);
const CART_KEY = "whf-cart-v1";
const DRAFT_KEY = "whf-checkout-form-v1";
const CONFIRM_KEY = "whf-order-confirmation-v1";
const REQUEST_KEY = "whf-order-request-v1";
const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);
function read(storage: Storage, key: string): unknown {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    return null;
  }
}
function write(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function clear(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {}
}
initializeAgeEntry(document, () => sessionStorage);

// Carry an existing customer's basket/form forward from the earlier storage names.
for (const [storageName, oldKey, newKey] of [
  ['localStorage', 'whf-demo-cart-v2', CART_KEY],
  ['sessionStorage', 'whf-demo-form-v1', DRAFT_KEY],
] as const) {
  try {
    const storage = window[storageName];
    const previous = read(storage,oldKey);
    if (previous !== null && (read(storage,newKey) !== null || write(storage,newKey,previous))) clear(storage,oldKey);
  } catch {}
}

let cart: CartItem[] = [];
try {
  cart = normalizeCart(read(localStorage, CART_KEY));
} catch {}
let toastTimeout: ReturnType<typeof setTimeout>;
function notify(message: string) {
  const toast = $(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}
function updateCart() {
  try {
    write(localStorage, CART_KEY, cart);
  } catch {}
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
    el.textContent = String(count);
    el.hidden = !count;
  });
}
updateCart();

const menu = $<HTMLButtonElement>(".menu-toggle");
const mobileNav = $("#mobile-nav");
function closeMenu() {
  if (!menu || !mobileNav) return;
  menu.setAttribute("aria-expanded", "false");
  mobileNav.hidden = true;
}
menu?.addEventListener("click", () => {
  if (!mobileNav) return;
  const open = menu.getAttribute("aria-expanded") === "true";
  menu.setAttribute("aria-expanded", String(!open));
  mobileNav.hidden = open;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menu?.getAttribute("aria-expanded") === "true") {
    closeMenu();
    menu.focus();
  }
});
window.matchMedia("(min-width: 801px)").addEventListener("change", (e) => {
  if (e.matches) closeMenu();
});
document.querySelectorAll<HTMLAnchorElement>("[data-language]").forEach((a) => {
  const url = new URL(a.href);
  url.search = window.location.search;
  a.href = url.toString();
  a.addEventListener("click", () => {
    try {
      localStorage.setItem("whf-language", a.dataset.language || "en");
    } catch {}
    saveDraft();
  });
});

const catalog = $("[data-catalog]");
if (catalog) {
  const form = catalog.querySelector<HTMLFormElement>("form")!;
  const search = form.elements.namedItem("q") as HTMLInputElement;
  const collection = form.elements.namedItem("collection") as HTMLSelectElement;
  const params = new URLSearchParams(location.search);
  collection.value = params.get("collection") || "";
  search.value = params.get("q") || "";
  function filter(syncUrl = true) {
    const query = search.value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    let count = 0;
    catalog!
      .querySelectorAll<HTMLElement>("[data-strain-card]")
      .forEach((card) => {
        const visible = (!query || card.dataset.search?.includes(query)) && (!collection.value || card.dataset.collection === collection.value);
        card.hidden = !visible;
        if (visible) count++;
      });
    $("[data-result-count]")!.textContent = String(count);
    $("[data-result-label]")!.textContent = count === 1 ? t.record : t.records;
    $("[data-no-results]")!.hidden = !!count;
    if (syncUrl) {
      const p = new URLSearchParams();
      if (search.value) p.set("q", search.value);
      if (collection.value) p.set("collection", collection.value);
      history.replaceState(
        null,
        "",
        `${location.pathname}${p.size ? `?${p}` : ""}`,
      );
      document
        .querySelectorAll<HTMLAnchorElement>("[data-language]")
        .forEach((a) => {
          const u = new URL(a.href);
          u.search = p.toString();
          a.href = u.toString();
        });
    }
  }
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("input", () => filter());
  form.addEventListener("change", () => filter());
  form.addEventListener("reset", () => {
    setTimeout(() => filter(), 0);
  });
  $("[data-reset-filters]")?.addEventListener("click", () => form.reset());
  filter(false);
}

document
  .querySelectorAll<HTMLButtonElement>("[data-add-offer]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      const offer = offers.find((o) => o.id === button.dataset.addOffer);
      if (!offer || !isOfferAvailable(offer)) return;
      const existing = cart.find((i) => i.id === offer.id);
      if (existing && existing.quantity >= offer.max)
        return notify(t.limitError);
      if (existing) existing.quantity++;
      else cart.push({ id: offer.id, quantity: 1 });
      updateCart();
      notify(t.inCart);
    }),
  );

const checkout = $("[data-checkout]");
const form = $<HTMLFormElement>("[data-order-form]");
const isConfirmation = checkout?.dataset.confirmation === "true";
interface Confirmation {
  reference: string;
  items: OrderItem[];
  subtotal: number; shipping: number; total: number;
  payment: OrderDetails['payment'];
}
let confirmation: Confirmation | null = null;
try {
  const candidate = read(sessionStorage, CONFIRM_KEY) as Confirmation | null;
  if (
    candidate &&
    /^WHF-[A-F0-9]{32}$/.test(candidate.reference) &&
    Array.isArray(candidate.items) && candidate.items.length &&
    candidate.items.every(i => typeof i.name === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && Number.isInteger(i.unitCents) && i.unitCents >= 0) &&
    Number.isInteger(candidate.total) && candidate.total >= 0
  )
    confirmation = {
      ...candidate,
    };
} catch {}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  content = "",
) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content) el.textContent = content;
  return el;
}
function renderSummary() {
  if (!checkout) return;
  const items = isConfirmation ? confirmation?.items || [] : cart;
  const hasItems = items.length > 0;
  $("[data-empty]")!.hidden = hasItems;
  $("[data-checkout-content]")!.hidden = !hasItems;
  const list = $("[data-cart-items]")!;
  list.replaceChildren();
  if (!hasItems) return;
  for (const item of items) {
    const offer = offers.find((o) => o.id === item.id);
    const snapshot = isConfirmation ? item as OrderItem : null;
    const strain = getStrain(snapshot?.strain || offer!.strain);
    const row = element("div", "order-item");
    const img = element("img");
    img.src = strain?.image ? `/images/${strain.image}.webp` : "/images/wolf-xolo.webp";
    img.alt = "";
    img.width = 65;
    img.height = 80;
    const copy = element("div");
    const name = snapshot?.name || strain.name;
    copy.append(element("h3", "", name), element("p", "", snapshot?.pack || t.packSize));
    if (!isConfirmation) {
      const controls = element("div", "quantity-controls");
      const input = element("input");
      input.type = "number";
      input.min = "1";
      input.max = String(offer!.max);
      input.step = "1";
      input.value = String(item.quantity);
      input.setAttribute("aria-label", `${t.quantity}: ${strain.name}`);
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (!Number.isInteger(value) || value < 1 || value > offer!.max) {
          input.value = String(item.quantity);
          notify(t.limitError);
          return;
        }
        item.quantity = value;
        updateCart();
        renderSummary();
      });
      const remove = element("button", "", t.remove);
      remove.type = "button";
      remove.setAttribute("aria-label", `${t.remove}: ${strain.name}`);
      remove.addEventListener("click", () => {
        cart = cart.filter((i) => i.id !== item.id);
        updateCart();
        renderSummary();
      });
      controls.append(input, remove);
      copy.append(controls);
    } else copy.append(element("p", "", `${t.quantity}: ${item.quantity}`));
    row.append(
      img,
      copy,
      element("strong", "", money((snapshot?.unitCents ?? offer!.cents) * item.quantity, locale)),
    );
    list.append(row);
  }
  const totals = isConfirmation && confirmation ? confirmation : calculateTotals(cart);
  $("[data-subtotal]")!.textContent = money(totals.subtotal, locale);
  $("[data-shipping]")!.textContent = money(totals.shipping, locale);
  $("[data-total]")!.textContent = money(totals.total, locale);
  if (isConfirmation && confirmation)
    $("[data-reference]")!.textContent = confirmation.reference;
  if (isConfirmation && confirmation?.payment) {
    const payment = confirmation.payment;
    $('[data-confirmation-payment]')!.textContent = `${t.paymentMethod}: ${paymentMethods[payment.method]} · ${payment.account}`;
  }
}

const draftFields = [
  "name",
  "email",
  "address",
  "city",
  "state",
  "zip",
  "paymentMethod",
  "paymentAccount",
] as const;
function saveDraft() {
  if (!form) return;
  const data: Record<string, string | boolean> = {};
  for (const key of draftFields)
    data[key] = (form.elements.namedItem(key) as HTMLInputElement).value;
  try {
    write(sessionStorage, DRAFT_KEY, data);
  } catch {}
}
if (form) {
  // Drafts and browser-restored form state must not pre-accept the policies.
  (form.elements.namedItem('terms') as HTMLInputElement).checked = false;
  const method = form.elements.namedItem('paymentMethod') as HTMLSelectElement;
  const account = form.elements.namedItem('paymentAccount') as HTMLInputElement;
  function updatePaymentHelp() {
    const hints = {
      cashapp: [t.cashappAccount, t.cashappHelp, '$yourcashtag'],
      paypal: [t.paypalAccount, t.paypalHelp, 'you@example.com'],
      zelle: [t.contactAccount, t.zelleHelp, 'you@example.com / +1…'],
      apple_pay: [t.contactAccount, t.applePayHelp, 'you@example.com / +1…'],
    };
    const hint = hints[method.value as keyof typeof hints] || [t.paymentAccount,t.paymentAccountHelp,''];
    $('[data-payment-account-label]')!.textContent=hint[0];
    $('[data-payment-help]')!.textContent=hint[1];
    account.placeholder=hint[2]; account.setCustomValidity('');
  }
  try {
    const draft = read(sessionStorage, DRAFT_KEY) as Record<
      string,
      unknown
    > | null;
    if (draft) {
      for (const key of draftFields)
        if (typeof draft[key] === "string")
          (form.elements.namedItem(key) as HTMLInputElement).value = String(
            draft[key],
          );
    }
  } catch {}
  updatePaymentHelp();
  method.addEventListener('change',updatePaymentHelp);
  account.addEventListener('input',()=>account.setCustomValidity(''));
  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);
  let submitting = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    const data: Record<string, string | boolean> = {};
    for (const key of draftFields)
      data[key] = (form.elements.namedItem(key) as HTMLInputElement).value;
    data.terms = (form.elements.namedItem("terms") as HTMLInputElement).checked;
    const error = $("[data-form-error]")!;
    try { parsePayment({method:data.paymentMethod,account:data.paymentAccount}); }
    catch { account.setCustomValidity(t.paymentError); }
    if (!validCheckoutForm(data) || !form.checkValidity()) {
      error.textContent = account.validity.customError || !method.value ? t.paymentError : t.formError;
      error.hidden = false;
      form.querySelector<HTMLElement>(":invalid")?.focus();
      return;
    }
    cart = normalizeCart(cart);
    updateCart();
    if (!cart.length) {
      renderSummary();
      return;
    }
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const originalLabel = button.textContent;
    submitting = true; button.disabled = true; button.textContent = t.submitting;
    error.hidden = true;
    try {
      const payload = {customer:Object.fromEntries(['name','email','address','city','state','zip'].map(k=>[k,data[k]])),payment:{method:data.paymentMethod,account:data.paymentAccount},cart,terms:data.terms,policyVersion:POLICY_VERSION,locale};
      const fingerprint = JSON.stringify({...payload,locale:undefined});
      const prior = read(sessionStorage,REQUEST_KEY) as {fingerprint?:string;id?:string} | null;
      const requestId = prior?.fingerprint === fingerprint && prior.id ? prior.id : crypto.randomUUID();
      if (!write(sessionStorage,REQUEST_KEY,{id:requestId,fingerprint}) || !write(sessionStorage,'whf-storage-check',true)) throw new Error(t.storageError);
      clear(sessionStorage,'whf-storage-check');
      const response = await fetch('/api/orders/',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({...payload,requestId})});
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 503 ? t.orderUnavailable : response.status === 429 ? t.orderRateLimit : t.orderError);
      const receipt = result.confirmation as Confirmation;
      if (!write(sessionStorage,CONFIRM_KEY,receipt)) {
        error.textContent=`${t.orderSaved} ${receipt.reference}. ${t.storageError}`; error.hidden=false;
        return;
      }
      clear(sessionStorage, DRAFT_KEY);
      clear(localStorage, CART_KEY);
      clear(sessionStorage,REQUEST_KEY);
      location.assign(pathFor(locale, "confirmation"));
    } catch (failure) {
      error.textContent=failure instanceof Error && [t.storageError,t.orderUnavailable,t.orderRateLimit,t.orderError].includes(failure.message) ? failure.message : t.orderError;
      error.hidden=false;
    } finally {submitting=false;button.disabled=false;button.textContent=originalLabel;}
  });
}
$("[data-print]")?.addEventListener("click", () => window.print());
$("[data-browse-more]")?.addEventListener("click", () => {
  try {
    clear(sessionStorage, CONFIRM_KEY);
  } catch {}
  location.assign(pathFor(locale, "genetics"));
});
window.addEventListener("storage", (event) => {
  if (event.key === CART_KEY) {
    try {
      cart = normalizeCart(read(localStorage, CART_KEY));
    } catch {
      cart = [];
    }
    updateCart();
    renderSummary();
  }
});
window.addEventListener("pageshow", () => {
  if (form) (form.elements.namedItem('terms') as HTMLInputElement).checked = false;
  try {
    cart = normalizeCart(read(localStorage, CART_KEY));
  } catch {}
  updateCart();
  renderSummary();
});
renderSummary();
