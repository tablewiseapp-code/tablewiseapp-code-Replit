import { useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { useI18n } from "@/lib/i18n";
import { groceryProductText as copy } from "@/lib/grocery-product-copy";
import { groceryPhoto } from "./grocery-add-item";

/** Photo controls are outside the checkbox label, so editing never checks the row. */
/** `children` are extra row actions shown in the same menu, so a row has one "…" button. */
export function GroceryItemPicture({ item, image, disabled, onSave, label, children, onMenuClosed }: {
  item: string;
  image?: string | null;
  disabled?: boolean;
  onSave: (image: string | null) => Promise<void>;
  label?: string;
  children?: ReactNode;
  /** Runs when the menu has closed; call `preventDefault` to keep focus off the "…" button. */
  onMenuClosed?: (event: Event) => void;
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
    try { await onSave(next); setRetry(null); }
    catch { setError(copy(lang, "saveError")); setRetry({ image: next }); }
  };
  const save = async (next: string | null) => {
    if (lock.current) return;
    lock.current = true;
    try { await persist(next); }
    finally { lock.current = false; setBusy(null); }
  };
  return <>
    {image && <button type="button" className="grocery-photo-thumbnail" onClick={() => setPreview(true)}
      aria-label={`${copy(lang, "viewPhoto")}: ${item}`} data-testid="button-item-picture-preview">
      <img className="grocery-product-photo" src={image} alt={copy(lang, "preview")} loading="lazy" />
    </button>}
    <div className="grocery-photo-actions">
      <DropdownMenu dir={lang === "he" ? "rtl" : "ltr"}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="grocery-icon-button" disabled={disabled || Boolean(busy)}
            aria-label={label ?? `${copy(lang, "actions")}: ${item}`} title={label ?? copy(lang, "actions")} data-testid="button-item-picture-menu">
            <MoreHorizontal aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={onMenuClosed}>
          <DropdownMenuItem className="min-h-11" onSelect={() => input.current?.click()} data-testid="menu-item-picture-upload">
            {copy(lang, image ? "changePhoto" : "addPhoto")}
          </DropdownMenuItem>
          {image && <DropdownMenuItem className="min-h-11" onSelect={() => void save(null)} data-testid="menu-item-picture-remove">
            {copy(lang, "removePhoto")}
          </DropdownMenuItem>}
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
        aria-label={`${copy(lang, image ? "changePhoto" : "addPhoto")}: ${item}`} data-testid="input-existing-item-photo"
        disabled={disabled || Boolean(busy)} onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file || lock.current) return;
          lock.current = true; setBusy("processing"); setError(""); setRetry(null);
          try {
            let next: string;
            try { next = await groceryPhoto(file); }
            catch { setError(copy(lang, "photoError")); return; }
            await persist(next);
          } finally { lock.current = false; setBusy(null); }
        }} />
    </div>
    {busy && <p className="grocery-picture-status" role="status">{copy(lang, busy)}</p>}
    {error && <div className="grocery-picture-status" role="alert">
      {error} {retry && <button type="button" className="grocery-reset" disabled={Boolean(busy)} onClick={() => void save(retry.image)}>{copy(lang, "retry")}</button>}
    </div>}
    <Dialog.Root open={preview && Boolean(image)} onOpenChange={setPreview}>
      <Dialog.Portal>
        <Dialog.Overlay className="grocery-picture-overlay" />
        <Dialog.Content className="grocery-picture-dialog" aria-describedby={undefined} dir={lang === "he" ? "rtl" : "ltr"}
          onCloseAutoFocus={event => {
            event.preventDefault();
            input.current?.closest("li")?.querySelector<HTMLButtonElement>("[data-testid=button-item-picture-preview]")?.focus();
          }}>
          <Dialog.Title>{item}</Dialog.Title>
          {image && <img src={image} alt={copy(lang, "preview")} />}
          <Dialog.Close className="grocery-share-button">{copy(lang, "closePhoto")}</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
