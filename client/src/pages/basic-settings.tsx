import { useState, type ReactNode } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useI18n } from "@/lib/i18n";
import { useSettingsCopy } from "@/lib/settings-copy";
import { allergens, cuisines, dietPatterns, ingredientPrefIds } from "@shared/food-rules";
import { selectableDevices } from "@/lib/device-requirements";
import { mealSlots, type MealSlot } from "@/lib/meal-plan";
import {
  cookingPrefKeys, emptyMember, householdServings, leftoverOptions, mealRecipeTypes, mealTimeLimits, noveltyOptions, portionSizes, servingLimits,
  useBasicSettings, varietyOptions, type BasicSettings, type IngredientChoice, type MealRule, type Member,
} from "@/lib/basic-settings";

const chip = (on: boolean) => `inline-flex items-center gap-1.5 px-3 py-2 min-h-11 text-xs rounded-full border hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42624e] ${on ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`;
const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter(x => x !== value) : [...list, value]);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function Chips<T extends string>({ label, hint, options, selected, onToggle, labelOf, testid }:
  { label: string; hint?: string; options: readonly T[]; selected: readonly T[]; onToggle: (v: T) => void; labelOf: (v: T) => string; testid: string }) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(v => {
          const on = selected.includes(v);
          return (
            <button key={v} type="button" aria-pressed={on} onClick={() => onToggle(v)} className={chip(on)} data-testid={`${testid}-${slug(v)}`}>
              {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{labelOf(v)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Choice<T extends string>({ label, options, value, onChange, labelOf, testid }:
  { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; labelOf: (v: T) => string; testid: string }) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div role="radiogroup" aria-label={label} className="mt-2 flex flex-wrap gap-2">
        {options.map(v => (
          <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)} className={chip(v === value)} data-testid={`${testid}-${slug(v)}`}>
            {labelOf(v)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ label, hint, on, onChange, testid }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; testid: string }) {
  return (
    <div className="mt-3">
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`${chip(on)} text-start`} data-testid={testid}>
        <span aria-hidden="true" className={`inline-flex h-4 w-4 items-center justify-center rounded border ${on ? "border-[#42624e] bg-[#42624e] text-white" : "border-muted-foreground/40"}`}>{on && <Check className="h-3 w-3" />}</span>
        {label}
      </button>
      {hint && <p className="mt-1 ms-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange, display, testid, fewer, more }:
  { label: string; value: number; min: number; max: number; onChange: (v: number) => void; display: string; testid: string; fewer: string; more: string }) {
  const btn = "flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42624e]";
  return (
    <div className="mt-4">
      <span className="text-sm font-medium text-foreground" id={`${testid}-label`}>{label}</span>
      <div role="group" aria-labelledby={`${testid}-label`} className="mt-2 inline-flex items-center rounded-full border border-[#d9dfd4]">
        <button type="button" aria-label={fewer} disabled={value <= min} onClick={() => onChange(value - 1)} className={btn} data-testid={`${testid}-decrease`}><Minus className="h-4 w-4" aria-hidden="true" /></button>
        <span className="min-w-20 text-center text-sm font-medium" aria-live="polite" data-testid={`${testid}-value`}>{display}</span>
        <button type="button" aria-label={more} disabled={value >= max} onClick={() => onChange(value + 1)} className={btn} data-testid={`${testid}-increase`}><Plus className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>
  );
}

function Terms({ label, hint, placeholder, values, onChange, testid }: { label: string; hint?: string; placeholder: string; values: string[]; onChange: (v: string[]) => void; testid: string }) {
  const t = useSettingsCopy();
  const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim().toLowerCase(); if (v && !values.includes(v)) onChange([...values, v]); setDraft(""); };
  return (
    <div className="mt-4">
      <label className="text-sm font-medium text-foreground" htmlFor={`${testid}-input`}>{label}</label>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map(v => (
          <span key={v} className="inline-flex min-h-9 items-center gap-1 rounded-full border hairline bg-foreground/5 ps-3 pe-1 text-xs" data-testid={`${testid}-item`}>
            {v}
            <button type="button" aria-label={t("removeItem", { item: v })} onClick={() => onChange(values.filter(x => x !== v))}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42624e]"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </span>
        ))}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); add(); }}>
        <input id={`${testid}-input`} value={draft} onChange={e => setDraft(e.target.value)} maxLength={40} placeholder={placeholder}
          className="min-h-11 w-full max-w-xs rounded-full border hairline bg-white px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42624e]" data-testid={`${testid}-input`} />
        <button type="submit" className={chip(false)} data-testid={`${testid}-add`}>{t("add")}</button>
      </form>
    </div>
  );
}

