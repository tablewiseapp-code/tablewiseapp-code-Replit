import { useMutation, useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { myRecipesKey, setRecipeLiked, type MyRecipes } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";

/** Private like for one recipe. Updates the list at once and rolls back if the save fails. */
export function RecipeLikeButton({ recipeId }: { recipeId: string }) {
  const { t } = useI18n();
  const mine = useQuery<MyRecipes>({ queryKey: myRecipesKey }).data;
  const liked = mine?.liked.includes(recipeId) ?? false;
  const toggle = useMutation({
    mutationFn: (next: boolean) => setRecipeLiked(recipeId, next),
    onMutate: (next: boolean) => {
      const before = queryClient.getQueryData<MyRecipes>(myRecipesKey);
      if (before) queryClient.setQueryData<MyRecipes>(myRecipesKey, {
        ...before, liked: next ? [recipeId, ...before.liked] : before.liked.filter(id => id !== recipeId),
      });
      return before;
    },
    onError: (_error, _next, before) => { if (before) queryClient.setQueryData(myRecipesKey, before); },
  });
  return (
    <button type="button" aria-pressed={liked} aria-label={liked ? t("recipes.unlike") : t("recipes.like")}
      title={liked ? t("recipes.unlike") : t("recipes.like")} disabled={!mine}
      onClick={e => { e.preventDefault(); e.stopPropagation(); toggle.mutate(!liked); }}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      data-testid={`button-like-${recipeId}`}>
      <Heart className={liked ? "h-5 w-5 fill-current text-primary" : "h-5 w-5"} aria-hidden="true" />
    </button>
  );
}
