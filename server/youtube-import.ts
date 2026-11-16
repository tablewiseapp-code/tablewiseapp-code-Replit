import { and, eq } from "drizzle-orm";
import { recipes, recipeSources, type Recipe, type RecipeSource, type RecipeSourceStatus } from "@shared/schema";
import type { YouTubeVideo } from "@shared/youtube";

type Database = Omit<typeof import("./db").db, "$client">;
type Content = Pick<Recipe, "title" | "ingredients" | "steps" | "sourceUrl">;

/** The seam for real extraction: swap this for a call to the extraction pipeline. No transcription or scraping yet. */
export type Extractor = (video: YouTubeVideo) => Promise<{ status: RecipeSourceStatus; recipe: Content }>;

export const mockExtractor: Extractor = async video => ({
  status: "mock",
  recipe: {
    title: "YouTube recipe — preview",
    // Clearly fictional sample content; nothing here comes from the video.
    ingredients: ["Sample ingredient: 2 cups imaginary flour", "Sample ingredient: 1 pinch of pretend salt", "Sample ingredient: 3 made-up tomatoes"],
    steps: ["Sample step: gather the sample ingredients.", "Sample step: combine them in a pretend bowl.", "Sample step: serve this sample dish to nobody."],
    sourceUrl: video.canonicalUrl,
  },
});

export type YouTubeImportStore = {
  /** Creates the recipe and its source together, or returns the owner's existing import of this video. */
  importVideo(ownerId: string, originalUrl: string, video: YouTubeVideo): Promise<{ recipeId: string; existing: boolean }>;
  forRecipe(recipeId: string): Promise<Pick<RecipeSource, "provider" | "canonicalUrl" | "externalVideoId" | "status"> | undefined>;
};

export function databaseYouTubeImportStore(extract: Extractor = mockExtractor, connection?: Database): YouTubeImportStore {
  const database = async () => connection ?? (await import("./db")).db;
  const mine = (ownerId: string, videoId: string) => and(eq(recipeSources.ownerId, ownerId),
    eq(recipeSources.provider, "youtube"), eq(recipeSources.externalVideoId, videoId));
  const find = async (db: Database, ownerId: string, videoId: string) =>
    (await db.select({ recipeId: recipeSources.recipeId }).from(recipeSources).where(mine(ownerId, videoId)))[0]?.recipeId;
  return {
    async importVideo(ownerId, originalUrl, video) {
      const db = await database();
      const found = await find(db, ownerId, video.videoId);
      if (found) return { recipeId: found, existing: true };
      const { status, recipe } = await extract(video);
      try {
        // One transaction: a failure in either insert leaves neither row behind.
        const recipeId = await db.transaction(async tx => {
          const [created] = await tx.insert(recipes).values(recipe).returning({ id: recipes.id });
          await tx.insert(recipeSources).values({ recipeId: created.id, ownerId, provider: "youtube", originalUrl,
            canonicalUrl: video.canonicalUrl, externalVideoId: video.videoId, status });
          return created.id;
        });
        return { recipeId, existing: false };
      } catch (error: any) {
        // A concurrent request for the same video won the unique index; its recipe is the one to open.
        if (error?.code === "23505") {
          const raced = await find(db, ownerId, video.videoId);
          if (raced) return { recipeId: raced, existing: true };
        }
        throw error;
      }
    },
    async forRecipe(recipeId) {
      const [source] = await (await database()).select({ provider: recipeSources.provider, canonicalUrl: recipeSources.canonicalUrl,
        externalVideoId: recipeSources.externalVideoId, status: recipeSources.status })
        .from(recipeSources).where(eq(recipeSources.recipeId, recipeId));
      return source;
    },
  };
}
