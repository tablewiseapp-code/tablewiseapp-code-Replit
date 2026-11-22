import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Minus, Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useHouseholdCopy } from "@/lib/household-copy";
import { challengeWhen, weeknightTimeOptions, type BasicSettings, type HouseholdSetup } from "@/lib/basic-settings";
import { settingsText } from "@/lib/settings-copy";
import { allergens, type DietPattern } from "@shared/food-rules";
import { mealSlots } from "@/lib/meal-plan";
import { cookingEvenings, weekOrder } from "@/lib/week-suggestions";
import { askURL } from "@/hooks/use-cook-now";

export const toggle = <T,>(list: readonly T[], value: T) => (list.includes(value) ? list.filter(x => x !== value) : [...list, value]);

export const Chip = ({ on, onClick, children, testid }: { on: boolean; onClick: () => void; children: ReactNode; testid: string }) =>
  <button type="button" aria-pressed={on} onClick={onClick} className="chip" data-testid={testid}>{children}</button>;
/** One choice of several. .chip only styles aria-pressed, so the selected look (border, fill, weight, ✓) is set here. */
export const Radio = ({ on, onClick, children, testid, className = "" }: { on: boolean; onClick: () => void; children: ReactNode; testid: string; className?: string }) =>
  <button type="button" role="radio" aria-checked={on} onClick={onClick} data-testid={testid}
    className={`chip ${on ? "!border-primary !bg-accent font-semibold" : ""} ${className}`}>{on && <span aria-hidden="true" className="text-xs">✓</span>}{children}</button>;

/** − value + with 44px buttons; the value is announced when it changes. */
export function Counter({ label, value, canLess, canMore, onChange, testid }: { label: string; value: number; canLess: boolean; canMore: boolean; onChange: (delta: number) => void; testid: string }) {
  const t = useHouseholdCopy();
  return (
    <div role="group" aria-label={label} className="flex items-center justify-between gap-3 py-2" data-testid={testid}>
      <span className="text-base font-medium">{label}</span>
      <span className="inline-flex items-center rounded-full border border-input bg-card">
        <button type="button" aria-label={t("fewerOf", { who: label })} disabled={!canLess} onClick={() => onChange(-1)} data-testid={`${testid}-decrease`}
          className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"><Minus className="h-4 w-4" aria-hidden="true" /></button>
        <span className="min-w-10 text-center text-base font-medium tabular-nums" aria-live="polite" data-testid={`${testid}-value`}>{value}</span>
        <button type="button" aria-label={t("moreOf", { who: label })} disabled={!canMore} onClick={() => onChange(1)} data-testid={`${testid}-increase`}
          className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden="true" /></button>
      </span>
    </div>
  );
}

/** Fixed days beyond the weekly count: the person raises the count or unselects days (Save waits for one of them). */
export const overCount = (setup: HouseholdSetup) => setup.evenings !== null && setup.fixedDays.length > setup.evenings;

/** The Week's cooking days: evenings per week, optional fixed evenings, the chef challenge day and the Mon–Fri time limits. */
export function CookingDays({ setup, onChange }: { setup: HouseholdSetup; onChange: (patch: Partial<HouseholdSetup>) => void }) {
  const { t: app } = useI18n();
  const t = useHouseholdCopy();
  const dayName = (day: number) => app(`meals.${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day]}`);
  const evenings = cookingEvenings({ setup }).length;
  const label = "mb-1.5 mt-4 text-sm font-medium";
  return (
    <div data-testid="cooking-days">
      <p className={label} id="evenings-label">{t("eveningsQ")}</p>
      <div role="radiogroup" aria-labelledby="evenings-label" className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map(n => <Radio key={n} on={setup.evenings === n} className="min-w-11 justify-center" onClick={() => onChange({ evenings: n })} testid={`evenings-${n}`}>{n}</Radio>)}
        <Radio on={setup.evenings === null} onClick={() => onChange({ evenings: null })} testid="evenings-unsure">{t("notSure")}</Radio>
      </div>
      {setup.evenings === null && <p className="mt-1 text-sm text-muted-foreground">{t("notSureHint", { n: evenings })}</p>}

      <p className={label}>{t("fixedQ")} ({t("optional")})</p>
      <div className="flex flex-wrap gap-2">{weekOrder.map(day => (
        <Chip key={day} on={setup.fixedDays.includes(day)} onClick={() => onChange({ fixedDays: toggle(setup.fixedDays, day).sort((a, b) => a - b) })} testid={`fixed-${day}`}>{dayName(day)}</Chip>
      ))}</div>
      <p className="mt-1 text-sm text-muted-foreground">{t("fixedHint")}</p>
      {overCount(setup) && (
        <div role="alert" className="mt-3 rounded-lg bg-accent p-3 text-sm" data-testid="over-count">
          <p>{t("tooManyDays", { days: setup.fixedDays.length, count: setup.evenings! })} {t("reviseDays")}</p>
          <button type="button" className="btn btn-secondary mt-2" onClick={() => onChange({ evenings: setup.fixedDays.length })} data-testid="raise-count">{t("raiseCount", { days: setup.fixedDays.length })}</button>
        </div>
      )}

      {setup.style === "chef" && <>
        <p className={label} id="challenge-label">{t("challengeQ")}</p>
        <div role="radiogroup" aria-labelledby="challenge-label" className="flex flex-wrap gap-2">
          {challengeWhen.map(when => <Radio key={when} on={setup.challenge.when === when} onClick={() => onChange({ challenge: { ...setup.challenge, when } })} testid={`challenge-${when}`}>{t(`challenge_${when}`)}</Radio>)}
        </div>
        {setup.challenge.when === "day" && <div className="mt-2 flex flex-wrap gap-2">{weekOrder.map(day => (
          <Chip key={day} on={setup.challenge.day === day} onClick={() => onChange({ challenge: { when: "day", day: setup.challenge.day === day ? null : day } })} testid={`challenge-day-${day}`}>{dayName(day)}</Chip>
        ))}</div>}
      </>}

    </div>
  );
}

