import { z } from "zod";

const line = z.string().trim().min(1).max(1000);
const safeURL = z.string().max(2048).url().refine(value => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, "Use an HTTP(S) URL without credentials");

export const recipeInput = z.object({
  title: z.string().trim().min(1).max(200),
  ingredients: z.array(line).min(1).max(100),
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(100),
  image: safeURL.nullable().optional(),
  sourceUrl: safeURL.nullable().optional(),
  cookTime: z.number().int().min(0).max(10080).nullable().optional(),
  servings: z.string().trim().min(1).max(40).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).nullable().optional(),
}).strict();
export const recipePatch = recipeInput.partial().refine(value => Object.keys(value).length > 0);
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
