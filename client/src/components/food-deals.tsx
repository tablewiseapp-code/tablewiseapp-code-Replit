import { useState } from "react";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { builtInDealCategories, foodDeals, suggestedDealCategories, type FoodDeal } from "@/lib/food-deals";
import { usePlannerCopy } from "@/lib/planner-copy";
import { useWeekFilterCopy } from "@/lib/week-filter-copy";

// A category is a built-in key ("protein") or a name the person typed ("custom:Snacks").
// ponytail: added categories live in component state for this visit only; persist per owner when deals become real.
const CUSTOM = "custom:";

export function FoodDeals({ activeDeal, onShowRecipes }: { activeDeal: string | null; onShowRecipes: (dealId: string) => void }) {
  const c = useWeekFilterCopy();
  const [categories, setCategories] = useState<string[]>([...builtInDealCategories]);
  const [selected, setSelected] = useState<string>("protein");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const label = (category: string) => category.startsWith(CUSTOM) ? category.slice(CUSTOM.length) : c(`cat_${category}`);
  const has = (text: string) => categories.some(category => label(category).trim().toLocaleLowerCase() === text.trim().toLocaleLowerCase());

  const add = (category: string) => {
    const text = label(category).trim();
    if (!text) { setError(c("blankCategory")); return; }
    if (has(text)) { setError(c("duplicateCategory")); return; }
    setCategories(prev => [...prev, category]);
    setSelected(category);
    setAdding(false);
  };
  const open = () => { setName(""); setError(""); setAdding(true); };
  const offers = foodDeals.filter(deal => deal.category === selected);

  return (
    <section className="card mb-6 p-4" aria-labelledby="food-deals-title" data-testid="food-deals">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 id="food-deals-title" className="text-base font-medium text-foreground">{c("foodDeals")}</h2>
        <span className="tag" data-testid="sample-deals">{c("sampleDeals")}</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={c("categories")} className="flex flex-wrap gap-2">
          {categories.map(category => (
            <button key={category} type="button" role="tab" aria-selected={category === selected} aria-controls="food-deals-panel"
              onClick={() => setSelected(category)} className="chip" data-testid={`deal-tab-${category}`}>{label(category)}</button>
          ))}
        </div>
        <button type="button" onClick={open} aria-label={c("addCategory")} data-testid="button-add-deal-category"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground hover:bg-accent">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div id="food-deals-panel" role="tabpanel" aria-label={label(selected)}>
        {offers.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="deals-empty">{c("noDeals")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {offers.map(deal => (
              <li key={deal.id} className="flex flex-wrap items-center gap-3 py-2" data-testid={`deal-${deal.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-base text-foreground">{c(`deal_${deal.id}`)}</p>
                  <p className="text-sm text-muted-foreground"><bdi>{deal.store}</bdi> · <bdi className="tabular-nums">{c("perLb", { price: deal.price })}</bdi></p>
                </div>
                <button type="button" onClick={() => onShowRecipes(deal.id)} aria-pressed={activeDeal === deal.id}
                  className="btn btn-secondary shrink-0" data-testid={`deal-show-${deal.id}`}>{c("showRecipes")}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent data-testid="add-deal-category-dialog">
          <DialogHeader>
            <DialogTitle>{c("addCategory")}</DialogTitle>
            <DialogDescription>{c("suggestions")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {suggestedDealCategories.map(category => (
              <button key={category} type="button" onClick={() => add(category)} disabled={has(c(`cat_${category}`))}
                className="chip disabled:opacity-50" data-testid={`deal-suggestion-${category}`}>{c(`cat_${category}`)}</button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); add(`${CUSTOM}${name.trim()}`); }} className="space-y-2">
            <label htmlFor="deal-category-name" className="block text-sm text-muted-foreground">{c("customCategory")}</label>
            <input id="deal-category-name" value={name} onChange={e => { setName(e.target.value); setError(""); }} maxLength={40}
              placeholder={c("categoryPlaceholder")} aria-invalid={Boolean(error)} aria-describedby={error ? "deal-category-error" : undefined}
              className="w-full px-3 min-h-11 text-base border hairline rounded-lg bg-card focus-ring-quiet" data-testid="input-deal-category" />
            {error && <p id="deal-category-error" role="alert" className="text-sm text-destructive" data-testid="deal-category-error">{error}</p>}
            <DialogFooter className="gap-2">
              <button type="button" onClick={() => setAdding(false)} className="btn btn-secondary">{c("cancel")}</button>
              <button type="submit" className="btn btn-primary" data-testid="button-save-deal-category">{c("add")}</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** The Week's "Weekly deals · N offers" box: always open, with a pulsing dot (still under reduced motion), and absent when no offer applies to the shown week. */
export function WeekDeals({ offers, lang }: { offers: { deal: FoodDeal; dish: string | null }[]; lang: string }) {
  const c = useWeekFilterCopy();
  const t = usePlannerCopy();
  if (!offers.length) return null;
  const day = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <section className="mb-4 rounded-lg border border-border bg-white px-3" data-testid="week-deals">
      <h2 className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
        <span data-testid="week-deals-title">{offers.length === 1 ? t("dealsOne") : t("deals", { count: offers.length })}</span>
      </h2>
      <ul className="divide-y divide-border pb-2">
        {offers.map(({ deal, dish }) => (
          <li key={deal.id} className="flex flex-wrap items-center gap-3 py-2 text-sm" data-testid={`week-deal-${deal.id}`}>
            <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{c(`deal_${deal.id}`)}{dish && <span className="ms-2 text-primary" data-testid={`week-deal-dish-${deal.id}`}>{t("dealFor", { title: dish })}</span>}</p>
            <p className="text-muted-foreground"><bdi>{deal.store}</bdi> · <bdi className="tabular-nums">{c("perLb", { price: deal.price })}</bdi> · {deal.expires
              ? t("dealUntil", { date: day.format(new Date(`${deal.expires}T12:00:00Z`)) }) : t("dealSample")}</p>
            </div>
            <Link href={`/meals?browse&deal=${encodeURIComponent(deal.id)}`} className="btn btn-secondary shrink-0"
              data-testid={`week-deal-recipes-${deal.id}`}>{t("dealRecipes")}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
