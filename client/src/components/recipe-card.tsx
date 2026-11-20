import type { ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { recipePhoto } from "@/lib/recipe-photo";
import { useRecipeTranslations } from "@/lib/recipe-translation";
import type { RecipeView } from "@/lib/basic-settings";
import type { RecipeTimeMode } from "@/lib/recipe-time";
import { RecipeMeta, RecipeViewRows, type RecipeViewData } from "./recipe-summary";

export type RecipeCardData = RecipeViewData & { title: string; image?: string | null; ingredients?: readonly string[] | null };

/**
 * The one recipe card: photo (or a labelled example photo), title, time and servings, then Settings → Recipe View.
 * The title opens the recipe and covers the whole card; `corner` (the like button) and `children` (credit, actions) sit above it.
 * Change the look here, not at the call sites.
 */
export function RecipeCard({ recipe, href, onOpen, corner, children, mode, servings, view, photo = true, testId, titleTestId, ids = {} }: {
  recipe: RecipeCardData;
  /** Where the title goes; or `onOpen` for a card that opens a dialog instead of a page. */
  href?: string; onOpen?: () => void;
  corner?: ReactNode; children?: ReactNode;
  mode?: RecipeTimeMode; servings?: string | null; view?: RecipeView; photo?: boolean;
  testId?: string; titleTestId?: string;
  /** Test ids of the parts, for the existing browser tests. */
  ids?: { meta?: string; view?: string; img?: string; example?: string };
}) {
  const { t } = useI18n();
  const translated = useRecipeTranslations().get(recipe.id)?.title;
  const image = photo ? recipePhoto({ ...recipe, ingredients: recipe.ingredients ?? [] }) : null;
  const stretch = "after:absolute after:inset-0 after:rounded-[20px] after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-[3px] focus-visible:after:outline-offset-[3px] focus-visible:after:outline-ring";
  const title = <span className="break-words" data-testid={titleTestId}>{translated ?? recipe.title}</span>;
  return (
    <article className="relative flex h-full flex-col rounded-[20px] border border-border bg-card text-card-foreground shadow-md shadow-foreground/5" data-testid={testId}>
      {image && <figure className="relative m-0">
        <img src={image.src} alt="" loading="lazy" decoding="async" data-testid={ids.img}
          className="image-fade-in block aspect-[1.96] w-full rounded-t-[20px] object-cover"
          onLoad={e => e.currentTarget.classList.add("image-loaded")}
          onError={e => { e.currentTarget.parentElement!.hidden = true; }} />
        {image.example && <figcaption className="absolute bottom-2.5 start-3 rounded-md bg-foreground/90 px-2 py-0.5 text-[11px] text-background"
          data-testid={ids.example}>{t("recipe.examplePhoto")}</figcaption>}
      </figure>}
      <div className={`flex flex-1 flex-col px-5 pb-5 pt-[18px] ${corner && !image ? "pe-16" : ""}`}>
        <h3 className="mb-2.5 text-[1.38rem] font-semibold leading-tight tracking-[-0.035em]">
          {href ? <Link href={href} className={stretch}>{title}</Link>
            : onOpen ? <button type="button" onClick={onOpen} className={`text-start ${stretch}`}>{title}</button> : title}
        </h3>
        <RecipeMeta recipe={servings ? { ...recipe, servings } : recipe} mode={mode} testId={ids.meta} />
        <RecipeViewRows recipe={recipe} view={view} testId={ids.view} />
        {children && <div className="relative z-10 mt-auto flex flex-col gap-3 pt-3">{children}</div>}
      </div>
      {corner && <div className="absolute end-3 top-3 z-10 rounded-full bg-card shadow-md shadow-foreground/10">{corner}</div>}
    </article>
  );
}
