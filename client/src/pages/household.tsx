import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { StorePicker } from "@/components/store-picker";
import { WeekFilterPanel, useWeekFilterChips } from "@/components/week-filter-panel";
import { useI18n } from "@/lib/i18n";
import { useHouseholdCopy } from "@/lib/household-copy";
import { settingsText } from "@/lib/settings-copy";
import { useWeekFilterCopy } from "@/lib/week-filter-copy";
import { useRecipeCatalog } from "@/hooks/use-week-workspace";
import { getRecipeUserMeta } from "@/hooks/use-recipe-user-meta";
import { selectableDevices } from "@/lib/device-requirements";
import { challengeWhen, cookingStyles, householdServings, loadSettings, servingLimits, updateSettings,
  weeknightTimeOptions, type BasicSettings, type CookingStyle } from "@/lib/basic-settings";
import { mealSlots, readPlan, writePlan } from "@/lib/meal-plan";
import { matchesPlannerFilters, WEEK_DEFAULT_MAX_MINUTES } from "@/lib/planner-filters";
import { toPlannerRecipes, type PlannerRecipe } from "@/lib/planner-recipes";
import { checkEligibility } from "@/lib/preference-engine";
import { loadWeekFilters, saveWeekFilters, type WeekFilters } from "@/lib/week-filters";
import { cookingEvenings, proposeCookingPlan, weekOrder } from "@/lib/week-suggestions";
import { currentWeek } from "@/lib/week-plan";
import { allergens, type Allergen, type DietPattern } from "@shared/food-rules";

// Diets: only those the catalog marks with an explicit, verified tag (preference-engine.ts → dietTags). Allergies: all of
// Basic Settings' list; gluten and milk also need the tag, the others are checked by ingredient wording (unclear = unsafe).
const offeredDiets: DietPattern[] = ["vegetarian", "vegan", "glutenFree", "dairyFree"];
const offeredAllergies: readonly Allergen[] = allergens;
const toggle = <T,>(list: readonly T[], value: T) => (list.includes(value) ? list.filter(x => x !== value) : [...list, value]);

type GroupKey = "style" | "servings" | "restrictions" | "equipment" | "evenings" | "fixed" | "challenge" | "weeknight" | "filters";
/** Groups that start collapsed for each cooking style (Quick & easy: only the essentials open). */
const collapsedFor = (style: CookingStyle): GroupKey[] => (style === "quick" ? ["weeknight", "filters"] : style === "everyday" ? ["filters"] : []);