/** Cook now found nothing: requirements are never relaxed, so the way out is reviewing them. `from` is where to come back. */
export function CookNowEmpty({ from }: { from: string }) {
  const t = useHouseholdCopy();
  return (
    <div role="status" className="mt-3 rounded-lg bg-foreground/5 p-3 text-sm" data-testid="cook-now-none">
      <p>{t("cookNowNone")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link href="/settings" className="btn btn-text -ms-2" data-testid="cook-now-review">{t("reviewPrefs")}</Link>
        <Link href={askURL(["kitchen"], from)} className="btn btn-text" data-testid="cook-now-kitchen">{t("reviewKitchen")}</Link>
      </div>
    </div>
  );
}

// Diets: only those the catalog marks with an explicit, verified tag (preference-engine.ts → dietTags).
export const offeredDiets: DietPattern[] = ["vegetarian", "vegan", "glutenFree", "dairyFree"];

/** Family food requirements: No requirements, diets, allergies and the person's own exclusions. Every one applies to everyone
 * eating. No requirements clears the others; choosing one clears No requirements. Your household saves each change at once;
 * Personalize my recipes edits a draft (`update` decides). */
export function RequirementsEditor({ settings, update }: { settings: BasicSettings; update: (change: (s: BasicSettings) => BasicSettings) => unknown }) {
  const { lang } = useI18n();
  const t = useHouseholdCopy();
  const s = (key: string) => settingsText(lang, key);
  const d = settings.dietary;
  const [dietOpen, setDietOpen] = useState(() => d.diets.length > 0);
  const [exclusionsOpen, setExclusionsOpen] = useState(() => d.allergies.length + d.customAllergies.length > 0);
  const [term, setTerm] = useState("");
  const require = (change: (d: BasicSettings["dietary"]) => Partial<BasicSettings["dietary"]>) =>
    update(x => ({ ...x, setup: { ...x.setup, noRestrictions: false }, dietary: { ...x.dietary, ...change(x.dietary) } }));
  const chooseNone = () => {
    setDietOpen(false); setExclusionsOpen(false);
    update(x => ({ ...x, setup: { ...x.setup, noRestrictions: true }, dietary: { ...x.dietary, diets: [], allergies: [], customAllergies: [] } }));
  };
  return <>
    <p className="text-sm text-muted-foreground">{t("requirementsHint")} {t("restrictionsHint")}</p>
    <div className="mt-3 grid gap-2">
      <Chip on={settings.setup.noRestrictions && !d.diets.length && !d.allergies.length && !d.customAllergies.length} onClick={chooseNone} testid="restriction-none">{t("noRequirements")}</Chip>
      <Chip on={dietOpen} onClick={() => setDietOpen(o => !o)} testid="restriction-diet">{t("chooseDiet")}</Chip>
      {dietOpen && <div className="flex flex-wrap gap-2 ps-3" data-testid="diet-options">{offeredDiets.map(diet => (
        <Chip key={diet} on={d.diets.includes(diet)} onClick={() => require(x => ({ diets: toggle(x.diets, diet) }))} testid={`diet-${diet}`}>{s(`diet_${diet}`)}</Chip>
      ))}</div>}
      <Chip on={exclusionsOpen} onClick={() => setExclusionsOpen(o => !o)} testid="restriction-exclusions">{t("addExclusions")}</Chip>
      {exclusionsOpen && <div className="ps-3" data-testid="exclusion-options">
        <div className="flex flex-wrap gap-2">{allergens.map(a => (
          <Chip key={a} on={d.allergies.includes(a)} onClick={() => require(x => ({ allergies: toggle(x.allergies, a) }))} testid={`allergy-${a}`}>{s(`allergen_${a}`)}</Chip>
        ))}</div>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); if (term.trim()) { require(x => ({ customAllergies: [...x.customAllergies, term.trim()] })); setTerm(""); } }}>
          <label className="grid gap-1 text-sm font-medium">{t("exclusionLabel")}
            <input value={term} onChange={e => setTerm(e.target.value)} maxLength={40} className="min-h-11 rounded-lg border border-input bg-card px-3 text-base font-normal" data-testid="input-exclusion" />
          </label>
          <button type="submit" className="btn btn-secondary" data-testid="button-add-exclusion">{t("add")}</button>
        </form>
        {d.customAllergies.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">{d.customAllergies.map(x => (
          <li key={x}><button type="button" className="chip" aria-label={t("remove", { item: x })} onClick={() => require(y => ({ customAllergies: y.customAllergies.filter(z => z !== x) }))}>{x} <span aria-hidden="true">×</span></button></li>
        ))}</ul>}
      </div>}
    </div>
    {d.diets.some(x => !offeredDiets.includes(x)) && <p className="mt-3 text-sm text-muted-foreground" data-testid="other-rules">
      {t("alsoApplied", { list: d.diets.filter(x => !offeredDiets.includes(x)).map(x => s(`diet_${x}`)).join(", ") })}</p>}
    {settings.household.members.some(m => m.diets.length || m.allergies.length || m.customAllergies.length) && <p className="mt-1 text-sm text-muted-foreground">{t("membersApplied")}</p>}
  </>;
}

