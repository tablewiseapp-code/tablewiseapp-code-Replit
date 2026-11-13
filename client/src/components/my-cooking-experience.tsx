import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useRecipeViewCopy, type RecipeViewKey } from "@/lib/recipe-view-copy";
import { StarRating } from "@/components/ui/star-rating";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  addCookingPhoto, cookingKey, cookingPhotoURL, cookingSummary, deleteCooking, deleteCookingPhoto, fetchCookingSessions,
  newCookingId, recordCooking, updateCooking, type CookingSession,
} from "@/lib/cooking-history";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#496c5a]";
const pill = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium ${focus}`;
const NOTES_DEBOUNCE_MS = 700;

const useCookingSessions = (recipeId: string) =>
  useQuery({ queryKey: cookingKey(recipeId), queryFn: () => fetchCookingSessions(recipeId), staleTime: Infinity });

function useCookingCopy() {
  const { lang } = useI18n();
  const { t } = useRecipeViewCopy();
  const date = (iso: string) => new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(new Date(iso));
  const plural: Record<string, RecipeViewKey> = { one: "madeCountOne", few: "madeCountFew", many: "madeCountMany" };
  const madeCount = (count: number) => t(plural[new Intl.PluralRules(lang).select(count)] ?? "madeCountOther", { count });
  return { t, date, madeCount };
}

/** Small completion indicator for the recipe header. Shares the cached history with the section below. */
export function CookedBadge({ recipeId }: { recipeId: string }) {
  const { t } = useCookingCopy();
  const { data } = useCookingSessions(recipeId);
  if (!data?.length) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#42624e]/10 px-2 py-0.5 text-xs font-medium text-[#42624e]" data-testid="badge-cooked">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />{t("madeBadge", { count: data.length })}
    </span>
  );
}

export function MyCookingExperience({ recipeId }: { recipeId: string }) {
  const { t, date, madeCount } = useCookingCopy();
  const queryClient = useQueryClient();
  const query = useCookingSessions(recipeId);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false); // state updates too late for a double tap within one frame
  const [retryId, setRetryId] = useState<string | null>(null); // a failed attempt is retried with the same id
  const [justMade, setJustMade] = useState<string | null>(null);
  const [error, setError] = useState<"record" | "undo" | null>(null);
  const setSessions = (update: (sessions: CookingSession[]) => CookingSession[]) =>
    queryClient.setQueryData<CookingSession[]>(cookingKey(recipeId), previous => update(previous ?? []));
  const patchSession = (id: string, update: (session: CookingSession) => CookingSession) =>
    setSessions(sessions => sessions.map(session => session.id === id ? update(session) : session));

  // One click records it. Double taps are ignored while saving; the server also dedupes a repeated id.
  const record = async () => {
    if (busy.current) return;
    busy.current = true;
    const id = retryId ?? newCookingId();
    setSaving(true); setError(null);
    try {
      const session = await recordCooking(id, recipeId);
      setSessions(sessions => [session, ...sessions.filter(s => s.id !== session.id)]);
      setJustMade(session.id); setRetryId(null);
    } catch { setRetryId(id); setError("record"); }
    finally { setSaving(false); busy.current = false; }
  };
  const undo = async () => {
    if (!justMade || busy.current) return;
    busy.current = true;
    setSaving(true); setError(null);
    try {
      await deleteCooking(justMade);
      setSessions(sessions => sessions.filter(s => s.id !== justMade));
      setJustMade(null);
    } catch { setError("undo"); }
    finally { setSaving(false); busy.current = false; }
  };

  const sessions = query.data ?? [];
  const { count, lastCookedAt } = cookingSummary(sessions);
  const [latest, ...earlier] = sessions;
  return (
    <section className="mt-4 rounded-lg border hairline bg-white p-4" aria-labelledby="cooking-heading" data-testid="my-cooking-experience">
      <h2 id="cooking-heading" className="sr-only">{t("cookingHeading")}</h2>
      {query.isPending ? (
        <div className="h-24 animate-pulse rounded-md bg-foreground/5" aria-hidden="true" />
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-muted-foreground">{t("historyFailed")}</p>
          <button type="button" onClick={() => void query.refetch()} className={`${pill} border border-[#d9dfd4]`}>{t("retry")}</button>
        </div>
      ) : !latest ? (
        <div className="text-center sm:text-start">
          <p className="text-lg font-medium text-foreground">{t("madeItTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("madeItSubtitle")}</p>
          <button type="button" onClick={() => void record()} disabled={saving} aria-busy={saving} data-testid="button-made-it"
            className={`${pill} mt-3 w-full bg-[#42624e] text-base text-white shadow-sm transition hover:bg-[#385540] active:scale-[0.98] disabled:opacity-70 sm:w-auto sm:px-6`}>
            {saving ? t("saving") : t("madeItCta")}
          </button>
        </div>
      ) : (
        <>
          <div role="status" aria-live="polite" className="flex flex-wrap items-start justify-between gap-2">
            {justMade === latest.id ? (
              <div key={justMade} className="animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none" data-testid="cooking-celebration">
                <p className="text-lg font-medium text-foreground">{t("madeItDone")}</p>
                <p className="text-sm text-muted-foreground">{t("madeItSubtitle")}</p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-medium text-foreground" data-testid="text-cooked-count">{madeCount(count)}</p>
                {lastCookedAt && <p className="text-sm text-muted-foreground" data-testid="text-last-cooked">{t("lastCooked", { date: date(lastCookedAt) })}</p>}
              </div>
            )}
            {justMade === latest.id && (
              <button type="button" onClick={() => void undo()} disabled={saving} data-testid="button-undo-cooked"
                className={`min-h-11 rounded px-2 text-sm font-medium text-[#42624e] underline underline-offset-2 disabled:opacity-50 ${focus}`}>{t("undo")}</button>
            )}
          </div>
          <div className="mt-4" data-testid="cooking-session-latest">
            <SessionEditor key={latest.id} session={latest} onPatch={update => patchSession(latest.id, update)} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t hairline pt-3">
            <p className="text-xs text-muted-foreground">{t("privateNote")}</p>
            <button type="button" onClick={() => void record()} disabled={saving} data-testid="button-made-again"
              className={`${pill} border border-[#42624e] text-[#42624e] hover:bg-[#f2f6ef] disabled:opacity-50`}>{saving && !justMade ? t("saving") : t("madeAgain")}</button>
          </div>
          {earlier.length > 0 && (
            <div className="mt-3 border-t hairline pt-3">
              <h3 className="text-sm font-medium text-foreground">{t("earlierTimes")}</h3>
              <ul className="mt-1 divide-y divide-[#e6ebe2]">
                {earlier.map(session => (
                  <li key={session.id}>
                    <details className="group" data-testid={`cooking-session-${session.id}`}>
                      <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded text-sm ${focus}`}>
                        <span>{date(session.cookedAt)}</span>
                        {session.rating && <StarRating value={session.rating} onChange={() => {}} readOnly size="sm" />}
                      </summary>
                      <div className="pb-3"><SessionEditor session={session} onPatch={update => patchSession(session.id, update)} /></div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{t("madeItFailed")}</p>}
    </section>
  );
}

function SessionEditor({ session, onPatch }: { session: CookingSession; onPatch: (update: (s: CookingSession) => CookingSession) => void }) {
  const { t, date } = useCookingCopy();
  const [ratingError, setRatingError] = useState(false);
  const rate = async (rating: number) => {
    const previous = session.rating;
    setRatingError(false);
    onPatch(s => ({ ...s, rating }));
    try { const saved = await updateCooking(session.id, { rating }); onPatch(s => ({ ...s, rating: saved.rating, updatedAt: saved.updatedAt })); }
    catch { onPatch(s => ({ ...s, rating: previous })); setRatingError(true); }
  };
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-medium text-foreground" aria-hidden="true">{t("howWasIt")}</p>
        <StarRating value={session.rating} label={t("howWasIt")} onChange={value => void rate(value)} />
        {ratingError && <p role="alert" className="mt-1 text-xs text-red-600">{t("saveFailed")}</p>}
      </div>
      <Notes session={session} onPatch={onPatch} />
      <Photos session={session} onPatch={onPatch} date={date(session.cookedAt)} />
    </div>
  );
}

// Autosaves after a pause in typing, on blur and when leaving the page. Saves run one at a time, in order.
function Notes({ session, onPatch }: { session: CookingSession; onPatch: (update: (s: CookingSession) => CookingSession) => void }) {
  const { t } = useCookingCopy();
  const [notes, setNotes] = useState(session.notes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const latest = useRef(notes);
  const saved = useRef(notes);
  const queue = useRef(Promise.resolve());
  const save = () => {
    queue.current = queue.current.then(async () => {
      const value = latest.current;
      if (value === saved.current) return;
      setStatus("saving");
      try {
        const result = await updateCooking(session.id, { notes: value });
        saved.current = value;
        onPatch(s => ({ ...s, notes: result.notes, updatedAt: result.updatedAt }));
        setStatus(latest.current === value ? "saved" : "saving");
      } catch { setStatus("error"); }
    });
  };
  useEffect(() => {
    latest.current = notes;
    const timer = setTimeout(save, NOTES_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [notes]);
  useEffect(() => () => { if (latest.current !== saved.current) save(); }, []);
  const id = `notes-${session.id}`;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">{t("myNotes")}</label>
        <span className="text-xs text-muted-foreground" aria-live="polite" data-testid="notes-status">
          {status === "saving" ? t("saving") : status === "saved" ? t("saved") : status === "error" ? (
            <button type="button" onClick={save} className={`text-red-600 underline underline-offset-2 ${focus}`}>{t("saveFailed")} {t("retry")}</button>
          ) : null}
        </span>
      </div>
      <textarea id={id} value={notes} maxLength={4000} rows={3} placeholder={t("notesPlaceholder")} data-testid="input-cooking-notes"
        onChange={event => { setNotes(event.target.value); setStatus("idle"); }} onBlur={save}
        className="block w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed" />
    </div>
  );
}

function Photos({ session, onPatch, date }: { session: CookingSession; onPatch: (update: (s: CookingSession) => CookingSession) => void; date: string }) {
  const { t } = useCookingCopy();
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const add = async (files: File[]) => {
    setUploading(true); setFailed(false);
    for (const file of files) {
      try {
        const id = await addCookingPhoto(session.id, file);
        onPatch(s => ({ ...s, photoIds: [...s.photoIds, id] }));
      } catch { setFailed(true); }
    }
    setUploading(false);
  };
  const remove = async (id: string) => {
    try {
      await deleteCookingPhoto(id);
      onPatch(s => ({ ...s, photoIds: s.photoIds.filter(p => p !== id) }));
      setConfirmDelete(null);
    } catch { setFailed(true); setConfirmDelete(null); }
  };
  const alt = t("photoAlt", { date });
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{t("myPhotos")}</p>
      {session.photoIds.length > 0 && (
        <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="cooking-photos">
          {session.photoIds.map(id => (
            <li key={id} className="relative aspect-square overflow-hidden rounded-md bg-foreground/5">
              <button type="button" onClick={() => setPreview(id)} className={`h-full w-full ${focus}`} data-testid={`button-photo-${id}`}>
                <img src={cookingPhotoURL(id, true)} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </button>
              <button type="button" onClick={() => setConfirmDelete(id)} aria-label={t("deletePhoto")} data-testid={`button-delete-photo-${id}`}
                className={`absolute end-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70 ${focus}`}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className={`${pill} cursor-pointer border border-[#d9dfd4] bg-white text-[#42624e] hover:bg-[#f2f6ef] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#496c5a] ${uploading ? "pointer-events-none opacity-60" : ""}`}>
        <ImagePlus className="h-4 w-4" aria-hidden="true" />
        <span aria-live="polite">{uploading ? t("addingPhoto") : t("addPhoto")}</span>
        <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading} data-testid="input-cooking-photo"
          onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void add(files); }} />
      </label>
      {failed && <p role="alert" className="mt-1 text-xs text-red-600">{t("photoFailed")}</p>}

      <Dialog open={preview !== null} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {preview && <img src={cookingPhotoURL(preview)} alt={alt} className="max-h-[80vh] w-full rounded object-contain" data-testid="img-photo-preview" />}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete !== null} onOpenChange={open => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deletePhotoTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deletePhotoBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11 bg-red-600 text-white hover:bg-red-700" data-testid="button-confirm-delete-photo"
              onClick={event => { event.preventDefault(); if (confirmDelete) void remove(confirmDelete); }}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
