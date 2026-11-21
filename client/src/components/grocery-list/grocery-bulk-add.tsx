import { useState } from "react";
import { parseIngredientLine } from "@shared/ingredient-parse";
import { useI18n } from "@/lib/i18n";
import { shoppingCopy } from "@/lib/grocery-shopping-copy";
import { categorizeIngredient } from "@/lib/grocery-categories";
import { groceryMeasure } from "@/lib/grocery-meal-removal";

export type BulkItem = { text: string; category: string; existingId?: string };
type Decision = "skip" | "keep" | "update";
type Draft = { text: string; category: string; decision?: Decision };

function itemName(text: string) {
  return groceryMeasure(text).name.toLowerCase().trim().replace(/\s+/g, " ");
}

export function GroceryBulkAdd({ categories, existing, onSave }: {
  categories: Record<string, string>;
  existing: { text: string; id?: string }[];
  onSave: (items: BulkItem[]) => Promise<boolean>;
}) {
  const { lang, t } = useI18n();
  const copy = (key: Parameters<typeof shoppingCopy>[1]) => shoppingCopy(lang, key);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const normalized = lines.map(line => {
    const parsed = parseIngredientLine(line);
    return parsed.ingredient ? parsed.display : line;
  });
  const invalid = normalized.length > 50 || normalized.some(line => line.length > 80);
  const rows = draft?.map((row, index) => {
    const name = itemName(row.text);
    const match = existing.find(item => itemName(item.text) === name && item.id);
    const duplicate = Boolean(match) || existing.some(item => itemName(item.text) === name) ||
      draft.slice(0, index).some(item => itemName(item.text) === name && item.decision !== "skip");
    const decision = duplicate ? row.decision ?? "skip" : "keep";
    return { ...row, match, duplicate, decision };
  }) ?? [];
  const ready = rows.filter(row => row.decision !== "skip");
  const targetIds = ready.flatMap(row => row.decision === "update" && row.match?.id ? [row.match.id] : []);
  const canSave = ready.length > 0 && ready.every(row => row.text.trim() && row.text.trim().length <= 80 &&
    (row.decision !== "update" || row.match?.id)) && new Set(targetIds).size === targetIds.length;
  const change = (index: number, patch: Partial<Draft>) =>
    setDraft(previous => previous?.map((row, i) => i === index ? { ...row, ...patch } : row) ?? null);

  return <details className="mt-3 rounded border p-3">
    <summary className="min-h-11 cursor-pointer py-2">{copy("paste")}</summary>
    {!draft ? <>
      <label className="block text-sm">{copy("onePerLine")}
        <textarea rows={4} maxLength={6000} className="my-2 block w-full rounded border bg-background p-2"
          value={text} onChange={event => setText(event.target.value)} />
      </label>
      {invalid && <p role="alert">{copy("bulkLimit")}</p>}
      <button className="grocery-share-button disabled:opacity-50" disabled={!lines.length || invalid} onClick={() => {
        setDraft(normalized.map(line => {
          return { text: line, category: categorizeIngredient(line) };
        }));
      }}>{copy("preview")}</button>
    </> : <form onSubmit={async event => {
      event.preventDefault();
      if (!canSave || busy) return;
      setBusy(true);
      try {
        if (await onSave(ready.map(row => ({
          text: row.text.trim(), category: row.category,
          ...(row.decision === "update" && row.match?.id ? { existingId: row.match.id } : {}),
        })))) {
          setText("");
          setDraft(null);
        }
      } finally { setBusy(false); }
    }}>
      <ul className="divide-y">
        {rows.map((row, index) => <li key={index} className="grid gap-2 py-3 sm:grid-cols-2">
          <label className="text-sm">{copy("item")}
            <input className="block min-h-11 w-full rounded border bg-background px-2" value={row.text}
              onChange={event => change(index, { text: event.target.value, decision: undefined })} maxLength={80} disabled={busy} />
          </label>
          <label className="text-sm">{copy("category")}
            <select className="block min-h-11 w-full rounded border bg-background px-2" value={row.category}
              onChange={event => change(index, { category: event.target.value })} disabled={busy}>
              {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          {row.duplicate && <label className="text-sm sm:col-span-2">{copy("duplicate")}{row.match && ` · ${row.match.text}`}
            <select className="block min-h-11 w-full rounded border bg-background px-2" value={row.decision}
              onChange={event => change(index, { decision: event.target.value as Decision })} disabled={busy}>
              <option value="skip">{copy("skip")}</option>
              <option value="keep">{copy("keepBoth")}</option>
              {row.match && <option value="update">{copy("update")}</option>}
            </select>
          </label>}
        </li>)}
      </ul>
      <button className="grocery-primary disabled:opacity-50" disabled={!canSave || busy}>{copy("save")}</button>
      <button type="button" className="grocery-share-button ms-2" disabled={busy} onClick={() => setDraft(null)}>{t("cancel")}</button>
    </form>}
  </details>;
}
