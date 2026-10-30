import type { Express } from "express";
import type { PilotSecurity } from "../../security";
import { apiErrorHandler } from "../../security";
import {
  optionalRouter, conversationRoutes, loadChatStorage, type LoadStorage,
  jsonBody, validate, textBody, boundedHistory,
} from "../route-security";

async function loadProvider() {
  const { default: OpenAI } = await import("openai");
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export function registerChatRoutes(app: Express, security: PilotSecurity, deps: {
  loadStorage?: LoadStorage; loadProvider?: typeof loadProvider;
} = {}): void {
  const router = optionalRouter(security);
  const storageLoader = deps.loadStorage ?? loadChatStorage;
  conversationRoutes(router, storageLoader);
  router.post("/api/conversations/:id/messages",
    jsonBody("40kb"), validate(textBody, true), security.aiPermit, async (req, res, next) => {
      try {
        const storage = await storageLoader();
        const id = Number(req.params.id);
        if (!await storage.getConversation(id)) {
          res.status(404).json({ error: "Conversation not found" }); return;
        }
        const content = textBody.parse(req.body).content;
        const history = boundedHistory([
          ...await storage.getMessagesByConversation(id), { role: "user", content },
        ]);
        const provider = await (deps.loadProvider ?? loadProvider)();
        await storage.createMessage(id, "user", content);
        const stream = await provider.chat.completions.create({
          model: "gpt-5.1", messages: history, stream: true, max_completion_tokens: 2048,
        });
        res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
        let fullResponse = "";
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          fullResponse += content;
          if (fullResponse.length > 16_000) throw new Error("Response limit exceeded.");
          if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
        await storage.createMessage(id, "assistant", fullResponse);
        res.end(`data: ${JSON.stringify({ done: true })}\n\n`);
      } catch (error) { next(error); }
      finally { res.locals.releaseAI(); }
    });
  router.use(apiErrorHandler);
  app.use(router);
}
