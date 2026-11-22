import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { PageContainer } from "@/components/layout/page-container";
import { Chip, Counter, CookNowEmpty, KidFriendlySwitch, RequirementsEditor, toggle } from "@/components/household-controls";
import { useI18n } from "@/lib/i18n";
import { useHouseholdCopy, type HouseholdKey } from "@/lib/household-copy";
import { settingsText } from "@/lib/settings-copy";
import { personalizeURL, useCookNow } from "@/hooks/use-cook-now";
import { CookNowProteins } from "@/components/on-hand-picker";
import type { DeviceId } from "@/lib/device-requirements";
import { cookingStyles, emptyMember, hasRequirements, householdCounts, loadSettings, missingAnswers, pushSettings, setupSteps, updateSettings,
  type BasicSettings, type Member, type SetupStep } from "@/lib/basic-settings";
import { serveAmount } from "@shared/cooking-plan";

// Your household (/household): four questions, one at a time, then "What would you like to do?" (2026-11-21).
// Every answer is saved as it is chosen (Basic Settings, Postgres per owner), so Back and refresh keep it and setup.step
// resumes where the person left. ?ask=kitchen,…&then=… asks only those questions, then resumes the action that needed them.
const kitchenDevices: DeviceId[] = ["Stovetop", "Oven", "Microwave", "Air fryer"];
const MAX_PEOPLE = 12; // basic-settings.ts keeps at most 12 members
type Screen = SetupStep | "done";

/** A member the counters may remove: no food details of their own (a name alone is not one; product owner, 2026-11-21).
 * Diets, allergies, exclusions, likes, dislikes and portion are never deleted from here. */
const blank = (m: Member) => !m.diets.length && !m.allergies.length && !m.customAllergies.length && !m.dislikes.length && !m.favorites.length
  && m.portion === null;
/** The counters: household members by kind, or a fixed number (Basic Settings) as adults before any member exists. */
const countsOf = (s: BasicSettings) => s.household.members.length
  ? { adults: s.household.members.filter(m => m.kind === "adult").length, kids: s.household.members.filter(m => m.kind === "child").length }
  : s.household.servingsMode === "fixed" ? { adults: Math.min(MAX_PEOPLE, s.household.fixedServings), kids: 0 } : { adults: 0, kids: 0 };
const half = (n: number) => `${Math.floor(n)}${n % 1 ? "½" : ""}`.replace(/^0½$/, "½");

