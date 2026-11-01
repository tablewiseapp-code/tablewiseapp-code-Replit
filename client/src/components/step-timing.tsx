import { useI18n } from "@/lib/i18n";
import { analysisMatches, stepAnalysisSchema, type StepDuration, type TimingContext, type StepAnalysis } from "@shared/step-timing";

export function currentAnalysis(recipe: TimingContext, value?: StepAnalysis | null): StepAnalysis | null {
  const parsed = stepAnalysisSchema.safeParse(value);
  return parsed.success && analysisMatches(recipe, parsed.data) ? parsed.data : null;
}

export function StepTiming({ duration }: { duration?: StepDuration }) {
  const { t } = useI18n();
  return <span className="inline-block rounded-full bg-foreground/5 px-3 py-1 text-xs text-muted-foreground" data-testid="step-duration">
    {duration ? `${duration.min}${duration.max !== duration.min ? `–${duration.max}` : ""} ${t(`timing.${duration.unit}`)} · ${t(`timing.${duration.provenance}`)}` : t("timing.unknown")}
  </span>;
}

export function AnalysisWarnings({ analysis }: { analysis: StepAnalysis }) {
  const { t } = useI18n();
  return <div className="space-y-2 text-sm" data-testid="analysis-warnings">
    <p className="text-muted-foreground">{t("timing.disclaimer")}</p>
    {analysis.warnings.length > 0 && <><p className="font-medium">{t("timing.warnings")}</p>
      <ul className="list-disc ps-5">{analysis.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></>}
  </div>;
}
