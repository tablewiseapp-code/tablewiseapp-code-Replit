import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useI18n } from "@/lib/i18n";
import { groceryProductText as copy } from "@/lib/grocery-product-copy";
import { groceryPhoto } from "./grocery-add-item";

/** The square photo button of a grocery row: "+" opens the image picker; a thumbnail opens the picture with Change and
 * Remove. A failed save keeps the previous picture (the parent updates only after success) and shows the error. */
export function GroceryItemPicture({ item, image, disabled, onSave }: {
  item: string;
  image?: string | null;
  disabled?: boolean;
  onSave: (image: string | null) => Promise<void>;
}) {
  const { lang } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState<"processing" | "uploading" | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<{ image: string | null } | null>(null);
  const [preview, setPreview] = useState(false);
  const persist = async (next: string | null) => {
    setBusy("uploading");
    setError("");
    try { await onSave(next); setRetry(null); return true; }
    catch { setError(copy(lang, "saveError")); setRetry({ image: next }); return false; }
  };
  const save = async (next: string | null) => {
    if (lock.current) return;
    lock.current = true;
    try { if (await persist(next)) setPreview(false); }
    finally { lock.current = false; setBusy(null); }
  };
  const blocked = disabled || Boolean(busy);
  return <>
    {image
      ? <button type="button" className="grocery-photo-button" onClick={() => setPreview(true)} disabled={blocked}
          aria-label={`${copy(lang, "viewPhoto")}: ${item}`} data-testid="button-item-picture-preview">
          <img src={image} alt="" loading="lazy" />
        </button>
      : <button type="button" className="grocery-photo-button is-empty" onClick={() => input.current?.click()} disabled={blocked}
          aria-label={`${copy(lang, "addPhoto")}: ${item}`} data-testid="button-item-picture-add">
          <Plus aria-hidden="true" />
        </button>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
      aria-label={`${copy(lang, image ? "changePhoto" : "addPhoto")}: ${item}`} data-testid="input-existing-item-photo"
      disabled={blocked} onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file || lock.current) return;
        lock.current = true; setBusy("processing"); setError(""); setRetry(null);
        try {
          let next: string;
          try { next = await groceryPhoto(file); }
          catch { setError(copy(lang, "photoError")); return; }
          if (await persist(next)) setPreview(false);
        } finally { lock.current = false; setBusy(null); }
      }} />
    {(busy || error) && <div className="grocery-picture-status" role={error ? "alert" : "status"}>
      {busy ? copy(lang, busy) : error}
      {!busy && retry && <> <button type="button" className="grocery-reset" onClick={() => void save(retry.image)}>{copy(lang, "retry")}</button></>}
    </div>}
    <Dialog.Root open={preview && Boolean(image)} onOpenChange={setPreview}>
      <Dialog.Portal>
        <Dialog.Overlay className="grocery-picture-overlay" />
        <Dialog.Content className="grocery-picture-dialog" aria-describedby={undefined} dir={lang === "he" ? "rtl" : "ltr"}>
          <Dialog.Title>{item}</Dialog.Title>
          {image && <img src={image} alt={copy(lang, "preview")} />}
          {(busy || error) && <p role={error ? "alert" : "status"}>{busy ? copy(lang, busy) : error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="grocery-primary" disabled={blocked} onClick={() => input.current?.click()}
              data-testid="menu-item-picture-upload">{copy(lang, "changePhoto")}</button>
            <button type="button" className="grocery-share-button" disabled={blocked} onClick={() => void save(null)}
              data-testid="menu-item-picture-remove">{copy(lang, "removePhoto")}</button>
            <Dialog.Close className="grocery-share-button">{copy(lang, "closePhoto")}</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
