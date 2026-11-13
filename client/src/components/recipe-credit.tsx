import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RecipeCredit } from "@shared/recipe-credit";
import { useMvpCopy } from "@/lib/mvp-copy";
import { updateRecipeCredit, type Recipe } from "@/lib/storage";

export function RecipeCreditLine({ recipe }: { recipe: RecipeCredit & { id: string } }) {
  const { t } = useMvpCopy();
  const personal = recipe.creditKind === "mine";
  const name = recipe.creditName?.trim();
  const reference = recipe.chefReference?.trim();
  // No known author: show nothing rather than a "not specified" message.
  if (!personal && !name && !reference) return null;
  return <span className="min-w-0 max-w-full basis-full break-words" data-testid={`recipe-credit-${recipe.id}`}>
    {personal ? `${t("creditMine")}${name ? ` — ${name}` : ""}` :
      name ? `${t(reference ? "creditReference" : "creditChef")}: ${name}` : `${t("creditReference")}: ${reference}`}
  </span>;
}

export function RecipeCreditEditor({ recipe, onSaved }: { recipe: Recipe; onSaved: (recipe: Recipe) => void }) {
  const { t } = useMvpCopy();
  const queries = useQueryClient();
  const [kind, setKind] = useState<"chef" | "mine">(recipe.creditKind ?? "chef");
  const [name, setName] = useState(recipe.creditName ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  useEffect(() => {
    setKind(recipe.creditKind ?? "chef"); setName(recipe.creditName ?? "");
  }, [recipe.id, recipe.creditKind, recipe.creditName]);
  useEffect(() => setStatus(null), [recipe.id]);
  if (!recipe.creditEditable) return null;
  return <form className="mb-6 space-y-3 rounded-xl border hairline p-4" data-testid="recipe-credit-editor"
    onSubmit={async event => {
      event.preventDefault();
      if (saving || (kind === "chef" && !name.trim())) return;
      setSaving(true); setStatus(null);
      try {
        const updated = await updateRecipeCredit(recipe.id, { creditKind: kind, creditName: name.trim() || null });
        onSaved(updated);
        await queries.invalidateQueries({ queryKey: ["/api/recipes"] });
        setStatus("saved");
      } catch { setStatus("error"); }
      finally { setSaving(false); }
    }}>
    <h2 className="text-sm font-medium">{t("creditEdit")}</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm">
        <span>{t("creditType")}</span>
        <select value={kind} disabled={saving} data-testid="select-credit-kind"
          onChange={event => { setKind(event.target.value as "chef" | "mine"); setName(""); setStatus(null); }}
          className="block min-h-11 w-full rounded-lg border bg-background px-3">
          <option value="chef">{t("creditChef")}</option><option value="mine">{t("creditMine")}</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span>{t(kind === "mine" ? "creditOptionalName" : "creditRequiredName")}</span>
        <input value={name} maxLength={120} required={kind === "chef"} disabled={saving}
          data-testid="input-credit-name" onChange={event => { setName(event.target.value); setStatus(null); }}
          className="block min-h-11 w-full rounded-lg border bg-background px-3" />
      </label>
    </div>
    <button disabled={saving || (kind === "chef" && !name.trim())} data-testid="button-save-credit"
      className="min-h-11 rounded-full bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">{t("creditSave")}</button>
    {status && <p role={status === "error" ? "alert" : "status"} data-testid="credit-save-status"
      className="text-sm">{t(status === "saved" ? "creditSaved" : "creditFailed")}</p>}
  </form>;
}
