import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { BookOpen, CalendarDays, Menu, Settings, ShoppingBasket, Sparkles } from "lucide-react";
import { LANGUAGES, useI18n } from "@/lib/i18n";
import { MobileNavSheet } from "@/components/layout/mobile-nav-sheet";

// Fixed order by expected use. Never reorder at runtime.
const PRIMARY = [
  { href: "/recipes", key: "nav.recipes", icon: BookOpen, id: "recipes" },
  { href: "/meals", key: "nav.week", icon: CalendarDays, id: "meals" },
  { href: "/grocery-list", key: "nav.groceries", icon: ShoppingBasket, id: "grocery-list" },
  { href: "/my-ideas", key: "nav.ideas", icon: Sparkles, id: "my-ideas" },
] as const;

/** Which destination owns a URL. A recipe opened from the planner (?week) belongs to Week. */
export function activeSection(path: string, search: string): string | null {
  if (path.startsWith("/recipe/") && new URLSearchParams(search).has("week")) return "meals";
  if (path === "/recipes" || path === "/import" || path === "/recipe-view" || path.startsWith("/recipe/")) return "recipes";
  if (path === "/" || path === "/plan" || path === "/meals") return "meals";
  if (path === "/grocery-list") return "grocery-list";
  if (path === "/my-ideas") return "my-ideas";
  if (path === "/settings") return "settings";
  return null;
}

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function LanguageSelector() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
        className={`min-h-11 rounded-full px-3 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground ${focus}`}
        data-testid="button-language-selector">
        {LANGUAGES.find(l => l.code === lang)?.nativeLabel}
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border hairline bg-background py-1 shadow-lg">
          {LANGUAGES.map(l => (
            <button type="button" key={l.code} onClick={() => { setLang(l.code); setOpen(false); }} aria-pressed={lang === l.code}
              className={`min-h-11 w-full px-3 text-start text-sm ${focus} ${lang === l.code ? "bg-foreground/5 font-medium" : "text-muted-foreground hover:bg-foreground/5"}`}
              data-testid={`button-lang-${l.code}`}>
              {l.nativeLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The one application navigation: header (desktop links + Settings, mobile menu) and the mobile bottom bar. */
export function AppNav() {
  const [path] = useLocation();
  const search = useSearch();
  const { t, lang, setLang } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const active = activeSection(path, search);
  const current = (id: string) => (active === id ? ("page" as const) : undefined);

  return (
    <>
      <header className="app-nav border-b hairline bg-background" data-testid="app-nav-header">
        <div className="app-container flex max-w-7xl items-center gap-2 py-2">
          <Link href="/" className={`me-4 inline-flex min-h-11 items-center rounded-md text-base font-semibold tracking-tight text-foreground ${focus}`} data-testid="app-nav-brand">
            TableWise
          </Link>
          <nav aria-label={t("nav.main")} className="hidden flex-1 items-center gap-1 sm:flex" data-testid="app-nav">
            {PRIMARY.map(item => (
              <Link key={item.id} href={item.href} aria-current={current(item.id)} data-testid={`app-nav-link-${item.id}`}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${focus} ${active === item.id
                  ? "border-primary bg-accent font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}>
                <item.icon className="h-4 w-4" aria-hidden="true" />{t(item.key)}
              </Link>
            ))}
          </nav>
          <div className="ms-auto hidden items-center gap-1 sm:flex">
            <Link href="/settings" aria-current={current("settings")} data-testid="app-nav-link-settings"
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${focus} ${active === "settings"
                ? "border-primary bg-accent font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}>
              <Settings className="h-4 w-4" aria-hidden="true" />{t("nav.settings")}
            </Link>
            <LanguageSelector />
          </div>
          <div className="ms-auto sm:hidden">
            <MobileNavSheet title={t("nav.menu")} open={menuOpen} onOpenChange={setMenuOpen}
              trigger={
                <button type="button" className={`inline-flex min-h-11 items-center gap-2 rounded-full border hairline px-4 text-sm ${focus}`}
                  data-testid="app-nav-menu-trigger">
                  <Menu className="h-4 w-4" aria-hidden="true" />{t("nav.menu")}
                </button>
              }>
              <Link href="/settings" aria-current={current("settings")} onClick={() => setMenuOpen(false)} data-testid="app-nav-menu-link-settings"
                className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm ${focus} ${active === "settings" ? "bg-accent font-semibold text-foreground" : "text-foreground hover:bg-foreground/5"}`}>
                <Settings className="h-4 w-4" aria-hidden="true" />{t("nav.settings")}
              </Link>
              <div className="flex flex-wrap gap-2 border-t hairline pt-3">
                {LANGUAGES.map(l => (
                  <button type="button" key={l.code} onClick={() => setLang(l.code)} aria-pressed={lang === l.code}
                    className={`min-h-11 rounded-full border px-4 text-sm ${focus} ${lang === l.code ? "bg-foreground text-background" : "text-muted-foreground"}`}
                    data-testid={`button-mobile-lang-${l.code}`}>
                    {l.nativeLabel}
                  </button>
                ))}
              </div>
            </MobileNavSheet>
          </div>
        </div>
      </header>

      <nav aria-label={t("nav.main")} data-testid="app-nav-bottom"
        className="app-nav fixed inset-x-0 bottom-0 z-40 border-t hairline bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="grid grid-cols-4">
          {PRIMARY.map(item => (
            <Link key={item.id} href={item.href} aria-current={current(item.id)} data-testid={`app-nav-bottom-link-${item.id}`}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] ${focus} focus-visible:-outline-offset-2 ${active === item.id
                ? "font-semibold text-foreground before:absolute before:inset-x-4 before:top-0 before:h-[3px] before:rounded-b before:bg-primary"
                : "text-muted-foreground"}`}>
              <item.icon className="h-5 w-5" strokeWidth={active === item.id ? 2.5 : 1.75} aria-hidden="true" />
              <span className="max-w-full truncate">{t(item.key)}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