export default function Household() {
  const { lang, dir } = useI18n();
  const t = useHouseholdCopy();
  const s = (key: string) => settingsText(lang, key);
  const [, setLocation] = useLocation();
  const query = new URLSearchParams(useSearch());
  const asked = (query.get("ask") ?? "").split(",").filter((x): x is SetupStep => (setupSteps as readonly string[]).includes(x));
  const then = query.get("then");
  const screens: Screen[] = asked.length ? asked : [...setupSteps, "done"];
  const [settings, setSettings] = useState(loadSettings);
  const [index, setIndex] = useState(() => {
    if (asked.length) return 0;
    if (query.get("step") === "5") return 4;
    return settings.setup.status === "new" && settings.setup.step > 0 ? Math.min(4, settings.setup.step - 1) : 0;
  });
  const screen = screens[index];
  const [error, setError] = useState<"required" | "save" | null>(null);
  const [busy, setBusy] = useState(false);
  const cookNow = useCookNow();
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    // Focus follows the question (not on first load, where the page itself is announced).
    if (first.current) first.current = false; else heading.current?.focus();
    setError(null);
    // Progress is recorded once the person moves past the first question (only looking at it records nothing).
    if (!asked.length && settings.setup.status === "new" && settings.setup.step !== index + 1 && (index > 0 || settings.setup.step > 0)) save(x => ({ ...x, setup: { ...x.setup, step: index + 1 } }));
  }, [index]);

  /** Saved at once; a refused write keeps the screen as it was and says so. */
  const save = (change: (current: BasicSettings) => BasicSettings) => {
    try { setSettings(updateSettings(change)); setError(null); return true; } catch { setError("save"); return false; }
  };
  const go = (to: number) => setIndex(Math.max(0, Math.min(screens.length - 1, to)));

  // ---- Answers ----
  const counts = countsOf(settings);
  const people = counts.adults + counts.kids;
  const removable = (kind: Member["kind"]) => settings.household.members.some(m => m.kind === kind && blank(m));
  const changeCount = (kind: Member["kind"], delta: number) => save(x => {
    // The first change turns a fixed number into that many adults; then members are added, or a blank one removed.
    let members = x.household.members.length || x.household.servingsMode !== "fixed" ? x.household.members
      : Array.from({ length: countsOf(x).adults }, (_, i) => emptyMember("adult", settingsText(lang, "adultN", { n: i + 1 })));
    const same = members.filter(m => m.kind === kind).length;
    if (delta > 0) members = [...members, emptyMember(kind, settingsText(lang, kind === "adult" ? "adultN" : "childN", { n: same + 1 }))];
    else {
      const at = members.findLastIndex(m => m.kind === kind && blank(m));
      if (at < 0) return x;
      members = members.filter((_, i) => i !== at);
    }
    return { ...x, household: { ...x.household, members, servingsMode: "auto" } };
  });
  const answered = settings.setup.noRestrictions || hasRequirements(settings);
  const devices = settings.kitchen.devices;

  const finish = async () => {
    setBusy(true); setError(null);
    const done = missingAnswers(loadSettings()).length === 0;
    if (!save(x => ({ ...x, setup: { ...x.setup, status: done ? "done" : x.setup.status, step: asked.length ? x.setup.step : 5 } }))) { setBusy(false); return; }
    // Setup counts as finished only once the server has it; the answers stay on screen if it fails.
    if (!(await pushSettings())) { setError("save"); setBusy(false); return; }
    setBusy(false);
    if (!asked.length) return go(index + 1);
    if (then === "cook") cookNow.start();
    else setLocation(then && then.startsWith("/") && !then.startsWith("//") ? then : "/");
  };
  const next = () => {
    const ok = screen === "people" ? people > 0 : screen === "restrictions" ? answered : screen === "kitchen" ? devices !== null : true;
    if (!ok) { setError("required"); return; }
    if (screen === screens[screens.length - (asked.length ? 1 : 2)]) void finish(); else go(index + 1);
  };

  // ---- Screens ----
  const required = (key: HouseholdKey) => error === "required" && <p role="alert" className="mt-3 text-sm text-destructive" data-testid="step-required">{t(key)}</p>;
  const body: Record<Screen, () => ReactNode> = {
    style: () => <>
      <div role="radiogroup" aria-labelledby="step-title" className="grid gap-2">
        {cookingStyles.map(style => (
          <button key={style} type="button" role="radio" aria-checked={settings.setup.style === style} data-testid={`style-${style}`}
            onClick={() => save(x => ({ ...x, setup: { ...x.setup, style } })) && go(index + 1)}
            className={`min-h-11 rounded-lg border p-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${settings.setup.style === style ? "border-primary bg-accent" : "border-border bg-card"}`}>
            <span className="block text-sm font-semibold">{settings.setup.style === style ? "✓ " : ""}{t(`style_${style}`)}</span>
            <span className="block text-sm text-muted-foreground">{t(`style_${style}Hint`)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-text -ms-2 mt-2" data-testid="style-default"
        onClick={() => save(x => ({ ...x, setup: { ...x.setup, style: "everyday" } })) && go(index + 1)}>{t("useEveryday")}</button>
    </>,
    people: () => <>
      <Counter label={t("adults")} value={counts.adults} canLess={counts.adults > 0 && (removable("adult") || !settings.household.members.length)} canMore={people < MAX_PEOPLE}
        onChange={d => changeCount("adult", d)} testid="count-adults" />
      <Counter label={t("children")} value={counts.kids} canLess={counts.kids > 0 && removable("child")} canMore={people < MAX_PEOPLE}
        onChange={d => changeCount("child", d)} testid="count-kids" />
      {/* Kid-friendly meals: right below Children when there are any; the same saved preference as in Personalize my recipes. */}
      {counts.kids > 0 && (
        <KidFriendlySwitch on={settings.household.kidFriendly} onToggle={() => save(x => ({ ...x, household: { ...x.household, kidFriendly: !x.household.kidFriendly } }))} />
      )}
      <p className="mt-2 text-sm" aria-live="polite" data-testid="servings-preview">{t("peoplePreview", { servings: half(serveAmount({ date: "", adults: counts.adults, kids: counts.kids }, null)) })}</p>
      {settings.household.servingsMode === "fixed" && <p className="mt-1 text-sm text-muted-foreground" data-testid="fixed-note">{t("fixedNote", { n: settings.household.fixedServings })}</p>}
      {/* − never deletes a named person or their details: say who, and where to remove them. */}
      {(["adult", "child"] as const).some(kind => (kind === "adult" ? counts.adults : counts.kids) > 0 && !removable(kind)) && settings.household.members.some(m => !blank(m)) && (
        <p className="mt-3 rounded-lg bg-accent p-3 text-sm" data-testid="member-details">
          {t("removeInSettings", { names: settings.household.members.filter(m => !blank(m)).map(m => m.name).join(", ") })}{" "}
          <Link href="/settings?from=household" className="font-medium text-primary underline underline-offset-4" data-testid="link-members-settings">{t("openSettings")}</Link>
        </p>)}
      {required("peopleRequired")}
    </>,
    restrictions: () => <>
      <RequirementsEditor settings={settings} update={save} />
      {required("requirementsRequired")}
    </>,
    kitchen: () => <>
      <p className="text-sm text-muted-foreground">{t("kitchenHint")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {kitchenDevices.map(d => (
          // Unselecting the last appliance means "not answered", never "no appliances": that has its own choice.
          <Chip key={d} on={!!devices?.includes(d)} testid={`device-${d}`}
            onClick={() => save(x => { const list = toggle(x.kitchen.devices ?? [], d); return { ...x, kitchen: { devices: list.length ? list : null } }; })}>{s(`device_${d}`)}</Chip>
        ))}
        <Chip on={devices?.length === 0} onClick={() => save(x => ({ ...x, kitchen: { devices: [] } }))} testid="device-none">{t("noAppliances")}</Chip>
      </div>
      {devices?.length === 0 && <p className="mt-3 text-sm text-muted-foreground" data-testid="no-appliances-hint">{t("noAppliancesHint")}</p>}
      {required("kitchenRequired")}
    </>,
    done: () => <>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={cookNow.start} disabled={!cookNow.ready} className="card min-h-11 p-4 text-start disabled:opacity-60" data-testid="button-cook-now">
          <span className="block text-base font-semibold">{t("cookNow")}</span>
          <span className="block text-sm text-muted-foreground">{t("cookNowHint")}</span>
        </button>
        <button type="button" onClick={() => setLocation("/meals?plan")} className="card min-h-11 p-4 text-start" data-testid="button-plan-week">
          <span className="block text-base font-semibold">{t("planWeek")}</span>
          <span className="block text-sm text-muted-foreground">{t("planWeekHint")}</span>
        </button>
      </div>
      {cookNow.empty && <CookNowEmpty from="/household?step=5" />}
      <Link href={personalizeURL("/household?step=5")} className="btn btn-text -ms-2 mt-4" data-testid="link-personalize">{t("personalize")}</Link>
    </>,
  };
  const titles: Record<Screen, string> = { style: t("styleQ"), people: t("peopleQ"), restrictions: t("requirementsQ"), kitchen: t("kitchenQ"), done: t("doneQ") };
  const numbered = screens.filter(x => x !== "done");

  return (
    <div className="pb-28 sm:pb-10" dir={dir}>
      <PageContainer size="md" className="max-w-xl py-4 sm:py-10">
        <header className="page-header mb-4">
          <p className="text-sm text-muted-foreground" data-testid="step-of">
            {t("title")}{screen !== "done" && ` · ${t("stepOf", { n: index + 1, total: numbered.length })}`}
          </p>
          <h1 id="step-title" ref={heading} tabIndex={-1} className="page-title focus:outline-none" data-testid="text-page-title" data-step={screen}>{titles[screen]}</h1>
        </header>
        <section aria-labelledby="step-title" data-testid={`step-${screen}`}>{body[screen]()}</section>
        {/* Asked before Cook now: an empty result is shown here, where the person is. */}
        {screen !== "done" && cookNow.empty && <CookNowEmpty from="/" />}
        {error === "save" && <p role="alert" className="mt-4 text-sm text-destructive" data-testid="household-error">{t("saveFailed")}{" "}
          <button type="button" className="btn btn-text" onClick={() => void finish()} data-testid="button-retry-save">{t("retry")}</button></p>}
        {/* Style advances on choice; every other question confirms with Continue. */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {index > 0 && <button type="button" onClick={() => go(index - 1)} className="btn btn-secondary" data-testid="button-back">{t("back")}</button>}
          {screen !== "style" && screen !== "done" && <button type="button" onClick={next} disabled={busy || (then === "cook" && !cookNow.ready)} className="btn btn-primary" data-testid="button-next">{busy ? t("saving") : t("next")}</button>}
        </div>
      </PageContainer>
      <CookNowProteins cookNow={cookNow} />
    </div>
  );
}
