import "dotenv/config";
import express, { type Express } from "express";
import { developmentCatalogEnabled, developmentRecipeReadOnly, curateDevelopmentCatalog, curateDevelopmentRecipe } from "./seeds/curated-development-catalog";
import { recipeCreditInput } from "../shared/recipe-credit";
import { createServer, type Server } from "http";
import type { IStorage } from "./storage";
import { isMissingPreparationColumn } from "./storage";
import OpenAI, { toFile } from "openai";
import { installPilotSecurity, pilotConfig, type PilotConfig } from "./security";
import { recipeInput, recipePatch, recipeId, parseInput, audioInput } from "./request-schemas";
import { analyticsBatchSchema, validEventTimes } from "../shared/pilot-analytics";
import { pilotEventStore, AnalyticsCapacityError, type PilotEventStore } from "./pilot-analytics";
import type { NutritionEnricher } from "./recipe-nutrition";
import type { NutritionInput } from "../shared/recipe-nutrition";

export type RecipeStorage = Pick<IStorage, "getAllRecipes" | "getRecipe" | "createRecipe" | "updateRecipe" | "updateRecipeCredit" | "deleteRecipe">;
export type RouteDependencies = {
  storage?: RecipeStorage;
  nutrition?: NutritionEnricher;
  config?: PilotConfig;
  ai?: () => OpenAI;
  now?: () => number;
  analytics?: Pick<PilotEventStore, "record" | "summary">;
};

function inferAudioFileExtension(mimeType?: string): "webm" | "mp3" | "mp4" | "wav" | "ogg" {
  if (!mimeType) return "webm";
  const normalized = mimeType.toLowerCase();

  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "mp4";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";

  return "webm";
}