/** Structured ingredient chips plus free-text extras (stored as "custom:<text>"). */
function Ingredients({ label, hint, values, onChange, testid }: { label: string; hint: string; values: IngredientChoice[]; onChange: (v: IngredientChoice[]) => void; testid: string }) {
  const t = useSettingsCopy();
  const custom = values.filter(v => v.startsWith("custom:")).map(v => v.slice(7));
  const known = values.filter(v => !v.startsWith("custom:"));
  return (
    <div>
      <Chips label={label} hint={hint} options={ingredientPrefIds} selected={known as typeof ingredientPrefIds} labelOf={v => t(`ing_${v}`)}
        onToggle={v => onChange([...toggle(known, v), ...custom.map(c => `custom:${c}`)])} testid={testid} />
      <Terms label="" placeholder={t("customIngredientPlaceholder")} values={custom} onChange={list => onChange([...known, ...list.map(c => `custom:${c}`)])} testid={`${testid}-custom`} />
    </div>
  );
}

function Badge({ hard }: { hard: boolean }) {
  const t = useSettingsCopy();
  return <span className={`ms-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${hard ? "bg-[#42624e]/10 text-[#42624e]" : "bg-foreground/5 text-muted-foreground"}`}>{t(hard ? "always" : "preference")}</span>;
}
const Note = ({ children, testid }: { children: ReactNode; testid?: string }) => <p className="mt-4 rounded-lg bg-foreground/5 p-3 text-xs text-muted-foreground" data-testid={testid}>{children}</p>;

/** "Breakfast · Meatless · 15 min" */
const mealRuleSummary = (t: ReturnType<typeof useSettingsCopy>, meal: MealSlot, rule: MealRule) =>
  [t(`meal_${meal}`), t(`mealType_${rule.type}`), rule.max === null ? t("mealTimeDefaultShort") : rule.max === "none" ? t("noLimit") : t("minutes", { n: rule.max })].join(" · ");

function MealRuleCard({ meal, rule, onChange }: { meal: MealSlot; rule: MealRule; onChange: (patch: Partial<MealRule>) => void }) {
  const t = useSettingsCopy();
  const id = `meal-rule-${meal.toLowerCase()}`;
  return (
    <details className="rounded-xl border hairline bg-white px-3" data-testid={id}>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42624e]" data-testid={`${id}-summary`}>
        {mealRuleSummary(t, meal, rule)}
      </summary>
      <div className="pb-3">
        <Choice label={t("recipeType")} options={mealRecipeTypes} value={rule.type} labelOf={v => t(`mealType_${v}`)} onChange={type => onChange({ type })} testid={`${id}-type`} />
        <div className="mt-4">
          <label className="text-sm font-medium text-foreground" htmlFor={`${id}-time`}>{t("mealMaxTime")}</label>
          <select id={`${id}-time`} value={rule.max ?? ""} data-testid={`${id}-time`}
            onChange={e => onChange({ max: e.target.value === "" ? null : e.target.value === "none" ? "none" : Number(e.target.value) as MealRule["max"] })}
            className="mt-2 block min-h-11 rounded-full border hairline bg-white px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42624e]">
            <option value="">{t("mealTimeDefault")}</option>
            {mealTimeLimits.map(m => <option key={m} value={m}>{t("minutes", { n: m })}</option>)}
            <option value="none">{t("noLimit")}</option>
          </select>
        </div>
      </div>
    </details>
  );
}

