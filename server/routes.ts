import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPEN_API_KEY,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
