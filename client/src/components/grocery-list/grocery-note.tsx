import { useState } from "react";
import { StickyNote } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** A short note on one grocery item. An empty note removes it. Used on the owner's list and on shared lists.
 * With `onEditingChange` the parent opens editing (from a row menu) and no note button is shown. */
export function GroceryNote({ item, value, canEdit, onSave, editing: openEditing, onEditingChange }: {
  item: string;
  value?: string | null;
  canEdit: boolean;
  onSave: (note: string) => void;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const { t } = useI18n();
  const [ownEditing, setOwnEditing] = useState(false);
  const editing = onEditingChange ? Boolean(openEditing) : ownEditing;
  const setEditing = onEditingChange ?? setOwnEditing;
  const label = t("grocery.noteFor", { item });
  return (
    <>
      {canEdit && !onEditingChange && (
        <button type="button" className={`grocery-note-toggle${value ? " has-note" : ""}`} aria-label={label} title={label}
          aria-expanded={editing} onClick={() => setOwnEditing(open => !open)} data-testid="button-item-note">
          <StickyNote aria-hidden="true" />
        </button>
      )}
      {editing ? (
        <input className="grocery-note-input" autoFocus defaultValue={value ?? ""} maxLength={500} dir="auto"
          placeholder={t("grocery.notePlaceholder")} aria-label={label} data-testid="input-item-note"
          onBlur={event => {
            setEditing(false);
            const next = event.target.value.trim();
            if (next !== (value ?? "")) onSave(next);
          }}
          onKeyDown={event => {
            if (event.key === "Escape") event.currentTarget.value = value ?? "";
            if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
          }} />
      ) : value ? <p className="grocery-note" dir="auto" data-testid="grocery-item-note">{value}</p> : null}
    </>
  );
}
