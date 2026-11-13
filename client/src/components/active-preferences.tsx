import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { activePreferenceChips, breakdownKeys, type MatchCounts, type PreferenceChip } from "@/lib/active-preferences";
import { settingsText } from "@/lib/settings-copy";
import type { BasicSettings } from "@/lib/basic-settings";

const COLLAPSED = 6;
const groupStyle: Record<PreferenceChip["group"], string> = {
  hard: "border-primary/30 bg-primary/10 text-foreground",
  planning: "border-transparent bg-foreground/5 text-foreground",
  soft: "border-border bg-white text-muted-foreground",
};
const groupKey = { hard: "groupHard", planning: "groupPlanning", soft: "groupSoft" } as const;
const link = "inline-flex min-h-11 items-center rounded-full px-2 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

/** Weekly Meals: live match counts from the rendered dataset, the saved settings shaping them, and a link to edit them. */
export function ActivePreferences({ settings, counts, noDevices, onEdit }:
  { settings: BasicSettings; counts: MatchCounts | null; noDevices: boolean; onEdit: () => void }) {
  const { lang, t: app } = useI18n();
  const t = (key: string, values?: Record<string, string | number>) => settingsText(lang, key, values);
  const [expanded, setExpanded] = useState(false);
  const [why, setWhy] = useState(false);
  const chips = activePreferenceChips(settings, lang, meal => app(`meals.${meal.toLowerCase()}`));
  const visible = expanded ? chips : chips.slice(0, COLLAPSED);
  const groups = (["hard", "planning", "soft"] as const).map(group => ({ group, items: visible.filter(c => c.group === group) })).filter(g => g.items.length);
  const reasons = counts ? breakdownKeys.filter(k => counts.breakdown[k] > 0) : [];
  return (
    <section aria-labelledby="active-preferences-title" className="card mb-4 p-3 sm:p-4" data-testid="active-preferences">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="active-preferences-title" className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />{t("matchesTitle")}
        </h2>
        <button type="button" onClick={onEdit} data-testid="button-edit-preferences"
          className="btn btn-secondary">
          {t(chips.length ? "editPrefs" : "setUp")}
        </button>
      </div>

      {counts && (
        <div aria-live="polite">
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="match-counts">
            <li className="font-medium text-foreground" data-testid="count-matching" data-count={counts.matching}>{t("statMatching", { count: counts.matching })}</li>
            <li className="text-muted-foreground" data-testid="count-settings" data-count={counts.bySettings}>{t("statSettings", { count: counts.bySettings })}</li>
            {counts.byFilters > 0 && <li className="text-muted-foreground" data-testid="count-filters" data-count={counts.byFilters}>{t("statFilters", { count: counts.byFilters })}</li>}
          </ul>
          {(reasons.length > 0 || counts.byFilters > 0) && (
            <>
              <button type="button" aria-expanded={why} aria-controls="match-breakdown" onClick={() => setWhy(!why)} className={link} data-testid="button-why-excluded">
                {why ? t("hideBreakdown") : t("whyExcluded")}
              </button>
              {why && (
                <div id="match-breakdown" className="rounded-lg bg-foreground/5 p-3 text-xs" data-testid="match-breakdown">
                  <ul className="space-y-1">
                    {reasons.map(k => <li key={k} className="flex justify-between gap-4" data-testid={`breakdown-${k}`} data-count={counts.breakdown[k]}><span>{t(`bd_${k}`)}</span><span className="font-medium">{counts.breakdown[k]}</span></li>)}
                    {counts.byFilters > 0 && <li className="flex justify-between gap-4" data-testid="breakdown-filters" data-count={counts.byFilters}><span>{t("bd_filters")}</span><span className="font-medium">{counts.byFilters}</span></li>}
                  </ul>
                  {reasons.length > 1 && <p className="mt-2 text-muted-foreground">{t("bdNote")}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {chips.length === 0
        ? <p className="mt-1 text-xs text-muted-foreground" data-testid="preferences-none">{t("noneSet")}</p>
        : (
          <div className="mt-2 space-y-1.5" id="active-preferences-chips">
            <p className="text-xs text-muted-foreground">{t("activeSubtitle")}</p>
            {groups.map(({ group, items }) => (
              <div key={group} className="flex flex-wrap items-center gap-1.5" data-testid={`preferences-${group}`}>
                <span className="me-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t(groupKey[group])}</span>
                {items.map(chip => (
                  <span key={chip.id} className={`rounded-full border px-2.5 py-1 text-xs ${groupStyle[group]}`} data-testid={`preference-chip-${chip.id}`}>{chip.text}</span>
                ))}
              </div>
            ))}
            {chips.length > COLLAPSED && (
              <button type="button" aria-expanded={expanded} aria-controls="active-preferences-chips" onClick={() => setExpanded(!expanded)} data-testid="button-preferences-toggle" className={link}>
                {expanded ? t("showLess") : t("showAll", { count: chips.length })}
              </button>
            )}
          </div>
        )}
      {noDevices && <p className="mt-2 text-xs text-muted-foreground" role="note" data-testid="settings-banner">{t("onlyNoCook")}</p>}
    </section>
  );
}