/** One collapsible group. The header shows its current answer in small text; choosing something inside collapses the groups above. */
function Group({ id, title, summary, hint, open, onToggle, onPicked, children }: {
  id: GroupKey; title: string; summary: string; hint?: ReactNode; open: boolean; onToggle: () => void; onPicked: () => void; children: ReactNode;
}) {
  return (
    <section className="border-b hairline" data-testid={`q-${id}`}>
      <h2>
        <button type="button" aria-expanded={open} aria-controls={`q-${id}-body`} onClick={onToggle} data-testid={`q-${id}-toggle`}
          className="flex min-h-11 w-full items-center gap-2 py-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <span className="min-w-0 flex-1">
            <span className="text-base font-semibold text-foreground">{title}</span>
            {summary && <span className="ms-2 text-sm font-normal text-muted-foreground" data-testid={`q-${id}-summary`}>{summary}</span>}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-700 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h2>
      {/* Slow open/close: grid rows animate 0fr ↔ 1fr; inert + invisible keep a closed group out of focus and the accessibility tree. */}
      <div id={`q-${id}-body`} inert={!open}
        className={`grid transition-[grid-template-rows,visibility] duration-700 ease-in-out motion-reduce:transition-none ${open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="pb-4" onClickCapture={e => { if ((e.target as HTMLElement).closest("button")) onPicked(); }}>
            {hint && <p className="mb-3 text-sm text-muted-foreground">{hint}</p>}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
const Chip = ({ on, onClick, children, testid }: { on: boolean; onClick: () => void; children: ReactNode; testid: string }) =>
  <button type="button" aria-pressed={on} onClick={onClick} className="chip" data-testid={testid}>{children}</button>;
/** One choice of several. .chip only styles aria-pressed, so the selected look (border, fill, weight, ✓) is set here. */
const Radio = ({ on, onClick, children, testid, className = "" }: { on: boolean; onClick: () => void; children: ReactNode; testid: string; className?: string }) =>
  <button type="button" role="radio" aria-checked={on} onClick={onClick} data-testid={testid}
    className={`chip ${on ? "!border-primary !bg-accent font-semibold" : ""} ${className}`}>{on && <span aria-hidden="true" className="text-xs">✓</span>}{children}</button>;

export default function Household() {
  const { t: app, lang, dir } = useI18n();
  const t = useHouseholdCopy();
  const c = useWeekFilterCopy();
  const s = (key: string) => settingsText(lang, key);
  const [, setLocation] = useLocation();
  const catalog = useRecipeCatalog();
  const [initial] = useState(loadSettings);
  // One draft for every answer: switching style only changes what is shown, never what was entered.
  const [draft, setDraft] = useState<BasicSettings>(() => ({ ...initial, household: { ...initial.household, servingsMode: "fixed", fixedServings: householdServings(initial) ?? 2 } }));
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => new Set(collapsedFor(initial.setup.style)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"catalog" | "save" | "equipment" | "restrictions" | null>(null);
  // The Week → Plan filters: the same value the Week page shows, saved as soon as it changes.
  const [filters, setFiltersState] = useState(loadWeekFilters);
  const setFilters = (next: WeekFilters) => { setFiltersState(next); saveWeekFilters(next); };
  const filterChips = useWeekFilterChips(filters, setFilters).all;
  const setup = draft.setup;
  const patch = (change: (d: BasicSettings) => BasicSettings) => setDraft(change);
  const setSetup = (values: Partial<BasicSettings["setup"]>) => patch(d => ({ ...d, setup: { ...d.setup, ...values } }));
  const dayName = (day: number) => app(`meals.${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day]}`);

  const evenings = cookingEvenings(draft);
  const restricted = [...offeredDiets.filter(d => draft.dietary.diets.includes(d)), ...offeredAllergies.filter(a => draft.dietary.allergies.includes(a))];
  const otherRules = [...draft.dietary.diets.filter(d => !offeredDiets.includes(d)).map(d => s(`diet_${d}`)),
    ...draft.dietary.allergies.filter(a => !offeredAllergies.includes(a)).map(a => s(`allergen_${a}`)), ...draft.dietary.customAllergies];
  const memberRules = draft.household.members.some(m => m.diets.length || m.allergies.length || m.customAllergies.length);
  // Required: nothing is pre-selected. The person picks a diet or allergy, or says "None" explicitly.
  const noneChosen = setup.noRestrictions && restricted.length === 0;
  const restrictionsAnswered = noneChosen || restricted.length > 0 || otherRules.length > 0;
  // Required: a new person starts with nothing selected (null = never answered), so the suggestions never assume a device.
  const devices = draft.kitchen.devices ?? [];
  const planner = useMemo(() => toPlannerRecipes(catalog.data ?? []), [catalog.data]);
  const eligible = useMemo(() => planner.filter(r => checkEligibility(r, draft).eligible), [planner, draft]);
  const fits = (r: PlannerRecipe) => matchesPlannerFilters(r, filters, "total", getRecipeUserMeta(r.id));

  const order: GroupKey[] = ["style", "servings", "restrictions", "equipment", "evenings", "fixed", ...(setup.style === "chef" ? ["challenge" as const] : []), "weeknight", "filters"];
  const open = (key: GroupKey) => !collapsed.has(key);
  const toggleGroup = (key: GroupKey) => setCollapsed(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const collapseAbove = (key: GroupKey) => setCollapsed(prev => new Set([...prev, ...order.slice(0, order.indexOf(key))]));
  const chooseStyle = (style: CookingStyle) => {
    setSetup({ style });
    // Quick & easy folds the optional groups away; Chef challenge opens them. Answers are never cleared.
    setCollapsed(prev => new Set([...[...prev].filter(k => !["challenge", "weeknight", "filters"].includes(k)), ...collapsedFor(style)]));
  };

  const challengeText = setup.challenge.when === "day" && setup.challenge.day !== null ? dayName(setup.challenge.day) : t(`challenge_${setup.challenge.when}`);
  const summaries: Record<GroupKey, string> = {
    style: t(`style_${setup.style}`),
    servings: t("servingsN", { n: draft.household.fixedServings }),
    restrictions: restricted.length ? restricted.map(r => offeredDiets.includes(r as DietPattern) ? s(`diet_${r}`) : s(`allergen_${r}`)).join(", ") : noneChosen ? t("none") : "",
    equipment: devices.map(d => s(`device_${d}`)).join(", "),
    evenings: setup.evenings === null ? `${t("notSure")} (${evenings.length})` : String(setup.evenings),
    fixed: setup.fixedDays.map(dayName).join(", "),
    challenge: challengeText,
    weeknight: mealSlots.some(m => setup.weeknightMax[m] !== null)
      ? mealSlots.filter(m => setup.weeknightMax[m] !== null).map(m => `${app(`meals.${m.toLowerCase()}`)} ${t("upTo", { n: setup.weeknightMax[m]! }).toLocaleLowerCase(lang)}`).join(", ")
      : t("noLimit"),
    filters: [filters.maxMinutes === null ? app("meals.any") : c("upTo", { count: filters.maxMinutes }), ...filterChips.map(chip => chip.label)].join(", "),
  };

  const skip = () => {
    try { updateSettings(x => ({ ...x, setup: { ...x.setup, status: x.setup.status === "new" ? "skipped" : x.setup.status } })); } catch { /* still leave */ }
    setLocation("/");
  };
  // A required answer is missing: open its group and bring it into view.
  const ask = (key: "restrictions" | "equipment") => {
    setError(key);
    setCollapsed(prev => { const next = new Set(prev); next.delete(key); return next; });
    setTimeout(() => document.querySelector(`[data-testid="q-${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };
  const suggest = () => {
    if (!restrictionsAnswered) return ask("restrictions");
    if (!devices.length) return ask("equipment");
    if (!catalog.data) { setError("catalog"); return; }
    setBusy(true); setError(null);
    try {
      // Stores are saved by the picker as they are tapped: keep the latest, not the draft's copy.
      const saved = updateSettings(x => ({ ...draft, rev: x.rev, shopping: { ...draft.shopping, stores: x.shopping.stores },
        setup: { ...draft.setup, status: "done", suggested: x.setup.suggested, declined: x.setup.declined } }));
      // The answers rebuild the whole Week (product owner, 2026-11-20); an approved Week keeps its groceries until Save changes.
      const result = proposeCookingPlan({ ...readPlan(), batches: [] }, planner, saved, currentWeek(), { fits });
      writePlan(result.plan);
      updateSettings(x => ({ ...x, setup: { ...x.setup, suggested: result.suggested, declined: [] } }));
      setLocation("/meals?plan");
    } catch { setError("save"); setBusy(false); }
  };

  const group = (id: GroupKey, title: string, children: ReactNode, hint?: ReactNode) => (
    <Group key={id} id={id} title={title} summary={summaries[id]} hint={hint} open={open(id)} onToggle={() => toggleGroup(id)} onPicked={() => collapseAbove(id)}>{children}</Group>
  );
  const overCount = setup.evenings !== null && setup.fixedDays.length > setup.evenings;
  const groups: Record<GroupKey, () => ReactNode> = {
    style: () => group("style", t("styleQ"),
      <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
        {cookingStyles.map(style => (
          <button key={style} type="button" role="radio" aria-checked={setup.style === style} data-testid={`style-${style}`} onClick={() => chooseStyle(style)}
            className={`min-h-11 rounded-lg border p-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${setup.style === style ? "border-primary bg-accent" : "border-border bg-card"}`}>
            <span className="block text-sm font-semibold">{setup.style === style ? "✓ " : ""}{t(`style_${style}`)}</span>
            <span className="block text-sm text-muted-foreground">{t(`style_${style}Hint`)}</span>
          </button>
        ))}
      </div>),
    servings: () => group("servings", t("servingsQ"),
      <div role="group" aria-label={t("servingsQ")} className="inline-flex items-center rounded-full border border-input bg-card">
        <button type="button" aria-label={t("fewer")} disabled={draft.household.fixedServings <= servingLimits.min} data-testid="servings-decrease"
          onClick={() => patch(x => ({ ...x, household: { ...x.household, fixedServings: x.household.fixedServings - 1 } }))} className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"><Minus className="h-4 w-4" aria-hidden="true" /></button>
        <span className="min-w-24 text-center text-base font-medium" aria-live="polite" data-testid="servings-value">{t("servingsN", { n: draft.household.fixedServings })}</span>
        <button type="button" aria-label={t("more")} disabled={draft.household.fixedServings >= servingLimits.max} data-testid="servings-increase"
          onClick={() => patch(x => ({ ...x, household: { ...x.household, fixedServings: x.household.fixedServings + 1 } }))} className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden="true" /></button>
      </div>),
    restrictions: () => group("restrictions", t("restrictionsQ"), <>
      <div className="flex flex-wrap gap-2">
        <Chip on={noneChosen} testid="restriction-none"
          onClick={() => {
            patch(x => ({ ...x, setup: { ...x.setup, noRestrictions: true },
              dietary: { ...x.dietary, diets: x.dietary.diets.filter(d => !offeredDiets.includes(d)), allergies: x.dietary.allergies.filter(a => !offeredAllergies.includes(a)) } }));
            if (error === "restrictions") setError(null);
            setCollapsed(prev => new Set([...prev, "restrictions"])); // "None" answers the question: fold it away
          }}>{t("none")}</Chip>
      </div>
      <p className="mt-3 text-sm font-medium">{t("dietLabel")}</p>
      <div className="mt-1 flex flex-wrap gap-2">{offeredDiets.map(d => (
        <Chip key={d} on={draft.dietary.diets.includes(d)} onClick={() => { patch(x => ({ ...x, setup: { ...x.setup, noRestrictions: false }, dietary: { ...x.dietary, diets: toggle(x.dietary.diets, d) } })); if (error === "restrictions") setError(null); }} testid={`diet-${d}`}>{s(`diet_${d}`)}</Chip>
      ))}</div>
      <p className="mt-3 text-sm font-medium">{t("allergyLabel")}</p>
      <div className="mt-1 flex flex-wrap gap-2">{offeredAllergies.map(a => (
        <Chip key={a} on={draft.dietary.allergies.includes(a)} onClick={() => { patch(x => ({ ...x, setup: { ...x.setup, noRestrictions: false }, dietary: { ...x.dietary, allergies: toggle(x.dietary.allergies, a) } })); if (error === "restrictions") setError(null); }} testid={`allergy-${a}`}>{s(`allergen_${a}`)}</Chip>
      ))}</div>
      {otherRules.length > 0 && <p className="mt-3 text-sm text-muted-foreground" data-testid="other-rules">{t("alsoApplied", { list: otherRules.join(", ") })}</p>}
      {memberRules && <p className="mt-1 text-sm text-muted-foreground">{t("membersApplied")}</p>}
      {error === "restrictions" && <p role="alert" className="mt-2 text-sm text-destructive" data-testid="restrictions-required">{t("restrictionsRequired")}</p>}
    </>, t("restrictionsHint")),
    equipment: () => group("equipment", t("equipmentQ"), <>
      <div className="flex flex-wrap gap-2">{selectableDevices.map(d => (
        <Chip key={d} on={devices.includes(d)} testid={`device-${d}`}
          onClick={() => { patch(x => ({ ...x, kitchen: { devices: toggle(x.kitchen.devices ?? [], d) } })); if (error === "equipment") setError(null); }}>{s(`device_${d}`)}</Chip>
      ))}</div>
      {error === "equipment" && <p role="alert" className="mt-2 text-sm text-destructive" data-testid="equipment-required">{t("equipmentRequired")}</p>}
    </>, t("equipmentHint")),
    evenings: () => group("evenings", t("eveningsQ"),
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map(n => <Radio key={n} on={setup.evenings === n} className="min-w-11 justify-center"
          onClick={() => setSetup({ evenings: n })} testid={`evenings-${n}`}>{n}</Radio>)}
        <Radio on={setup.evenings === null} onClick={() => setSetup({ evenings: null })} testid="evenings-unsure">{t("notSure")}</Radio>
      </div>, setup.evenings === null ? t("notSureHint", { n: evenings.length }) : undefined),
    fixed: () => group("fixed", `${t("fixedQ")} (${t("optional")})`, <>
      <div className="flex flex-wrap gap-2">{weekOrder.map(day => (
        <Chip key={day} on={setup.fixedDays.includes(day)} onClick={() => setSetup({ fixedDays: toggle(setup.fixedDays, day).sort((a, b) => a - b) })} testid={`fixed-${day}`}>{dayName(day)}</Chip>
      ))}</div>
      {overCount && (
        <p role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-accent p-3 text-sm" data-testid="over-count">
          {t("tooManyDays", { days: setup.fixedDays.length, count: setup.evenings! })}
          <button type="button" className="btn btn-secondary" onClick={() => setSetup({ evenings: setup.fixedDays.length })} data-testid="raise-count">{t("raiseCount", { days: setup.fixedDays.length })}</button>
        </p>
      )}
    </>, t("fixedHint")),
    challenge: () => group("challenge", t("challengeQ"), <>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {challengeWhen.map(when => <Radio key={when} on={setup.challenge.when === when}
          onClick={() => setSetup({ challenge: { ...setup.challenge, when } })} testid={`challenge-${when}`}>{t(`challenge_${when}`)}</Radio>)}
      </div>
      {setup.challenge.when === "day" && <div className="mt-2 flex flex-wrap gap-2">{weekOrder.map(day => (
        <Chip key={day} on={setup.challenge.day === day} onClick={() => setSetup({ challenge: { when: "day", day: setup.challenge.day === day ? null : day } })} testid={`challenge-day-${day}`}>{dayName(day)}</Chip>
      ))}</div>}
    </>),
    weeknight: () => group("weeknight", t("weeknightQ"),
      <div className="space-y-3">{mealSlots.map(meal => (
        <div key={meal} role="radiogroup" aria-label={app(`meals.${meal.toLowerCase()}`)} data-testid={`weeknight-${meal}`}>
          <p className="mb-1.5 text-sm font-medium">{app(`meals.${meal.toLowerCase()}`)}</p>
          <div className="flex flex-wrap gap-2">
            {[null, ...weeknightTimeOptions].map(n => <Radio key={n ?? "none"} on={setup.weeknightMax[meal] === n}
              onClick={() => patch(d => ({ ...d, setup: { ...d.setup, weeknightMax: { ...d.setup.weeknightMax, [meal]: n } } }))} testid={`weeknight-${meal}-${n ?? "none"}`}>{n === null ? t("noLimit") : t("minutes", { n })}</Radio>)}
          </div>
        </div>
      ))}</div>, <>{t("weeknightHint")}{setup.style === "chef" && setup.challenge.when === "day" ? ` ${t("weeknightChefHint")}` : ""}</>),
    filters: () => group("filters", t("filtersQ"),
      <div data-testid="household-filters">
        <WeekFilterPanel variant="onboarding" filters={filters} onChange={setFilters} devices={devices} eligible={eligible} matchingCount={eligible.filter(fits).length} />
      </div>, filters.maxMinutes === WEEK_DEFAULT_MAX_MINUTES ? t("filtersHint") : undefined),
  };

  return (
    <div className="pb-28 sm:pb-10" dir={dir}>
      <PageContainer size="md" className="max-w-2xl py-4 sm:py-10">
        <header className="page-header mb-2">
          <h1 className="page-title" data-testid="text-page-title">{t("title")}</h1>
          <p className="page-subtitle">{t("intro")}</p>
        </header>

        {order.map(key => groups[key]())}

        {/* Optional: Continue works with no store chosen. */}
        <div className="border-b hairline py-4"><StorePicker /></div>

        <div className="sticky bottom-[var(--app-bottom-nav)] z-10 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          <p className="text-xs font-medium text-muted-foreground">{t("summary")}</p>
          <p className="mt-1 text-sm" data-testid="household-summary">{order.filter(k => k !== "weeknight" || mealSlots.some(m => setup.weeknightMax[m] !== null)).map(k => summaries[k]).filter(Boolean).join(" · ")}</p>
          {error && <p role="alert" className="mt-2 text-sm text-destructive" data-testid="household-error">{t(error === "catalog" ? "catalogError" : error === "equipment" ? "equipmentRequired" : error === "restrictions" ? "restrictionsRequired" : "saveError")}
            {error === "catalog" && <button type="button" className="btn btn-text" onClick={() => catalog.refetch()}>{t("retry")}</button>}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={suggest} disabled={busy || catalog.isPending} className="btn btn-primary" data-testid="button-suggest-week">{busy ? t("working") : t("suggest")}</button>
            <button type="button" onClick={skip} className="btn btn-text" data-testid="button-skip-household">{t("skip")}</button>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
