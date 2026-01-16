import { useState, useEffect } from "react";

export type RecipeUserMeta = {
  isMyPick: boolean;
  rating: number | null;
  ratedAt?: string;
};

const STORAGE_PREFIX = "recipe_user_meta_";

export function useRecipeUserMeta(recipeId: string) {
  const [meta, setMeta] = useState<RecipeUserMeta>(() => {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}${recipeId}`);
    return saved ? JSON.parse(saved) : { isMyPick: false, rating: null };
  });

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}${recipeId}`, JSON.stringify(meta));
  }, [meta, recipeId]);

  const toggleMyPick = () => {
    setMeta(prev => ({ ...prev, isMyPick: !prev.isMyPick }));
  };

  const setRating = (rating: number) => {
    setMeta(prev => ({
      ...prev,
      rating,
      ratedAt: new Date().toISOString()
    }));
  };

  return { meta, toggleMyPick, setRating };
}

export function getRecipeUserMeta(recipeId: string): RecipeUserMeta {
  const saved = localStorage.getItem(`${STORAGE_PREFIX}${recipeId}`);
  return saved ? JSON.parse(saved) : { isMyPick: false, rating: null };
}
