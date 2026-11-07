import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCart,
  calculateTotals,
  validCheckoutForm,
} from "../src/lib/reservation.ts";
import { allRoutes, pathFor } from "../src/lib/routes.ts";
import { dictionaries } from "../src/i18n/index.ts";
import {
  projects,
  strains,
  offers,
  SHOW_PROJECTS,
  getAvailableOffer,
  formatLineage,
  getCatalogLine,
  catalogLines,
  catalogStrains,
} from "../src/data/catalog.ts";

test("cart rejects malformed data, unknown offers, duplicates, fractions and invalid quantities", () => {
  for (const value of [null, {}, "[]", false])
    assert.deepEqual(normalizeCart(value), []);
  const valid = { id: "demo-sandia", quantity: 2 };
  assert.deepEqual(
    normalizeCart([
      valid,
      valid,
      { id: "unknown", quantity: 1 },
      { id: "demo-cherry", quantity: 1.5 },
      { id: "demo-albany", quantity: 0 },
    ]),
    [valid],
  );
  assert.deepEqual(
    normalizeCart([
      { id: "demo-sandia", quantity: 3 },
      { id: "demo-cherry", quantity: "1" },
      { id: "demo-albany", quantity: -1 },
    ]),
    [],
  );
});
test("USD totals use integer cents, trusted offer prices and no shipping on empty baskets", () => {
  assert.deepEqual(calculateTotals([]), { subtotal: 0, shipping: 0, total: 0 });
  assert.deepEqual(
    calculateTotals([
      { id: "demo-sandia", quantity: 2 },
      { id: "demo-cherry", quantity: 1 },
    ]),
    { subtotal: 18000, shipping: 1000, total: 19000 },
  );
});
test("checkout form requires complete contact, US address shape and acknowledgement", () => {
  const data = {
    name: "Alex Example",
    email: "alex@example.com",
    address: "123 Example Street",
    city: "Los Angeles",
    state: "CA",
    zip: "90001",
    terms: true,
  };
  assert.equal(validCheckoutForm(data), true);
  for (const patch of [
    { email: "invalid" },
    { zip: "ABCDE" },
    { state: "California" },
    { terms: false },
    { address: "" },
  ])
    assert.equal(validCheckoutForm({ ...data, ...patch }), false);
});
test("every public route has a unique English and Spanish equivalent", () => {
  const routes = allRoutes();
  assert.equal(routes.length, 66);
  assert.equal(new Set(routes.map((r) => r.path)).size, routes.length);
  for (const r of routes)
    assert.ok(
      routes.find(
        (other) =>
          other.locale !== r.locale &&
          other.page === r.page &&
          other.slug === r.slug,
      ),
    );
  assert.equal(pathFor("es", "strain", "la-sandia"), "/es/genetica/la-sandia/");
  assert.equal(pathFor("en", "home"), "/");
});
test("both interface languages are complete and catalog relationships are valid", () => {
  assert.deepEqual(
    Object.keys(dictionaries.en).sort(),
    Object.keys(dictionaries.es).sort(),
  );
  for (const language of Object.values(dictionaries))
    for (const value of Object.values(language)) assert.ok(value.trim());
  assert.equal(strains.length, 23);
  assert.equal(projects.length, 0);
  for (const s of strains) {
    assert.equal(s.project, undefined);
  }
  for (const o of offers) assert.ok(strains.find((s) => s.id === o.strain));
});
test('the 18 available varieties keep their $60 packs and all SKUs remain unique',()=>{
  assert.equal(offers.length,23);
  assert.equal(new Set(offers.map(offer=>offer.id)).size,23);
  assert.ok(offers.every(offer=>offer.cents===6000));
  const available = strains.filter(strain=>strain.available);
  assert.equal(available.length,18);
  for (const strain of available) {
    assert.equal(getAvailableOffer(strain.id)?.cents,6000);
    assert.equal(getAvailableOffer(strain.id)?.max,2);
  }
  assert.equal(getAvailableOffer('la-sandia')?.id,'demo-sandia');
});

