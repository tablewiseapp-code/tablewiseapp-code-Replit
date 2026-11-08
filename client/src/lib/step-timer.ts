import type { StepDuration } from "@shared/step-timing";

// Pure countdown model. `endsAt` (epoch ms) is set while running; `remaining` (seconds) otherwise.
export type StepTimer = { remaining: number; endsAt: number | null };
const factor = { seconds: 1, minutes: 60, hours: 3600 } as const;

/** A range starts at its minimum; the timer is only ever set from stated/analysed data. */
export const timerSeconds = (duration?: Pick<StepDuration, "min" | "unit"> | null) =>
  duration ? duration.min * factor[duration.unit] : null;
export const idleTimer = (seconds: number): StepTimer => ({ remaining: seconds, endsAt: null });
export const secondsLeft = (timer: StepTimer, now: number) =>
  timer.endsAt === null ? timer.remaining : Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
export const startTimer = (timer: StepTimer, now: number): StepTimer =>
  timer.endsAt !== null || timer.remaining <= 0 ? timer : { remaining: timer.remaining, endsAt: now + timer.remaining * 1000 };
export const pauseTimer = (timer: StepTimer, now: number): StepTimer =>
  timer.endsAt === null ? timer : { remaining: secondsLeft(timer, now), endsAt: null };
export const isDone = (timer: StepTimer, now: number) => timer.endsAt !== null && secondsLeft(timer, now) === 0;
export const isRunning = (timer: StepTimer, now: number) => timer.endsAt !== null && !isDone(timer, now);

export function formatClock(total: number): string {
  const s = Math.max(0, Math.floor(total)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
}

export type TimerMap = Record<number, StepTimer>;
export const timersKey = (recipeId: string) => `tablewise:cooking-timers:v1:${recipeId}`;
export function readTimers(recipeId: string): TimerMap {
  try {
    const raw = JSON.parse(sessionStorage.getItem(timersKey(recipeId)) ?? "{}");
    const out: TimerMap = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
      const v = value as StepTimer;
      if (Number.isInteger(Number(key)) && Number.isFinite(v?.remaining) && v.remaining >= 0 && (v.endsAt === null || Number.isFinite(v.endsAt))) out[Number(key)] = { remaining: v.remaining, endsAt: v.endsAt };
    }
    return out;
  } catch { return {}; }
}
export function saveTimers(recipeId: string, timers: TimerMap) {
  try { sessionStorage.setItem(timersKey(recipeId), JSON.stringify(timers)); } catch { /* best-effort */ }
}
export function clearTimers(recipeId: string) {
  try { sessionStorage.removeItem(timersKey(recipeId)); } catch { /* nothing to clear */ }
}
