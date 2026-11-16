import { useState, type FormEvent } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Pencil, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { can, type Access } from "@shared/grocery-access";
import type { ShareRole } from "@shared/schema";
import { categorizeIngredient, groceryCategoryLabelKeys, groceryCategoryOrder } from "@/lib/grocery-categories";
import { GroceryNote } from "@/components/grocery-list/grocery-note";
import { roleLabelKey, shareRoles } from "@/components/grocery-list/grocery-share-dialog";
import "@/components/grocery-list/grocery-list.css";

type Item = { id: string; category: string; text: string; recipes: string; checked: boolean; note: string | null };
type SharedList = { access: Access; role: ShareRole; items: Item[] };

/** A grocery list opened from a share link. The server decides what this visitor may do; this page only hides the rest. */
export default function SharedGrocery() {
  const [, params] = useRoute("/shared/:token");
  const [, setLocation] = useLocation();
  const { t } = useI18n();
  const { toast } = useToast();
  const url = `/api/shared-lists/${params?.token ?? ""}`;
  // ponytail: polling every 15s (the API rate limit is shared by all visitors); push updates if this must feel instant.
  const { data, isLoading } = useQuery<SharedList>({ queryKey: [url], refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 0 });
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) return <main className="grocery-page" aria-busy="true"><div className="grocery-shell"><div className="grocery-skeleton grocery-skeleton-title" /></div></main>;
  if (!data) {
    return (
      <main className="grocery-page">
        <section className="grocery-shell grocery-state" data-testid="shared-list-gone">
          <h1>{t("grocery.sharedGone")}</h1>
          <p>{t("grocery.sharedGoneBody")}</p>
        </section>
      </main>
    );
  }

  const { access, role, items } = data;
  /** Shows the change at once, sends it, then reloads the list so everyone's changes line up. */
  const change = async (send: () => Promise<unknown>, optimistic?: (items: Item[]) => Item[]) => {
    if (optimistic) queryClient.setQueryData<SharedList>([url], { ...data, items: optimistic(items) });
    try { await send(); }
    catch { toast({ title: t("grocery.changeFailed"), variant: "destructive" }); }
    await queryClient.invalidateQueries({ queryKey: [url] });
  };
  const patch = (item: Item, body: Partial<Pick<Item, "checked" | "note" | "text">>) =>
    change(() => apiRequest("PATCH", `${url}/items/${item.id}`, body), list => list.map(i => i.id === item.id ? { ...i, ...body } : i));
  const add = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void change(() => apiRequest("POST", `${url}/items`, { text, category: categorizeIngredient(text) }));
  };
  const turnOff = async () => {
    if (!window.confirm(t("grocery.sharedOffConfirm"))) return;
    try { await apiRequest("DELETE", url); setLocation("/grocery-list"); }
    catch { toast({ title: t("grocery.changeFailed"), variant: "destructive" }); }
  };

  const categories = [...groceryCategoryOrder, ...new Set(items.map(i => i.category).filter(c => !groceryCategoryOrder.includes(c)))];
  const done = items.filter(i => i.checked).length;

  return (
    <main className="grocery-page">
      <div className="grocery-shell">
        <header className="grocery-heading">
          <div className="grocery-title-row">
            <div>
              <h1>{t("grocery.sharedTitle")}</h1>
              <p className="grocery-subtitle" data-testid="shared-access">{access === "owner" ? t("grocery.sharedOwner") : t(roleLabelKey(access))}</p>
            </div>
            <div className="grocery-count" aria-live="polite"><strong>{done} / {items.length}</strong></div>
          </div>
          <div className="grocery-progress" role="progressbar" aria-label={t("grocery.checked", { checked: done, total: items.length })} aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
            <span style={{ transform: `scaleX(${items.length ? done / items.length : 0})` }} />
          </div>
          {access === "owner" && (
            <div className="grocery-row">
              <label htmlFor="shared-role">{t("grocery.linkRole")}</label>
              <select id="shared-role" value={role} onChange={event => change(() => apiRequest("PATCH", url, { role: event.target.value }))} data-testid="select-shared-role">
                {shareRoles.map(role => <option key={role} value={role}>{t(roleLabelKey(role))}</option>)}
              </select>
              <button type="button" className="grocery-share-button" onClick={turnOff} data-testid="button-turn-off-link">{t("grocery.sharedOff")}</button>
            </div>
          )}
          {can(access, "add") && (
            <form className="grocery-row" onSubmit={add}>
              <input className="grocery-field" value={draft} onChange={event => setDraft(event.target.value)} maxLength={300} dir="auto"
                placeholder={t("grocery.addItem")} aria-label={t("grocery.addItem")} data-testid="input-shared-add" />
              <button type="submit" className="grocery-share-button" data-testid="button-shared-add">{t("grocery.add")}</button>
            </form>
          )}
        </header>

        <div className="grocery-list">
          {categories.map(category => {
            const rows = items.filter(i => i.category === category).sort((a, b) => a.text.localeCompare(b.text));
            if (!rows.length) return null;
            return (
              <section className="grocery-category" key={category}>
                <header className="grocery-category-head">
                  <span className="grocery-category-title">
                    <span className="grocery-category-text"><h2>{groceryCategoryLabelKeys[category] ? t(groceryCategoryLabelKeys[category]) : category}</h2></span>
                    <span className="grocery-category-count">{rows.length}</span>
                  </span>
                </header>
                <ul>
                  {rows.map(item => (
                    <li key={item.id} className={`grocery-item${item.checked ? " is-checked" : ""}`} data-testid="shared-item">
                      {editingId === item.id ? (
                        <input className="grocery-field" autoFocus defaultValue={item.text} maxLength={300} dir="auto" aria-label={t("grocery.editItem", { item: item.text })} data-testid="input-shared-edit"
                          onBlur={event => {
                            setEditingId(null);
                            const text = event.target.value.trim();
                            if (text && text !== item.text) void patch(item, { text });
                          }}
                          onKeyDown={event => {
                            if (event.key === "Escape") event.currentTarget.value = item.text;
                            if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
                          }} />
                      ) : (
                        <label className="grocery-item-label">
                          <input type="checkbox" checked={item.checked} disabled={!can(access, "add")} onChange={() => patch(item, { checked: !item.checked })} />
                          <span className="grocery-checkmark" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3.5 8.2 3 3 6-6.3" /></svg></span>
                          <span className="grocery-ingredient" dir="auto">{item.text}</span>
                        </label>
                      )}
                      {item.recipes && <span className="grocery-recipes">{item.recipes}</span>}
                      {can(access, "edit") && (
                          <span className="grocery-item-actions">
                            <button type="button" className="grocery-icon-button" aria-label={t("grocery.editItem", { item: item.text })} onClick={() => setEditingId(item.id)} data-testid="button-shared-edit"><Pencil aria-hidden="true" /></button>
                            <button type="button" className="grocery-icon-button" aria-label={t("grocery.removeItem", { item: item.text })} data-testid="button-shared-remove"
                              onClick={() => change(() => apiRequest("DELETE", `${url}/items/${item.id}`), list => list.filter(i => i.id !== item.id))}><X aria-hidden="true" /></button>
                          </span>
                      )}
                      <GroceryNote item={item.text} value={item.note} canEdit={can(access, "add")} onSave={note => patch(item, { note: note || null })} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
