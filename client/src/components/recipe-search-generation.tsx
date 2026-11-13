import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Loader2, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GeneratedRecipeBody, chip, primary, secondary } from "@/components/generate-recipe";
import { useI18n } from "@/lib/i18n";
import { generateCopy, type GenerateCopyKey } from "@/lib/generate-recipe-copy";
import { approveDraft, createDraft, DraftRequestError, editDraft, regenerateDraft, type RecipeDraft } from "@/lib/recipe-drafts";
import type { FilterViolation } from "@/lib/recipe-generation";
import type { RecipeGenerationRequest } from "@shared/recipe-generation-request";
import type { Recipe } from "@/lib/storage";

type Props = {
  query: string;
  request: RecipeGenerationRequest;
  /** Applied filters as removable chips. Removing one changes the page filters, which re-runs the search. */
  chips: { label: string; remove: () => void }[];
  notApplied: string[];
  /** Recipes with this name that miss the current filters. */
  nameOnly: { id: string; title: string }[];
  violationLabel: (violation: FilterViolation) => string;
  onEditFilters: () => void;
  onPublished: (recipe: Recipe) => void;
  /** Someone published a match meanwhile: reload the page's recipes. */
  onExisting: () => void;
};
type Busy = null | "generate" | "regenerate" | "save" | "approve";
type Form = { title: string; description: string; servings: string; prepTime: string; cookTime: string; ingredients: string; steps: string };

const lines = (text: string) => text.split("\n").map(line => line.trim()).filter(Boolean);
const minutes = (text: string) => text.trim() === "" ? null : Number(text);

