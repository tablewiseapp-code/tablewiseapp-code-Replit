import assert from "node:assert/strict";
import type OpenAI from "openai";

// Minimal browser localStorage for the client store.
const data = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, String(v)),
  removeItem: (k: string) => void data.delete(k),
};

const ideas = await import("../client/src/lib/my-ideas");
const { analyzePreferences, buildGenerationBrief, personalizationSignals: signalsSchema } = await import("../server/recipe-personalization");
const { buildRecipeGenerationContext, generateRecipe, generationRequest } = await import("../server/recipe-generation");

const recipe = (title: string, step = "Bake in the oven for 20 minutes.") => ({
  title, ingredients: ["2 eggs", "100 g cheese"], steps: [step], prepTime: 10, cookTime: 20, servings: "2", tags: ["ai-generated"],
});
const result = (title: string, step?: string) => ({ recipe: recipe(title, step), description: "d", meta: { generationRequestId: "req-1", model: "gpt-4o", promptVersion: "v" } });

// 1. Generated recipes persist as distinct records with metadata, newest first.
const a = ideas.saveIdea(result("Cheese bake"), { filterSet: "meals" });
const b = ideas.saveIdea(result("Cheese bake"), { filterSet: "meals" }); // regenerate: a new record, never a replacement
let list = ideas.listIdeas();
assert.deepEqual(list.map(i => i.id), [b.id, a.id]);
assert.notEqual(a.id, b.id);
assert.equal(a.origin, "ai_generated"); assert.equal(a.generationRequestId, "req-1"); assert.equal(a.generationModel, "gpt-4o");
assert.equal(a.isFavorite, false); assert.equal(a.recipeId, null);
assert.deepEqual(ideas.cookingMethods(a), ["Oven"]);

// 2. Favourites and plan status.
ideas.updateIdea(a.id, { isFavorite: true, recipeId: "r-1" });
assert.equal(ideas.listIdeas().find(i => i.id === a.id)!.isFavorite, true);
const saved = ideas.listIdeas().find(i => i.id === a.id)!;
assert.equal(ideas.isInPlan(saved, { selectedIds: [], planAssignments: [{ recipeId: "r-1", mealType: "Dinner", startDay: 1, spanDays: 1 }] }), true);
assert.equal(ideas.isInPlan(b, { selectedIds: ["r-1"], planAssignments: [] }), false, "unsaved ideas are never 'in plan'");

// 3. Events: recipe_generated recorded once per idea; anonymous session; no recording when off.
assert.equal(ideas.trackRecipeEvent("recipe_generated", a.id), true);
assert.equal(ideas.trackRecipeEvent("recipe_generated", a.id), false, "no duplicate");
assert.equal(ideas.trackRecipeEvent("recipe_favorited", a.id), true);
assert.equal(ideas.trackRecipeEvent("recipe_viewed", b.id), true);
const events = ideas.listActivity();
assert.equal(events.length, 3);
assert.ok(events.every(e => e.id && e.at && e.sessionId === events[0].sessionId));
ideas.setPersonalization(false);
assert.equal(ideas.trackRecipeEvent("recipe_viewed", a.id), false);
assert.equal(ideas.personalizationSignals(), undefined, "nothing is sent when off");
ideas.setPersonalization(true);

// 4. Signals are compact: titles and favourite-method counts only.
ideas.updateIdea(b.id, { isFavorite: true });
const signals = ideas.personalizationSignals()!;
assert.deepEqual(signals, { recentTitles: ["Cheese bake", "Cheese bake"], favoriteMethods: [{ method: "Oven", count: 2 }] });
assert.ok(signalsSchema.safeParse(signals).success);
assert.equal(signalsSchema.safeParse({ ...signals, events }).success, false, "raw logs are rejected");

// 5. Removing an idea deletes its events too; clearing activity deletes everything.
ideas.removeIdea(b.id);
assert.deepEqual(ideas.listIdeas().map(i => i.id), [a.id]);
assert.ok(ideas.listActivity().every(e => e.recipeId !== b.id));
ideas.clearActivity();
assert.deepEqual(ideas.listActivity(), []);

// 6. Analyzer: no history -> explicit filters only; weak evidence ignored; explicit method wins.
const empty = { maxMinutes: null, dietary: [], mealType: [], cookingMethod: [], proteinType: [], servings: null, mustInclude: [], mustExclude: [] };
const ctx = buildRecipeGenerationContext(empty as any, "total");
assert.deepEqual(await analyzePreferences(undefined, ctx), { learnedPreferences: {}, recommendationStrategy: {} });
const weak = await analyzePreferences({ recentTitles: [], favoriteMethods: [{ method: "Oven", count: 1 }] }, ctx);
assert.deepEqual(weak.learnedPreferences, {});
const strong = await analyzePreferences({ recentTitles: ["Cheese bake"], favoriteMethods: [{ method: "Oven", count: 4 }] }, ctx);
assert.equal(strong.learnedPreferences.cookingMethods![0].confidence, "medium");
assert.deepEqual(strong.recommendationStrategy.avoidTitles, ["Cheese bake"]);
const explicit = buildRecipeGenerationContext({ ...empty, cookingMethod: ["Stovetop"] } as any, "total");
assert.equal((await analyzePreferences({ recentTitles: [], favoriteMethods: [{ method: "Oven", count: 9 }] }, explicit)).learnedPreferences.cookingMethods, undefined);

// 7. Request schema accepts optional signals; the model receives a structured brief with hard constraints separate.
assert.ok(generationRequest.safeParse({ filterSet: "meals", filters: empty, timeMode: "total", personalization: signals }).success);
assert.ok(generationRequest.safeParse({ filterSet: "meals", filters: empty, timeMode: "total" }).success, "works without history");
const brief = buildGenerationBrief(ctx, strong);
assert.deepEqual(Object.keys(brief), ["hardConstraints", "explicitPreferences", "learnedPreferences", "mealContext", "recommendationStrategy"]);
const calls: any[] = [];
const ai = { chat: { completions: { async create(input: unknown) {
  calls.push(input);
  return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
    title: "Pan eggs", description: "d", servings: "2", prepTime: 5, cookTime: 10, mealTypes: ["dinner"], lunchbox: "none", dietary: [],
    ingredients: [{ quantity: "2", unit: "", name: "eggs" }], steps: ["Fry in a pan."] }) } }] };
} } } } as unknown as OpenAI;
await generateRecipe(ctx, () => ai, undefined, strong);
const sent = JSON.parse(calls[0].messages[1].content);
assert.deepEqual(sent.hardConstraints, ctx);
assert.deepEqual(sent.recommendationStrategy.avoidTitles, ["Cheese bake"]);
assert.match(calls[0].messages[0].content, /hardConstraints > explicitPreferences > learnedPreferences/);

console.log("my-ideas: ok");
