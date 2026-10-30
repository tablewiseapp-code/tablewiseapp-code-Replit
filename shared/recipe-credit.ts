import { z } from "zod";

export const creditKind = z.enum(["chef", "mine"]);
export const creditName = z.string().trim().max(120).nullable().optional();
export const recipeCreditInput = z.object({
  creditKind,
  creditName,
}).strict().superRefine((value, ctx) => {
  if (value.creditKind === "chef" && !value.creditName?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["creditName"], message: "Enter the chef or creator's name." });
  }
}).transform(value => ({ creditKind: value.creditKind, creditName: value.creditName || null }));
export type RecipeCredit = {
  creditKind?: "chef" | "mine" | null;
  creditName?: string | null;
  chefReference?: string | null;
};
