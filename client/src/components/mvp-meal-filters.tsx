import { useEffect, useId, useRef, useState, type CompositionEvent, type KeyboardEvent } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { mealTypes, timeCaps, defaultMealFilters, normalizeIngredientTerm } from "@/lib/meal-filters";
import type { MealFilters } from "@/lib/meal-filters";
import type { RecipeTimeMode } from "@/lib/recipe-time";
import { useI18n } from "@/lib/i18n";
import { mealFilterCopy, type MealFilterCopyKey } from "@/lib/meal-filter-copy";

type Props = {
  filters: MealFilters;
  onChange: (next: MealFilters) => void;
  timeMode: RecipeTimeMode;
  onTimeModeChange: (mode: RecipeTimeMode) => void;
  resultCount: number;
};

type IngredientKind = "mustInclude" | "mustExclude";

const controlClass = "min-h-11 rounded-xl border border-[#d9dfd4] bg-white px-3 text-sm text-[#45594c] focus:border-[#8ea58c] focus:outline-none focus:ring-2 focus:ring-[#dce8d8]";
const chipClass = "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-[#d9dfd4] bg-[#f1f4ed] px-3 py-1.5 text-start text-xs leading-5 text-[#45594c]";

export function MvpMealFilters({ filters, onChange, timeMode, onTimeModeChange, resultCount }: Props) {
  const { lang, dir } = useI18n();
  const t = (key: MealFilterCopyKey, values?: Record<string, string | number>) => mealFilterCopy(lang, key, values);
  const [open, setOpen] = useState(false);
  const [includeDraft, setIncludeDraft] = useState("");
  const [excludeDraft, setExcludeDraft] = useState("");
  const [composing, setComposing] = useState<IngredientKind | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const update = (patch: Partial<MealFilters>) => onChange({ ...filters, ...patch });
  const activeCount = Number(filters.maxMinutes !== null) +
    filters.mustInclude.length + filters.mustExclude.length +
    filters.mealTypes.length + Number(filters.lunchbox !== "any");

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        const focusInside = rootRef.current?.contains(document.activeElement);
        setOpen(false);
        if (focusInside) toggleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const addTerm = (kind: IngredientKind) => {
    const draft = kind === "mustInclude" ? includeDraft : excludeDraft;
    const term = normalizeIngredientTerm(draft);
    if (!term) return;
    const current = filters[kind];
    if (term.length > 200 || current.length >= 50) return;
    const exists = current.some(value => normalizeIngredientTerm(value) === term);
    if (!exists) update({ [kind]: [...current, term] });
    if (kind === "mustInclude") setIncludeDraft("");
    else setExcludeDraft("");
  };

  const removeTerm = (kind: IngredientKind, term: string) => {
    update({ [kind]: filters[kind].filter(value => value !== term) });
  };

  const handleIngredientKey = (kind: IngredientKind, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && composing !== kind && !event.nativeEvent.isComposing) {
      event.preventDefault();
      addTerm(kind);
    }
  };

  const beginComposition = (kind: IngredientKind) => (_event: CompositionEvent<HTMLInputElement>) => setComposing(kind);
  const finishComposition = () => setComposing(null);

  const clearAll = () => {
    onChange(defaultMealFilters());
    setIncludeDraft("");
    setExcludeDraft("");
  };

  const removeChip = (kind: "time" | "include" | "exclude" | "mealType" | "lunchbox", value?: string) => {
    if (kind === "time") update({ maxMinutes: null });
    if (kind === "include" && value) removeTerm("mustInclude", value);
    if (kind === "exclude" && value) removeTerm("mustExclude", value);
    if (kind === "mealType" && value) update({ mealTypes: filters.mealTypes.filter(type => type !== value) });
    if (kind === "lunchbox") update({ lunchbox: "any" });
  };

  const chips: { key: string; label: string; kind: "time" | "include" | "exclude" | "mealType" | "lunchbox"; value?: string }[] = [];
  if (filters.maxMinutes !== null) {
    chips.push({ key: "time", kind: "time", label: `${t(timeMode)} · ${t("minutes", { count: filters.maxMinutes })}` });
  }
  filters.mustInclude.forEach(term => chips.push({ key: `include-${term}`, kind: "include", value: term, label: `${t("mustInclude")}: ${term}` }));
  filters.mustExclude.forEach(term => chips.push({ key: `exclude-${term}`, kind: "exclude", value: term, label: `${t("mustExclude")}: ${term}` }));
  filters.mealTypes.forEach(type => chips.push({ key: `meal-${type}`, kind: "mealType", value: type, label: t(type) }));
  if (filters.lunchbox !== "any") chips.push({
    key: "lunchbox",
    kind: "lunchbox",
    label: filters.lunchbox === "lunchbox" ? t("lunchbox") : t("schoolLunchbox"),
  });

  const renderIngredientField = (kind: IngredientKind, draft: string, setDraft: (value: string) => void) => {
    const id = `${panelId}-${kind}`;
    const terms = filters[kind];
    return (
      <div className="min-w-0">
        <label htmlFor={id} className="mb-2 block text-sm font-medium text-[#45594c]">{t(kind)}</label>
        <div className="flex min-w-0 gap-2">
          <input
            id={id}
            maxLength={200}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => handleIngredientKey(kind, event)}
            onCompositionStart={beginComposition(kind)}
            onCompositionEnd={finishComposition}
            placeholder={t("ingredientPlaceholder")}
            className={`${controlClass} min-w-0 flex-1`}
            aria-describedby={`${id}-hint`}
            data-testid={`mvp-ingredient-input-${kind}`}
          />
          <button type="button" onClick={() => addTerm(kind)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[#d9dfd4] bg-[#f8f8f2] px-3 text-sm font-medium text-[#45594c] hover:bg-[#edf2e9]" data-testid={`mvp-ingredient-add-${kind}`}>
            <Plus className="h-4 w-4" aria-hidden="true" />{t("add")}
          </button>
        </div>
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-[#798279]">{t("pressEnter")}</p>
        {terms.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label={t(kind)}>
            {terms.map(term => (
              <li key={term} className="min-w-0 max-w-full">
                <button type="button" onClick={() => removeTerm(kind, term)} aria-label={t("removeIngredient", { term })} className={chipClass}>
                  <span className="break-words">{term}</span><X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div ref={rootRef} dir={dir} className="relative min-w-0" data-testid="mvp-meal-filters">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? t("closeFilters") : t("openFilters")}${activeCount ? `, ${t("activeFilters", { count: activeCount })}` : ""}`}
          onClick={() => setOpen(value => !value)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d9dfd4] bg-[#fbfbf7] px-4 text-sm font-medium text-[#42624e] transition-colors hover:bg-[#f0f4ed] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#496c5a]"
          data-testid="mvp-filters-toggle"
        >
          {t("filters")}
          {activeCount > 0 && <span className="rounded-full bg-[#e3eadf] px-2 py-0.5 text-xs tabular-nums">{activeCount}</span>}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <p className="text-sm text-[#68756a]" aria-live="polite" data-testid="mvp-filter-result-count">
          {t("matchingRecipes", { count: resultCount })}
        </p>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2" aria-label={t("activeFilters", { count: activeCount })}>
          {chips.map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={() => removeChip(chip.kind, chip.value)}
              aria-label={t("removeFilter", { label: chip.label })}
              className={`${chipClass} max-w-full hover:border-[#a9bba5] hover:bg-[#e8eee4]`}
            >
              <span className="break-words">{chip.label}</span>
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          ))}
          {activeCount > 0 && (
            <button type="button" onClick={clearAll} className="min-h-10 px-2 text-xs font-medium text-[#7b604a] underline decoration-[#d8c7b8] underline-offset-4 hover:text-[#654b39]" data-testid="mvp-filters-clear">
              {t("clear")}
            </button>
          )}
        </div>
      )}

      {open && (
        <section id={panelId} className="absolute inset-x-0 z-30 mt-3 max-h-[min(78dvh,46rem)] overflow-y-auto rounded-2xl border border-[#d9dfd4] bg-[#fbfbf7] p-4 shadow-[0_18px_48px_-28px_rgba(39,52,46,0.42)] sm:p-5" data-testid="mvp-filters-panel">
          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset className="min-w-0 rounded-xl border border-[#e2e6dd] p-3 sm:p-4">
              <legend className="px-1 text-sm font-semibold text-[#34443a]">{t("time")}</legend>
              <div role="group" aria-label={t("timeDisplay")} className="mt-1 flex flex-wrap gap-2">
                {(["preparation", "total"] as const).map(mode => (
                  <button key={mode} type="button" aria-pressed={timeMode === mode} onClick={() => onTimeModeChange(mode)}
                    data-testid={`mvp-time-${mode}`}
                    className={`min-h-11 rounded-full border px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#496c5a] ${timeMode === mode ? "border-[#42624e] bg-[#42624e] text-white" : "border-[#d9dfd4] bg-white text-[#52665a]"}`}>
                    {t(mode)}
                  </button>
                ))}
              </div>
              <label htmlFor={`${panelId}-max-time`} className="mb-2 mt-4 block text-xs font-medium text-[#68756a]">{t("maxTime")}</label>
              <span className="relative block">
                <select id={`${panelId}-max-time`} value={filters.maxMinutes ?? ""}
                  onChange={event => update({ maxMinutes: event.target.value ? Number(event.target.value) as MealFilters["maxMinutes"] : null })}
                  className={`${controlClass} w-full appearance-none pe-10`} data-testid="mvp-filter-time-cap">
                  <option value="">{t("anyTime")}</option>
                  {timeCaps.map(cap => <option key={cap} value={cap}>{t("minutes", { count: cap })}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#738076]" aria-hidden="true" />
              </span>
            </fieldset>

            <fieldset className="min-w-0 rounded-xl border border-[#e2e6dd] p-3 sm:p-4 sm:col-span-2">
              <legend className="px-1 text-sm font-semibold text-[#34443a]">{t("ingredients")}</legend>
              <div className="grid gap-4 md:grid-cols-2">
                {renderIngredientField("mustInclude", includeDraft, setIncludeDraft)}
                {renderIngredientField("mustExclude", excludeDraft, setExcludeDraft)}
              </div>
              <p className="mt-3 rounded-lg bg-[#f2f3ec] p-3 text-xs leading-5 text-[#737c72]">{t("ingredientNotice")}</p>
            </fieldset>

            <fieldset className="min-w-0 rounded-xl border border-[#e2e6dd] p-3 sm:p-4">
              <legend className="px-1 text-sm font-semibold text-[#34443a]">{t("mealType")}</legend>
              <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label={t("mealType")}>
                <button type="button" aria-pressed={filters.mealTypes.length === 0} onClick={() => update({ mealTypes: [] })}
                  className={`min-h-11 rounded-full border px-3 text-xs font-medium ${filters.mealTypes.length === 0 ? "border-[#42624e] bg-[#42624e] text-white" : "border-[#d9dfd4] bg-white text-[#52665a]"}`}>
                  {t("all")}
                </button>
                {mealTypes.map(type => {
                  const selected = filters.mealTypes.includes(type);
                  return (
                    <button key={type} type="button" aria-pressed={selected} onClick={() => update({
                      mealTypes: selected ? filters.mealTypes.filter(value => value !== type) : [...filters.mealTypes, type],
                    })}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${selected ? "border-[#42624e] bg-[#42624e] text-white" : "border-[#d9dfd4] bg-white text-[#52665a]"}`}>
                      {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{t(type)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="min-w-0 rounded-xl border border-[#e2e6dd] p-3 sm:p-4 sm:col-span-2">
              <legend className="px-1 text-sm font-semibold text-[#34443a]">{t("lunchboxSuitability")}</legend>
              <label htmlFor={`${panelId}-lunchbox`} className="sr-only">{t("lunchboxSuitability")}</label>
              <span className="relative mt-1 block max-w-md">
                <select id={`${panelId}-lunchbox`} value={filters.lunchbox} onChange={event => update({ lunchbox: event.target.value as MealFilters["lunchbox"] })}
                  className={`${controlClass} w-full appearance-none pe-10`} data-testid="mvp-filter-lunchbox">
                  <option value="any">{t("any")}</option>
                  <option value="lunchbox">{t("lunchbox")}</option>
                  <option value="school-lunchbox">{t("schoolLunchbox")}</option>
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#738076]" aria-hidden="true" />
              </span>
              <p className="mt-3 rounded-lg bg-[#f2f3ec] p-3 text-xs leading-5 text-[#737c72]">{t("schoolNotice")}</p>
            </fieldset>
          </div>
        </section>
      )}
    </div>
  );
}
