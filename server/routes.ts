import "dotenv/config";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRecipeSchema } from "@shared/schema";
import OpenAI, { toFile } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY,
});

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/recipes", async (_req, res) => {
    try {
      const recipes = await storage.getAllRecipes();
      res.json(recipes);
    } catch (error: any) {
      console.error("Error fetching recipes:", error);
      res.status(500).json({ error: "Failed to fetch recipes" });
    }
  });

  app.get("/api/recipes/:id", async (req, res) => {
    try {
      const recipe = await storage.getRecipe(req.params.id);
      if (!recipe) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      res.json(recipe);
    } catch (error: any) {
      console.error("Error fetching recipe:", error);
      res.status(500).json({ error: "Failed to fetch recipe" });
    }
  });

  app.post("/api/recipes", async (req, res) => {
    try {
      const parsed = insertRecipeSchema.parse(req.body);
      const recipe = await storage.createRecipe(parsed);
      res.status(201).json(recipe);
    } catch (error: any) {
      console.error("Error creating recipe:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid recipe data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create recipe" });
    }
  });

  app.patch("/api/recipes/:id", async (req, res) => {
    try {
      const recipe = await storage.updateRecipe(req.params.id, req.body);
      if (!recipe) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      res.json(recipe);
    } catch (error: any) {
      console.error("Error updating recipe:", error);
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
      console.error("Error deleting recipe:", error);
      res.status(500).json({ error: "Failed to delete recipe" });
    }
  });

  app.post("/api/transcribe-audio", async (req, res) => {
    try {
      const { audio, mimeType, language } = req.body ?? {};

      if (!audio || typeof audio !== "string") {
        return res.status(400).json({ error: "Audio data is required" });
      }

      const audioBuffer = Buffer.from(audio, "base64");
      if (!audioBuffer.length) {
        return res.status(400).json({ error: "Audio data is invalid" });
      }

      const fileExt = inferAudioFileExtension(mimeType);
      const file = await toFile(audioBuffer, `dictation.${fileExt}`);
      const response = await openai.audio.transcriptions.create({
        model: "gpt-4o-mini-transcribe",
        file,
        ...(typeof language === "string" && language.length > 0 ? { language } : {}),
      });

      res.json({ transcript: response.text ?? "" });
    } catch (error: any) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ error: error.message || "Failed to transcribe audio" });
    }
  });

  app.post("/api/parse-recipe", async (req, res) => {
    try {
      const { transcript } = req.body;

      if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
        return res.status(400).json({ error: "Transcript text is required" });
      }

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
      res.json(parsed);
    } catch (error: any) {
      console.error("Error parsing recipe:", error);
      res.status(500).json({ error: error.message || "Failed to parse recipe" });
    }
  });

  return httpServer;
}
