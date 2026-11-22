import type { ReactNode } from "react";
import { Link } from "wouter";
import { Minus, Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useHouseholdCopy } from "@/lib/household-copy";
import { challengeWhen, weeknightTimeOptions, type HouseholdSetup } from "@/lib/basic-settings";
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

      {/* ponytail: the Mon–Fri limits sit here until the personalization editor (PR 2) takes them. */}
      <details className="mt-4 rounded-xl border border-border px-3" data-testid="weeknight-limits">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{t("weeknightQ")}</summary>
        <p className="text-sm text-muted-foreground">{t("weeknightHint")}{setup.style === "chef" && setup.challenge.when === "day" ? ` ${t("weeknightChefHint")}` : ""}</p>
        <div className="space-y-3 py-3">{mealSlots.map(meal => (
          <div key={meal} role="radiogroup" aria-label={app(`meals.${meal.toLowerCase()}`)} data-testid={`weeknight-${meal}`}>
            <p className="mb-1.5 text-sm font-medium">{app(`meals.${meal.toLowerCase()}`)}</p>
            <div className="flex flex-wrap gap-2">
              {[null, ...weeknightTimeOptions].map(n => <Radio key={n ?? "none"} on={setup.weeknightMax[meal] === n}
                onClick={() => onChange({ weeknightMax: { ...setup.weeknightMax, [meal]: n } })} testid={`weeknight-${meal}-${n ?? "none"}`}>{n === null ? t("noLimit") : t("minutes", { n })}</Radio>)}
            </div>
          </div>
        ))}</div>
      </details>
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
