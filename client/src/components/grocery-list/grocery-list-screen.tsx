import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { categorizeIngredient } from "@/lib/grocery-categories";
import { GroceryItemPicture } from "./grocery-item-picture";
import { GroceryBulkAdd, type BulkItem } from "./grocery-bulk-add";
import { GroceryAddItem } from "./grocery-add-item";
import { groceryProductText } from "@/lib/grocery-product-copy";
import { GroceryNote } from "./grocery-note";
import { useI18n } from "@/lib/i18n";
import { fetchRecipes } from "@/lib/storage";
import { readGroceryPrefs, saveGroceryPrefs, toggleCategory } from "@/lib/grocery-progress";
import { emptyPlan, fetchWeek, planStorageKey, readPlan, saveWeek, writePlan, type PlanState } from "@/lib/meal-plan";
import { assignmentKey, buildRecipeGroceryRows, groceryMealsFor, groceryMeasure, groceryPlanVersion, groceryQuantityText, remainingGroceryText, removeGroceryMeals, restoreGroceryMeals } from "@/lib/grocery-meal-removal";
import { buildShoppingList, groceryShoppingQueryKey as shoppingQuery, type Extra, type ShoppingPreference, type ShoppingRow } from "@/lib/grocery-items";
import { shoppingCopy } from "@/lib/grocery-shopping-copy";
import { parseIngredientLine, parseQuantity } from "@shared/ingredient-parse";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePilotPage } from "@/hooks/use-pilot-page";
import { currentWeek, isWeek } from "@/lib/week-plan";
import { toPlannerRecipes, type PlannerRecipe } from "@/lib/planner-recipes";
import { GroceryShareDialog } from "./grocery-share-dialog";
import { Plus, Share2, Store } from "lucide-react";
import { StorePicker } from "@/components/store-picker";
import { useStorePickerCopy } from "@/lib/store-picker-copy";
import { loadSettings } from "@/lib/basic-settings";
import { settingsText } from "@/lib/settings-copy";
import { mentionsTerm } from "@shared/food-rules";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import "./grocery-list.css";

type Recipe = PlannerRecipe;

const categories = [
  "Produce", "Meat & Poultry", "Seafood", "Dairy & Eggs",
  "Grains & Pasta", "Canned & Jarred", "Spices & Seasonings", "Other", "Manually Added",
];

