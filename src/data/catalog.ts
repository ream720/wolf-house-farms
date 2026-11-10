import { text, type Localized } from "../i18n/index.ts";

export interface Project {
  id: string;
  name: string;
  kind: "preservation" | "worked";
  image: string;
  number: string;
  title: Localized;
  intro: Localized;
  goal: Localized;
  approach: Localized;
}
// No project records are published until Wolf House Genetics supplies its project map.
export const projects: Project[] = [];

export const catalogLines = [
  { id: "caviar", label: "winterLine", comingSoon: true },
  { id: "original", label: "originalSelections", comingSoon: false },
  { id: "cherry-booberries", label: "cherryBatch", comingSoon: false },
  { id: "plantz", label: "plantzLine", comingSoon: false },
] as const;
export type CatalogLineId = (typeof catalogLines)[number]["id"];

export interface Strain {
  id: string;
  name: string;
  project?: string;
  status: "coming-soon" | "current" | "historical" | "retired";
  /** Whether this variety accepts reservations. Finite stock is managed by Wolf House Genetics. */
  available: boolean;
  number: string;
  image?: string;
  collection?: CatalogLineId;
  imageAlt: Localized;
  mother?: string;
  father?: string;
  suppliedLineage: string;
  seedType?: "hybridRegular";
  /** Optional overview for confirmed details beyond the name, collection and parentage. */
  description?: Localized;
  artStory: Localized;
  source: "supplied-artwork" | "breeder-message" | "batch-list";
}
// Project relationships remain optional until the breeder supplies a map of the work.
export const SHOW_PROJECTS = false;
const father = "Cherry Runtz × BloodBerry Rain";
export const strains: Strain[] = [
  {
    id: "la-sandia",
    available: true,
    name: "La Sandía",
    number: "01",
    image: "la-sandia",
    mother: "Watermelon Sugaree × Grape Rainbow Pie",
    father,
    suppliedLineage:
      "((Cherry Runtz × BloodBerry Rain) × (Watermelon Sugaree × Grape Rainbow Pie))",
    status: "current",
    source: "supplied-artwork",
    imageAlt: text(
      "Woodcut illustration of a watermelon and cut wedge in a desert landscape.",
      "Ilustración de grabado de una sandía y una rebanada en un paisaje desértico.",
    ),
    artStory: text(
      "The original card places a whole watermelon and a red wedge at its center. This interpretation carries that namesake into the Wolf House landscape through carved textures, deep green rind, and a restrained red accent.",
      "La tarjeta original tiene una sandía entera y una rebanada roja como protagonistas. Esta interpretación lleva ese motivo al paisaje de Wolf House mediante texturas de grabado, una cáscara verde profunda y un acento rojo discreto.",
    ),
  },
  {
    id: "cherry-zushi",
    available: true,
    name: "Cherry Zushi",
    number: "02",
    image: "cherry-zushi",
    mother: "Zkittlez × Kush Mints",
    father,
    suppliedLineage:
      "((Cherry Runtz × BloodBerry Rain) × (Zkittlez × Kush Mints))",
    status: "current",
    source: "supplied-artwork",
    imageAlt: text(
      "Woodcut illustration of a cherry branch and a small sushi still life against distant desert mountains.",
      "Ilustración de grabado de una rama de cerezas y un pequeño bodegón de sushi frente a montañas desérticas.",
    ),
    artStory: text(
      "Cherries and sushi give the supplied artwork its visual identity. Here, a cherry branch takes the lead, with a small still life beneath it, all rendered in the same engraved language as the wider site.",
      "Las cerezas y el sushi definen la identidad visual del arte proporcionado. Aquí, una rama de cerezas es protagonista, con un pequeño bodegón debajo, en el mismo lenguaje de grabado que el resto del sitio.",
    ),
  },
  {
    id: "albany-chocolate",
    available: true,
    name: "Albany Chocolate",
    number: "03",
    image: "albany-chocolate",
    mother: "Jealousy × Apples and Bananas",
    father,
    suppliedLineage:
      "((Cherry Runtz × BloodBerry Rain) × (Jealousy × Apples and Bananas))",
    seedType: "hybridRegular",
    status: "current",
    source: "supplied-artwork",
    imageAlt: text(
      "Woodcut illustration of a dark mahogany rooster on a desert rock, with agave and distant mountains.",
      "Ilustración de grabado de un gallo color caoba sobre una roca del desierto, con agaves y montañas lejanas.",
    ),
    artStory: text(
      "A dark rooster is the central motif of the supplied design. Its new treatment uses mahogany feather detail, warm earth, and a quiet desert setting to connect it with the Wolf House visual world.",
      "Un gallo oscuro es el motivo central del diseño proporcionado. Su nueva interpretación utiliza plumas en tonos caoba, tierra cálida y un paisaje desértico sereno para integrarlo al universo visual de Wolf House.",
    ),
  },
  {
    id: "spanish-blue",
    available: true,
    name: "Spanish Blue",
    number: "04",
    image: "spanish-blue",
    mother: "Gary Payton × Gary Payton",
    father,
    suppliedLineage:
      "((Cherry Runtz × BloodBerry Rain) × (Gary Payton × Gary Payton))",
    seedType: "hybridRegular",
    status: "current",
    source: "supplied-artwork",
    imageAlt: text(
      "Woodcut illustration of an ivory and slate-blue rooster in a quiet desert landscape.",
      "Ilustración de grabado de un gallo marfil con tonos azul pizarra en un paisaje desértico sereno.",
    ),
    artStory: text(
      "The pale rooster from the supplied artwork becomes an engraved study in ivory and slate blue. The bird remains the namesake motif, framed by the same landscape and paper tones used throughout the site.",
      "El gallo claro del arte proporcionado se transforma en un estudio grabado en marfil y azul pizarra. El ave conserva su papel como motivo de la ilustración, enmarcada por el paisaje y los tonos de papel del sitio.",
    ),
  },
];
strains.push({
  available: true,
  id: "pink-hatch", name: "Pink Hatch", number: "05",
  mother: "Garlic Juice × Grape Rainbow Pie",
  father,
  suppliedLineage: "(Cherry Runtz × Bloodberry Rain) × (Garlic Juice × Grape Rainbow Pie)",
  seedType: "hybridRegular", status: "current", source: "breeder-message",
  imageAlt: text("", ""),
  description: text("A rooster-themed selection.", "Una selección con motivo de gallo."),
  artStory: text("", ""),
});
const cherryBatch = [
  ["sweet-jealousy-cherry-booberries", "Sweet Jealousy", true],
  ["rainbow-juice-cherry-booberries", "Rainbow Juice", true],
  ["gary-payton-zushi-cherry-booberries", "Gary Payton x Zushi", true],
  ["cherry-booberries-cherry-booberries", "Cherry Boo Berries", true],
  ["gary-payton-s1-cherry-booberries", "Gary Payton S1", true],
  ["sangria-zcube-cherry-booberries", "Sangria x Zcube", true],
  ["cereza-black-tuna-cherry-booberries", "Cereza Black Tuna", true],
] as const;
for (const [index, [id, parent, available]] of cherryBatch.entries()) {
  const suppliedLineage = `${parent} x Cherry Boo Berries`;
  const parentage = { mother: parent, father: "Cherry Boo Berries", suppliedLineage };
  const name = formatLineage(parentage);
  strains.push({
    available,
    id, name, number: String(index + 6).padStart(2, "0"), collection: "cherry-booberries",
    ...parentage, status: "current", source: "batch-list",
    imageAlt: text("", ""),
    artStory: text("", ""),
  });
}
const plantzCrosses = [
  ["bakerz-dozen-plantz", "Bakerz Dozen", "Bakerz Dozen x Plantz", false],
  ["toronjaz-plantz", "Toronjaz", "Toronjaz x Plantz", true],
  ["gary-payton-zushi-plantz", "Gary Payton x Zushi", "(Gary Patyon x Zushi) x Plantz", true],
  ["lemon-zoap-plantz", "Lemon Zoap", "Lemon Zoap x Plantz", false],
  ["maple-nectar-plantz", "Maple Nectar", "Maple Nectar x Plantz", true],
  ["plantz-plantz", "Plantz", "Plantz x Plantz", true],
] as const;
for (const [index, [id, mother, suppliedLineage, available]] of plantzCrosses.entries()) {
  const parentage = { mother, father: "Plantz", suppliedLineage };
  strains.push({
    id, name: formatLineage(parentage), number: String(index + 13).padStart(2, "0"),
    collection: "plantz", available, ...parentage,
    status: "current", source: "breeder-message",
    imageAlt: text("", ""), artStory: text("", ""),
  });
}
export const getCatalogLine = (strain: Strain) =>
  catalogLines.find(line => line.id === (strain.collection ?? "original"))!;