/** Kid-friendly meals (one saved preference): lunch and dinner suggestions rank kid-friendly recipes first. */
export function KidFriendlySwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const t = useHouseholdCopy();
  return (
    <div className="flex items-center justify-between gap-3 py-2" data-testid="kid-friendly">
      <span id="kid-friendly-label" className="min-w-0">
        <span className="block text-base font-medium">{t("kidFriendly")}</span>
        <span className="block text-sm text-muted-foreground" id="kid-friendly-hint">{t("kidFriendlyHint")}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-labelledby="kid-friendly-label" aria-describedby="kid-friendly-hint" onClick={onToggle} data-testid="switch-kid-friendly"
        className={`relative inline-flex h-11 w-16 shrink-0 items-center rounded-full border-2 transition-colors motion-reduce:transition-none ${on ? "border-primary bg-primary" : "border-input bg-muted"}`}>
        <span aria-hidden="true" className={`absolute h-7 w-7 rounded-full bg-background shadow transition-[inset-inline-start] motion-reduce:transition-none ${on ? "start-7" : "start-1"}`} />
      </button>
    </div>
  );
}

/** Mon–Fri total-time limit for each meal (Personalize my recipes); the chef challenge evening's dinner is exempt. */
export function WeekdayLimits({ setup, onChange }: { setup: HouseholdSetup; onChange: (weeknightMax: HouseholdSetup["weeknightMax"]) => void }) {
  const { t: app } = useI18n();
  const t = useHouseholdCopy();
  return (
    <div data-testid="weeknight-limits">
      <p className="text-sm text-muted-foreground">{t("weeknightHint")}{setup.style === "chef" && setup.challenge.when === "day" ? ` ${t("weeknightChefHint")}` : ""}</p>
      <div className="space-y-3 py-3">{mealSlots.map(meal => (
        <div key={meal} role="radiogroup" aria-label={app(`meals.${meal.toLowerCase()}`)} data-testid={`weeknight-${meal}`}>
          <p className="mb-1.5 text-sm font-medium">{app(`meals.${meal.toLowerCase()}`)}</p>
          <div className="flex flex-wrap gap-2">
            {[null, ...weeknightTimeOptions].map(n => <Radio key={n ?? "none"} on={setup.weeknightMax[meal] === n}
              onClick={() => onChange({ ...setup.weeknightMax, [meal]: n })} testid={`weeknight-${meal}-${n ?? "none"}`}>{n === null ? t("noLimit") : t("minutes", { n })}</Radio>)}
          </div>
        </div>
      ))}</div>
    </div>
  );
}
