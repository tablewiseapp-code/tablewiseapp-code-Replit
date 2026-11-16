import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { groceryProductText as copy } from "@/lib/grocery-product-copy";

type Product = { id: string; category: string; names: Record<string, string>; aliases: string[] };

/** Resize and re-encode locally: avoid storing original photos, metadata or large uploads. */
export async function groceryPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10_000_000) throw new Error("Invalid photo");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.75);
    if (image.length > 280023) throw new Error("Photo too large");
    return image;
  } finally { bitmap.close(); }
}

export function GroceryAddItem({ onAdd }: { onAdd: (text: string, image?: string) => Promise<boolean> }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const photoVersion = useRef(0);
  const { data: products = [], isError } = useQuery<Product[]>({ queryKey: ["/api/household-products"], staleTime: 3600000 });
  const query = text.trim().toLocaleLowerCase();
  const matches = products.filter(product => [...Object.values(product.names), ...product.aliases]
    .some(name => name.toLocaleLowerCase().includes(query)))
    .sort((a, b) => Number(!a.names[lang]?.toLocaleLowerCase().startsWith(query)) - Number(!b.names[lang]?.toLocaleLowerCase().startsWith(query)))
    .slice(0, 12);
  useEffect(() => { if (open && active >= 0) document.getElementById(`product-${matches[active]?.id}`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);
  return <form className="grocery-add-product" onSubmit={async event => {
    event.preventDefault();
    if (!text.trim() || busy || processing) return;
    setBusy(true);
    try {
      if (await onAdd(text.trim(), image)) { setText(""); setOpen(false); setActive(-1); setImage(undefined); setError(""); if (input.current) input.current.value = ""; }
    } finally { setBusy(false); }
  }}>
    <div className="grocery-add">
      <div className="grocery-product-search">
        <input value={text} onChange={event => { setText(event.target.value); setOpen(true); setActive(-1); }} maxLength={80} autoFocus
          role="combobox" aria-autocomplete="list" aria-expanded={open && matches.length > 0}
          aria-controls="household-product-suggestions" aria-activedescendant={open && active >= 0 ? `product-${matches[active]?.id}` : undefined}
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
          onKeyDown={event => {
            if (event.key === "Escape") { setOpen(false); setActive(-1); }
            if (["ArrowDown", "ArrowUp"].includes(event.key) && matches.length) {
              event.preventDefault(); setOpen(true);
              setActive(previous => event.key === "ArrowDown" ? (previous + 1) % matches.length : (previous <= 0 ? matches.length - 1 : previous - 1));
            }
            if (event.key === "Enter" && open && active >= 0 && matches[active]) {
              event.preventDefault(); setText(matches[active].names[lang] || matches[active].names.en); setOpen(false); setActive(-1);
            }
          }} autoComplete="off" disabled={busy}
          placeholder={t("grocery.addItemPlaceholder")} aria-label={t("grocery.addItem")} data-testid="input-add-item" />
        {open && matches.length > 0 && <ul className="grocery-product-options" id="household-product-suggestions" role="listbox" aria-label={t("grocery.addItem")}>
          {matches.map((product, index) => <li key={product.id} id={`product-${product.id}`} role="option" aria-selected={active === index}
            onPointerDown={event => event.preventDefault()} onClick={() => { setText(product.names[lang] || product.names.en); setOpen(false); setActive(-1); }}>
            {product.names[lang] || product.names.en}
          </li>)}
        </ul>}
      </div>
      <button type="submit" className="grocery-share-button" disabled={busy || processing || !text.trim()} data-testid="button-add-item-submit">{busy ? copy(lang, "saving") : t("grocery.add")}</button>
    </div>
    <div className="grocery-photo-controls">
      <label className="grocery-share-button">
        {copy(lang, "addPhoto")}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || processing}
          aria-label={copy(lang, "addPhoto")} data-testid="input-item-photo" onChange={async event => {
            const file = event.target.files?.[0]; if (!file) return;
            const version = ++photoVersion.current;
            setProcessing(true); setError("");
            try { const next = await groceryPhoto(file); if (version === photoVersion.current) setImage(next); }
            catch { if (version === photoVersion.current) setError(copy(lang, "photoError")); }
            finally { if (version === photoVersion.current) setProcessing(false); }
          }} />
      </label>
      <span>{copy(lang, "optionalPhoto")}</span>
      {image && <><img className="grocery-product-photo" src={image} alt={copy(lang, "preview")} />
        <button type="button" className="grocery-share-button" disabled={busy || processing} onClick={() => { setImage(undefined); if (input.current) input.current.value = ""; }}>{copy(lang, "removePhoto")}</button></>}
    </div>
    {processing && <p role="status">{copy(lang, "processing")}</p>}
    {error && <p role="alert">{error}</p>}
    {isError && <p role="status">{copy(lang, "catalogError")}</p>}
  </form>;
}
