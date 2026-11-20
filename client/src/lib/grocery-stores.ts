import type { Language } from "./i18n";

// Where the person buys groceries (onboarding and Groceries → My stores). The one store catalog: a future promotions
// integration maps these stable ids to providers. Mock data: logos are bundled in client/public/store-logos.
export const storeMethods = ["delivery", "walkIn"] as const;
export type StoreMethod = typeof storeMethods[number];
/** A catalog id, or "custom:<name in lower case>" for a store the person added (its name kept as typed). */
export type StoreChoice = { id: string; name?: string; methods: StoreMethod[] };

export const storeCatalog: Record<string, { name: string; logo: string }> = {
  walmart: { name: "Walmart", logo: "/store-logos/walmart.svg" },
  "real-canadian-superstore": { name: "Real Canadian Superstore", logo: "/store-logos/real-canadian-superstore.png" },
  "no-frills": { name: "No Frills", logo: "/store-logos/no-frills.png" },
  safeway: { name: "Safeway", logo: "/store-logos/safeway.svg" },
  freshco: { name: "FreshCo", logo: "/store-logos/freshco.svg" },
  shufersal: { name: "שופרסל", logo: "/store-logos/shufersal.svg" },
  "rami-levy": { name: "רמי לוי", logo: "/store-logos/rami-levy.png" },
  yochananof: { name: "יוחננוף", logo: "/store-logos/yochananof.svg" },
  victory: { name: "ויקטורי", logo: "/store-logos/victory.svg" },
  "osher-ad": { name: "אושר עד", logo: "/store-logos/osher-ad.png" },
};
const canada = ["walmart", "real-canadian-superstore", "no-frills", "safeway", "freshco"];
/** The interface language picks the five suggestions (Russian is for Russian-speaking shoppers in Canada). */
export const suggestedStores: Record<Language, string[]> = { en: canada, ru: canada, he: ["shufersal", "rami-levy", "yochananof", "victory", "osher-ad"] };

const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
export const storeName = (choice: StoreChoice) => storeCatalog[choice.id]?.name ?? choice.name ?? "";

/** The five suggestions, then every saved store outside them (other language or custom). */
export const pickerRows = (stores: StoreChoice[], lang: Language): StoreChoice[] => {
  const suggested = suggestedStores[lang];
  return [...suggested.map(id => stores.find(s => s.id === id) ?? { id, methods: [] }), ...stores.filter(s => !suggested.includes(s.id))];
};

/** Turns one method on or off; a store left with no method is removed. */
export function toggleStoreMethod(stores: StoreChoice[], store: StoreChoice, method: StoreMethod): StoreChoice[] {
  const current = stores.find(s => s.id === store.id) ?? { ...store, methods: [] };
  const methods = current.methods.includes(method) ? current.methods.filter(m => m !== method) : storeMethods.filter(m => m === method || current.methods.includes(m));
  const rest = stores.filter(s => s.id !== store.id);
  return methods.length ? (stores.some(s => s.id === store.id) ? stores.map(s => (s.id === store.id ? { ...current, methods } : s)) : [...rest, { ...current, methods }]) : rest;
}

/** Adds a store by name. The same name (any capitalization or spacing), custom or from the catalog, reuses that entry. */
export function addStore(stores: StoreChoice[], rawName: string, methods: StoreMethod[]): StoreChoice[] {
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name || !methods.length) return stores;
  const id = Object.keys(storeCatalog).find(c => key(storeCatalog[c].name) === key(name)) ?? `custom:${key(name)}`;
  const existing = stores.find(s => s.id === id);
  const merged = storeMethods.filter(m => methods.includes(m) || existing?.methods.includes(m));
  return existing ? stores.map(s => (s.id === id ? { ...s, methods: merged } : s))
    : [...stores, id.startsWith("custom:") ? { id, name, methods: merged } : { id, methods: merged }];
}

export function sanitizeStores(raw: unknown): StoreChoice[] {
  if (!Array.isArray(raw)) return [];
  const out: StoreChoice[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const methods = Array.isArray(r.methods) ? storeMethods.filter(m => (r.methods as unknown[]).includes(m)) : [];
    if (!methods.length || typeof r.id !== "string" || out.some(s => s.id === r.id)) continue;
    if (storeCatalog[r.id]) out.push({ id: r.id, methods });
    else if (r.id.startsWith("custom:") && typeof r.name === "string" && r.name.trim() && key(r.name) === r.id.slice(7))
      out.push({ id: r.id, name: r.name.trim().replace(/\s+/g, " ").slice(0, 40), methods });
  }
  return out.slice(0, 50);
}
