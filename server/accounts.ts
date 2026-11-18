import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, sql } from "drizzle-orm";
import { accounts, accountSessions } from "@shared/schema";
import { profileInput, signInInput } from "./request-schemas";
import { RequestBudget, type installPilotSecurity } from "./security";

type Database = Omit<typeof import("./db").db, "$client">;
type Security = ReturnType<typeof installPilotSecurity>;
type Account = { id: string; email: string; passwordHash: string | null; ownerId: string };
export type SignedIn = { id: string; email: string; ownerId: string; name: string | null; hasPhoto: boolean; photoVersion: number };

const sessionCookie = "tablewise_session";
const sessionDays = 30;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const scryptKey = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await scryptKey(password, salt, 64)).toString("hex")}`;
}
export async function checkPassword(password: string, stored: string | null) {
  const [salt, key] = stored?.split(":") ?? [];
  if (!salt || !key) return false;
  const actual = await scryptKey(password, Buffer.from(salt, "hex"), 64);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type AccountStore = {
  find(email: string): Promise<Account | null>;
  /** Null when the email or owner is already taken. */
  create(email: string, passwordHash: string, ownerId: string): Promise<Account | null>;
  startSession(accountId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  /** The signed-in account for a live session. */
  session(tokenHash: string): Promise<SignedIn | null>;
  endSession(tokenHash: string): Promise<void>;
  photo(accountId: string): Promise<string | null>;
  /** Only the fields given change; a new photo (or none) gets a new version. */
  updateProfile(accountId: string, profile: { name?: string | null; photo?: string | null }): Promise<void>;
};

export function databaseAccountStore(connection?: Database): AccountStore {
  const database = async () => connection ?? (await import("./db")).db;
  return {
    async find(email) {
      const [row] = await (await database()).select().from(accounts).where(eq(accounts.email, email));
      return row ?? null;
    },
    async create(email, passwordHash, ownerId) {
      const [row] = await (await database()).insert(accounts).values({ email, passwordHash, ownerId }).onConflictDoNothing().returning();
      return row ?? null;
    },
    async startSession(accountId, tokenHash, expiresAt) {
      await (await database()).insert(accountSessions).values({ accountId, tokenHash, expiresAt });
    },
    async session(tokenHash) {
      const [row] = await (await database()).select({ id: accounts.id, email: accounts.email, ownerId: accounts.ownerId,
        name: accounts.displayName, hasPhoto: sql<boolean>`${accounts.photo} IS NOT NULL`, photoVersion: accounts.photoVersion })
        .from(accountSessions).innerJoin(accounts, eq(accounts.id, accountSessions.accountId))
        .where(and(eq(accountSessions.tokenHash, tokenHash), gt(accountSessions.expiresAt, new Date())));
      return row ?? null;
    },
    async endSession(tokenHash) {
      await (await database()).delete(accountSessions).where(eq(accountSessions.tokenHash, tokenHash));
    },
    async photo(accountId) {
      const [row] = await (await database()).select({ photo: accounts.photo }).from(accounts).where(eq(accounts.id, accountId));
      return row?.photo ?? null;
    },
    async updateProfile(accountId, { name, photo }) {
      if (name === undefined && photo === undefined) return;
      await (await database()).update(accounts).set({
        ...(name === undefined ? {} : { displayName: name }),
        ...(photo === undefined ? {} : { photo, photoVersion: sql`${accounts.photoVersion} + 1` }),
      }).where(eq(accounts.id, accountId));
    },
  };
}

/**
 * Email and password sign-in. One form: a new email creates the account with the password typed, and the guest's
 * data becomes the account's (its owner is adopted). A later sign-in from any browser opens the same owner.
 * Google sign-in later: find or create the account by verified email, then call `begin` below.
 */
export function installAccounts(app: Express, security: Security, store: AccountStore, now = Date.now) {
  // ponytail: per-process failure counter, like every other budget; move to Postgres if we run several processes.
  const failures = new RequestBudget(now, 10_000);
  const token = (req: Request) => {
    const value = security.readCookie(req, sessionCookie);
    return value && /^[a-f0-9]{64}$/.test(value) ? hash(value) : undefined;
  };

  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    const tokenHash = token(req);
    if (!tokenHash) return next();
    try {
      const account = await store.session(tokenHash);
      if (account) { res.locals.accountOwner = account.ownerId; res.locals.account = account; }
      else res.append("Set-Cookie", security.cookie(sessionCookie, "", 0));
      next();
    } catch {
      // Never fall back to the guest: writes would land in the wrong place.
      res.status(503).json({ error: "Something went wrong. Please try again." });
    }
  });

  const begin = async (res: Response, account: Account) => {
    const value = randomBytes(32).toString("hex");
    await store.startSession(account.id, hash(value), new Date(now() + sessionDays * 86400_000));
    res.append("Set-Cookie", security.cookie(sessionCookie, value, sessionDays * 86400));
    res.json({ email: account.email });
  };

  app.get("/api/auth/me", (_req, res) => {
    const account = res.locals.account as SignedIn | undefined;
    if (!account) return res.json({ email: null });
    res.json({ email: account.email, name: account.name, photo: account.hasPhoto ? `/api/auth/photo?v=${account.photoVersion}` : null });
  });

  // The profile photo behind the versioned link /me returns. JPEG only.
  app.get("/api/auth/photo", async (_req, res) => {
    const account = res.locals.account as SignedIn | undefined;
    try {
      const photo = account && (await store.photo(account.id))?.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!photo) return res.status(404).json({ error: "No photo" });
      res.set("Cache-Control", "private, max-age=31536000, immutable").type("image/jpeg").send(Buffer.from(photo[1], "base64"));
    } catch {
      console.error("api_failure operation=account_photo_get");
      res.status(500).json({ error: "failed" });
    }
  });

  app.put("/api/auth/profile", express.json({ limit: "300kb", inflate: false }), async (req, res) => {
    const account = res.locals.account as SignedIn | undefined;
    if (!account) return res.status(401).json({ error: "sign_in" });
    const input = profileInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "invalid" });
    try {
      await store.updateProfile(account.id, input.data);
      res.status(204).end();
    } catch {
      console.error("api_failure operation=account_profile");
      res.status(500).json({ error: "failed" });
    }
  });

  app.post("/api/auth/sign-in", express.json({ limit: "2kb", inflate: false }), async (req, res) => {
    const input = signInInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "invalid" });
    const { email, password } = input.data;
    if (failures.take(`email:${hash(email)}`, 10, 900_000)) return res.status(429).json({ error: "too_many" });
    try {
      let account = await store.find(email);
      if (!account) {
        // The guest's owner becomes the account's, so their Week, tasks and history come along.
        const guest = res.locals.accountOwner ? undefined : security.guestOwner(req);
        account = await store.create(email, await hashPassword(password), guest ?? randomBytes(32).toString("hex"));
        // The guest cookie now opens the account's data, so drop it; signing out starts a new guest.
        security.forgetGuest(res);
        // Taken meanwhile (same email at the same moment, or a reused guest cookie): ask to try again.
        if (!account) return res.status(409).json({ error: "retry" });
        return await begin(res, account);
      }
      if (!await checkPassword(password, account.passwordHash)) return res.status(401).json({ error: "wrong_password" });
      await begin(res, account);
    } catch {
      console.error("api_failure operation=sign_in");
      res.status(500).json({ error: "failed" });
    }
  });

  app.post("/api/auth/sign-out", async (req, res) => {
    const tokenHash = token(req);
    try { if (tokenHash) await store.endSession(tokenHash); }
    catch { console.error("api_failure operation=sign_out"); return res.status(500).json({ error: "failed" }); }
    res.append("Set-Cookie", security.cookie(sessionCookie, "", 0));
    res.status(204).end();
  });
}
