import express, { type Express, type Request, type Response, type NextFunction, type ErrorRequestHandler } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export type PilotConfig = {
  operatorToken?: string;
  publicCatalog: boolean;
  aiEnabled: boolean;
  production: boolean;
  analyticsEnabled?: boolean;
};

export function pilotConfig(): PilotConfig {
  const token = process.env.TABLEWISE_OPERATOR_TOKEN;
  return {
    operatorToken: token && token.length >= 32 && token.length <= 256 ? token : undefined,
    publicCatalog: process.env.TABLEWISE_PUBLIC_CATALOG_REVIEWED === "true",
    aiEnabled: process.env.TABLEWISE_AI_ENABLED === "true",
    production: process.env.NODE_ENV === "production",
    analyticsEnabled: process.env.TABLEWISE_ANALYTICS_ENABLED === "true",
  };
}

const digest = (text: string) => createHash("sha256").update(text).digest();
const equal = (left: string, right: string) => timingSafeEqual(digest(left), digest(right));
const cookieName = "tablewise_operator";
const loginSchema = z.object({ token: z.string().min(32).max(256) }).strict();

// Bounded, fixed-window, per-process counters. Keys never contain IP addresses.
export class RequestBudget {
  private entries = new Map<string, { count: number; expires: number }>();
  constructor(private now = Date.now, private maxKeys = 1000) {}
  take(key: string, limit: number, windowMs: number): number {
    const now = this.now();
    this.entries.forEach((value, entry) => {
      if (value.expires <= now) this.entries.delete(entry);
    });
    let value = this.entries.get(key);
    if (!value) {
      if (this.entries.size >= this.maxKeys) return Math.ceil(windowMs / 1000);
      value = { count: 0, expires: now + windowMs };
      this.entries.set(key, value);
    }
    if (value.count >= limit) return Math.max(1, Math.ceil((value.expires - now) / 1000));
    value.count++;
    return 0;
  }
}

