import { useEffect, useId, useState } from "react";
import { Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { useStorePickerCopy } from "@/lib/store-picker-copy";
import { loadSettings, settingsChangedEvent, updateSettings } from "@/lib/basic-settings";
import { addStore, pickerRows, storeCatalog, storeMethods, storeName, toggleStoreMethod, type StoreChoice, type StoreMethod } from "@/lib/grocery-stores";

/** A bundled logo in a 48×36 box, or the storefront icon for a custom store or a logo that fails to load. */
function StoreLogo({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  const logo = storeCatalog[id]?.logo;
  return (
    <span className="flex h-9 w-12 shrink-0 items-center justify-center" data-testid={`store-logo-${id}`}>
      {logo && !failed
        ? <img src={logo} alt="" className="h-9 w-12 object-contain" onError={() => setFailed(true)} />
        : <Store className="h-6 w-6 text-muted-foreground" aria-hidden="true" />}
    </span>
  );
}

/** "Where do you buy your groceries?" Every tap is saved at once to Basic Settings (shopping.stores). */
export function StorePicker({ showHeading = true }: { showHeading?: boolean }) {
  const { lang } = useI18n();
  const t = useStorePickerCopy();
  const [stores, setStores] = useState(() => loadSettings().shopping.stores);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [methods, setMethods] = useState<StoreMethod[]>([]);
  const nameId = useId();
  useEffect(() => {
    const refresh = () => setStores(loadSettings().shopping.stores);
    window.addEventListener(settingsChangedEvent, refresh);
    return () => window.removeEventListener(settingsChangedEvent, refresh);
  }, []);
  const change = (next: (current: StoreChoice[]) => StoreChoice[]) => {
    try { setStores(updateSettings(s => ({ ...s, shopping: { ...s.shopping, stores: next(s.shopping.stores) } })).shopping.stores); setError(false); }
    catch { setError(true); }
  };
  const canAdd = !!name.trim() && methods.length > 0;
  const add = () => {
    if (!canAdd) return;
    change(current => addStore(current, name, methods));
    setAdding(false); setName(""); setMethods([]);
  };
  const methodToggle = (on: boolean, method: StoreMethod, label: string, onClick: () => void, testid: string) => (
    <button key={method} type="button" className="chip" aria-pressed={on} aria-label={t("toggle", { store: label, method: t(method) })} onClick={onClick} data-testid={testid}>{t(method)}</button>
  );

  return (
    <section aria-labelledby={showHeading ? `${nameId}-heading` : undefined} data-testid="store-picker">
      {showHeading && <h2 id={`${nameId}-heading`} className="text-base font-semibold text-foreground">{t("heading")}</h2>}
      <p className="mb-3 text-sm text-muted-foreground">{t("helper")}</p>
      <ul className="divide-y divide-border">
        {pickerRows(stores, lang).map(store => {
          const label = storeName(store);
          return (
            <li key={store.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2" data-testid={`store-${store.id}`}>
              <span className="flex min-w-[8rem] flex-1 items-center gap-3">
                <StoreLogo id={store.id} />
                <span className="min-w-0 break-words text-sm font-medium" data-testid={`store-name-${store.id}`}>{label}</span>
              </span>
              <span className="flex gap-2">
                {storeMethods.map(method => methodToggle(store.methods.includes(method), method, label,
                  () => change(current => toggleStoreMethod(current, store, method)), `store-${store.id}-${method}`))}
              </span>
            </li>
          );
        })}
      </ul>
      {adding ? (
        <form className="mt-3 space-y-2 rounded-lg border border-border p-3" onSubmit={e => { e.preventDefault(); add(); }} data-testid="store-add-form">
          <label htmlFor={nameId} className="text-sm font-medium">{t("storeName")}</label>
          <Input id={nameId} value={name} maxLength={40} autoFocus onChange={e => setName(e.target.value)} data-testid="store-add-name" />
          <div className="flex flex-wrap gap-2">
            {storeMethods.map(method => methodToggle(methods.includes(method), method, name.trim() || t("storeName"),
              () => setMethods(m => (m.includes(method) ? m.filter(x => x !== method) : [...m, method])), `store-add-${method}`))}
          </div>
          {name.trim() && !methods.length && <p className="text-sm text-muted-foreground">{t("needMethod")}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={!canAdd} data-testid="store-add-save">{t("add")}</button>
            <button type="button" className="btn btn-text" onClick={() => { setAdding(false); setName(""); setMethods([]); }}>{t("cancel")}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-text mt-2" onClick={() => setAdding(true)} data-testid="store-add-open">{t("addAnother")}</button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{t("saveError")}</p>}
    </section>
  );
}