async function verifyTranscriptText(
  openai: OpenAI,
  transcript: string,
  language?: string,
): Promise<string> {
  if (!transcript.trim()) return transcript;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_completion_tokens: 2048,
    messages: [
      {
        role: "system",
        content: `You correct speech-to-text transcripts.
- Keep the original language.
- Do not translate.
- Preserve meaning exactly.
- Fix obvious word errors, spelling, grammar, and punctuation.
- Do not add new facts or extra explanations.
- Return only the corrected transcript text.`,
      },
      {
        role: "user",
        content: `Language hint: ${language || "auto"}\n\nTranscript:\n${transcript}`,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || transcript;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  dependencies: RouteDependencies = {},
): Promise<Server> {
  const config = dependencies.config ?? pilotConfig();
  const developmentCredits = developmentCatalogEnabled() && !config.production;
  const security = installPilotSecurity(app, config, dependencies.now, developmentCredits);
  const storage = dependencies.storage ?? (await import("./storage")).storage;
  // Development-only saved reads. No model calls, migrations or public paid endpoint.
  // Custom storage adapters must supply their own corresponding nutrition reader.
  const nutrition = developmentCredits
    ? dependencies.nutrition ?? (!dependencies.storage
      ? await (await import("./recipe-nutrition")).databaseNutritionEnricher() : undefined)
    : undefined;
  const withNutrition = async <T extends NutritionInput>(rows: T[]) => nutrition ? nutrition(rows) : rows;
  let client: OpenAI | undefined;
  const getAI = () => {
    if (dependencies.ai) return dependencies.ai();
    const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY;
    if (!apiKey) throw new Error("AI is not configured");
    return client ??= new OpenAI({ apiKey, timeout: 20_000, maxRetries: 0 });
  };
  app.use("/api", (req, res, next) => {
    if (["POST", "PATCH", "PUT"].includes(req.method) && !req.is("application/json")) {
      return res.status(415).json({ error: "Use application/json." });
    }
    if (/^\/transcribe-audio\/?$/i.test(req.path)) return next();
    if (/^\/analytics\/events\/?$/i.test(req.path)) return express.json({ limit: "16kb", inflate: false })(req, res, next);
    express.json({ limit: "64kb", inflate: false })(req, res, next);
  });
  const analytics = dependencies.analytics ?? pilotEventStore;
  app.post("/api/analytics/events", async (req, res) => {
    const parsed = analyticsBatchSchema.safeParse(req.body);
    if (!parsed.success || !validEventTimes(parsed.data, (dependencies.now ?? Date.now)())) {
      return res.status(400).json({ error: "Invalid pilot event batch." });
    }
    if (!security.analyticsPilotPermit(parsed.data.pilotId, res)) return;
    try {
      await analytics.record(parsed.data);
      res.status(204).end();
    } catch (error) {
      console.error("api_failure operation=pilot_event_write");
      res.status(error instanceof AnalyticsCapacityError ? 503 : 500).json({ error: "Pilot analytics is unavailable." });
    }
  });
  app.get("/api/analytics/summary", async (_req, res) => {
    try { res.json(await analytics.summary()); }
    catch {
      console.error("api_failure operation=pilot_summary");
      res.status(503).json({ error: "Pilot analytics is unavailable." });
    }
  });
  app.use("/api/recipes/:id", (req, res, next) => {
    if (!recipeId.safeParse(req.params.id).success) {
      return res.status(400).json({ error: "Invalid recipe identifier." });
    }
    if (["PATCH", "PUT", "DELETE"].includes(req.method) && developmentRecipeReadOnly(req.params.id)) {
      return res.status(409).json({ error: "The curated development recipes are read-only. Stored recipes are preserved." });
    }
    next();
  });
  app.get("/api/recipes", async (_req, res) => {
    try {
      const recipes = await storage.getAllRecipes();
      res.json(await withNutrition(developmentCatalogEnabled() ? curateDevelopmentCatalog(recipes) : recipes));
    } catch (error: any) {
      console.error("api_failure operation=recipe_list");
      res.status(500).json({ error: "Failed to fetch recipes" });
    }
  });

  app.get("/api/recipes/:id", async (req, res) => {
    try {
      const recipe = await storage.getRecipe(req.params.id);
      if (!recipe) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      res.json((await withNutrition([developmentCatalogEnabled() ? curateDevelopmentRecipe(recipe) : recipe]))[0]);
    } catch (error: any) {
      console.error("api_failure operation=recipe_get");
      res.status(500).json({ error: "Failed to fetch recipe" });
    }
  });

  app.patch("/api/development/recipe-credits/:id", async (req, res) => {
    if (!developmentCredits) return res.status(404).json({ error: "Not found." });
    const id = recipeId.safeParse(req.params.id);
    const parsed = recipeCreditInput.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: "Choose Chef with a name, or Mine with an optional name." });
    try {
      const updated = await storage.updateRecipeCredit(id.data, parsed.data);
      if (!updated) return res.status(404).json({ error: "Recipe not found." });
      res.json((await withNutrition([curateDevelopmentRecipe(updated)]))[0]);
    } catch {
      console.error("api_failure operation=recipe_credit_update");
      res.status(503).json({ error: "Unable to save the recipe credit. No recipe contents were changed." });
    }
  });

  app.post("/api/recipes", async (req, res) => {
    try {
      const parsed = recipeInput.parse(req.body);
      const recipe = await storage.createRecipe(parsed);
      res.status(201).json(recipe);
    } catch (error: any) {
      console.error("api_failure operation=recipe_create");
      if (isMissingPreparationColumn(error)) {
        return res.status(503).json({ error: "Recipe timing storage needs setup. No changes were saved." });
      }
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid recipe data" });
      }
      res.status(500).json({ error: "Failed to create recipe" });
    }
  });

  app.patch("/api/recipes/:id", async (req, res) => {
    try {
      const data = recipePatch.safeParse(req.body);
      if (!data.success) return res.status(400).json({ error: "Invalid recipe data" });
      const recipe = await storage.updateRecipe(req.params.id, data.data);
      if (!recipe) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      res.json(recipe);
    } catch (error: any) {
      console.error("api_failure operation=recipe_update");
      if (isMissingPreparationColumn(error)) {
        return res.status(503).json({ error: "Recipe timing storage needs setup. No changes were saved." });
      }
      res.status(500).json({ error: "Failed to update recipe" });
    }
  });

  app.delete("/api/recipes/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteRecipe(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("api_failure operation=recipe_delete");
      res.status(500).json({ error: "Failed to delete recipe" });
    }
  });

  app.post("/api/transcribe-audio", express.json({ limit: "6mb", inflate: false }), security.aiPermit, async (req, res) => {
    try {
      const input = audioInput.safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: "Invalid audio input." });
      const { audio, mimeType, language, verifyText } = input.data;
      const audioBuffer = Buffer.from(audio, "base64");
      if (!audioBuffer.length) {
        return res.status(400).json({ error: "Audio data is invalid" });
      }

      const fileExt = inferAudioFileExtension(mimeType);
      const file = await toFile(audioBuffer, `dictation.${fileExt}`);
      const openai = getAI();
      const response = await openai.audio.transcriptions.create({
        model: "gpt-4o-mini-transcribe",
        file,
        ...(typeof language === "string" && language.length > 0 ? { language } : {}),
      });

      const rawTranscript = (response.text ?? "").trim();
      if (rawTranscript.length > 12000) return res.status(502).json({ error: "Transcript exceeds supported length." });
      const shouldVerify = verifyText !== false;

      if (!rawTranscript || !shouldVerify) {
        return res.json({ transcript: rawTranscript, rawTranscript });
      }

      let transcript = rawTranscript;
      try {
        transcript = await verifyTranscriptText(
          openai,
          rawTranscript,
          typeof language === "string" ? language : undefined,
        );
      } catch (verificationError: any) {
        // Fallback to the original transcript if cleanup fails.
        console.error("api_failure operation=transcript_verify");
      }

      res.json({ transcript, rawTranscript });
    } catch (error: any) {
      console.error("api_failure operation=audio_transcribe");
      res.status(502).json({ error: "Failed to transcribe audio" });
    } finally {
      res.locals.releaseAI();
    }
  });

  app.post("/api/parse-recipe", security.aiPermit, async (req, res) => {
    try {
      const input = parseInput.safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: "Invalid transcript text." });
      const { transcript } = input.data;
      const openai = getAI();
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a recipe parser. The user will give you a spoken recipe transcript. Extract and return a structured recipe as JSON with exactly this format:
{
  "title": "Recipe Name",
  "ingredients": ["ingredient 1 with quantity", "ingredient 2 with quantity"],
  "steps": ["Step 1 description", "Step 2 description"],
  "cookTime": 30,
  "servings": "3-4",
  "tags": ["kidFriendly", "vegetarian", "glutenFree"]
}

Rules:
- "title": A clear, concise recipe name
- "ingredients": Each item should include quantity and unit if mentioned (e.g. "200g rice", "2 tbsp olive oil", "1 large onion, diced")
- "steps": Clear, numbered cooking instructions. Each step should be a complete sentence.
- "cookTime": Estimated total cooking time in minutes (integer)
- "servings": Estimated servings as a range like "1-2", "3-4", or "5+"
- "tags": Only include tags that apply from this list: "kidFriendly", "vegetarian", "glutenFree"
- If information is missing, make reasonable assumptions based on the recipe
- Return ONLY valid JSON, no markdown or extra text`
          },
          {
            role: "user",
            content: transcript.trim()
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: "No response from AI" });
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        return res.status(500).json({ error: "AI returned invalid format. Please try again." });
      }
      const output = recipeInput.safeParse(parsed);
      if (!output.success) return res.status(502).json({ error: "AI returned an invalid recipe." });
      res.json(output.data);
    } catch (error: any) {
      console.error("api_failure operation=recipe_parse");
      res.status(502).json({ error: "Failed to parse recipe" });
    } finally {
      res.locals.releaseAI();
    }
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
  return httpServer;
}
