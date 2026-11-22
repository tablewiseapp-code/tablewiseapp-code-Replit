import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { PageContainer } from "@/components/layout/page-container";
import { Chip, CookNowEmpty, KidFriendlySwitch, RequirementsEditor, toggle, WeekdayLimits } from "@/components/household-controls";
import { useI18n } from "@/lib/i18n";
import { preferenceSummary, useHouseholdCopy } from "@/lib/household-copy";
import { settingsText } from "@/lib/settings-copy";
import { loadSettings, updateSettings, type BasicSettings } from "@/lib/basic-settings";
import { useCookNow, readCookNow } from "@/hooks/use-cook-now";
import { CookNowProteins } from "@/components/on-hand-picker";
import { cuisineChoices } from "@shared/food-rules";

/** Where Save and Cancel go: a path inside the app, else screen 5 of Your household. */
const origin = (from: string | null) => (from && from.startsWith("/") && !from.startsWith("//") ? from : "/household?step=5");

/** Personalize my recipes (/personalize?from=…, 2026-11-21): family food requirements (hard), favorite cuisines (ranking) and
 * optional cooking preferences, on a draft. Save writes only these fields onto the latest settings and returns to `from`;
 * from Cook now it picks a fresh suggestion. Cancel returns with nothing changed. Temporary filters never come here. */
export default function Personalize() {
  const { lang, dir, t: app } = useI18n();
  const t = useHouseholdCopy();
  const s = (key: string) => settingsText(lang, key);
  const [, setLocation] = useLocation();
  const from = origin(new URLSearchParams(useSearch()).get("from"));
  const [draft, setDraft] = useState(loadSettings);
  const [failed, setFailed] = useState(false);
  const cookNow = useCookNow();
  const update = (change: (current: BasicSettings) => BasicSettings) => setDraft(change);
  const fromCookNow = from.startsWith("/recipe/") && new URLSearchParams(from.split("?")[1] ?? "").has("suggest");

  const save = () => {
    try {
      updateSettings(x => ({ ...x,
        dietary: { ...x.dietary, diets: draft.dietary.diets, allergies: draft.dietary.allergies, customAllergies: draft.dietary.customAllergies, preferredCuisines: draft.dietary.preferredCuisines },
        setup: { ...x.setup, noRestrictions: draft.setup.noRestrictions, weeknightMax: draft.setup.weeknightMax },
        household: { ...x.household, kidFriendly: draft.household.kidFriendly } }));
    } catch { setFailed(true); return; }
    // Suggestions refresh: Cook now picks again under the new rules; the Week asks "Your preferences have been changed".
    // Same proteins as the suggestion it came from; asked again only when none fits the new rules.
    if (!fromCookNow) { setLocation(from); return; }
    const proteins = readCookNow(from.split("?")[1] ?? "").proteins;
    if (cookNow.run(proteins).noMatch && proteins.length) cookNow.start();
  };

  const section = (id: string, title: string, children: React.ReactNode) => (
    <section className="border-b hairline py-5" aria-labelledby={`${id}-title`} data-testid={`personalize-${id}`}>
      <h2 id={`${id}-title`} className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );

  return (
    <div className="pb-32 sm:pb-10" dir={dir}>
      <PageContainer size="md" className="max-w-xl py-4 sm:py-10">
        <header className="page-header mb-2">
          <h1 className="page-title" data-testid="text-page-title">{t("personalize")}</h1>
          <p className="page-subtitle">{t("personalizeIntro")}</p>
        </header>
        <p className="rounded-lg bg-accent p-3 text-sm" aria-live="polite" data-testid="preference-summary">
          {preferenceSummary(draft, lang, m => app(`meals.${m.toLowerCase()}`))}</p>

        {section("requirements", t("requirementsQ"), <RequirementsEditor settings={draft} update={update} />)}
        {section("cuisines", t("favoriteCuisines"), <>
          <p className="mb-3 text-sm text-muted-foreground">{t("favoriteCuisinesHint")}</p>
          <div className="flex flex-wrap gap-2">{cuisineChoices.map(c => (
            <Chip key={c} on={draft.dietary.preferredCuisines.includes(c)} testid={`cuisine-${c}`}
              onClick={() => update(x => ({ ...x, dietary: { ...x.dietary, preferredCuisines: toggle(x.dietary.preferredCuisines, c),
                avoidCuisines: x.dietary.avoidCuisines.filter(a => a !== c) } }))}>{s(`cuisine_${c}`)}</Chip>
          ))}</div>
        </>)}
        {section("cooking", t("cookingPrefs"), <>
          <KidFriendlySwitch on={draft.household.kidFriendly} onToggle={() => update(x => ({ ...x, household: { ...x.household, kidFriendly: !x.household.kidFriendly } }))} />
          <h3 className="mt-4 text-sm font-semibold">{t("weeknightQ")}</h3>
          <WeekdayLimits setup={draft.setup} onChange={weeknightMax => update(x => ({ ...x, setup: { ...x.setup, weeknightMax } }))} />
          <p className="text-sm text-muted-foreground">{t("moreInSettings")}{" "}
            <Link href="/settings" className="font-medium text-primary underline underline-offset-4" data-testid="link-more-settings">{t("openSettings")}</Link></p>
        </>)}
        {cookNow.empty && <CookNowEmpty from={from} />}

        <div className="sticky bottom-[var(--app-bottom-nav)] z-10 -mx-4 flex flex-wrap gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          {failed && <p role="alert" className="w-full text-sm text-destructive" data-testid="personalize-error">{t("saveFailed")}</p>}
          <button type="button" onClick={save} disabled={fromCookNow && !cookNow.ready} className="btn btn-primary" data-testid="button-save-preferences">{t("save")}</button>
          <button type="button" onClick={() => setLocation(from)} className="btn btn-secondary" data-testid="button-cancel-preferences">{t("cancel")}</button>
        </div>
      </PageContainer>
      <CookNowProteins cookNow={cookNow} />
    </div>
  );
}