/** Search → no match → review preferences → generate → review / edit / regenerate → approve (publish). */
export function RecipeSearchGeneration({ query, request, chips, notApplied, nameOnly, violationLabel, onEditFilters, onPublished, onExisting }: Props) {
  const { lang, dir } = useI18n();
  const t = (key: GenerateCopyKey) => generateCopy(lang, key).replace("{name}", `“${query}”`);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<DraftRequestError | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  // One action at a time: double clicks and parallel buttons never send a second request.
  const run = async (kind: Exclude<Busy, null>, action: (signal: AbortSignal) => Promise<void>) => {
    if (inFlight.current) return;
    const controller = inFlight.current = new AbortController();
    setBusy(kind); setError(null);
    try { await action(controller.signal); }
    catch (caught) {
      if (controller.signal.aborted) return;
      const failure = caught instanceof DraftRequestError ? caught : new DraftRequestError(t("failedTitle"), 0);
      if (failure.matches.length) onExisting();
      setError(failure);
    } finally {
      inFlight.current = null; setBusy(null);
    }
  };
  const start = () => {
    setOpen(true);
    if (!draft) void run("generate", async signal => setDraft(await createDraft(request, signal)));
  };
  const regenerate = () => draft && run("regenerate", async signal => { setDraft(await regenerateDraft(draft.id, signal)); setForm(null); });
  const startEdit = () => draft && setForm({
    title: draft.recipe.title, description: draft.description, servings: draft.recipe.servings ?? "",
    prepTime: draft.recipe.prepTime?.toString() ?? "", cookTime: draft.recipe.cookTime?.toString() ?? "",
    ingredients: draft.recipe.ingredients.join("\n"), steps: draft.recipe.steps.join("\n"),
  });
  const saveEdit = () => draft && form && run("save", async () => {
    setDraft(await editDraft(draft.id, {
      title: form.title, description: form.description, servings: form.servings.trim() || null,
      prepTime: minutes(form.prepTime), cookTime: minutes(form.cookTime), ingredients: lines(form.ingredients), steps: lines(form.steps),
    }));
    setForm(null);
  });
  const approve = () => draft && run("approve", async () => {
    const { recipe } = await approveDraft(draft.id);
    setOpen(false); setDraft(null);
    onPublished(recipe);
  });
  const close = () => { inFlight.current?.abort(); setOpen(false); setError(null); };

  const field = (key: keyof Form, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`draft-${key}`} className="text-xs text-foreground">{label}</Label>
      <Input id={`draft-${key}`} value={form![key]} onChange={e => setForm({ ...form!, [key]: e.target.value })} data-testid={`draft-edit-${key}`} {...props} />
    </div>
  );
  const area = (key: "description" | "ingredients" | "steps", label: string, rows: number) => (
    <div className="space-y-1">
      <Label htmlFor={`draft-${key}`} className="text-xs text-foreground">{label}</Label>
      <Textarea id={`draft-${key}`} rows={rows} value={form![key]} onChange={e => setForm({ ...form!, [key]: e.target.value })} data-testid={`draft-edit-${key}`} />
    </div>
  );

  return (
    <>
      <div role="status" data-testid="recipe-search-no-match" className="rounded-2xl border border-dashed border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">{t("noMatchTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("noMatchBody")}</p>
        {nameOnly.length > 0 && <div className="mt-3 rounded-lg bg-background p-3 text-sm text-foreground" data-testid="recipe-search-name-only">
          <p className="font-medium">{t("nameOnlyTitle")}</p>
          <ul className="mt-1 list-disc ps-5">
            {nameOnly.map(recipe => <li key={recipe.id}><Link href={`/recipe/${encodeURIComponent(recipe.id)}`} className="underline underline-offset-2">{recipe.title}</Link></li>)}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">{t("nameOnlyHint")}</p>
        </div>}
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("preferences")}</h4>
            <button type="button" onClick={onEditFilters} className="min-h-11 px-2 text-xs font-medium text-primary underline underline-offset-2" data-testid="recipe-search-change-filters">{t("changeFilters")}</button>
          </div>
          {chips.length ? (
            <ul className="mt-1 flex flex-wrap gap-1.5" data-testid="recipe-search-chips">
              {chips.map(c => <li key={c.label} className={`${chip} items-center gap-1 pe-1`}>
                {c.label}
                <button type="button" onClick={c.remove} aria-label={`${t("removeFilter")}: ${c.label}`} className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-border">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>)}
            </ul>
          ) : <p className="mt-1 text-xs text-muted-foreground">{t("noPreferences")}</p>}
          {notApplied.length > 0 && <p className="mt-2 text-xs text-muted-foreground" data-testid="recipe-search-not-applied">{t("notApplied")}: {notApplied.join(", ")}</p>}
        </div>
        <button type="button" onClick={start} disabled={busy !== null} className={`${primary} mt-4 w-full sm:w-auto`} data-testid="recipe-search-create">
          <Sparkles className="h-4 w-4" aria-hidden="true" />{draft ? t("continueDraft") : t("createWithAI")}
        </button>
      </div>

      <Dialog open={open} onOpenChange={next => { if (!next) close(); }}>
        <DialogContent dir={dir} className="max-h-[90dvh] overflow-y-auto rounded-2xl border-border bg-background sm:max-w-xl" data-testid="recipe-draft-dialog">
          {(busy === "generate" || busy === "regenerate") && <div role="status" className="flex items-center gap-3 py-6 text-sm text-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <DialogTitle className="text-sm font-medium">{busy === "generate" ? t("creating") : t("regenerating")}</DialogTitle>
            <DialogDescription className="sr-only">{t("draftBadge")}</DialogDescription>
          </div>}

          {error && !draft && busy === null && <div role="alert" data-testid="recipe-draft-error">
            <DialogTitle className="text-base font-semibold text-foreground">{error.matches.length ? t("existsTitle") : t("failedTitle")}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">{error.matches.length ? t("existsBody") : error.message}</DialogDescription>
            {error.matches.length > 0 && <ul className="mt-2 list-disc ps-5 text-sm">
              {error.matches.map(m => <li key={m.id}><Link href={`/recipe/${encodeURIComponent(m.id)}`} className="underline underline-offset-2">{m.title}</Link></li>)}
            </ul>}
            <div className="mt-4 flex flex-wrap gap-2">
              {!error.matches.length && <button type="button" className={primary} onClick={start} data-testid="recipe-draft-retry">{t("retry")}</button>}
              <button type="button" className={secondary} onClick={close}>{t("close")}</button>
            </div>
          </div>}

          {draft && busy !== "generate" && busy !== "regenerate" && <div data-testid="recipe-draft-review">
            <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-[#fbf3ea] px-2.5 py-1 text-xs font-medium text-[#6e4f3a]" data-testid="recipe-draft-badge">
              <Sparkles className="h-3 w-3" aria-hidden="true" />{t("draftBadge")}
            </p>
            {form ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); void saveEdit(); }} data-testid="recipe-draft-edit">
              <DialogTitle className="text-base font-semibold text-foreground">{t("edit")}</DialogTitle>
              <DialogDescription className="sr-only">{t("edit")}</DialogDescription>
              {field("title", t("recipeName"), { required: true, maxLength: 200 })}
              {area("description", t("description"), 2)}
              <div className="grid grid-cols-3 gap-2">
                {field("servings", t("servings"), { maxLength: 40 })}
                {field("prepTime", `${t("prep")} (${t("min")})`, { type: "number", min: 0, max: 10080, inputMode: "numeric" })}
                {field("cookTime", `${t("cook")} (${t("min")})`, { type: "number", min: 0, max: 10080, inputMode: "numeric" })}
              </div>
              {area("ingredients", `${t("ingredients")} · ${t("ingredientsHint")}`, 6)}
              {area("steps", `${t("steps")} · ${t("stepsHint")}`, 6)}
              {error && <p role="alert" className="text-xs text-[#815b49]">{error.message}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={primary} disabled={busy !== null} data-testid="recipe-draft-save">{busy === "save" ? t("saving") : t("saveEdits")}</button>
                <button type="button" className={secondary} disabled={busy !== null} onClick={() => { setForm(null); setError(null); }}>{t("cancelEdits")}</button>
              </div>
            </form> : <>
              <DialogTitle className="pe-6 text-xl font-semibold text-foreground">{draft.recipe.title}</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">{draft.description}</DialogDescription>
              {draft.violations.length > 0 && <div role="status" className="mt-3 rounded-lg border border-[#e7d2bf] bg-[#fbf3ea] p-3 text-sm text-[#6e4f3a]" data-testid="recipe-draft-violations">
                <p className="font-medium">{t("violationsTitle")}</p>
                <ul className="mt-1 list-disc ps-5 text-xs leading-5">{draft.violations.map((v, i) => <li key={i}>{violationLabel(v)}</li>)}</ul>
              </div>}
              {draft.recipe.tags && draft.recipe.tags.some(tag => ["vegetarian", "glutenFree", "kidFriendly"].includes(tag)) &&
                <ul className="mt-3 flex flex-wrap gap-1.5" data-testid="recipe-draft-dietary">
                  {draft.recipe.tags.filter(tag => ["vegetarian", "glutenFree", "kidFriendly"].includes(tag))
                    .map(tag => <li key={tag} className={chip}>{violationLabel({ filter: "dietary", value: { vegetarian: "Vegetarian", glutenFree: "Gluten-free", kidFriendly: "Kid friendly" }[tag]! })}</li>)}
                </ul>}
              <GeneratedRecipeBody recipe={draft.recipe} />
              <p className="mt-3 text-xs text-muted-foreground">{t("publishNote")}</p>
              {error && <p role="alert" className="mt-2 text-xs text-[#815b49]" data-testid="recipe-draft-action-error">{error.message}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={busy !== null} onClick={approve} data-testid="recipe-draft-approve">{busy === "approve" ? t("approving") : t("approve")}</button>
                <button type="button" className={secondary} disabled={busy !== null} onClick={startEdit} data-testid="recipe-draft-edit-button">{t("edit")}</button>
                <button type="button" className={secondary} disabled={busy !== null} onClick={regenerate} data-testid="recipe-draft-regenerate">{t("regenerate")}</button>
              </div>
            </>}
          </div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
