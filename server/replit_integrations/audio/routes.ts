import type { Express } from "express";
import type { PilotSecurity } from "../../security";
import { apiErrorHandler } from "../../security";
import {
  optionalRouter, conversationRoutes, loadChatStorage, type LoadStorage,
  jsonBody, validate, audioBody, boundedHistory,
} from "../route-security";

const loadAudio = () => import("./client");

export function registerAudioRoutes(app: Express, security: PilotSecurity, deps: {
  loadStorage?: LoadStorage; loadProvider?: typeof loadAudio;
} = {}): void {
  const router = optionalRouter(security);
  const storageLoader = deps.loadStorage ?? loadChatStorage;
  conversationRoutes(router, storageLoader);
  router.post("/api/conversations/:id/messages",
    jsonBody("6mb"), validate(audioBody, true), security.aiPermit, async (req, res, next) => {
      try {
        const storage = await storageLoader();
        const id = Number(req.params.id);
        if (!await storage.getConversation(id)) {
          res.status(404).json({ error: "Conversation not found" }); return;
        }
        const existing = await storage.getMessagesByConversation(id);
        boundedHistory([...existing, { role: "user", content: " ".repeat(8_000) }]);
        const { audio, voice } = audioBody.parse(req.body);
        const provider = await (deps.loadProvider ?? loadAudio)();
        const { buffer, format } = await provider.ensureCompatibleFormat(Buffer.from(audio, "base64"));
        if (buffer.length > 8 * 1024 * 1024) throw new Error("Converted audio limit exceeded.");
        const transcript = await provider.speechToText(buffer, format);
        const history = boundedHistory([...existing, { role: "user", content: transcript }]);
        await storage.createMessage(id, "user", transcript);
        const stream = await provider.openai.chat.completions.create({
          model: "gpt-audio", modalities: ["text", "audio"],
          audio: { voice, format: "pcm16" }, messages: history,
          stream: true, max_completion_tokens: 2048,
        });
        res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
        res.write(`data: ${JSON.stringify({ type: "user_transcript", data: transcript })}\n\n`);
        let assistantTranscript = "";
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta as { audio?: { transcript?: string; data?: string } };
          if (delta?.audio?.transcript) {
            assistantTranscript += delta.audio.transcript;
            if (assistantTranscript.length > 16_000) throw new Error("Response limit exceeded.");
            res.write(`data: ${JSON.stringify({ type: "transcript", data: delta.audio.transcript })}\n\n`);
          }
          if (delta?.audio?.data) res.write(`data: ${JSON.stringify({ type: "audio", data: delta.audio.data })}\n\n`);
        }
        await storage.createMessage(id, "assistant", assistantTranscript);
        res.end(`data: ${JSON.stringify({ type: "done", transcript: assistantTranscript })}\n\n`);
      } catch (error) { next(error); }
      finally { res.locals.releaseAI(); }
    });
  router.use(apiErrorHandler);
  app.use(router);
}