test("supplied artwork parent roles and limited seed-type evidence are preserved", () => {
  const byId = Object.fromEntries(strains.map((s) => [s.id, s]));
  assert.deepEqual(
    strains.slice(0, 4).map((s) => s.name),
    ["La Sandía", "Cherry Zushi", "Albany Chocolate", "Spanish Blue"],
  );
  for (const s of strains.slice(0, 4)) {
    assert.equal(s.father, "Cherry Runtz × BloodBerry Rain");
    assert.equal(s.source, "supplied-artwork");
    assert.equal(s.status, "current");
  }
  assert.equal(
    byId["la-sandia"].mother,
    "Watermelon Sugaree × Grape Rainbow Pie",
  );
  assert.equal(byId["cherry-zushi"].mother, "Zkittlez × Kush Mints");
  assert.equal(
    byId["albany-chocolate"].mother,
    "Jealousy × Apples and Bananas",
  );
  assert.equal(byId["spanish-blue"].mother, "Gary Payton × Gary Payton");
  assert.equal(byId["la-sandia"].seedType, undefined);
  assert.equal(byId["cherry-zushi"].seedType, undefined);
  assert.equal(byId["albany-chocolate"].seedType, "hybridRegular");
  assert.equal(byId["spanish-blue"].seedType, "hybridRegular");
  assert.equal(SHOW_PROJECTS, false);
  assert.ok(
    allRoutes().every((r) => r.page !== "work" && r.page !== "project"),
  );
});

test("new breeder records preserve source crosses and confirmed parent roles", () => {
  const pink = strains.find(s => s.id === "pink-hatch")!;
  assert.equal(pink.suppliedLineage, "(Cherry Runtz × Bloodberry Rain) × (Garlic Juice × Grape Rainbow Pie)");
  assert.equal(pink.seedType, "hybridRegular");
  assert.equal(pink.mother, "Garlic Juice × Grape Rainbow Pie");
  assert.equal(pink.father, "Cherry Runtz × BloodBerry Rain");
  const batch = strains.filter(s => s.collection === "cherry-booberries");
  assert.deepEqual(batch.map(s => s.suppliedLineage), [
    "Sweet Jealousy x Cherry Boo Berries",
    "Rainbow Juice x Cherry Boo Berries",
    "Gary Payton x Zushi x Cherry Boo Berries",
    "Cherry Boo Berries x Cherry Boo Berries",
    "Gary Payton S1 x Cherry Boo Berries",
    "Sangria x Zcube x Cherry Boo Berries",
    "Cereza Black Tuna x Cherry Boo Berries",
  ]);
  for (const s of batch) {
    assert.equal(s.status, "current");
    assert.ok(s.mother);
    assert.equal(s.father, "Cherry Boo Berries");
    assert.equal(s.seedType, undefined);
    assert.equal(offers.some(o => o.strain === s.id), true);
    for (const locale of ["en", "es"] as const)
      assert.ok(allRoutes().some(r => r.path === pathFor(locale, "strain", s.id)));
  }
});

test("public pedigrees consistently group the female parent before the male parent", () => {
  assert.deepEqual(strains.filter(s=>s.status!=='coming-soon').map(formatLineage), [
    "(Watermelon Sugaree x Grape Rainbow Pie) x (Cherry Runtz x BloodBerry Rain)",
    "(Zkittlez x Kush Mints) x (Cherry Runtz x BloodBerry Rain)",
    "(Jealousy x Apples and Bananas) x (Cherry Runtz x BloodBerry Rain)",
    "(Gary Payton x Gary Payton) x (Cherry Runtz x BloodBerry Rain)",
    "(Garlic Juice x Grape Rainbow Pie) x (Cherry Runtz x BloodBerry Rain)",
    "Sweet Jealousy x Cherry Boo Berries",
    "Rainbow Juice x Cherry Boo Berries",
    "(Gary Payton x Zushi) x Cherry Boo Berries",
    "Cherry Boo Berries x Cherry Boo Berries",
    "Gary Payton S1 x Cherry Boo Berries",
    "(Sangria x Zcube) x Cherry Boo Berries",
    "Cereza Black Tuna x Cherry Boo Berries",
    "Bakerz Dozen x Plantz",
    "Toronjaz x Plantz",
    "(Gary Payton x Zushi) x Plantz",
    "Lemon Zoap x Plantz",
    "Maple Nectar x Plantz",
    "Plantz x Plantz",
  ]);
  for (const s of strains.filter(s => s.collection === "cherry-booberries"))
    assert.equal(s.name, formatLineage(s));
  assert.equal(
    formatLineage({ mother: "Toronjaz", father: "Gary Payton × Zushi", suppliedLineage: "" }),
    "Toronjaz x (Gary Payton x Zushi)",
  );
});

