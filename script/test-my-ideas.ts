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
assert.deepEqual(Object.keys(brief), ["hardConstraints", "explicitPreferences", "learnedPreferences", "mealContext", "generationStyle", "budgetPreference", "recommendationStrategy"]);
assert.equal(brief.generationStyle, "surprise_me", "default style");
assert.equal(brief.budgetPreference, "everyday", "default budget");
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


// 8. Style and budget reach the model as soft guidance; hard constraints are untouched by them.
calls.length = 0;
const out = await generateRecipe(ctx, () => ai, undefined, undefined, "chefs_touch", "flexible");
const styledBrief = JSON.parse(calls[0].messages[1].content);
assert.equal(styledBrief.generationStyle, "chefs_touch"); assert.equal(styledBrief.budgetPreference, "flexible");
assert.match(styledBrief.recommendationStrategy.style, /refined/); assert.match(styledBrief.recommendationStrategy.budget, /Premium/);
assert.deepEqual(styledBrief.hardConstraints, ctx);
assert.match(calls[0].messages[0].content, /Never state prices/);
assert.match(calls[0].messages[0].content, /°C/);
assert.equal(calls[0].response_format.json_schema.schema.required.includes("tip"), true);
assert.equal(out.tip, "", "tip defaults to empty");
const quick = buildGenerationBrief(ctx, undefined, "quick_easy");
assert.match(quick.recommendationStrategy.style, /fewer steps/); assert.equal(quick.budgetPreference, "everyday");

// 9. Budget preference: Everyday by default and for unknown stored values; persisted when changed.
const { ideaGenerationBody, noIdeaFilters } = await import("../client/src/lib/recipe-generation");
data.delete(ideas.budgetKey);
assert.equal(ideas.getBudget(), "everyday");
ideas.setBudget("save_more"); assert.equal(ideas.getBudget(), "save_more");
data.set(ideas.budgetKey, "luxury"); assert.equal(ideas.getBudget(), "everyday");

// 10. Serialization: Meals filter names, preparation time, one style; the server accepts it.
const reqBody = ideaGenerationBody({ ...noIdeaFilters, maxMinutes: 30, cookingMethod: ["Oven"], dietary: ["Gluten-free"], mealType: ["Dinner"] }, "quick_easy", "everyday");
assert.deepEqual(reqBody, { filterSet: "meals", timeMode: "preparation", style: "quick_easy", budget: "everyday",
  filters: { maxMinutes: 30, dietary: ["Gluten-free"], mealType: ["Dinner"], cookingMethod: ["Oven"], proteinType: [], servings: null, mustInclude: [], mustExclude: [] } });
assert.ok(generationRequest.safeParse(reqBody).success);
assert.equal(generationRequest.safeParse({ ...reqBody, style: ["quick_easy", "chefs_touch"] }).success, false, "one style only");

// 11. Provenance metadata is stored with the idea; search/filter/sort run over saved ideas only.
ideas.clearIdeas();
const meta = (style: string) => ({ generationRequestId: `r-${style}`, model: "m", promptVersion: "recipe-generation/3", style });
const stew = ideas.saveIdea({ recipe: { ...recipe("Lentil stew", "Simmer on the stovetop for 25 minutes."), prepTime: 15, ingredients: ["200 g lentils", "1 onion"], tags: ["ai-generated", "vegetarian", "meal:dinner"] }, description: "d", tip: "Salt at the end.", meta: meta("family_favorite") }, reqBody);
const toast = ideas.saveIdea({ recipe: { ...recipe("Air fryer toast", "Air fryer at 180°C for 5 minutes."), prepTime: 5, tags: ["ai-generated", "meal:breakfast"] }, description: "d", meta: meta("quick_easy") }, reqBody);
const stored = ideas.listIdeas().find(i => i.id === stew.id)!;
assert.deepEqual([stored.style, stored.promptVersion, stored.tip, stored.origin], ["family_favorite", "recipe-generation/3", "Salt at the end.", "ai_generated"]);
const all = ideas.listIdeas();
const ids = (list: { id: string }[]) => list.map(i => i.id);
assert.deepEqual(ids(ideas.filterIdeas(all, "", noIdeaFilters, "newest")), [toast.id, stew.id]);
assert.deepEqual(ids(ideas.filterIdeas(all, "", noIdeaFilters, "oldest")), [stew.id, toast.id]);
assert.deepEqual(ids(ideas.filterIdeas(all, "LENTIL", noIdeaFilters, "newest")), [stew.id], "title search");
assert.deepEqual(ids(ideas.filterIdeas(all, "onion", noIdeaFilters, "newest")), [stew.id], "ingredient search");
assert.deepEqual(ids(ideas.filterIdeas(all, "", { ...noIdeaFilters, cookingMethod: ["Air fryer"] }, "newest")), [toast.id]);
assert.deepEqual(ids(ideas.filterIdeas(all, "", { ...noIdeaFilters, maxMinutes: 10 }, "newest")), [toast.id], "max prep time");
assert.deepEqual(ids(ideas.filterIdeas(all, "", { ...noIdeaFilters, dietary: ["Vegetarian"] }, "newest")), [stew.id]);
assert.deepEqual(ids(ideas.filterIdeas(all, "", { ...noIdeaFilters, mealType: ["Breakfast"] }, "newest")), [toast.id]);
assert.deepEqual(ids(ideas.filterIdeas(all, "pizza", noIdeaFilters, "newest")), [], "no matches");
// Older ideas saved before styles existed still load.
data.set(ideas.ideasKey, JSON.stringify([{ ...stored, style: undefined, promptVersion: undefined, tip: undefined }]));
assert.equal(ideas.filterIdeas(ideas.listIdeas(), "stew", noIdeaFilters, "newest").length, 1);

console.log("my-ideas: ok");
