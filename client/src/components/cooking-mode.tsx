import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useRecipeViewCopy } from "@/lib/recipe-view-copy";
import { cleanStep, stepDuration } from "@/lib/recipe-steps";
import {
  clearCookingStep, clampStep, isLastStep, nextStep, previousStep, readCookingStep, readCookingZen,
  saveCookingStep, saveCookingZen, stepProgress,
} from "@/lib/cooking-session";
import { clearTimers, formatClock, idleTimer, isDone, isRunning, pauseTimer, readTimers, saveTimers, secondsLeft, startTimer, timerSeconds, type StepTimer, type TimerMap } from "@/lib/step-timer";
import { StepTiming } from "@/components/step-timing";
import type { StepAnalysis } from "@shared/step-timing";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#496c5a]";
const btn = `inline-flex min-h-12 items-center justify-center gap-1 rounded-full px-5 text-sm font-medium ${focus}`;

export function CookingMode({ recipeId, title, steps, analysis, servings, scaledIngredients, onExit, onFinish }: {
  recipeId: string; title: string; steps: string[]; analysis?: StepAnalysis | null;
  servings: number | null; scaledIngredients: string[]; onExit: () => void; onFinish: () => void;
}) {
  const { dir } = useI18n();
  const { t } = useRecipeViewCopy();
  const total = steps.length;
  const [step, setStep] = useState(() => readCookingStep(recipeId, total));
  const [zen, setZen] = useState(readCookingZen);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [timers, setTimers] = useState<TimerMap>(() => readTimers(recipeId));
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const progress = stepProgress(step, total);
  const last = isLastStep(step, total);

  useEffect(() => { saveCookingStep(recipeId, step); setConfirmRestart(false); }, [recipeId, step]);
  useEffect(() => { activeRef.current?.scrollIntoView?.({ block: "nearest" }); }, [step, zen]);
  useEffect(() => {
    rootRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the overlay scrolls; the page behind does not
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => { saveTimers(recipeId, timers); }, [recipeId, timers]);
  const anyRunning = Object.values(timers).some(timer => timer.endsAt !== null);
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [anyRunning]);
  const alerted = useRef(new Set<number>());
  useEffect(() => {
    for (const [key, timer] of Object.entries(timers)) {
      if (isDone(timer, now) && !alerted.current.has(Number(key))) { alerted.current.add(Number(key)); navigator.vibrate?.([200, 100, 200]); }
    }
  }, [timers, now]);
  const update = (index: number, seconds: number, change: (timer: StepTimer) => StepTimer) => {
    const t = Date.now(); setNow(t);
    setTimers(prev => ({ ...prev, [index]: change(prev[index] ?? idleTimer(seconds)) }));
  };
  const resetTimer = (index: number) => { alerted.current.delete(index); setTimers(prev => { const { [index]: _, ...rest } = prev; return rest; }); };
  const timerFor = (index: number, raw: string) => {
    const seconds = timerSeconds(stepDuration(raw, analysis?.steps[index]));
    return seconds ? { seconds, timer: timers[index] ?? idleTimer(seconds) } : null;
  };
  const timerControl = (index: number, raw: string, big: boolean) => {
    const found = timerFor(index, raw);
    if (!found) return null; // no stated duration: no timer, nothing invented
    const { seconds, timer } = found;
    const left = secondsLeft(timer, now), done = isDone(timer, now), running = isRunning(timer, now), started = timers[index] !== undefined;
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={`step-timer-${index}`} data-state={done ? "done" : running ? "running" : started ? "paused" : "idle"}>
        <span className={`font-mono tabular-nums ${big ? "text-4xl sm:text-5xl" : "text-xl"} ${done ? "text-red-600" : ""}`} data-testid={`step-timer-clock-${index}`}
          role="timer" aria-label={t("startTimer")}>{formatClock(left)}</span>
        {!started && <button type="button" onClick={() => update(index, seconds, timer => startTimer(timer, Date.now()))} data-testid="timer-start"
          className={`${btn} bg-[#42624e] text-white`}>{t("startTimer")} · {formatClock(seconds)}</button>}
        {started && !done && (running
          ? <button type="button" onClick={() => update(index, seconds, timer => pauseTimer(timer, Date.now()))} data-testid="timer-pause" className={`${btn} border border-[#d9dfd4] bg-white`}>{t("pauseTimer")}</button>
          : <button type="button" onClick={() => update(index, seconds, timer => startTimer(timer, Date.now()))} data-testid="timer-resume" className={`${btn} bg-[#42624e] text-white`}>{t("resumeTimer")}</button>)}
        {started && <button type="button" onClick={() => resetTimer(index)} data-testid="timer-reset" className={`${btn} border border-[#d9dfd4] bg-white`}>{t("resetTimer")}</button>}
        {done && <p role="alert" className="w-full text-sm font-medium text-red-600" data-testid="timer-done">{t("timerDone")}</p>}
      </div>
    );
  };

  const go = (next: number) => setStep(clampStep(next, total));
  const finish = () => { clearCookingStep(recipeId); clearTimers(recipeId); onFinish(); };
  const toggleZen = () => { const next = !zen; setZen(next); saveCookingZen(next); };
  const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";

  if (total === 0) return null;
  const currentText = cleanStep(steps[step]);
  const duration = stepDuration(steps[step], analysis?.steps[step]);

  return (
    <div ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${t("cookingMode")}: ${title}`} dir={dir}
      data-testid="cooking-mode" data-zen={zen ? "true" : "false"}
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); onExit(); }
        else if (event.key === forward && !last) go(nextStep(step, total));
        else if (event.key === backward) go(previousStep(step, total));
      }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground outline-none">
      <header className="border-b hairline px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <button type="button" onClick={onExit} data-testid="cooking-exit" className={`${btn} border border-[#d9dfd4] bg-white px-4`}>
            <X className="h-4 w-4" aria-hidden="true" />{t("exitCooking")}
          </button>
          <button type="button" role="switch" aria-checked={zen} onClick={toggleZen} data-testid="cooking-zen-toggle"
            className={`${btn} border px-4 ${zen ? "border-[#42624e] bg-[#42624e] text-white" : "border-[#d9dfd4] bg-white text-[#52665a]"}`}>
            {t("zenMode")}<span aria-hidden="true" className="text-xs">{zen ? "✓" : ""}</span>
          </button>
        </div>
        <div className="mx-auto mt-3 max-w-3xl">
          <p className={`min-w-0 break-words ${zen ? "text-xs text-muted-foreground" : "text-base font-medium"}`} data-testid="cooking-title">{title}</p>
          <div className="mt-2 flex items-center gap-3">
            <p className="shrink-0 text-sm font-medium" aria-live="polite" data-testid="cooking-step-label">{t("stepOf", { current: progress.current, total })}</p>
            <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={progress.current} aria-label={t("stepOf", { current: progress.current, total })}
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10" data-testid="cooking-progress">
              <div className="h-full rounded-full bg-[#42624e]" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl">
          {zen ? (
            <div className="space-y-6 py-4" data-testid="cooking-zen-step">
              <p className="break-words text-2xl leading-relaxed sm:text-3xl" data-testid="cooking-current-text">{currentText}</p>
              <StepTiming duration={duration ?? undefined} />
              {timerControl(step, steps[step], true)}
            </div>
          ) : (
            <>
              {scaledIngredients.length > 0 && (
                <details className="mb-5 rounded-lg border hairline bg-white p-3" data-testid="cooking-ingredients">
                  <summary className={`min-h-11 cursor-pointer py-2 text-sm font-medium ${focus}`}>{t("showIngredients", { count: servings ?? "" })}</summary>
                  <ul className="list-disc space-y-1 ps-5 pb-2 text-sm">{scaledIngredients.map((text, i) => <li key={i} className="break-words">{text}</li>)}</ul>
                </details>
              )}
              <ol className="space-y-3" data-testid="cooking-steps">
                {steps.map((raw, i) => {
                  const active = i === step;
                  const stepTime = stepDuration(raw, analysis?.steps[i]);
                  return (
                    <li key={i} ref={active ? activeRef : undefined} aria-current={active ? "step" : undefined} data-testid={`cooking-step-${i}`} data-active={active}>
                      <button type="button" onClick={() => go(i)} aria-label={t("goToStep", { n: i + 1 })}
                        className={`flex w-full min-h-14 items-start gap-3 rounded-lg p-4 text-start ${focus} ${active ? "border-2 border-[#42624e] bg-[#42624e]/10" : "border hairline bg-white opacity-80"}`}>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${active ? "bg-[#42624e] text-white" : "bg-foreground/5"}`} aria-hidden="true">{i + 1}</span>
                        <span className="min-w-0 flex-1 space-y-2">
                          {active && <span className="block text-xs font-medium uppercase tracking-wide text-[#42624e]">{t("currentStep")}</span>}
                          <span className={`block break-words leading-relaxed ${active ? "text-lg" : "text-base"}`}>{cleanStep(raw)}</span>
                          <StepTiming duration={stepTime ?? undefined} />
                        </span>
                      </button>
                      {(active || timers[i]) && <div className="px-4 pb-1 pt-2">{timerControl(i, raw, false)}</div>}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </main>

      <footer className="border-t hairline bg-background px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => go(previousStep(step, total))} disabled={step === 0} data-testid="cooking-prev"
              className={`${btn} flex-1 border border-[#d9dfd4] bg-white disabled:opacity-40 sm:flex-none`}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t("prevStep")}
            </button>
            {last ? (
              <button type="button" onClick={finish} data-testid="cooking-finish" className={`${btn} flex-1 bg-[#42624e] text-white sm:flex-none`}>{t("finishCooking")}</button>
            ) : (
              <button type="button" onClick={() => go(nextStep(step, total))} data-testid="cooking-next" className={`${btn} flex-1 bg-[#42624e] text-white sm:flex-none`}>
                {t("nextStepLabel")}<ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </button>
            )}
          </div>
          {step > 0 && (
            <button type="button" data-testid="cooking-restart"
              onClick={() => { if (confirmRestart) { go(0); } else setConfirmRestart(true); }}
              className={`min-h-11 self-center rounded px-3 text-xs underline underline-offset-2 text-muted-foreground ${focus}`}>
              {confirmRestart ? t("confirmRestart") : t("restart")}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
