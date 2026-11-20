import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { addStore, pickerRows, sanitizeStores, storeCatalog, suggestedStores, toggleStoreMethod } from "../client/src/lib/grocery-stores";
import { loadSettings, updateSettings } from "../client/src/lib/basic-settings";

// Every catalog store has a bundled logo; every suggestion is in the catalog; ten unique retailers.
for (const [id, store] of Object.entries(storeCatalog)) assert.ok(existsSync(`client/public${store.logo}`), `logo for ${id}`);
assert.equal(new Set(Object.values(suggestedStores).flat()).size, 10);
for (const id of Object.values(suggestedStores).flat()) assert.ok(storeCatalog[id], id);

// Walmart walk-in, then Safeway delivery + walk-in; the order of methods is stable.
let stores = toggleStoreMethod([], { id: "walmart", methods: [] }, "walkIn");
stores = toggleStoreMethod(stores, { id: "safeway", methods: [] }, "walkIn");
stores = toggleStoreMethod(stores, { id: "safeway", methods: [] }, "delivery");
assert.deepEqual(stores, [{ id: "walmart", methods: ["walkIn"] }, { id: "safeway", methods: ["delivery", "walkIn"] }]);
// Turning off the last method removes the store.
assert.deepEqual(toggleStoreMethod(stores, stores[0], "walkIn"), [stores[1]]);

// Hebrew keeps the Canadian choices visible after its five suggestions; English shows no duplicates.
assert.deepEqual(pickerRows(stores, "he").map(s => s.id), [...suggestedStores.he, "walmart", "safeway"]);
assert.deepEqual(pickerRows(stores, "ru").map(s => s.id), suggestedStores.ru);

// Custom stores: blank name or no method adds nothing; the same name in another case/spacing reuses the entry.
assert.equal(addStore(stores, "   ", ["walkIn"]), stores);
assert.equal(addStore(stores, "Butcher", []), stores);
let custom = addStore([], "  Joe's  Butcher ", ["walkIn"]);
assert.deepEqual(custom, [{ id: "custom:joe's butcher", name: "Joe's Butcher", methods: ["walkIn"] }]);
custom = addStore(custom, "joe's butcher", ["delivery"]);
assert.deepEqual(custom, [{ id: "custom:joe's butcher", name: "Joe's Butcher", methods: ["delivery", "walkIn"] }]);
// A catalog name typed by hand is the catalog store.
assert.deepEqual(addStore([], " WALMART", ["delivery"]), [{ id: "walmart", methods: ["delivery"] }]);

// Sanitizing drops unknown ids, empty methods, duplicates and mismatched custom names.
assert.deepEqual(sanitizeStores([{ id: "walmart", methods: ["walkIn", "fly"] }, { id: "walmart", methods: ["delivery"] }, { id: "nope", methods: ["walkIn"] },
  { id: "safeway", methods: [] }, { id: "custom:x", name: "Y", methods: ["walkIn"] }, ...custom]), [{ id: "walmart", methods: ["walkIn"] }, ...custom]);

// Saved with Basic Settings and read back.
const memory = new Map<string, string>();
const store = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
assert.deepEqual(loadSettings(store).shopping.stores, []);
updateSettings(s => ({ ...s, shopping: { ...s.shopping, stores } }), store);
assert.deepEqual(loadSettings(store).shopping.stores, stores);
console.log("grocery stores: ok");
