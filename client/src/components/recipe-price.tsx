import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { dishPriceTier, isEstimatedPrice, mockRecipePrice } from "@/lib/recipe-price";

export function RecipePriceSummary({ recipe, context = "detail" }: {
  recipe: { id: string; servings?: string | null }; context?: string;
}) {
  const { t, lang } = useI18n();
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const price = mockRecipePrice(recipe);
  const tier = price ? dishPriceTier(price.total) : null;
  if (!price || !tier) return <span title={t("price.unavailable")} aria-label={t("price.unavailable")}
    data-testid={`price-${context}-${recipe.id}`}>—</span>;
  const money = (value: number) => new Intl.NumberFormat(lang, {
    style: "currency", currency: price.currency, currencyDisplay: "code",
  }).format(value);
  const revealed = revealedId === recipe.id;
  const source = t(price.source === "mock" ? "price.mockDish" : price.source === "ai-estimate" ? "price.estimated" : "price.verified");
  return <span className="inline-flex shrink-0" data-testid={`price-${context}-${recipe.id}`}>
    <button type="button" aria-expanded={revealed} disabled={context === "drag"}
      aria-label={`${source}. ${revealed ? `${money(price.total)}. ${t("price.hide")}` : t("price.reveal")}`}
      title={`${source} · ${t("price.tierGuide")}`}
      data-testid={`price-button-${context}-${recipe.id}`} data-price-source={price.source}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setRevealedId(revealed ? null : recipe.id); }}
      className={`inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-full bg-foreground/5 px-2.5 text-xs text-foreground hover:bg-foreground/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${isEstimatedPrice(price) ? "font-bold" : "font-normal"}`}>
      {revealed ? money(price.total) : tier}
    </button>
  </span>;
}
