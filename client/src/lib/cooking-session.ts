// Cooking progress lives in sessionStorage (this tab's session, per recipe); the Zen preference in localStorage.
export const cookingStepKey = (recipeId: string) => `tablewise:cooking:v1:${recipeId}`;
export const cookingZenKey = "tablewise:cooking-zen:v1";

export const clampStep = (step: number, total: number) =>
  total <= 0 ? 0 : Math.min(Math.max(0, Math.trunc(Number(step)) || 0), total - 1);
export const nextStep = (step: number, total: number) => clampStep(step + 1, total);
export const previousStep = (step: number, total: number) => clampStep(step - 1, total);
export const isLastStep = (step: number, total: number) => step >= total - 1;
export const stepProgress = (step: number, total: number) =>
  ({ current: clampStep(step, total) + 1, total, percent: total <= 0 ? 0 : Math.round(((clampStep(step, total) + 1) / total) * 100) });

export function readCookingStep(recipeId: string, total: number): number {
  try { return clampStep(Number(sessionStorage.getItem(cookingStepKey(recipeId))), total); } catch { return 0; }
}
export function saveCookingStep(recipeId: string, step: number) {
  try { sessionStorage.setItem(cookingStepKey(recipeId), String(step)); } catch { /* progress is best-effort */ }
}
export function clearCookingStep(recipeId: string) {
  try { sessionStorage.removeItem(cookingStepKey(recipeId)); } catch { /* nothing to clear */ }
}
export function hasCookingProgress(recipeId: string): boolean {
  try { return Number(sessionStorage.getItem(cookingStepKey(recipeId))) > 0; } catch { return false; }
}
export function readCookingZen(): boolean {
  try { return localStorage.getItem(cookingZenKey) === "true"; } catch { return false; }
}
export function saveCookingZen(value: boolean) {
  try { localStorage.setItem(cookingZenKey, String(value)); } catch { /* preference only */ }
}