const caviarCrosses = [
  ['gary-payton-zushi-caviar', 'Gary Payton x Zushi x Caviar'],
  ['bakers-dozen-caviar', 'Bakers Dozen x Caviar'],
  ['toronjaz-caviar', 'Toronjaz x Caviar'],
  ['maple-nectar-caviar', 'Maple Nectar x Caviar'],
  ['plantz-caviar', 'Plantz x Caviar'],
] as const;
for (const [index, [id, suppliedLineage]] of caviarCrosses.entries()) {
  strains.push({
    id, name: suppliedLineage, suppliedLineage,
    number: String(index + 19).padStart(2,'0'), collection:'caviar',
    available:false, status:'coming-soon', source:'breeder-message',
    // The supplied list does not confirm parent sexes or seed type.
    imageAlt:text('',''), artStory:text('',''),
  });
}

// Public display order follows the collection order without changing stable
// record numbers or established order SKUs.
export const catalogStrains = catalogLines.flatMap(line => strains.filter(strain => getCatalogLine(strain).id === line.id));

/** Female x male, grouping only a parent that is itself a cross. */
export function formatLineage(strain: Pick<Strain, "mother" | "father" | "suppliedLineage">): string {
  if (!strain.mother || !strain.father) return strain.suppliedLineage;
  const parentLabel = (parent: string) => {
    const label = parent.replace(/\s+×\s+/g, " x ");
    return /\s+x\s+/i.test(label) ? `(${label})` : label;
  };
  return `${parentLabel(strain.mother)} x ${parentLabel(strain.father)}`;
}
export const getProject = (id: string) => projects.find((p) => p.id === id)!;
export const getStrain = (id: string) => strains.find((s) => s.id === id)!;
export const PACK_PRICE_CENTS = 5000;
export const MAX_PACKS_PER_VARIETY = 2;
export const SHIPPING_CENTS = 1500;
export const pollenOffer = {
  id: 'pollen-plantz-2ml', strain: 'plantz-pollen', name: text('Plantz pollen', 'Polen de Plantz'),
  pack: text('2 mL pollen per unit', '2 mL de polen por unidad'),
  cents: 20000, max: 4, stock: 4,
};
export interface Offer { id: string; strain: string; cents: number; max: number }
// Preserve the three existing SKU values for saved orders and customers' baskets.
const establishedOfferIds: Record<string,string> = {
  'la-sandia': 'demo-sandia', 'cherry-zushi': 'demo-cherry', 'albany-chocolate': 'demo-albany',
};
export const seedOffers = strains.map(strain => ({
  id: establishedOfferIds[strain.id] || `pack-${strain.id}`,
  strain: strain.id, cents: PACK_PRICE_CENTS, max: MAX_PACKS_PER_VARIETY,
}));
export const offers: Offer[] = [...seedOffers, pollenOffer];
export function offerName(offer: Offer, locale: 'en' | 'es' = 'en') {
  return offer.id === pollenOffer.id ? pollenOffer.name[locale] : getStrain(offer.strain).name;
}
export function offerPack(offer: Offer, locale: 'en' | 'es' = 'en') {
  return offer.id === pollenOffer.id ? pollenOffer.pack[locale] : locale === 'es' ? '10 semillas por paquete' : '10 seeds per pack';
}

// No release schedule: reservation eligibility belongs to each variety.
export function isOfferAvailable(offer: (typeof offers)[number]): boolean {
  if (offer.id === pollenOffer.id) return true; // Live stock is allocated atomically by the database.
  const strain = strains.find(s => s.id === offer.strain);
  return strain?.available === true && strain.status !== 'coming-soon';
}
export function getAvailableOffer(strainId: string) {
  return offers.find(o => o.strain === strainId && isOfferAvailable(o));
}