export function installPilotSecurity(app: Express, config: PilotConfig, now = Date.now) {
  const budget = new RequestBudget(now);
  const sessions = new Map<string, number>();
  let activeAI = 0;
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.set("query parser", "simple");
  const throttle = (res: Response, retry: number) => {
    res.setHeader("Retry-After", String(retry));
    res.status(429).json({ error: "Too many requests. Try again later." });
  };
  const consume = (res: Response, key: string, max: number, ms: number) => {
    const retry = budget.take(key, max, ms);
    if (retry) throttle(res, retry);
    return !retry;
  };
  const sameOrigin = (req: Request) => {
    try {
      const origin = new URL(req.get("origin") || "");
      return origin.host === req.get("host") &&
        (origin.protocol === "https:" || (!config.production && origin.protocol === "http:"));
    } catch { return false; }
  };
  const cleanupSessions = () => {
    sessions.forEach((expiry, key) => { if (expiry <= now()) sessions.delete(key); });
  };
  const authorized = (req: Request) => {
    if (!config.operatorToken) return false;
    const header = req.get("authorization");
    if (header) return header.length <= 520 &&
      header.startsWith("Bearer ") && equal(header.slice(7), config.operatorToken);
    cleanupSessions();
    const cookie = req.get("cookie")?.split(";").map(v => v.trim())
      .find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    return !!cookie && cookie.length === 64 && (sessions.get(digest(cookie).toString("hex")) || 0) > now();
  };
  const requireOperator = (req: Request, res: Response, next: NextFunction) => {
    if (!authorized(req)) return res.status(403).json({ error: "Operator access required." });
    // Bearer requests have no ambient browser authority. Cookies do, so require Origin.
    if (!["GET", "HEAD"].includes(req.method) && !req.get("authorization") && !sameOrigin(req)) {
      return res.status(403).json({ error: "Same-origin request required." });
    }
    next();
  };
  const sessionCookie = (value: string, maxAge: number) =>
    `${cookieName}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.production ? "; Secure" : ""}`;

  app.get("/operator", (_req, res) => {
    res.set({ "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer" });
    res.type("html").send(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TableWise operator</title><main><h1>TableWise operator access</h1><p>Public visitors cannot change recipes or use paid AI. Sign in here to use existing import and recipe tools. Access expires after one hour or a server restart.</p><form action="/api/operator/session" method="post"><label>Operator token <input name="token" type="password" required minlength="32" maxlength="256" autocomplete="off"></label><button>Sign in</button></form><p>Sign out immediately:</p><form action="/api/operator/logout" method="post"><button>Sign out</button></form><p><a href="/recipes">Open recipes</a> · <a href="/import">Import recipe</a></p></main></html>`);
  });
  app.use("/api", (req, res, next) => {
    const start = now();
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    res.on("finish", () => {
      // No URL, query, credentials, request/response bodies, or exception details.
      console.log(`api method=${req.method} status=${res.statusCode} durationMs=${now() - start}`);
    });
    if (!consume(res, "all", 120, 60_000)) return;
    next();
  });
  app.post("/api/operator/session",
    (req, res, next) => {
      if (!consume(res, "login:all", 5, 900_000)) return;
      if (!sameOrigin(req)) return res.status(403).json({ error: "Same-origin request required." });
      next();
    },
    express.urlencoded({ extended: false, limit: "1kb", parameterLimit: 2, inflate: false }),
    express.json({ limit: "1kb", inflate: false }),
    (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!config.operatorToken || !parsed.success || !equal(parsed.data.token, config.operatorToken)) {
        return res.status(403).json({ error: "Operator access required." });
      }
      cleanupSessions();
      if (sessions.size >= 20) return throttle(res, 3600);
      const cookie = randomBytes(32).toString("hex");
      sessions.set(digest(cookie).toString("hex"), now() + 3600_000);
      res.setHeader("Set-Cookie", sessionCookie(cookie, 3600));
      res.redirect(303, "/recipes");
    });
  app.get("/api/operator/session", (req, res) => res.json({
    operator: authorized(req), aiEnabled: config.aiEnabled && authorized(req),
  }));
  app.post("/api/operator/logout", requireOperator, (req, res) => {
    const cookie = req.get("cookie")?.split(";").map(v => v.trim())
      .find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (cookie) sessions.delete(digest(cookie).toString("hex"));
    res.setHeader("Set-Cookie", sessionCookie("", 0));
    res.redirect(303, "/operator");
  });
  const isEventIngest = (req: Request) => req.method === "POST" && /^\/analytics\/events\/?$/i.test(req.path);
  // Only this exact anonymous write is exempt; all other mutations and ALL
  // analytics inspection remain fail-closed. No IPs are retained for budgets.
  app.use("/api", (req, res, next) => {
    if (isEventIngest(req)) {
      if (!config.analyticsEnabled || !config.publicCatalog) return res.status(503).json({ error: "Pilot analytics is disabled." });
      if (!sameOrigin(req)) return res.status(403).json({ error: "Same-origin request required." });
      if (!consume(res, "events:minute", 60, 60_000) || !consume(res, "events:hour", 500, 3600_000)) return;
      return next();
    }
    if (!["GET", "HEAD"].includes(req.method) || /^\/analytics(?:\/|$)/i.test(req.path)) {
      return requireOperator(req, res, () => {
        if (!["GET", "HEAD"].includes(req.method) && !consume(res, "writes", 30, 60_000)) return;
        next();
      });
    }
    next();
  });
  const analyticsPilotPermit = (pilotId: string, res: Response) =>
    consume(res, `pilot:${pilotId}`, 20, 60_000);
  app.use("/api/recipes", (req, res, next) => {
    if (["GET", "HEAD"].includes(req.method) && !config.publicCatalog && !authorized(req)) {
      return res.status(503).json({ error: "Public catalog is not approved for access." });
    }
    next();
  });
  const aiPermit = (req: Request, res: Response, next: NextFunction) => {
    if (!config.aiEnabled) return res.status(503).json({ error: "Paid AI is disabled." });
    if (!consume(res, "ai:minute", 5, 60_000) ||
        !consume(res, "ai:hour", 20, 3600_000) ||
        !consume(res, "ai:day", 40, 86400_000)) return;
    if (activeAI >= 2) return throttle(res, 30);
    activeAI++;
    // Release on actual handler completion, not client disconnect (provider may still run).
    let released = false;
    res.locals.releaseAI = () => { if (!released) { activeAI--; released = true; } };
    next();
  };
  return { aiPermit, authorized, analyticsPilotPermit, config };
}

export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    console.error("api_failure after_headers");
    res.destroy();
    return;
  }
  const status = error?.type === "entity.too.large" ? 413 :
    error?.type === "entity.parse.failed" || error?.type === "parameters.too.many" ? 400 :
    error?.type === "encoding.unsupported" || error?.type === "charset.unsupported" ? 415 : 500;
  console.error(`api_failure status=${status}`);
  res.status(status).json({ error: status === 413 ? "Request body is too large." :
    status === 400 ? "Invalid request body." : status === 415 ? "Unsupported encoding." : "Request failed." });
};

export type PilotSecurity = ReturnType<typeof installPilotSecurity>;
