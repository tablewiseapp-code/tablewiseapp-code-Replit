import { useState, type FormEvent } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { useI18n } from "@/lib/i18n";
import { setGuestChoice, storageBlocked, switchPerson, useAccountCopy, type AccountCopyKey } from "@/lib/account-copy";

const field = "mt-2 block min-h-11 w-full rounded-full border border-input bg-card px-4 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const errors: Record<number, AccountCopyKey> = { 400: "invalid", 401: "wrongPassword", 429: "tooMany" };

export default function SignIn({ onGuest }: { onGuest: () => void }) {
  const { dir } = useI18n();
  const t = useAccountCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountCopyKey | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      if (response.ok) { setGuestChoice(false); return switchPerson(); }
      setError(errors[response.status] ?? "failed");
    } catch { setError("failed"); }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <PageContainer size="md" className="max-w-md py-8 sm:py-10">
        <h1 className="page-title" data-testid="text-page-title">{t("title")}</h1>
        <p className="page-subtitle">{t("intro")}</p>
        {storageBlocked() && <p role="alert" className="mt-4 text-sm font-medium text-destructive" data-testid="storage-blocked">{t("blocked")}</p>}
        <form onSubmit={submit} className="card mt-5 p-4">
          <label className="block text-base font-medium text-foreground">{t("email")}
            <input name="email" type="email" required maxLength={254} autoComplete="email" className={field} data-testid="input-email" />
          </label>
          <label className="mt-4 block text-base font-medium text-foreground">{t("password")}
            <input name="password" type="password" required minLength={8} maxLength={200} autoComplete="current-password" className={field} data-testid="input-password" />
          </label>
          <p className="mt-1 text-sm text-muted-foreground">{t("passwordHint")}</p>
          <p className="mt-3 text-sm text-muted-foreground">{t("newHere")}</p>
          {error && <p role="alert" className="mt-3 text-sm font-medium text-destructive" data-testid="sign-in-error">{t(error)}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary mt-4 w-full" data-testid="button-sign-in">{busy ? t("busy") : t("submit")}</button>
        </form>
        <button type="button" onClick={() => { setGuestChoice(true); onGuest(); }} className="btn btn-secondary mt-4 w-full" data-testid="button-guest">{t("guest")}</button>
        <p className="mt-2 text-center text-sm text-muted-foreground">{t("guestHint")}</p>
      </PageContainer>
    </div>
  );
}
