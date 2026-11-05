import type { Locale } from "../i18n/index.ts";
import { strains, projects, SHOW_PROJECTS } from "../data/catalog.ts";

export type Page =
  | "home"
  | "genetics"
  | "strain"
  | "work"
  | "project"
  | "story"
  | "checkout"
  | "confirmation"
  | "contact"
  | "privacy"
  | "terms"
  | "faq"
  | "ordering";
const segments = {
  en: {
    home: "",
    genetics: "genetics",
    strain: "genetics",
    work: "work",
    project: "work",
    story: "story",
    checkout: "checkout",
    confirmation: "confirmation",
    contact: "contact",
    privacy: "privacy",
    terms: "terms",
    faq: "faq",
    ordering: "ordering",
  },
  es: {
    home: "",
    genetics: "genetica",
    strain: "genetica",
    work: "trabajo",
    project: "trabajo",
    story: "historia",
    checkout: "reserva",
    confirmation: "confirmacion",
    contact: "contacto",
    privacy: "privacidad",
    terms: "terminos",
    faq: "preguntas-frecuentes",
    ordering: "pedidos",
  },
};
export function pathFor(locale: Locale, page: Page, slug = ""): string {
  const parts = [
    locale === "es" ? "es" : "",
    segments[locale][page],
    slug,
  ].filter(Boolean);
  return parts.length ? `/${parts.join("/")}/` : "/";
}
export function allRoutes() {
  const routes: { locale: Locale; page: Page; slug: string; path: string }[] =
    [];
  for (const locale of ["en", "es"] as const) {
    for (const page of [
      "home",
      "genetics",
      "story",
      "checkout",
      "confirmation",
      "contact",
      "privacy",
      "terms",
      "faq",
      "ordering",
    ] as Page[])
      routes.push({ locale, page, slug: "", path: pathFor(locale, page) });
    if (SHOW_PROJECTS)
      routes.push({
        locale,
        page: "work",
        slug: "",
        path: pathFor(locale, "work"),
      });
    for (const strain of strains)
      routes.push({
        locale,
        page: "strain",
        slug: strain.id,
        path: pathFor(locale, "strain", strain.id),
      });
    for (const project of SHOW_PROJECTS ? projects : [])
      routes.push({
        locale,
        page: "project",
        slug: project.id,
        path: pathFor(locale, "project", project.id),
      });
  }
  return routes;
}
