import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { useWeekFilterCopy } from "@/lib/week-filter-copy";
import { settingsText } from "@/lib/settings-copy";
import { methodChoices } from "@/lib/basic-settings";
import { cookingLevels, dietaryGroups, dietaryOptions, KID_FAVOURITES, weekTimeOptions } from "@/lib/planner-filters";
import { countWeekFilters, defaultWeekFilters, sourceOptions, type WeekFilters } from "@/lib/week-filters";
import { mealSlots, type MealSlot } from "@/lib/meal-plan";
import type { DeviceId } from "@/lib/device-requirements";
import type { PlannerRecipe } from "@/lib/planner-recipes";
import { cuisines, recipeCuisine } from "@shared/food-rules";

export type FilterChip = { label: string; remove: () => void };

/** Display names for filter values (also used for the AI generation chips on the Week page). */
export function useFilterLabels(): Record<string, string> {
  const { t } = useI18n();
  const c = useWeekFilterCopy();
  return {
    "Vegetarian": t("meals.vegetarian"), "Kid friendly": t("meals.kidFriendly"), "Gluten-free": t("meals.glutenFree"),
    "Breakfast": t("meals.breakfast"), "Lunch": t("meals.lunch"), "Dinner": t("meals.dinner"), "Lunch box": t("meals.lunchBox"),
    "Oven": t("meals.oven"), "Air fryer": t("meals.airFryer"), "Stovetop": t("meals.stovetop"), "Microwave": t("meals.microwave"), "No-cook": t("meals.noCook"),
    "Chicken": t("meals.chicken"), "Beef": t("meals.beef"), "Seafood": t("meals.seafood"), "Plant-based": t("meals.plantBased"),
    "My recipes": t("meals.myRecipes"), "Imported": t("meals.imported"), "Trusted authors": t("meals.trustedAuthors"), "Personal": t("meals.personal"),
    ...Object.fromEntries(dietaryOptions.map(o => [o.value, o.value === KID_FAVOURITES ? c("kidFavourites") : c(o.value)])),
  };
}

/** Every selected filter as a removable chip. `search`: the ones the search no-result message lists. */
export function useWeekFilterChips(filters: WeekFilters, onChange: (next: WeekFilters) => void) {
  const { t, lang } = useI18n();
  const c = useWeekFilterCopy();
  const label = useFilterLabels();
  const set = (values: Partial<WeekFilters>) => onChange({ ...filters, ...values });
  const without = (key: "dietary" | "mealType" | "cookingMethod" | "proteinType" | "mustInclude" | "mustExclude" | "cuisine" | "source", value: string) =>
    set({ [key]: filters[key].filter(v => v !== value) });
  const search: FilterChip[] = [
    ...(filters.cookingLevel ? [{ label: c(`level_${filters.cookingLevel}`), remove: () => set({ cookingLevel: null }) }] : []),
    ...(filters.deal ? [{ label: c("dealChip", { name: c(`deal_${filters.deal}`) }), remove: () => set({ deal: null }) }] : []),
    ...(["dietary", "mealType", "cookingMethod", "proteinType"] as const).flatMap(key =>
      filters[key].map(value => ({ label: label[value] ?? value, remove: () => without(key, value) }))),
    ...filters.mustInclude.map(term => ({ label: `${t("meals.mustInclude")}: ${term}`, remove: () => without("mustInclude", term) })),
    ...filters.mustExclude.map(term => ({ label: `${t("meals.mustExclude")}: ${term}`, remove: () => without("mustExclude", term) })),
  ];
  const all: FilterChip[] = [
    ...search,
    ...filters.cuisine.map(cu => ({ label: `${t("meals.cuisine")}: ${settingsText(lang, `cuisine_${cu}`)}`, remove: () => without("cuisine", cu) })),
    ...filters.source.map(src => ({ label: label[src] ?? src, remove: () => without("source", src) })),
    ...(filters.myPicks ? [{ label: t("meals.showOnlyMyPicks"), remove: () => set({ myPicks: false, minRating: null }) }] : []),
    ...(filters.myPicks && filters.minRating !== null ? [{ label: `${t("meals.minimumRating")}: ${filters.minRating}*+`, remove: () => set({ minRating: null }) }] : []),
    ...(filters.withNotes ? [{ label: t("meals.withMyNotes"), remove: () => set({ withNotes: false }) }] : []),
    ...(filters.modifiedByMe ? [{ label: t("meals.modifiedByMe"), remove: () => set({ modifiedByMe: false }) }] : []),
  ];
  return { search, all };
}

