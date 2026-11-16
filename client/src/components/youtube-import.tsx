import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { embedUrl, parseYouTubeUrl } from "@shared/youtube";

type Source = { provider: "youtube"; canonicalUrl: string; externalVideoId: string; status: string };

/** Paste a YouTube link, save it (server creates the recipe + source in one transaction) and open the recipe. */
export function YouTubeImport() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    if (!parseYouTubeUrl(url)) return setError(t("youtube.invalid"));
    busy.current = true; setSaving(true); setError(null);
    try {
      const res = await fetch("/api/recipe-sources/youtube", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.recipeId) throw new Error(res.status === 400 ? t("youtube.invalid") : t("youtube.failed"));
      setLocation(`/recipe/${body.recipeId}`);
    } catch (err: any) {
      setError(err.message || t("youtube.failed"));
      busy.current = false; setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mb-6 space-y-3 p-4" data-testid="youtube-import" noValidate>
      <label htmlFor="youtube-url" className="block text-sm font-medium text-foreground">{t("youtube.label")}</label>
      <input id="youtube-url" type="url" inputMode="url" value={url} disabled={saving} placeholder={t("youtube.placeholder")}
        onChange={e => { setUrl(e.target.value); setError(null); }} aria-invalid={error ? true : undefined}
        aria-describedby={error ? "youtube-url-error" : undefined} data-testid="input-youtube-url"
        className={`w-full rounded-lg border bg-background px-4 py-3 text-sm focus-ring-quiet ${error ? "border-red-300" : "hairline"}`} />
      {error && <p id="youtube-url-error" role="alert" className="text-xs text-red-500" data-testid="youtube-import-error">{error}</p>}
      <button type="submit" disabled={saving || !url.trim()} aria-busy={saving} className="btn btn-primary" data-testid="button-import-youtube">
        {saving ? t("youtube.saving") : t("youtube.button")}
      </button>
    </form>
  );
}

/** Preview notice + compact embedded player. Renders nothing for recipes without a source. Loaded only on the detail page. */
export function RecipeVideo({ recipeId }: { recipeId: string }) {
  const { t } = useI18n();
  const [source, setSource] = useState<Source | null>(null);
  useEffect(() => {
    let live = true;
    setSource(null);
    fetch(`/api/recipes/${encodeURIComponent(recipeId)}/source`)
      .then(r => (r.ok ? r.json() : null)).then(v => { if (live) setSource(v); }).catch(() => {});
    return () => { live = false; };
  }, [recipeId]);
  if (!source || source.provider !== "youtube") return null;
  return (
    <section className="mt-6 space-y-3" aria-label={t("youtube.playerTitle")} data-testid="recipe-video">
      {source.status === "mock" && <p className="card p-3 text-sm text-muted-foreground" role="note" data-testid="text-preview-notice">{t("youtube.notice")}</p>}
      <div className="aspect-video w-full max-w-[360px] overflow-hidden rounded-lg border hairline bg-muted">
        <iframe src={embedUrl(source.externalVideoId)} title={t("youtube.playerTitle")} loading="lazy" className="h-full w-full border-0"
          allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen data-testid="youtube-player" />
      </div>
      <a href={source.canonicalUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline" data-testid="link-watch-on-youtube">{t("youtube.watch")}</a>
    </section>
  );
}