test("availability switches per variety without removing its catalog routes", () => {
  const strain = strains.find(s => s.id === "la-sandia")!;
  const before = strain.available;
  const selected = [{ id: "demo-sandia", quantity: 1 }];
  try {
    strain.available = false;
    assert.equal(getAvailableOffer(strain.id), undefined);
    assert.deepEqual(normalizeCart(selected), []);
    assert.deepEqual(calculateTotals(selected), {subtotal:0, shipping:0, total:0});
    assert.equal(getAvailableOffer("cherry-zushi")?.id, "demo-cherry");
    assert.ok(allRoutes().some(r => r.page === "strain" && r.slug === strain.id));
    // Prior order confirmations remain readable when availability changes later.
    assert.deepEqual(normalizeCart(selected, {allowUnavailable:true}), selected);
    assert.equal(calculateTotals(selected, {allowUnavailable:true}).total, 7000);
    strain.available = true;
    assert.equal(getAvailableOffer(strain.id)?.id, "demo-sandia");
    assert.deepEqual(normalizeCart(selected), selected);
  } finally { strain.available = before; }
  for (const s of strains) assert.equal(typeof s.available, "boolean");
});

test("Plantz remains an independent line with six bilingual variety routes", () => {
  assert.deepEqual(catalogLines.map(line => line.id), ["caviar", "original", "cherry-booberries", "plantz"]);
  const members = strains.filter(s => getCatalogLine(s).id === "plantz");
  assert.deepEqual(members.map(s => s.mother), ["Bakerz Dozen", "Toronjaz", "Gary Payton x Zushi", "Lemon Zoap", "Maple Nectar", "Plantz"]);
  assert.equal(strains.filter(s => getCatalogLine(s).id === "original").length, 5);
  assert.equal(strains.filter(s => getCatalogLine(s).id === "cherry-booberries").length, 7);
  assert.equal(new Set(strains.map(s => s.id)).size, strains.length);
  for (const s of members) {
    assert.equal(s.father, "Plantz");
    assert.equal(s.available, true);
    assert.equal(s.seedType, undefined);
    assert.equal(getAvailableOffer(s.id)?.cents, 6000);
    assert.equal(s.name, formatLineage(s));
    for (const locale of ["en", "es"] as const)
      assert.ok(allRoutes().some(r => r.path === pathFor(locale, "strain", s.id)));
  }
});

test('Winter is coming leads the catalog with five upcoming Caviar crosses',()=>{
  const upcoming = strains.filter(s=>s.collection==='caviar');
  const names = ['Gary Payton x Zushi x Caviar','Bakers Dozen x Caviar','Toronjaz x Caviar','Maple Nectar x Caviar','Plantz x Caviar'];
  assert.deepEqual(upcoming.map(s=>s.name),names);
  assert.deepEqual(catalogStrains.slice(0,5).map(s=>s.name),names);
  for(const strain of upcoming) {
    assert.equal(strain.status,'coming-soon');
    assert.equal(strain.available,false);
    assert.equal(strain.mother,undefined);
    assert.equal(strain.father,undefined);
    assert.equal(strain.seedType,undefined);
    assert.equal(strain.suppliedLineage,strain.name);
    assert.equal(getAvailableOffer(strain.id),undefined);
    const offer=offers.find(o=>o.strain===strain.id)!;
    assert.deepEqual(normalizeCart([{id:offer.id,quantity:1}]),[]);
    for(const locale of ['en','es'] as const) assert.ok(allRoutes().some(r=>r.path===pathFor(locale,'strain',strain.id)));
  }
});
