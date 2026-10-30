import type { Express } from "express";
import type { PilotSecurity } from "../../security";
import { apiErrorHandler } from "../../security";
import { optionalRouter, jsonBody, validate, imageBody } from "../route-security";
import { requireImageResult } from "./result";

const loadImage = () => import("./client");

export function registerImageRoutes(app: Express, security: PilotSecurity, deps: {
  loadProvider?: typeof loadImage;
} = {}): void {
  const router = optionalRouter(security, "/api/generate-image");
  router.post("/api/generate-image",
    jsonBody("24kb"), validate(imageBody), security.aiPermit, async (req, res, next) => {
      try {
        const { prompt, size } = imageBody.parse(req.body);
        const { openai } = await (deps.loadProvider ?? loadImage)();
        const response = await openai.images.generate({ model: "gpt-image-1", prompt, n: 1, size });
        const imageData = requireImageResult(response);
        res.json({ url: imageData.url, b64_json: imageData.b64_json });
      } catch (error) { next(error); }
      finally { res.locals.releaseAI(); }
    });
  router.use(apiErrorHandler);
  app.use(router);
}
