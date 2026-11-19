// Real PostgreSQL + HTTP checks for accounts. Only a disposable *_test database is accepted.
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import { databaseAccountStore, checkPassword, hashPassword } from "../server/accounts";
import { databaseWeekPlanStore } from "../server/week-plans";
import { registerRoutes } from "../server/routes";
import { apiErrorHandler } from "../server/security";

const url = process.env.TABLEWISE_TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error("Set TABLEWISE_TEST_DATABASE_URL to a disposable database ending in _test.");

async function main() {
  const stored = await hashPassword("correct horse");
  assert.equal(await checkPassword("correct horse", stored), true);
  assert.equal(await checkPassword("wrong horse!", stored), false);
  assert.equal(await checkPassword("anything", null), false, "no password (future Google account) never matches");

  const pool = new pg.Pool({ connectionString: url });
  const app = express(), server = createServer(app);
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    execFileSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "push", "--force"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    const describe = async () => {
      const out: unknown[] = [];
      for (const table of ["accounts", "account_sessions"]) out.push(
        (await pool.query("SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_name=$1 ORDER BY 1", [table])).rows,
        (await pool.query("SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY 1", [table])).rows,
        (await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename=$1 ORDER BY 1", [table])).rows);
      return out;
    };
    const pushed = await describe();
    await pool.query("DROP TABLE account_sessions; DROP TABLE accounts;");
    await pool.query(readFileSync("migrations/0015_accounts.sql", "utf8"));
    await pool.query(readFileSync("migrations/0017_account_profile.sql", "utf8"));
    assert.deepEqual(await describe(), pushed, "migration matches Drizzle schema");

    const db = drizzle(pool, { schema });
    await registerRoutes(server, app, { storage: {} as any, accounts: databaseAccountStore(db), weekPlans: databaseWeekPlanStore(db),
      nutrition: async r => r as any, config: { aiEnabled: false, production: false, publicCatalog: true } });
    app.use(apiErrorHandler);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const request = async (method: string, path: string, body?: unknown, cookie?: string, origin = true) => {
      const response = await fetch(base + path, { method, headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}), ...(origin ? { origin: base } : {}),
      }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = response.headers.get("content-type")?.includes("json") ? await response.json() : undefined;
      const cookies = Object.fromEntries(response.headers.getSetCookie().map(c => c.split(";")[0].split("=") as [string, string]));
      return { status: response.status, data, cookies };
    };
    const plan = { weekStart: "2026-11-16", proposed: false, selectedIds: ["r1"], planAssignments: [], locked: true };
    const signIn = (email: string, password: string, cookie?: string) => request("POST", "/api/auth/sign-in", { email, password }, cookie);

    // A guest plans a Week, then signs in with a new email: the account adopts the guest's data.
    const guest = (await request("PUT", "/api/week-plan", plan)).cookies.tablewise_owner;
    assert.ok(guest);
    assert.deepEqual((await request("GET", "/api/auth/me", undefined, `tablewise_owner=${guest}`)).data, { email: null });
    assert.equal((await signIn("Ann@Example.com", "short", `tablewise_owner=${guest}`)).status, 400, "password too short");
    assert.equal((await request("POST", "/api/auth/sign-in", { email: "ann@example.com", password: "secret-pass" }, undefined, false)).status, 403, "same-origin only");
    const created = await signIn(" Ann@Example.com ", "secret-pass", `tablewise_owner=${guest}`);
    assert.equal(created.status, 200);
    assert.deepEqual(created.data, { email: "ann@example.com" });
    assert.equal(created.cookies.tablewise_owner, "", "guest cookie dropped: it now opens the account's data");
    const session = `tablewise_session=${created.cookies.tablewise_session}`;
    const ann = { email: "ann@example.com", name: null, photo: null };
    assert.deepEqual((await request("GET", "/api/auth/me", undefined, session)).data, ann);
    assert.deepEqual((await request("GET", "/api/week-plan?week=2026-11-16", undefined, session)).data, plan, "guest Week came along");

    // Another browser: wrong password, then the right one opens the same Week.
    assert.equal((await signIn("ann@example.com", "not-the-pass")).status, 401);
    const second = await signIn("ann@example.com", "secret-pass");
    assert.equal(second.status, 200);
    const session2 = `tablewise_session=${second.cookies.tablewise_session}`;
    assert.deepEqual((await request("GET", "/api/week-plan?week=2026-11-16", undefined, session2)).data, plan);
    // A session wins over a guest cookie in the same browser; the guest's data stays with the guest.
    const other = (await request("PUT", "/api/week-plan", { ...plan, locked: false })).cookies.tablewise_owner;
    assert.deepEqual((await request("GET", "/api/week-plan?week=2026-11-16", undefined, `${session2}; tablewise_owner=${other}`)).data, plan);
    assert.equal((await request("GET", "/api/week-plan?week=2026-11-16", undefined, `tablewise_owner=${other}`)).data.locked, false);

    // Profile: name and photo belong to the account, so every signed-in browser sees them; a guest has none.
    const jpeg = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 224, 0, 16]).toString("base64")}`;
    assert.equal((await request("PUT", "/api/auth/profile", { name: "Ann" })).status, 401, "guest has no profile");
    assert.equal((await request("PUT", "/api/auth/profile", { name: "Ann" }, session2, false)).status, 403, "same-origin only");
    assert.equal((await request("PUT", "/api/auth/profile", { photo: "data:image/png;base64,AAAA" }, session2)).status, 400, "JPEG only");
    assert.equal((await request("PUT", "/api/auth/profile", { owner: "x" }, session2)).status, 400, "unknown fields rejected");
    assert.equal((await request("PUT", "/api/auth/profile", { name: "  Ann  ", photo: jpeg }, session2)).status, 204);
    assert.deepEqual((await request("GET", "/api/auth/me", undefined, session)).data, { ...ann, name: "Ann", photo: "/api/auth/photo?v=1" });
    const served = await fetch(`${base}/api/auth/photo?v=1`, { headers: { cookie: session } });
    assert.equal(served.headers.get("content-type"), "image/jpeg");
    assert.deepEqual([...new Uint8Array(await served.arrayBuffer())], [255, 216, 255, 224, 0, 16]);
    assert.equal((await request("GET", "/api/auth/photo")).status, 404, "a guest gets no photo");
    assert.equal((await request("PUT", "/api/auth/profile", { photo: null }, session2)).status, 204);
    assert.deepEqual((await request("GET", "/api/auth/me", undefined, session)).data, { ...ann, name: "Ann" }, "photo removed, name kept");
    await assert.rejects(pool.query("UPDATE accounts SET photo = repeat('a', 280024)"), /accounts_photo/);
    await request("PUT", "/api/auth/profile", { name: null }, session2);

    // Sign out ends that session only.
    assert.equal((await request("POST", "/api/auth/sign-out", undefined, session2)).status, 204);
    assert.deepEqual((await request("GET", "/api/auth/me", undefined, session2)).data, { email: null });
    assert.deepEqual((await request("GET", "/api/auth/me", undefined, session)).data, ann);

    // Expired sessions do not open anything.
    await pool.query("UPDATE account_sessions SET expires_at = now() - interval '1 second'");
    assert.deepEqual((await request("GET", "/api/auth/me", undefined, session)).data, { email: null });

    // Ten attempts per email per 15 minutes.
    for (let i = 0; i < 7; i++) await signIn("ann@example.com", "not-the-pass");
    assert.equal((await signIn("ann@example.com", "secret-pass")).status, 429);
    console.log("accounts db: ok");
  } finally {
    server.close();
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
