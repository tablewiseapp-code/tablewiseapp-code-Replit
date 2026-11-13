import { useState } from "react";
import { Copy, Download, Facebook, FileText, Mail, MessageCircle, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { countItems, facebookUrl, formatText, mailtoUrl, printableHtml, scopeList, toCsv, whatsappUrl, type ShareCategory, type ShareScope } from "@/lib/grocery-share";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read-only view of the list: sharing never touches checked state or progress. */
export function GroceryShareDialog({ open, onOpenChange, categories, pantryLabel }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ShareCategory[];
  pantryLabel: string;
}) {
  const { t, lang, dir } = useI18n();
  const [scope, setScope] = useState<ShareScope>("remaining");
  const [showExport, setShowExport] = useState(false);
  const title = t("grocery.shareTitle");
  const list = scopeList(categories, scope);
  const text = formatText(title, list, pantryLabel);
  const empty = list.length === 0;

  const copy = async (message = t("grocery.shareCopied")) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ description: message });
      return true;
    } catch {
      toast({ description: t("grocery.shareCopyFailed"), variant: "destructive" });
      return false;
    }
  };

  const nativeShare = async () => {
    if (typeof navigator.share !== "function") return copy(t("grocery.shareNativeFallback"));
    try { await navigator.share({ title, text }); }
    catch (error) { if ((error as Error)?.name !== "AbortError") await copy(t("grocery.shareNativeFallback")); }
  };

  const exportPdf = () => {
    const win = window.open("", "_blank");
    if (!win) return toast({ description: t("grocery.sharePopupBlocked"), variant: "destructive" });
    win.document.write(printableHtml(title, list, pantryLabel, lang, dir));
    win.document.close();
    win.addEventListener("afterprint", () => win.close());
    win.focus();
    win.print();
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const actions = [
    { id: "whatsapp", icon: MessageCircle, label: "WhatsApp", run: () => window.open(whatsappUrl(text), "_blank", "noopener") },
    { id: "email", icon: Mail, label: t("grocery.shareEmail"), run: () => { window.location.href = mailtoUrl(title, text); } },
    // Facebook only shares a link, so the list goes to the clipboard for the user to paste.
    { id: "facebook", icon: Facebook, label: "Facebook", run: async () => { await copy(t("grocery.shareFacebookHint")); window.open(facebookUrl(window.location.origin), "_blank", "noopener"); } },
    { id: "more", icon: Share2, label: t("grocery.shareMore"), run: nativeShare },
    { id: "copy", icon: Copy, label: t("grocery.shareCopy"), run: () => copy() },
    { id: "export", icon: Download, label: t("grocery.shareExport"), run: () => setShowExport(v => !v) },
  ];
  const exports = [
    { id: "pdf", label: "PDF", run: exportPdf },
    { id: "txt", label: "TXT", run: () => download(`tablewise-grocery-${stamp}.txt`, text + "\n", "text/plain;charset=utf-8") },
    { id: "csv", label: "CSV", run: () => download(`tablewise-grocery-${stamp}.csv`, toCsv(list, [
      t("grocery.csvCategory"), t("grocery.csvIngredient"), t("grocery.csvQuantity"), t("grocery.csvUnit"), t("grocery.csvChecked"), t("grocery.csvPantry"),
    ]), "text/csv;charset=utf-8") },
  ];

  const scopeOption = (value: ShareScope, label: string) => (
    <label className={`grocery-share-scope${scope === value ? " is-active" : ""}`}>
      <input type="radio" name="grocery-share-scope" value={value} checked={scope === value} onChange={() => setScope(value)} data-testid={`share-scope-${value}`} />
      <span>{label}</span>
      <span className="grocery-share-count">{countItems(scopeList(categories, value))}</span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={next => { onOpenChange(next); if (!next) setShowExport(false); }}>
      <DialogContent className="grocery-share-dialog sm:max-w-[420px] max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:pb-[max(24px,env(safe-area-inset-bottom))]" data-testid="grocery-share-dialog">
        <DialogHeader className="pe-8 text-start">
          <DialogTitle>{t("grocery.shareExportTitle")}</DialogTitle>
          <DialogDescription>{t("grocery.shareScopeLabel")}</DialogDescription>
        </DialogHeader>
        <div className="grocery-share-scopes" role="radiogroup" aria-label={t("grocery.shareScopeLabel")}>
          {scopeOption("remaining", t("grocery.shareRemaining"))}
          {scopeOption("all", t("grocery.shareAll"))}
        </div>
        {empty && <p className="grocery-share-empty" role="status">{t("grocery.shareNothing")}</p>}
        <div className="grocery-share-actions">
          {actions.map(a => (
            <button key={a.id} type="button" className="grocery-share-action" disabled={empty} onClick={a.run}
              aria-expanded={a.id === "export" ? showExport : undefined} data-testid={`share-${a.id}`}>
              <a.icon aria-hidden="true" />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
        {showExport && !empty && (
          <div className="grocery-share-exports" role="group" aria-label={t("grocery.shareExport")}>
            {exports.map(e => (
              <button key={e.id} type="button" onClick={e.run} data-testid={`export-${e.id}`}>
                <FileText aria-hidden="true" />{e.label}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