export default function GroceryListScreen() {
  const [, setLocation] = useLocation();
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const pantry = useMemo(() => loadSettings().shopping.pantry, []); // My Basic Settings: "Ingredients I usually have"
  const [initialPrefs] = useState(readGroceryPrefs);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(initialPrefs.checked);
  const [expansion, setExpansion] = useState(initialPrefs.expansion);
  const [shareOpen, setShareOpen] = useState(false);
  const [storesOpen, setStoresOpen] = useState(() => new URLSearchParams(window.location.search).has("stores"));
  const storeCopy = useStorePickerCopy();
  const [tab, setTab] = useState<"all" | "recipes" | "mine">("all");
  // Categories whose "$" button shows item prices. Display-only: expansion and checks are separate state.
  const [shownPrices, setShownPrices] = useState<Set<string>>(new Set());
  const [editingNote, setEditingNote] = useState<string | null>(null);
  // The note field opens once the row menu has closed, otherwise the menu takes focus back and the field closes.
  const noteAfterMenu = useRef<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ShoppingRow | null>(null);
  const [mealKeys, setMealKeys] = useState<Set<string>>(new Set());
  const [partial, setPartial] = useState<ShoppingRow | null>(null);
  const [amount, setAmount] = useState("");
  // Another week's list (/grocery-list?week=Monday from the Week calendar) reads and saves that week on the server;
  // otherwise the current week's browser copy, as before.
  const [otherWeek] = useState(() => { const w = new URLSearchParams(window.location.search).get("week"); return w && isWeek(w) && w !== currentWeek() ? w : null; });
  const [plan, setPlan] = useState<PlanState>(() => otherWeek ? emptyPlan() : readPlan());
  const [weekPending, setWeekPending] = useState(!!otherWeek);
  useEffect(() => {
    if (!otherWeek) return;
    fetchWeek(otherWeek).then(setPlan)
      .catch(() => toast({ title: t("grocery.changeFailed"), variant: "destructive" })).finally(() => setWeekPending(false));
  }, [otherWeek]);
  const shownPlan = useRef(plan);
  shownPlan.current = plan;
  const latestPlan = () => otherWeek ? shownPlan.current : readPlan();
  const storePlan = (next: PlanState) => otherWeek ? saveWeek(otherWeek, next) : writePlan(next);
  const [busy, setBusy] = useState(false);
  const { data: shopping = [], isError: shoppingError, isPending: shoppingPending, refetch: reloadShopping } =
    useQuery<ShoppingPreference[]>({ queryKey: shoppingQuery, refetchOnMount: "always" });
  const preferences = new Map(shopping.map(row => [row.key, row]));
  const skipped = new Set(shopping.filter(row => row.skipped).map(row => row.key));
  const patchShopping = async (patch: { key: string; skipped: boolean }) => {
    const response = await apiRequest("PATCH", shoppingQuery[0], patch);
    const saved: ShoppingPreference = await response.json();
    queryClient.setQueryData<ShoppingPreference[]>(shoppingQuery, previous => [
      ...(previous ?? []).filter(row => row.key !== saved.key), saved,
    ]);
  };
  const copy = (key: Parameters<typeof shoppingCopy>[1]) => shoppingCopy(lang, key);
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (!otherWeek && (event.key === planStorageKey || event.key === null)) {
        setPlan(readPlan());
        setPendingRemoval(null);
      }
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(true);
  const [recipesError, setRecipesError] = useState<string | null>(null);
  // Products the user added by hand ("I'm out of onion"), stored per owner on the server.
  const [extras, setExtras] = useState<Extra[]>([]);
  const [addOpen, setAddOpen] = useState(() => new URLSearchParams(window.location.search).has("add"));
  // Groceries use the approved dishes only (docs/cooking-plan.md); draft edits wait for Save changes.
  const approved = plan.approved ?? [];
  usePilotPage("grocery_list_opened", currentWeek(), approved.length > 0);
  // Notes per item, stored per owner on the server. The list still works if they cannot be loaded.
  const { data: notes = {} } = useQuery<Record<string, string>>({ queryKey: ["/api/grocery-notes"] });
  const { data: pictures = {}, isPending: picturesLoading, isError: picturesError, refetch: reloadPictures } = useQuery<Record<string, string | null>>({ queryKey: ["/api/grocery-item-photos"] });
  const savePicture = async (key: string, image: string | null) => {
    await apiRequest("PUT", "/api/grocery-item-photos", { key, image });
    queryClient.setQueryData<Record<string, string | null>>(["/api/grocery-item-photos"], previous => ({ ...previous, [key]: image }));
  };
  const saveNote = (key: string, note: string) => {
    queryClient.setQueryData(["/api/grocery-notes"], { ...notes, [key]: note });
    apiRequest("PUT", "/api/grocery-notes", { key, note }).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ["/api/grocery-notes"] });
      toast({ title: t("grocery.changeFailed"), variant: "destructive" });
    });
  };

  useEffect(() => {
    let active = true;
    setIsLoadingRecipes(true);
    // The recipe list still works if the hand-added items cannot be loaded.
    const loadExtras = fetch("/api/grocery-extras").then(res => res.ok ? res.json() : []).catch(() => []);
    Promise.all([fetchRecipes(), loadExtras])
      .then(([data, added]) => {
        if (!active) return;
        setExtras(added);
        setRecipes(toPlannerRecipes(data));
        setRecipesError(null);
      })
      .catch((error) => {
        if (!active) return;
        setRecipes([]);
        setRecipesError(error instanceof Error ? error.message : "Failed to load recipes");
      })
      .finally(() => {
        if (active) setIsLoadingRecipes(false);
      });
    return () => { active = false; };
  }, []);

  const recipeRows = useMemo(() => buildRecipeGroceryRows(plan.approved ?? [], recipes), [plan, recipes]);
  const { activeRows, manualRows, purchasedRows, recipePurchases } = buildShoppingList(recipeRows, extras, checkedItems, skipped);
  const categoryOf = (row: ShoppingRow) => {
    if (row.category && categories.includes(row.category)) return row.category;
    const category = categorizeIngredient(row.ingredient);
    return category === "Other" && row.extraId ? "Manually Added" : category;
  };

  useEffect(() => {
    if (!isLoadingRecipes && !recipesError) saveGroceryPrefs({ checked: checkedItems, expansion });
  }, [isLoadingRecipes, recipesError, checkedItems, expansion]);

  const markPurchased = (row: ShoppingRow, quantity?: number) => {
    const measure = groceryMeasure(row.ingredient);
    const matchingKeys = (keys: Set<string>) => [...keys].filter(key => row.extraId
      ? key === row.key || key.startsWith(`${row.key}:`)
      : !key.startsWith("extra:") && groceryMeasure(key).identity === measure.identity);
    const before = matchingKeys(checkedItems);
    let purchasedKey = row.ingredient.toLowerCase();
    if (row.extraId && quantity === undefined) purchasedKey = row.key;
    else if (measure.quantity !== null) {
      let total = quantity ?? measure.quantity;
      for (const key of before) {
        const text = row.extraId ? key.slice(row.key.length + 1) : key;
        total += groceryMeasure(text).quantity ?? 0;
      }
      const text = groceryQuantityText(measure, total);
      purchasedKey = row.extraId ? `${row.key}:${text}` : text.toLowerCase();
    }
    setCheckedItems(previous => new Set([...previous].filter(key => !before.includes(key)).concat(purchasedKey)));
    toast({ title: `${copy("checked")} · ${row.ingredient}`, action: <ToastAction altText={t("undo")} onClick={() => {
      setCheckedItems(previous => {
        const current = matchingKeys(previous);
        if (current.length !== 1 || current[0] !== purchasedKey) return previous;
        return new Set([...previous].filter(key => key !== purchasedKey).concat(before));
      });
    }}>{t("undo")}</ToastAction> });
  };

  const uncheck = (row: { key: string; ingredient: string }) => {
    setCheckedItems(previous => {
      const next = new Set(previous);
      next.delete(row.key);
      return next;
    });
  };

  const addExtra = async (text: string, image?: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/grocery-extras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, image }) });
      if (!res.ok) throw new Error();
      const extra: { id: string; text: string; image?: string | null } = await res.json();
      setExtras(previous => previous.some(item => item.id === extra.id) ? previous.map(item => item.id === extra.id ? extra : item) : [...previous, extra]);
      if (image) queryClient.setQueryData<Record<string, string | null>>(["/api/grocery-item-photos"], previous => {
        const next = { ...previous }; delete next[extra.text.toLowerCase()]; return next;
      });
      // "I'm out of it again": a product added again must not stay ticked from the last shop.
      setCheckedItems(previous => { const next = new Set(previous); if (!recipeRows.has(groceryMeasure(extra.text).identity)) next.delete(extra.text.toLowerCase()); next.delete(`extra:${extra.id}`); for (const key of next) if (key.startsWith(`extra:${extra.id}:`)) next.delete(key); return next; });
      return true;
    } catch { toast({ title: t("grocery.addItemFailed"), variant: "destructive" }); return false; }
  };
  const removeExtra = async (id: string) => {
    try {
      if (!(await fetch(`/api/grocery-extras/${id}`, { method: "DELETE" })).ok) throw new Error();
      setExtras(previous => previous.filter(item => item.id !== id));
      setCheckedItems(previous => new Set([...previous].filter(key => !key.startsWith(`extra:${id}:`) && key !== `extra:${id}` && (key !== extras.find(item => item.id === id)?.text.toLowerCase() || recipeRows.has(groceryMeasure(key).identity)))));
    } catch { throw new Error("Could not remove grocery extra"); }
  };
  const addBulk = async (items: BulkItem[]) => {
    try {
      const response = await apiRequest("POST", "/api/grocery-extras/bulk", items);
      const added: Extra[] = await response.json();
      setExtras(previous => {
        const updated = new Set(added.map(row => row.id));
        return [...previous.filter(row => !updated.has(row.id)), ...added];
      });
      setCheckedItems(previous => {
        const next = new Set(previous);
        for (const extra of added) {
          next.delete(`extra:${extra.id}`);
          for (const key of next) if (key.startsWith(`extra:${extra.id}:`)) next.delete(key);
          const existing = extras.find(row => row.id === extra.id);
          if (existing && !recipeRows.has(groceryMeasure(existing.text).identity)) next.delete(existing.text.toLowerCase());
        }
        return next;
      });
      return true;
    } catch {
      toast({ title: t("grocery.addItemFailed"), variant: "destructive" });
      return false;
    }
  };

  const categoryTranslations: Record<string, string> = {
    "Produce": t("grocery.produce"),
    "Meat & Poultry": t("grocery.meatPoultry"),
    "Seafood": t("grocery.seafood"),
    "Dairy & Eggs": t("grocery.dairyEggs"),
    "Grains & Pasta": t("grocery.grainsPasta"),
    "Canned & Jarred": t("grocery.cannedJarred"),
    "Spices & Seasonings": t("grocery.spicesSeasonings"),
    "Other": t("grocery.other"),
  };

  categoryTranslations["Manually Added"] = copy("uncategorized");

  const affected = pendingRemoval?.proteinRecipes ? groceryMealsFor(plan, pendingRemoval.proteinRecipes) : [];
  const selectedMeals = affected.filter(a => mealKeys.has(assignmentKey(a)));
  const nextPlan = removeGroceryMeals(plan, selectedMeals);
  const preview = { dropped: [] as string[], reduced: [] as string[], kept: [] as string[] };
  if (selectedMeals.length) {
    const nextRows = buildRecipeGroceryRows(nextPlan.approved ?? [], recipes);
    for (const [key, row] of recipeRows) {
      const after = nextRows.get(key);
      if (after?.ingredient === row.ingredient || skipped.has(key)) continue;
      const beforeText = remainingGroceryText(row.ingredient, recipePurchases);
      const afterText = after && remainingGroceryText(after.ingredient, recipePurchases);
      if (beforeText && !afterText) preview.dropped.push(beforeText);
      if (beforeText && afterText && beforeText !== afterText) preview.reduced.push(`${beforeText} → ${afterText}`);
      preview.kept.push(...recipePurchases.filter(text => groceryMeasure(text).identity === key));
    }
  }

  const beginRemoval = (row: ShoppingRow) => {
    const meals = row.proteinRecipes ? groceryMealsFor(plan, row.proteinRecipes) : [];
    setMealKeys(new Set(meals.length === 1 ? [assignmentKey(meals[0])] : []));
    setPendingRemoval(row);
  };

  const confirmRemoval = async (withMeals: boolean) => {
    if (!pendingRemoval || busy) return;
    try {
      if (withMeals) {
        const current = latestPlan();
        if (groceryPlanVersion(current) !== groceryPlanVersion(plan)) {
          setPlan(current);
          setPendingRemoval(null);
          toast({ title: copy("conflict"), variant: "destructive" });
          return;
        }
        const removed = [...selectedMeals];
        storePlan(nextPlan);
        setPlan(nextPlan);
        toast({ title: copy("removed"), action: <ToastAction altText={t("undo")} onClick={() => {
          const restored = restoreGroceryMeals(latestPlan(), removed, current);
          if (!restored) { toast({ title: copy("undoConflict"), variant: "destructive" }); return; }
          try { storePlan(restored); setPlan(restored); }
          catch { toast({ title: t("grocery.changeFailed"), variant: "destructive" }); }
        }}>{t("undo")}</ToastAction> });
      } else if (pendingRemoval.extraId) {
        setBusy(true);
        await removeExtra(pendingRemoval.extraId);
      } else {
        const key = pendingRemoval.key;
        setBusy(true);
        await patchShopping({ key, skipped: true });
        toast({ title: copy("remove"), action: <ToastAction altText={t("undo")} onClick={() => {
          void patchShopping({ key, skipped: false }).catch(() => toast({ title: t("grocery.changeFailed"), variant: "destructive" }));
        }}>{t("undo")}</ToastAction> });
      }
      setPendingRemoval(null);
    } catch { toast({ title: t("grocery.changeFailed"), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  if (isLoadingRecipes || shoppingPending || weekPending) {
    return (
      <main className="grocery-page" aria-busy="true">
        <div className="grocery-shell">
          <div className="grocery-skeleton grocery-skeleton-title" />
          <div className="grocery-skeleton grocery-skeleton-copy" />
          <div className="grocery-skeleton-list">
            {[0, 1, 2, 3, 4, 5].map(item => <div className="grocery-skeleton grocery-skeleton-row" key={item} />)}
          </div>
          <span className="grocery-sr-only">{t("recipes.loading")}</span>
        </div>
      </main>
    );
  }

  if (recipesError) {
    return (
      <main className="grocery-page">
        <section className="grocery-shell grocery-state" role="alert">
          <h1>{copy("loadFailed")}</h1>
          <button className="grocery-primary" onClick={() => window.location.reload()}>{groceryProductText(lang, "retry")}</button>
        </section>
      </main>
    );
  }

  const isPantry = (ingredient: string) => pantry.some(term => mentionsTerm(term, [ingredient]));
  // Keep photos and notes keyed to the original grocery text, even after a partial purchase.
  const rowMetadataKey = (row: ShoppingRow) => row.extraId ? (extras.find(extra => extra.id === row.extraId)?.text ?? row.ingredient).toLowerCase()
    : (recipeRows.get(row.key)?.ingredient ?? row.ingredient).toLowerCase();
  const shareRows = [
    ...activeRows.map(row => ({ ...row, checked: false })),
    ...purchasedRows.map(row => ({ ...row, checked: true, recipes: recipeRows.get(groceryMeasure(row.ingredient).identity)?.recipes ?? [] })),
  ];
  const shareCategories = categories.flatMap(category => {
    const items = shareRows.filter(row => categoryOf(row) === category);
    return items.length ? [{
      name: categoryTranslations[category] || category,
      items: items.map(row => ({ text: row.ingredient, checked: row.checked, pantry: isPantry(row.ingredient), note: notes[rowMetadataKey(row)] })),
    }] : [];
  });
  const linkItems = shareRows.map(row => ({
    category: categoryOf(row) === "Manually Added" ? "Other" : categoryOf(row),
    text: row.ingredient.slice(0, 300), recipes: row.recipes.join(" · ").slice(0, 300),
    checked: row.checked, note: notes[rowMetadataKey(row)] || null,
  }));
  const rows = tab === "mine" ? activeRows.filter(row => row.extraId) : tab === "recipes" ? activeRows.filter(row => !row.extraId) : activeRows;
  const priceOf = (row: ShoppingRow) => {
    const preference = preferences.get(row.key);
    return preference?.priceText === row.ingredient ? preference.priceCents : null;
  };
  const partialMeasure = partial ? groceryMeasure(partial.ingredient) : null;
  const displayUnit = partial ? parseIngredientLine(partial.ingredient).unit : null;
  const rawAmount = parseQuantity(amount);
  const parsedAmount = rawAmount === null ? null : rawAmount * (displayUnit === "kg" || displayUnit === "l" ? 1000 : 1);
  const validAmount = parsedAmount !== null && Number.isFinite(parsedAmount) && parsedAmount > 0 &&
    partialMeasure?.quantity != null && parsedAmount <= partialMeasure.quantity;
  const locale = lang === "he" ? "he-IL" : lang === "ru" ? "ru-RU" : "en-CA";
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol" }).format(value / 100);
  const subtotal = (items: ShoppingRow[]) => {
    const priced = items.map(priceOf).filter((value): value is number => value !== null);
    return priced.length ? money(priced.reduce((sum, value) => sum + value, 0)) : null;
  };
  const togglePrices = (category: string) => setShownPrices(previous => {
    const next = new Set(previous);
    if (!next.delete(category)) next.add(category);
    return next;
  });
  const renderRow = (row: ShoppingRow) => {
    const metadataKey = rowMetadataKey(row);
    const price = shownPrices.has(categoryOf(row)) ? priceOf(row) : null;
    const parsed = parseIngredientLine(row.ingredient);
    const quantity = parsed.quantity === null || !parsed.ingredient ? "" : parsed.display.slice(0, parsed.display.length - parsed.ingredient.length).trim();
    return (
      <li className="grocery-item" key={row.key} data-testid={`grocery-item-${metadataKey}`}>
        <label className="grocery-item-label">
          <input type="checkbox" checked={false} onChange={() => markPurchased(row)}
            aria-label={row.ingredient} />
          <span className="grocery-checkmark" aria-hidden="true">
            <svg viewBox="0 0 16 16"><path d="m3.5 8.2 3 3 6-6.3" /></svg>
          </span>
          <span className="min-w-0">
            <span className="grocery-ingredient block">{quantity ? parsed.ingredient : row.ingredient}</span>
            {quantity && <span className="block text-sm" data-testid="grocery-item-measure">{quantity}</span>}
            {row.recipes.length > 0 && <span className="block text-xs text-muted-foreground" data-testid="grocery-item-recipes">{row.recipes.join(" · ")}</span>}
          </span>
          {isPantry(row.ingredient) && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary" data-testid="grocery-pantry">{settingsText(lang, "pantryBadge")}</span>}
        </label>
        <GroceryItemPicture item={row.ingredient} image={Object.prototype.hasOwnProperty.call(pictures, metadataKey) ? pictures[metadataKey] : row.image}
          disabled={picturesLoading || picturesError} onSave={image => savePicture(metadataKey, image)}
          label={`${copy("actions")} · ${row.ingredient}`} onMenuClosed={event => {
            if (noteAfterMenu.current !== metadataKey) return;
            event.preventDefault();
            noteAfterMenu.current = null;
            setEditingNote(metadataKey);
          }}>
          <DropdownMenuItem className="min-h-11" onSelect={() => { noteAfterMenu.current = metadataKey; }} data-testid="button-item-note">
            {notes[metadataKey] ? copy("editNote") : t("grocery.notePlaceholder")}
          </DropdownMenuItem>
          {groceryMeasure(row.ingredient).quantity !== null && <DropdownMenuItem className="min-h-11" onSelect={() => {
            setAmount("");
            setPartial(row);
          }}>{copy("purchase")}</DropdownMenuItem>}
          <DropdownMenuItem className="min-h-11" onSelect={() => beginRemoval(row)} data-testid="button-remove-item">
            {copy("remove")}
          </DropdownMenuItem>
        </GroceryItemPicture>
        <span className="grocery-item-price" data-testid="grocery-item-price">{price === null ? "" : money(price)}</span>
        <GroceryNote item={row.ingredient} value={notes[metadataKey]} canEdit onSave={note => saveNote(metadataKey, note)}
          editing={editingNote === metadataKey} onEditingChange={open => setEditingNote(open ? metadataKey : null)} />
      </li>
    );
  };

  return (
    <main className="grocery-page">
      <div className="grocery-shell">
        <header className="grocery-heading">
          <div className="grocery-title-row">
            <h1>{t("grocery.groceryList")}</h1>
            <button type="button" className="grocery-primary" aria-expanded={addOpen} onClick={() => setAddOpen(open => !open)} data-testid="button-add-item">
              <Plus className="inline h-4 w-4" aria-hidden="true" /> {t("grocery.addItem")}
            </button>
          </div>
          <div className="grocery-heading-foot !justify-start">
            <div className="grocery-toggle" role="group" aria-label={t("grocery.title")}>
              {(["all", "recipes", "mine"] as const).map(value => (
                <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}
                  data-testid={`grocery-filter-${value}`}>{copy(value)}</button>
              ))}
            </div>
            <button type="button" className="grocery-share-button ms-auto" onClick={() => setStoresOpen(true)} data-testid="button-my-stores">
              <Store aria-hidden="true" />{storeCopy("myStores")}
            </button>
            <button type="button" className="grocery-share-button" onClick={() => setShareOpen(true)} data-testid="button-share-export">
              <Share2 aria-hidden="true" />{t("grocery.shareExportTitle")}
            </button>
          </div>
          {addOpen && <>
            <GroceryAddItem onAdd={async (text, image) => await addExtra(text, image) && (setAddOpen(false), true)} />
            <GroceryBulkAdd categories={categoryTranslations} onSave={async items => await addBulk(items) && (setAddOpen(false), true)}
              existing={[...manualRows.map(row => ({ text: row.ingredient, id: row.extraId })), ...activeRows.filter(row => !row.extraId).map(row => ({ text: row.ingredient }))]} />
          </>}
          <p aria-live="polite" className="mt-3 text-sm font-medium">{copy("left")} · {rows.length}</p>
        </header>
        <Dialog open={storesOpen} onOpenChange={setStoresOpen}>
          <DialogContent className="max-h-[85dvh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg" data-testid="my-stores-dialog">
            <DialogTitle>{storeCopy("heading")}</DialogTitle>
            <DialogDescription className="sr-only">{storeCopy("helper")}</DialogDescription>
            <StorePicker showHeading={false} />
            <button type="button" className="grocery-primary" onClick={() => setStoresOpen(false)} data-testid="my-stores-done">{storeCopy("done")}</button>
          </DialogContent>
        </Dialog>
        <GroceryShareDialog open={shareOpen} onOpenChange={setShareOpen} categories={shareCategories} linkItems={linkItems} pantryLabel={settingsText(lang, "pantryBadge")} />
        {shoppingError && <p role="alert">{t("grocery.changeFailed")} <button type="button" className="grocery-reset" onClick={() => void reloadShopping()}>{groceryProductText(lang, "retry")}</button></p>}
        {picturesError && <p role="alert">{groceryProductText(lang, "loadError")} <button type="button" className="grocery-reset" onClick={() => void reloadPictures()}>{groceryProductText(lang, "retry")}</button></p>}
        {!rows.length && (
          <p className="grocery-success" role="status" data-testid="grocery-shopping-complete">
            {tab === "mine" ? copy("emptyMine") : purchasedRows.length ? copy("done") : t("grocery.noMeals")}
            {tab !== "mine" && !purchasedRows.length && <button className="grocery-share-button mt-2" onClick={() => setLocation(otherWeek ? `/meals?week=${otherWeek}` : "/meals?plan")}>{t("grocery.goToPlan")}</button>}
          </p>
        )}
        <div className="grocery-list">
          {tab === "mine" ? <ul>{rows.map(renderRow)}</ul> : categories.map(category => {
            const items = rows.filter(row => categoryOf(row) === category);
            if (!items.length) return null;
            const collapsed = expansion[category] === "closed";
            const title = categoryTranslations[category];
            const slug = category.replace(/[^a-z]+/gi, "-").toLowerCase();
            return (
              <section key={category} className="grocery-category" data-grocery-category={category}>
                <header className="grocery-category-head">
                  <button className="grocery-category-toggle" aria-expanded={!collapsed} data-testid={`category-toggle-${slug}`}
                    onClick={() => setExpansion(previous => toggleCategory(previous, category, collapsed))}>
                    <span className="grocery-category-title">
                      <h2>{title}</h2>
                      <span className="grocery-category-count">{items.length}</span>
                    </span>
                    <svg className={`grocery-category-chevron${collapsed ? " is-collapsed" : ""}`} viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </button>
                  {shownPrices.has(category) && subtotal(items) && <span className="text-sm" data-testid={`category-subtotal-${slug}`}>{subtotal(items)}</span>}
                  <button type="button" className="grocery-share-button grocery-price-toggle" onClick={() => togglePrices(category)} aria-pressed={shownPrices.has(category)}
                    aria-label={`${copy("prices")} · ${title}`} data-testid={`category-prices-${slug}`}>$</button>
                </header>
                {!collapsed && <ul>{items.map(renderRow)}</ul>}
              </section>
            );
          })}
          {tab === "all" && purchasedRows.length > 0 && (
            <details className="grocery-category">
              <summary className="min-h-11 cursor-pointer p-3">{copy("checked")} ({purchasedRows.length})</summary>
              <ul>{purchasedRows.map(row => (
                <li className="grocery-item" key={row.key}>
                  <label className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" checked onChange={() => uncheck(row)} /> {row.ingredient}
                  </label>
                </li>
              ))}</ul>
              <button className="grocery-share-button m-3" onClick={() => {
                const before = [...checkedItems];
                setCheckedItems(new Set());
                toast({ title: t("grocery.uncheckAll"), action: <ToastAction altText={t("undo")}
                  onClick={() => setCheckedItems(previous => new Set([...previous, ...before]))}>{t("undo")}</ToastAction> });
              }}>{t("grocery.uncheckAll")}</button>
            </details>
          )}
        </div>
      </div>

      <Dialog open={pendingRemoval !== null} onOpenChange={open => { if (!open && !busy) setPendingRemoval(null); }}>
        <DialogContent className="max-h-[85dvh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogTitle>{copy("removeTitle")} {pendingRemoval?.ingredient}?</DialogTitle>
          <DialogDescription>{affected.length ? copy("protein") : copy("only")}</DialogDescription>
          {affected.length > 0 && <ul>
            {affected.map(a => {
              const day = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${a.cookDate}T12:00:00Z`));
              const key = assignmentKey(a);
              return <li key={key}><label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={mealKeys.has(key)} onChange={event => {
                  const checked = event.target.checked;
                  setMealKeys(previous => checked ? new Set([...previous, key]) : new Set([...previous].filter(value => value !== key)));
                }} />
                <span>{recipes.find(recipe => recipe.id === a.recipeId)?.title} · {day}</span>
              </label></li>;
            })}
          </ul>}
          {([["drops", preview.dropped], ["reduced", preview.reduced], ["kept", preview.kept]] as const).map(([key, items]) =>
            items.length > 0 && <details key={key}><summary className="min-h-11 cursor-pointer py-2">{copy(key)} · {items.length}</summary>
              <ul className="list-disc ps-5 text-sm">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="grocery-primary" disabled={busy} onClick={() => void confirmRemoval(false)}>{affected.length ? copy("only") : copy("remove")}</button>
            {affected.length > 0 && <button className="grocery-share-button disabled:opacity-50" disabled={!selectedMeals.length || busy}
              onClick={() => void confirmRemoval(true)}>{copy("meals")}</button>}
            <button className="grocery-share-button" disabled={busy} onClick={() => setPendingRemoval(null)}>{t("cancel")}</button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={partial !== null} onOpenChange={open => { if (!open) setPartial(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogTitle>{copy("purchase")}</DialogTitle>
          <DialogDescription>{partial?.ingredient}</DialogDescription>
          <form onSubmit={event => {
            event.preventDefault();
            if (partial && validAmount && parsedAmount !== null) { markPurchased(partial, parsedAmount); setPartial(null); }
          }}>
            <label className="block text-sm">{copy("quantity")} {displayUnit}
              <input className="my-2 block min-h-11 w-full rounded border bg-background px-3" inputMode="decimal"
                value={amount} onChange={event => setAmount(event.target.value)} />
            </label>
            <button className="grocery-primary disabled:opacity-50" disabled={!validAmount}>{copy("save")}</button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