/** The Week → Plan filters. One component for the Week page (sidebar and phone sheet) and Your household, so both
 * always show the same filters in the same state. `eligible`: recipes allowed by Basic Settings (cuisine choices). */
export function WeekFilterPanel({ filters, onChange, devices, eligible, matchingCount, mealCount }: {
  filters: WeekFilters; onChange: (next: WeekFilters) => void; devices: DeviceId[]; eligible: readonly PlannerRecipe[];
  matchingCount: number; mealCount?: (meal: MealSlot) => number;
}) {
  const { t, lang } = useI18n();
  const c = useWeekFilterCopy();
  const sText = (key: string, values?: Record<string, string | number>) => settingsText(lang, key, values);
  const filterLabel = useFilterLabels();
  const sourceLabel = filterLabel;
  const [includeInput, setIncludeInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  // Both disclosures start collapsed on every visit.
  const [moreDietaryOpen, setMoreDietaryOpen] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const updateFilters = (values: Partial<WeekFilters>) => onChange({ ...filters, ...values });
  const toggleArrayFilter = (key: "dietary" | "mealType" | "cookingMethod" | "proteinType" | "cuisine" | "source", value: string) =>
    updateFilters({ [key]: filters[key].includes(value) ? filters[key].filter(v => v !== value) : [...filters[key], value] });
  const clearAllFilters = () => onChange(defaultWeekFilters);
  const activeFilterCount = countWeekFilters(filters);
  const activeFilterChips = useWeekFilterChips(filters, onChange).all;
  const addTerm = (key: "mustInclude" | "mustExclude", raw: string) => {
    const term = raw.trim().toLowerCase();
    if (term && !filters[key].includes(term)) updateFilters({ [key]: [...filters[key], term] });
  };
  const addIncludeIngredient = () => { addTerm("mustInclude", includeInput); setIncludeInput(""); };
  const addExcludeIngredient = () => { addTerm("mustExclude", excludeInput); setExcludeInput(""); };
  const removeIncludeIngredient = (term: string) => updateFilters({ mustInclude: filters.mustInclude.filter(i => i !== term) });
  const removeExcludeIngredient = (term: string) => updateFilters({ mustExclude: filters.mustExclude.filter(i => i !== term) });
  // Cuisines present in the recipes you can cook (plus any already chosen, so it can be removed).
  const cuisineOptions = cuisines.filter(cu => filters.cuisine.includes(cu) || eligible.some(r => recipeCuisine(r.tags) === cu));

  // One filter panel: the desktop sidebar and the mobile sheet render the same controls.
  // Order: Cooking level, Total time, Dietary (+ More dietary options), Kid favourites, Kitchen tools, then More filters.
  const dietaryIn = (group: string) => dietaryOptions.filter(o => o.group === group && o.value !== KID_FAVOURITES);
  const advancedDietary = filters.dietary.filter(d => dietaryOptions.some(o => o.value === d && o.group !== "quick"));
  const sectionTitle = (text: string, id: string) => <h3 id={id} className="mb-2 text-sm font-medium text-foreground">{text}</h3>;
  const disclosure = (open: boolean, toggle: () => void, label: string, controls: string, testId: string) => (
    <button type="button" onClick={toggle} aria-expanded={open} aria-controls={controls} data-testid={testId}
      className="flex min-h-11 w-full items-center justify-between text-start text-sm font-medium text-foreground">
      {label}
      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
  const ingredientInput = (kind: "include" | "exclude") => {
    const include = kind === "include";
    const terms = include ? filters.mustInclude : filters.mustExclude;
    return (
      <div className="pb-3">
        <label htmlFor={`input-must-${kind}`} className="mb-2 block text-sm text-muted-foreground">{t(include ? "meals.mustInclude" : "meals.mustExclude")}</label>
        {terms.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">
          {terms.map(term => (
            <button key={term} type="button" onClick={() => (include ? removeIncludeIngredient : removeExcludeIngredient)(term)} className="chip"
              aria-label={t("meals.removeFilter", { label: `${t(include ? "meals.mustInclude" : "meals.mustExclude")}: ${term}` })}>
              {term}<X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>}
        <input id={`input-must-${kind}`} type="text" value={include ? includeInput : excludeInput}
          onChange={e => (include ? setIncludeInput : setExcludeInput)(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (include ? addIncludeIngredient : addExcludeIngredient)()}
          placeholder={t("meals.typeEnter")} data-testid={`input-must-${kind}`}
          className="w-full px-3 min-h-11 text-base border hairline rounded-lg bg-card focus-ring-quiet" />
      </div>
    );
  };
  return (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-medium text-foreground" data-testid="additional-filters-count">{t("filters.open", { count: activeFilterCount })}</h2>
                {activeFilterCount > 0 && (
                  <button type="button" onClick={clearAllFilters} className="btn btn-text" data-testid="button-clear-filters">
                    {t("filters.clearAll")}
                  </button>
                )}
              </div>
              <p className="mb-3 text-sm text-muted-foreground" aria-live="polite" data-testid="sidebar-matching" data-count={matchingCount}>
                {matchingCount === 1 ? t("meals.matchingCountOne") : t("meals.matchingCount", { count: matchingCount })}
              </p>
              {activeFilterChips.length > 0 && (
                <ul aria-label={t("filters.applied")} className="mb-4 flex flex-wrap gap-1.5" data-testid="active-filter-chips">
                  {activeFilterChips.map(chip => (
                    <li key={chip.label}>
                      <button type="button" onClick={chip.remove} aria-label={t("meals.removeFilter", { label: chip.label })} data-testid="active-filter-chip"
                        className="chip">
                        {chip.label}<X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <section className="border-b hairline pb-3 mb-3" data-filter-section="cookingLevel" aria-labelledby="filter-title-level">
                {sectionTitle(c("cookingLevel"), "filter-title-level")}
                <div className="flex flex-wrap gap-2">
                  {cookingLevels.map(level => (
                    <button key={level} type="button" className="chip" aria-pressed={filters.cookingLevel === level} data-testid={`filter-level-${level}`}
                      onClick={() => updateFilters({ cookingLevel: filters.cookingLevel === level ? null : level })}>{c(`level_${level}`)}</button>
                  ))}
                </div>
              </section>

              <section className="border-b hairline pb-3 mb-3" data-filter-section="time" aria-labelledby="filter-title-time">
                {sectionTitle(c("totalTime"), "filter-title-time")}
                <div className="flex flex-wrap gap-2">
                  {[null, ...weekTimeOptions].map(mins => (
                    <button key={mins ?? "any"} type="button" className="chip" aria-pressed={filters.maxMinutes === mins} data-testid={`filter-time-${mins ?? "any"}`}
                      onClick={() => updateFilters({ maxMinutes: mins })}>{mins === null ? t("meals.any") : c("upTo", { count: mins })}</button>
                  ))}
                </div>
              </section>

              <section className="border-b hairline pb-3 mb-3" data-filter-section="dietary" aria-labelledby="filter-title-dietary">
                {sectionTitle(c("dietary"), "filter-title-dietary")}
                <div className="flex flex-wrap gap-2">
                  {dietaryIn("quick").map(o => (
                    <button key={o.value} type="button" className="chip" aria-pressed={filters.dietary.includes(o.value)}
                      onClick={() => toggleArrayFilter("dietary", o.value)} data-testid={`filter-dietary-${o.value.toLowerCase()}`}>{c(o.value)}</button>
                  ))}
                </div>
                <div className="mt-2">
                  {disclosure(moreDietaryOpen, () => setMoreDietaryOpen(v => !v), c(moreDietaryOpen ? "fewerDietary" : "moreDietary"), "more-dietary-panel", "button-more-dietary")}
                  {moreDietaryOpen ? (
                    <div id="more-dietary-panel" className="space-y-3" data-testid="more-dietary-panel">
                      {dietaryGroups.filter(group => group !== "quick").map(group => (
                        <div key={group} role="group" aria-label={c(`group_${group}`)}>
                          <p className="mb-1.5 text-sm text-muted-foreground">{c(`group_${group}`)}</p>
                          <div className="flex flex-wrap gap-2">
                            {dietaryIn(group).map(o => (
                              <button key={o.value} type="button" className="chip" aria-pressed={filters.dietary.includes(o.value)}
                                onClick={() => toggleArrayFilter("dietary", o.value)} data-testid={`filter-dietary-${o.value.toLowerCase().replace(/\s+/g, "-")}`}>{c(o.value)}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : advancedDietary.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label={c("moreDietary")} data-testid="advanced-dietary-chips">
                      {advancedDietary.map(d => (
                        <li key={d}><button type="button" className="chip" onClick={() => toggleArrayFilter("dietary", d)} aria-label={t("meals.removeFilter", { label: c(d) })}>
                          {c(d)}<X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </button></li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <div className="border-b hairline pb-3 mb-3" data-filter-section="kidFavourites">
                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{c("kidFavourites")}</span>
                  <Switch checked={filters.dietary.includes(KID_FAVOURITES)} onCheckedChange={() => toggleArrayFilter("dietary", KID_FAVOURITES)}
                    data-testid="filter-kid-favourites" />
                </label>
              </div>

              <section className="border-b hairline pb-3 mb-3" data-filter-section="kitchenTools" aria-labelledby="filter-title-tools">
                {sectionTitle(c("kitchenTools"), "filter-title-tools")}
                <div className="flex flex-wrap gap-2">
                  {methodChoices(devices).map(tool => (
                    <button key={tool} type="button" className="chip" aria-pressed={filters.cookingMethod.includes(tool)}
                      onClick={() => toggleArrayFilter("cookingMethod", tool)} data-testid={`filter-method-${tool.toLowerCase().replace(" ", "-")}`}>{filterLabel[tool]}</button>
                  ))}
                </div>
              </section>

              <section className="border-b hairline pb-3 mb-3" data-filter-section="source" aria-labelledby="filter-title-source">
                {sectionTitle(t("meals.source"), "filter-title-source")}
                <div className="flex flex-wrap gap-2">
                  {sourceOptions.map(src => (
                    <button key={src} type="button" className="chip" aria-pressed={filters.source.includes(src)}
                      onClick={() => toggleArrayFilter("source", src)} data-testid={`filter-source-${src.toLowerCase().replace(" ", "-")}`}>{sourceLabel[src]}</button>
                  ))}
                </div>
              </section>

              {disclosure(moreFiltersOpen, () => setMoreFiltersOpen(v => !v), c(moreFiltersOpen ? "fewerFilters" : "moreFilters"), "more-filters-panel", "button-more-filters")}
              {moreFiltersOpen && (
                <div id="more-filters-panel" className="mt-2" data-testid="more-filters-panel">
                  <section className="border-b hairline pb-3 mb-3" data-filter-section="protein" aria-labelledby="filter-title-protein">
                    {sectionTitle(t("meals.proteinType"), "filter-title-protein")}
                    <div className="flex flex-wrap gap-2">
                      {["Chicken", "Beef", "Seafood", "Plant-based"].map(protein => (
                        <button key={protein} type="button" className="chip" aria-pressed={filters.proteinType.includes(protein)}
                          onClick={() => toggleArrayFilter("proteinType", protein)} data-testid={`filter-protein-${protein.toLowerCase().replace("-", "")}`}>{filterLabel[protein]}</button>
                      ))}
                    </div>
                  </section>
                  <section className="border-b hairline pb-3 mb-3" data-filter-section="mealType" aria-labelledby="filter-title-meal">
                    {sectionTitle(t("meals.mealType"), "filter-title-meal")}
                    <div className="flex flex-wrap gap-2">
                      {["Breakfast", "Lunch", "Dinner", "Lunch box"].map(type => (
                        <button key={type} type="button" className="chip" aria-pressed={filters.mealType.includes(type)}
                          onClick={() => toggleArrayFilter("mealType", type)} data-testid={`filter-meal-${type.toLowerCase().replace(" ", "-")}`}>
                          {filterLabel[type]}
                          {(mealSlots as readonly string[]).includes(type) && mealCount && (
                            <span className="ms-1 text-muted-foreground" data-testid={`meal-count-${type.toLowerCase()}`}>· {sText("mealCount", { count: mealCount(type as MealSlot) })}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="border-b hairline mb-3" data-filter-section="ingredients">
                    {ingredientInput("include")}
                    {ingredientInput("exclude")}
                  </section>
                  {cuisineOptions.length > 0 && (
                    <section className="border-b hairline pb-3 mb-3" data-filter-section="cuisine" aria-labelledby="filter-title-cuisine">
                      {sectionTitle(t("meals.cuisine"), "filter-title-cuisine")}
                      <div className="flex flex-wrap gap-2">
                        {cuisineOptions.map(cu => (
                          <button key={cu} type="button" className="chip" aria-pressed={filters.cuisine.includes(cu)}
                            onClick={() => toggleArrayFilter("cuisine", cu)} data-testid={`filter-cuisine-${cu.toLowerCase().replace(/\s+/g, "-")}`}>{sText(`cuisine_${cu}`)}</button>
                        ))}
                      </div>
                    </section>
                  )}
                  <section className="border-b hairline pb-3 mb-3" data-filter-section="myPicks" aria-labelledby="filter-title-picks">
                    {sectionTitle(t("meals.myPicksFilter"), "filter-title-picks")}
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={filters.myPicks} className="h-5 w-5 shrink-0 accent-primary" data-testid="checkbox-filter-mypicks"
                        onChange={() => updateFilters({ myPicks: !filters.myPicks, minRating: filters.myPicks ? null : filters.minRating })} />
                      <span className="text-sm text-foreground">{t("meals.showOnlyMyPicks")}</span>
                    </label>
                    {filters.myPicks && (
                      <div role="group" aria-label={t("meals.minimumRating")} className="mt-2">
                        <p className="mb-1.5 text-sm text-muted-foreground">{t("meals.minimumRating")}</p>
                        <div className="flex flex-wrap gap-2">
                          {[null, 4, 3, 2].map(rating => (
                            <button key={String(rating)} type="button" className="chip" aria-pressed={filters.minRating === rating}
                              onClick={() => updateFilters({ minRating: rating })} data-testid={`button-filter-rating-${rating ?? "any"}`}>{rating ? `${rating}*+` : t("meals.any")}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                  <section className="pb-1" data-filter-section="personal">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={filters.withNotes} onChange={() => updateFilters({ withNotes: !filters.withNotes })}
                        className="h-5 w-5 shrink-0 accent-primary" data-testid="filter-with-notes" />
                      <span className="text-sm text-foreground">{t("meals.withMyNotes")}</span>
                    </label>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={filters.modifiedByMe} onChange={() => updateFilters({ modifiedByMe: !filters.modifiedByMe })}
                        className="h-5 w-5 shrink-0 accent-primary" data-testid="filter-modified" />
                      <span className="text-sm text-foreground">{t("meals.modifiedByMe")}</span>
                    </label>
                  </section>
                </div>
              )}
            </>
  );
}
