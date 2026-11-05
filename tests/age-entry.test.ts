import test from "node:test";
import assert from "node:assert/strict";
import { initializeAgeEntry, AGE_KEY } from "../src/lib/age-entry.ts";

function fixture(initial: string | null = null, unavailable = false, legacy: string | null = null) {
  const events = new Map<string, (event?: unknown) => void>();
  let value = initial;
  let locked = true;
  const element = (id: string) => ({
    hidden: id === "denied", inert: id === "content", open: id === "gate", focused: false,
    removeAttribute() { this.open = false; },
    setAttribute() {},
    showModal() { this.open = true; }, close() { this.open = false; },
    focus() { this.focused = true; },
    addEventListener(name: string, callback: (event?: unknown) => void) { events.set(`${id}:${name}`, callback); },
  });
  const gate = element("gate"), content = element("content"), accept = element("accept"), decline = element("decline"), denied = element("denied"), main = element("main");
  const form = { ...element('form'), valid: false, reportValidity() { return this.valid; } };
  const nodes = { ".age-gate": gate, "[data-site-content]": content, "[data-age-accept]": accept, "[data-age-decline]": decline, "[data-age-denied]": denied, "#main": main, '[data-age-form]': form };
  const doc = { querySelector: (selector: keyof typeof nodes) => nodes[selector], body: {classList: {remove: () => {locked = false;}}} } as unknown as Document;
  const getStorage = () => {
    if (unavailable) throw new Error("Storage blocked");
    return {getItem: (key: string) => key === AGE_KEY ? value : legacy, setItem: (_key: string, next: string) => {value = next;}};
  };
  initializeAgeEntry(doc, getStorage);
  const submit = () => events.get('form:submit')!({preventDefault() {}});
  return {gate,content,accept,decline,denied,main,form,submit,events, value: () => value, locked: () => locked};
}

test("entry starts modal and inert; Escape cannot dismiss it", () => {
  const f=fixture();
  assert.equal(f.gate.open,true); assert.equal(f.content.inert,true); assert.equal(f.locked(),true);
  let prevented=false;
  f.events.get("gate:cancel")!({preventDefault: () => {prevented=true;}});
  assert.equal(prevented,true);
});
test("adult entry unlocks content, moves focus and persists for navigation", () => {
  const f=fixture(); f.form.valid=true; f.submit();
  assert.equal(f.gate.open,false); assert.equal(f.content.inert,false); assert.equal(f.locked(),false); assert.equal(f.main.focused,true);
  const next=fixture(f.value()); assert.equal(next.content.inert,false);
});
test("declining keeps content locked across reloads or language navigation", () => {
  const f=fixture(); f.events.get("decline:click")!();
  assert.equal(f.content.inert,true); assert.equal(f.accept.hidden,true); assert.equal(f.decline.hidden,true); assert.equal(f.denied.hidden,false); assert.equal(f.denied.focused,true);
  const next=fixture(f.value()); assert.equal(next.content.inert,true); assert.equal(next.accept.hidden,true);
});
test("corrupt or unavailable storage starts locked and still allows a session entry", () => {
  for (const f of [fixture("broken-json"), fixture(null,true)]) {
    assert.equal(f.content.inert,true);
    f.form.valid=true; f.submit();
    assert.equal(f.content.inert,false);
  }
});
test('entry requires checked consent and old age-only acceptance never grants access', () => {
  const f=fixture(null, false, JSON.stringify('adult'));
  f.submit(); assert.equal(f.content.inert,true); assert.equal(f.value(),null);
  f.form.valid=true; f.submit(); assert.equal(f.content.inert,false);
  const denied=fixture(JSON.stringify('adult'),false,JSON.stringify('underage'));
  denied.form.valid=true; denied.submit(); assert.equal(denied.content.inert,true);
});
