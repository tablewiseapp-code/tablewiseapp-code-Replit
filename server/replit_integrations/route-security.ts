import express, { type RequestHandler } from "express";
import { z } from "zod";
import type { PilotSecurity } from "../security";
import type { IChatStorage } from "./chat/storage";

export const conversationId = z.string().regex(/^[1-9]\d{0,9}$/)
  .transform(Number).refine(id => id <= 2_147_483_647);
export const titleBody = z.object({
  title: z.string().trim().min(1).max(200).default("New Chat"),
}).strict();
export const textBody = z.object({ content: z.string().trim().min(1).max(8_000) }).strict();
export const audioBody = z.object({
  // At most 4 MiB decoded. Reject noncanonical base64 before conversion or STT.
  audio: z.string().min(16).max(5_592_408)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/)
    .refine(value => {
      const bytes = Buffer.from(value, "base64");
      return value.length % 4 === 0 && bytes.length <= 4 * 1024 * 1024 &&
        bytes.toString("base64") === value;
    }),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).default("alloy"),
}).strict();
export const imageBody = z.object({
  prompt: z.string().trim().min(1).max(4_000),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).default("1024x1024"),
}).strict();

export function optionalRouter(security: PilotSecurity, path = "/api/conversations") {
  // Never supply default/no-op controls: importing a template must not enable it.
  if (!security?.requireOperator || !security.requireAIEnabled || !security.aiPermit) {
    throw new Error("Optional AI routes require pilot security.");
  }
  const router = express.Router();
  router.use(path, security.requireOperator, security.requireAIEnabled);
  return router;
}

export const jsonBody = (limit: string) => express.json({ limit, inflate: false });
export const validate = (body?: z.ZodTypeAny, id = false): RequestHandler => (req, res, next) => {
  if ((id && !conversationId.safeParse(req.params.id).success) ||
      (body && !body.safeParse(req.body).success)) {
    res.status(400).json({ error: "Invalid request body or conversation ID." });
    return;
  }
  next();
};

export function boundedHistory(messages: { role: string; content: string }[]) {
  if (messages.length > 32 || messages.reduce((sum, m) => sum + m.content.length, 0) > 32_000 ||
      messages.some(m => !["user", "assistant"].includes(m.role) || m.content.length > 8_000)) {
    throw new Error("Conversation context limit exceeded.");
  }
  return messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
}

export type LoadStorage = () => Promise<IChatStorage>;
export const loadChatStorage: LoadStorage = async () => (await import("./chat/storage")).chatStorage;

// Chat and audio are alternative templates with the same conversation paths.
export function conversationRoutes(router: express.Router, loadStorage: LoadStorage) {
  router.get("/api/conversations", async (_req, res, next) => {
    try { res.json(await (await loadStorage()).getAllConversations()); } catch (error) { next(error); }
  });
  router.get("/api/conversations/:id", validate(undefined, true), async (req, res, next) => {
    try {
      const storage = await loadStorage();
      const id = Number(req.params.id);
      const conversation = await storage.getConversation(id);
      if (!conversation) { res.status(404).json({ error: "Conversation not found" }); return; }
      res.json({ ...conversation, messages: await storage.getMessagesByConversation(id) });
    } catch (error) { next(error); }
  });
  router.post("/api/conversations", jsonBody("2kb"), validate(titleBody), async (req, res, next) => {
    try { res.status(201).json(await (await loadStorage()).createConversation(titleBody.parse(req.body).title)); }
    catch (error) { next(error); }
  });
  router.delete("/api/conversations/:id", validate(undefined, true), async (req, res, next) => {
    try { await (await loadStorage()).deleteConversation(Number(req.params.id)); res.status(204).end(); }
    catch (error) { next(error); }
  });
}
