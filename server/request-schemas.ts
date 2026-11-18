import { z } from "zod";
import { creditKind, creditName, recipeCreditInput } from "../shared/recipe-credit";
import { analysisMatches, stepAnalysisSchema } from "../shared/step-timing";
import { ingredientPartSchema } from "../shared/ingredient-parse";

const line = z.string().trim().min(1).max(1000);
const safeURL = z.string().max(2048).url().refine(value => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, "Use an HTTP(S) URL without credentials");

const recipeBase = z.object({
  title: z.string().trim().min(1).max(200),
  ingredients: z.array(line).min(1).max(100),
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(100),
  stepAnalysis: stepAnalysisSchema.nullable().optional(),
  ingredientParts: z.array(ingredientPartSchema).max(100).nullable().optional(),
  image: safeURL.nullable().optional(),
  sourceUrl: safeURL.nullable().optional(),
  cookTime: z.number().int().min(0).max(10080).nullable().optional(),
  prepTime: z.number().int().min(0).max(10080).nullable().optional(),
  servings: z.string().trim().min(1).max(40).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).nullable().optional(),
}).strict();
export const recipeInput = recipeBase.extend({
  creditKind: creditKind.nullable().optional(), creditName,
}).superRefine((value, ctx) => {
  if (value.ingredientParts && value.ingredientParts.length !== value.ingredients.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ingredientParts"], message: "One part per ingredient line." });
  }
  if (value.stepAnalysis && !analysisMatches(value, value.stepAnalysis)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stepAnalysis"], message: "Timing analysis is stale or incomplete." });
  }
  if (value.creditKind) {
    const parsed = recipeCreditInput.safeParse({ creditKind: value.creditKind, creditName: value.creditName });
    if (!parsed.success) parsed.error.issues.forEach(issue => ctx.addIssue(issue));
  } else if (value.creditName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["creditKind"], message: "Choose Chef or Mine." });
  }
}).transform(value => value.creditKind ? {
  ...value, ...recipeCreditInput.parse({ creditKind: value.creditKind, creditName: value.creditName }),
} : value);
// Customer edits of an AI draft: content only. Tags, provenance and status are server-controlled.
export const draftEdit = recipeBase.pick({ title: true, ingredients: true, steps: true, prepTime: true, cookTime: true, servings: true })
  .extend({ description: z.string().trim().max(400).optional() }).partial().strict()
  .refine(value => Object.keys(value).length > 0);
// Attribution is changed atomically through its bounded, separate endpoint.
export const recipePatch = recipeBase.partial().refine(value => Object.keys(value).length > 0)
  .refine(value => !value.ingredientParts || value.ingredientParts.length === value.ingredients?.length, "Send parts with their ingredient lines.");
export const recipeId = z.string().min(1).max(150).regex(/^[a-zA-Z0-9:_-]+$/);
export const parseInput = z.object({
  transcript: z.string().trim().min(1).max(12000),
}).strict();
export const maxAudioBytes = 4 * 1024 * 1024;
export const audioInput = z.object({
  audio: z.string().min(4).max(Math.ceil(maxAudioBytes / 3) * 4)
    .refine(value => value.length % 4 === 0 &&
      Buffer.from(value, "base64").toString("base64") === value),
  mimeType: z.enum(["audio/webm", "audio/webm;codecs=opus", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/wav", "audio/ogg", "audio/ogg;codecs=opus"]).optional(),
  language: z.enum(["en", "ru", "he"]).optional(),
  verifyText: z.boolean().optional(),
}).strict().refine(value => Buffer.byteLength(value.audio, "base64") <= maxAudioBytes);

// My Cooking Experience. Photos arrive already resized by the browser, as canonical base64 JPEG.
export const cookingSessionId = z.string().uuid();
export const groceryExtraCreate = z.object({
  text: z.string().trim().min(1).max(80),
  image: z.string().max(280023).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/)
    .refine(value => { const data = value.slice(23); const bytes = Buffer.from(data, "base64");
      return bytes.length <= 210000 && bytes.toString("base64") === data && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    }).optional(),
}).strict();
export const groceryItemPhotoInput = z.object({
  key: z.string().min(1).max(12000).refine(value => value === value.toLowerCase() && value.trim().length > 0),
  image: groceryExtraCreate.shape.image.unwrap().nullable(),
}).strict();
// Home Tasks: one upsert body for create, edit, complete, move and restore. createdAt is kept only on first save.
export const homeTaskInput = z.object({
  name: z.string().trim().min(1).max(120),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value)).nullable(),
  priority: z.enum(["high", "normal", "low"]),
  image: groceryExtraCreate.shape.image.unwrap().nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }).optional(),
}).strict();
// The Week: the whole plan in one PUT. Caps match /meals (12 recipes, 21 slots, 7 days).
export const weekPlanInput = z.object({
  selectedIds: z.array(recipeId).max(12),
  planAssignments: z.array(z.object({
    recipeId, mealType: z.enum(["Breakfast", "Lunch", "Dinner"]),
    startDay: z.number().int().min(0).max(6), spanDays: z.number().int().min(1).max(7),
    servings: z.number().positive().max(100).optional(),
  }).strict().refine(a => a.startDay + a.spanDays <= 7)).max(21),
  locked: z.boolean(),
}).strict();
export const cookingSessionCreate = z.object({ id: cookingSessionId, recipeId }).strict();
export const cookingSessionPatch = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
  notes: z.string().max(4000).transform(value => value.trim() ? value : null).nullable(),
}).partial().strict().refine(value => Object.keys(value).length > 0);
export const maxCookingPhotoBytes = 1_500_000;
export const maxCookingThumbnailBytes = 200_000;
const jpeg = (maxBytes: number) => z.string().min(4).max(Math.ceil(maxBytes / 3) * 4)
  .refine(value => value.length % 4 === 0 && Buffer.from(value, "base64").toString("base64") === value)
  .transform(value => Buffer.from(value, "base64"))
  .refine(bytes => bytes.length <= maxBytes && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff);
export const cookingPhotoInput = z.object({
  image: jpeg(maxCookingPhotoBytes), thumbnail: jpeg(maxCookingThumbnailBytes),
}).strict();

// Grocery share links and per-item notes.
export const shareToken = z.string().regex(/^[a-f0-9]{64}$/);
export const shareRole = z.enum(["view", "add", "edit"]);
const groceryText = z.string().trim().min(1).max(300);
const groceryCategory = z.string().trim().min(1).max(40);
const groceryNote = z.string().trim().max(500).transform(value => value || null);
export const sharedListCreate = z.object({
  role: shareRole,
  items: z.array(z.object({
    category: groceryCategory, text: groceryText, recipes: z.string().trim().max(300).default(""),
    checked: z.boolean().default(false), note: groceryNote.nullable().default(null),
  }).strict()).min(1).max(300),
}).strict();
export const sharedListPatch = z.object({ role: shareRole }).strict();
export const sharedItemCreate = z.object({ category: groceryCategory, text: groceryText }).strict();
export const sharedItemPatch = z.object({ checked: z.boolean(), note: groceryNote.nullable(), text: groceryText })
  .partial().strict().refine(value => Object.keys(value).length > 0);
// The key is the list's own item key, so it is matched exactly (no trimming).
export const groceryNoteInput = z.object({ key: z.string().min(1).max(300), note: groceryNote }).strict();
