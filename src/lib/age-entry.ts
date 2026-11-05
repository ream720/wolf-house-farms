import { POLICY_VERSION } from '../data/policies.ts';
export const AGE_KEY = `whf-age-agreement-${POLICY_VERSION}`;
const LEGACY_AGE_KEY = 'whf-age-entry-v1';

/** A browser-local age attestation; no age or identity data is sent. */
export function initializeAgeEntry(doc: Document, getStorage: () => Pick<Storage, "getItem" | "setItem">) {
  const gate = doc.querySelector<HTMLDialogElement>(".age-gate");
  const content = doc.querySelector<HTMLElement>("[data-site-content]");
  if (!gate || !content) return;
  const accept = doc.querySelector<HTMLButtonElement>("[data-age-accept]")!;
  const decline = doc.querySelector<HTMLButtonElement>("[data-age-decline]")!;
  const denied = doc.querySelector<HTMLElement>("[data-age-denied]")!;
  const form = doc.querySelector<HTMLFormElement>('[data-age-form]')!;
  const remember = (value: string) => {
    try { getStorage().setItem(AGE_KEY, JSON.stringify(value)); } catch {}
  };
  const unlock = () => {
    gate.close();
    content.inert = false;
    doc.body.classList.remove("age-locked");
    const main = doc.querySelector<HTMLElement>("#main");
    main?.setAttribute("tabindex", "-1");
    main?.focus({ preventScroll: true });
  };
  const deny = () => {
    accept.hidden = true;
    decline.hidden = true;
    denied.hidden = false;
    denied.focus();
  };
  gate.removeAttribute("open");
  gate.showModal();
  gate.addEventListener("cancel", e => e.preventDefault());
  let previous: unknown = null;
  try {
    const storage = getStorage();
    // Preserve underage denials; old age-only entry is not policy acceptance.
    previous = JSON.parse(storage.getItem(LEGACY_AGE_KEY) || 'null') === 'underage'
      ? 'underage' : JSON.parse(storage.getItem(AGE_KEY) || 'null');
  } catch {}
  if (previous === "adult") unlock();
  else if (previous === "underage") deny();
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (denied.hidden === false || !form.reportValidity()) return;
    remember('adult'); unlock();
  });
  decline.addEventListener("click", () => { remember("underage"); deny(); });
}