function MemberCard({ member, index, onChange, onRemove }: { member: Member; index: number; onChange: (m: Member) => void; onRemove: () => void }) {
  const t = useSettingsCopy();
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Member>) => onChange({ ...member, ...patch });
  const restrictions = member.diets.length + member.allergies.length + member.customAllergies.length;
  return (
    <li className="rounded-xl border hairline bg-white p-3" data-testid={`member-${index}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`member-name-${member.id}`}>{t("name")}</label>
        <input id={`member-name-${member.id}`} value={member.name} maxLength={40} onChange={e => set({ name: e.target.value })}
          className="min-h-11 min-w-0 flex-1 rounded-full border hairline px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42624e]" data-testid={`member-${index}-name`} />
        <div role="radiogroup" aria-label={t("type")} className="flex gap-1">
          {(["adult", "child"] as const).map(kind => (
            <button key={kind} type="button" role="radio" aria-checked={member.kind === kind} onClick={() => set({ kind })} className={chip(member.kind === kind)} data-testid={`member-${index}-${kind}`}>{t(kind)}</button>
          ))}
        </div>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={chip(open)} aria-label={t("details", { name: member.name })} data-testid={`member-${index}-details`}>
          {t("detailsShort")}{restrictions ? ` · ${restrictions}` : ""}
        </button>
        <button type="button" onClick={onRemove} aria-label={t("removeMember", { name: member.name })} className={chip(false)} data-testid={`member-${index}-remove`}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />{t("remove")}
        </button>
      </div>
      {open && (
        <div className="mt-1 border-t hairline pt-1">
          <Chips label={t("diets")} options={dietPatterns} selected={member.diets} labelOf={d => t(`diet_${d}`)} onToggle={d => set({ diets: toggle(member.diets, d) })} testid={`member-${index}-diet`} />
          <Chips label={t("allergies")} options={allergens} selected={member.allergies} labelOf={a => t(`allergen_${a}`)} onToggle={a => set({ allergies: toggle(member.allergies, a) })} testid={`member-${index}-allergy`} />
          <Terms label={t("customAllergies")} hint={t("customAllergyHint")} placeholder={t("customAllergyPlaceholder")} values={member.customAllergies} onChange={customAllergies => set({ customAllergies })} testid={`member-${index}-custom-allergy`} />
          <Ingredients label={t("dislikes")} hint={t("dislikesHint")} values={member.dislikes} onChange={dislikes => set({ dislikes })} testid={`member-${index}-dislike`} />
          <Ingredients label={t("favorites")} hint={t("favoritesHint")} values={member.favorites} onChange={favorites => set({ favorites })} testid={`member-${index}-favorite`} />
          <Choice label={t("memberPortion")} options={["household", ...portionSizes] as const} value={member.portion ?? "household"}
            labelOf={p => (p === "household" ? t("sameAsHousehold") : t(`portion_${p}`))} onChange={p => set({ portion: p === "household" ? null : p })} testid={`member-${index}-portion`} />
        </div>
      )}
    </li>
  );
}

export default function BasicSettingsPage() {
  const { dir, t: app } = useI18n();
  const t = useSettingsCopy();
  const { settings: s, save, status, retry } = useBasicSettings();
  const edit = <K extends keyof BasicSettings>(section: K, patch: Partial<BasicSettings[K]>) =>
    save(current => ({ ...current, [section]: { ...(current[section] as object), ...patch } }));
  const members = s.household.members;
  const editMember = (id: string, next: Member) => save(c => ({ ...c, household: { ...c.household, members: c.household.members.map(m => (m.id === id ? next : m)) } }));
  const addMember = (kind: Member["kind"]) => save(c => {
    const n = c.household.members.filter(m => m.kind === kind).length + 1;
    return { ...c, household: { ...c.household, members: [...c.household.members, emptyMember(kind, t(kind === "adult" ? "adultN" : "childN", { n }))] } };
  });
  const adults = members.filter(m => m.kind === "adult").length;
  const auto = householdServings({ ...s, household: { ...s.household, servingsMode: "auto" } });
  const devices = s.kitchen.devices;
  const minuteOptions = [15, 20, 30, 45, 60, 90, 120];
  const minutesSelect = (label: string, value: number | null, onChange: (v: number | null) => void, testid: string) => (
    <div className="mt-4">
      <label className="text-sm font-medium text-foreground" htmlFor={testid}>{label}</label>
      <select id={testid} value={value ?? ""} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)} data-testid={testid}
        className="mt-2 block min-h-11 rounded-full border hairline bg-white px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42624e]">
        <option value="">{t("noLimit")}</option>
        {minuteOptions.map(m => <option key={m} value={m}>{t("minutes", { n: m })}</option>)}
      </select>
    </div>
  );
  const section = (id: string, title: string, summary: string, children: ReactNode) => (
    <AccordionItem value={id} className="rounded-xl border hairline bg-white px-4 mb-3" data-testid={`section-${id}`}>
      <AccordionTrigger className="min-h-11 text-start hover:no-underline" data-testid={`section-${id}-toggle`}>
        <span className="flex flex-col items-start gap-0.5"><span className="text-base font-medium">{title}</span><span className="text-xs font-normal text-muted-foreground">{summary}</span></span>
      </AccordionTrigger>
      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  );
  const statusText = status === "saving" ? t("saving") : status === "saved" ? t("saved") : status === "error" ? t("saveError") : "";

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <PageContainer size="md" className="py-8 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium text-foreground sm:text-2xl" data-testid="text-page-title">{t("title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>
          </div>
          <div className={status === "idle" ? "sr-only" : "flex min-h-11 items-center gap-2 text-xs"} role="status" aria-live="polite" data-testid="settings-status" data-status={status}>
            <span className={status === "error" ? "text-red-700" : "text-muted-foreground"}>{statusText}</span>
            {status === "error" && <button type="button" onClick={retry} className={chip(false)} data-testid="settings-retry">{t("retry")}</button>}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("rulesExplain")}</p>

        <Accordion type="multiple" defaultValue={["household"]} className="mt-5">
          {section("household", t("household"), members.length ? t("householdSummary", { adults, children: members.length - adults }) : t("householdSummaryNone"), <>
            {members.length === 0 && <Note testid="members-empty">{t("noMembers")}</Note>}
            <ul className="mt-3 space-y-2">
              {members.map((m, i) => <MemberCard key={m.id} member={m} index={i} onChange={next => editMember(m.id, next)}
                onRemove={() => save(c => ({ ...c, household: { ...c.household, members: c.household.members.filter(x => x.id !== m.id) } }))} />)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => addMember("adult")} className={chip(false)} data-testid="add-adult"><Plus className="h-3.5 w-3.5" aria-hidden="true" />{t("addAdult")}</button>
              <button type="button" onClick={() => addMember("child")} className={chip(false)} data-testid="add-child"><Plus className="h-3.5 w-3.5" aria-hidden="true" />{t("addChild")}</button>
            </div>
            <Choice label={t("portion")} options={portionSizes} value={s.household.portion} labelOf={p => t(`portion_${p}`)} onChange={portion => edit("household", { portion })} testid="household-portion" />
            <Choice label={t("servings")} options={["auto", "fixed"] as const} value={s.household.servingsMode} labelOf={m => t(m === "auto" ? "servingsAuto" : "servingsFixed")}
              onChange={servingsMode => edit("household", { servingsMode })} testid="servings-mode" />
            {s.household.servingsMode === "fixed"
              ? <Stepper label={t("servings")} value={s.household.fixedServings} min={servingLimits.min} max={servingLimits.max} display={String(s.household.fixedServings)}
                  onChange={fixedServings => edit("household", { fixedServings })} testid="servings" fewer={t("fewer")} more={t("more")} />
              : <p className="mt-2 text-sm" data-testid="servings-auto">{auto ? t("servingsAutoValue", { count: auto }) : t("servingsAutoNone")}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{t("servingsHint")}</p>
          </>)}

          {section("dietary", t("dietary"), [...s.dietary.diets.map(d => t(`diet_${d}`)), ...s.dietary.allergies.map(a => t(`allergen_${a}`))].join(" · ") || t("noRestrictions"), <>
            <h3 className="mt-2 text-sm font-medium">{t("forEveryone")}<Badge hard /></h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("forEveryoneHint")}</p>
            <Chips label={t("diets")} options={dietPatterns} selected={s.dietary.diets} labelOf={d => t(`diet_${d}`)} onToggle={d => edit("dietary", { diets: toggle(s.dietary.diets, d) })} testid="diet" />
            <Chips label={t("allergies")} hint={t("allergiesHint")} options={allergens} selected={s.dietary.allergies} labelOf={a => t(`allergen_${a}`)}
              onToggle={a => edit("dietary", { allergies: toggle(s.dietary.allergies, a) })} testid="allergy" />
            <Terms label={t("customAllergies")} hint={t("customAllergyHint")} placeholder={t("customAllergyPlaceholder")} values={s.dietary.customAllergies}
              onChange={customAllergies => edit("dietary", { customAllergies })} testid="custom-allergy" />
            <h3 className="mt-6 text-sm font-medium">{t("preference")}<Badge hard={false} /></h3>
            <Ingredients label={t("dislikes")} hint={t("dislikesHint")} values={s.dietary.dislikes} onChange={dislikes => edit("dietary", { dislikes })} testid="dislike" />
            <Ingredients label={t("favorites")} hint={t("favoritesHint")} values={s.dietary.favorites} onChange={favorites => edit("dietary", { favorites })} testid="favorite" />
            <Chips label={t("preferredCuisines")} options={cuisines} selected={s.dietary.preferredCuisines} labelOf={c => t(`cuisine_${c}`)}
              onToggle={c => edit("dietary", { preferredCuisines: toggle(s.dietary.preferredCuisines, c), avoidCuisines: s.dietary.avoidCuisines.filter(x => x !== c) })} testid="cuisine-like" />
            <Chips label={t("avoidCuisines")} options={cuisines} selected={s.dietary.avoidCuisines} labelOf={c => t(`cuisine_${c}`)}
              onToggle={c => edit("dietary", { avoidCuisines: toggle(s.dietary.avoidCuisines, c), preferredCuisines: s.dietary.preferredCuisines.filter(x => x !== c) })} testid="cuisine-avoid" />
          </>)}

          {section("kitchen", t("kitchen"), devices === null ? t("devicesNotSet") : devices.length ? devices.map(d => t(`device_${d}`)).join(" · ") : t("devicesNone"), <>
            <Chips label={t("devices")} hint={t("devicesHint")} options={selectableDevices} selected={devices ?? selectableDevices} labelOf={d => t(`device_${d}`)}
              onToggle={d => edit("kitchen", { devices: toggle(devices ?? [...selectableDevices], d) })} testid="setting-device" />
            {devices === null && <Note testid="devices-not-set">{t("devicesNotSet")}</Note>}
            {devices?.length === 0 && <p className="mt-3 text-xs text-amber-700" data-testid="text-no-devices">{t("devicesNone")}</p>}
            <p className="mt-2 text-xs"><Badge hard /></p>
          </>)}

          {section("cooking", t("cooking"), `${t("onWeekdays")}: ${s.cooking.weekdayMax ? t("minutes", { n: s.cooking.weekdayMax }) : t("noLimit")} · ${t("onWeekends")}: ${s.cooking.weekendMax ? t("minutes", { n: s.cooking.weekendMax }) : t("noLimit")}`, <>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["weekday", "weekend"] as const).map(day => (
                <section key={day} aria-labelledby={`cooking-${day}`} className="rounded-lg border hairline p-3" data-testid={`cooking-${day}`}>
                  <h3 id={`cooking-${day}`} className="text-sm font-medium">{t(day === "weekday" ? "onWeekdays" : "onWeekends")}</h3>
                  {minutesSelect(t("cookingTime"), s.cooking[`${day}Max`], value => edit("cooking", { [`${day}Max`]: value }), `${day}-max`)}
                  {cookingPrefKeys.map(key => (
                    <Toggle key={key} label={t(key)} on={s.cooking[day][key]} testid={`${day}-pref-${slug(key)}`}
                      onChange={on => save(c => ({ ...c, cooking: { ...c.cooking, [day]: { ...c.cooking[day], [key]: on } } }))} />
                  ))}
                </section>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("dayTypeHint")}</p>
            <Toggle label={t("hardMax")} hint={t("hardMaxHint")} on={s.cooking.hardMax} onChange={hardMax => edit("cooking", { hardMax })} testid="hard-max" />
            <Note>{t("difficultyDeferred")}</Note>
          </>)}

          {section("planning", t("planning"), `${s.planning.meals.map(m => app(`meals.${m.toLowerCase()}`)).join(" · ")} · ${t("days", { n: s.planning.cookingDays })}`, <>
            <p className="mt-2 text-xs text-muted-foreground">{t("planningHint")}</p>
            <Chips label={t("mealsToPlan")} options={mealSlots} selected={s.planning.meals} labelOf={m => app(`meals.${m.toLowerCase()}`)} onToggle={m => edit("planning", { meals: toggle(s.planning.meals, m) })} testid="plan-meal" />
            <Note>{t("snacksDeferred")}</Note>
            <h3 className="mt-6 text-sm font-medium">{t("mealRulesTitle")}<Badge hard /></h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("mealRulesHint")}</p>
            <div className="mt-3 space-y-2" data-testid="meal-rules">
              {mealSlots.map(meal => <MealRuleCard key={meal} meal={meal} rule={s.planning.mealRules[meal]}
                onChange={patch => save(c => ({ ...c, planning: { ...c.planning, mealRules: { ...c.planning.mealRules, [meal]: { ...c.planning.mealRules[meal], ...patch } } } }))} />)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("mealTypeHint")} {t("mealTimeHint")}</p>
            <Stepper label={t("cookingDays")} value={s.planning.cookingDays} min={1} max={7} display={t("days", { n: s.planning.cookingDays })}
              onChange={cookingDays => edit("planning", { cookingDays })} testid="cooking-days" fewer="−" more="+" />
            <Choice label={t("leftovers")} options={leftoverOptions} value={s.planning.leftovers} labelOf={o => t(`leftovers_${o}`)} onChange={leftovers => edit("planning", { leftovers })} testid="leftovers" />
            <p className="mt-1 text-xs text-muted-foreground">{t("leftoversHint")} {t("servingsFromHousehold")}</p>
            <Toggle label={t("repeatFavorites")} on={s.planning.repeatFavorites} onChange={repeatFavorites => edit("planning", { repeatFavorites })} testid="repeat-favorites" />
            <Choice label={t("variety")} options={varietyOptions} value={s.planning.variety} labelOf={o => t(`variety_${o}`)} onChange={variety => edit("planning", { variety })} testid="variety" />
            <Choice label={t("novelty")} options={noveltyOptions} value={s.planning.novelty} labelOf={o => t(`novelty_${o}`)} onChange={novelty => edit("planning", { novelty })} testid="novelty" />
          </>)}

          {section("shopping", t("shopping"), s.shopping.pantry.length ? s.shopping.pantry.join(", ") : t("preference"), <>
            <Toggle label={t("budgetFriendly")} on={s.shopping.budgetFriendly} onChange={budgetFriendly => edit("shopping", { budgetFriendly })} testid="pref-budget" />
            <Toggle label={t("reuseIngredients")} on={s.shopping.reuseIngredients} onChange={reuseIngredients => edit("shopping", { reuseIngredients })} testid="pref-reuse" />
            <Terms label={t("pantry")} hint={t("pantryHint")} placeholder={t("pantryPlaceholder")} values={s.shopping.pantry} onChange={pantry => edit("shopping", { pantry })} testid="pantry" />
            <Note>{t("shoppingDeferred")}</Note>
          </>)}
        </Accordion>
      </PageContainer>
    </div>
  );
}
