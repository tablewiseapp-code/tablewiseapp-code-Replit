import { statedDuration, type StepAnalysis, type StepDuration } from "@shared/step-timing";

/** Drop a leading "1." / "2)" the source text already carries, so numbering is shown once. */
export const cleanStep = (step: string) => step.replace(/^\s*(?:step\s+)?\d{1,3}\s*[.):]\s+/i, "").trim() || step.trim();

/** Saved analysis wins; otherwise only an explicit duration stated in the text. Never invented. */
export function stepDuration(step: string, saved?: StepAnalysis["steps"][number]): StepDuration | null {
  if (saved) return saved;
  const stated = statedDuration(step);
  return stated ? { ...stated, text: step, provenance: "source" } : null;
}
