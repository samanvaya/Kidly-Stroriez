import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { createDb } from "../src/db.js";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  createAuthRouter,
} from "../src/auth.js";

const SECRET = "test-secret-32-bytes-long-enough!";

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", router);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

function makeRouter({ loginMax, registerMax } = {}) {
  const db = createDb();
  return createAuthRouter(db, SECRET, {
    loginMax: loginMax ?? 10,
    registerMax: registerMax ?? 5,
  });
}

const post = (base, path, body) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("BL-003-T01 hashPassword and verifyPassword round-trip passes", async () => {
  const hash = await hashPassword("correct-horse");
  assert.ok(await verifyPassword("correct-horse", hash));
});

test("BL-003-T02 verifyPassword returns false for wrong password", async () => {
  const hash = await hashPassword("correct-horse");
  assert.ok(!(await verifyPassword("wrong-horse", hash)));
});

test("BL-003-T03 signToken and verifyToken round-trip returns correct userId", () => {
  const token = signToken("user123", SECRET);
  assert.deepEqual(verifyToken(token, SECRET), { userId: "user123" });
});

test("BL-003-T04 verifyToken returns null for a tampered token", () => {
  const token = signToken("user123", SECRET);
  const tampered = token.slice(0, -4) + "0000";
  assert.equal(verifyToken(tampered, SECRET), null);
});

test("BL-003-T05 verifyToken returns null for a token signed with a different secret", () => {
  const token = signToken("user123", "other-secret");
  assert.equal(verifyToken(token, SECRET), null);
});

test("BL-003-T06 POST /api/auth/register creates an account and returns a usable token", async () => {
  await withServer(makeRouter(), async (base) => {
    const res = await post(base, "/api/auth/register", { email: "parent@example.com", password: "password123" });
    assert.equal(res.status, 201);
    const { token } = await res.json();
    assert.ok(typeof token === "string" && token.length > 10);
    const me = await fetch(base + "/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).email, "parent@example.com");
  });
});

test("BL-003-T07 duplicate email registration returns 409", async () => {
  await withServer(makeRouter(), async (base) => {
    await post(base, "/api/auth/register", { email: "dup@example.com", password: "password123" });
    const res = await post(base, "/api/auth/register", { email: "dup@example.com", password: "password123" });
    assert.equal(res.status, 409);
  });
});

test("BL-003-T08 short password registration returns 400", async () => {
  await withServer(makeRouter(), async (base) => {
    const res = await post(base, "/api/auth/register", { email: "valid@example.com", password: "short" });
    assert.equal(res.status, 400);
  });
});

test("BL-003-T09 POST /api/auth/login succeeds with correct credentials", async () => {
  await withServer(makeRouter(), async (base) => {
    await post(base, "/api/auth/register", { email: "login@example.com", password: "mypassword1" });
    const res = await post(base, "/api/auth/login", { email: "login@example.com", password: "mypassword1" });
    assert.equal(res.status, 200);
    const { token } = await res.json();
    assert.ok(typeof token === "string" && token.length > 10);
  });
});

test("BL-003-T10 POST /api/auth/login returns 401 for wrong password", async () => {
  await withServer(makeRouter(), async (base) => {
    await post(base, "/api/auth/register", { email: "wrong@example.com", password: "correctpass1" });
    const res = await post(base, "/api/auth/login", { email: "wrong@example.com", password: "wrongpass11" });
    assert.equal(res.status, 401);
  });
});

test("BL-003-T11 POST /api/auth/login returns 401 for unknown email", async () => {
  await withServer(makeRouter(), async (base) => {
    const res = await post(base, "/api/auth/login", { email: "ghost@example.com", password: "password123" });
    assert.equal(res.status, 401);
  });
});

test("BL-003-T12 GET /api/auth/me returns the logged-in parent for a valid token", async () => {
  await withServer(makeRouter(), async (base) => {
    const reg = await post(base, "/api/auth/register", { email: "gate@example.com", password: "password123" });
    const { token } = await reg.json();
    const me = await fetch(base + "/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
    const body = await me.json();
    assert.equal(body.email, "gate@example.com");
    assert.ok(typeof body.id === "string");
  });
});

test("BL-003-T13 GET /api/auth/me returns 401 with no Authorization header", async () => {
  await withServer(makeRouter(), async (base) => {
    const res = await fetch(base + "/api/auth/me");
    assert.equal(res.status, 401);
  });
});

test("BL-003-T14 GET /api/auth/me returns 401 for a forged token", async () => {
  await withServer(makeRouter(), async (base) => {
    const fakeToken = signToken("nonexistent-user-id", "wrong-secret");
    const res = await fetch(base + "/api/auth/me", { headers: { Authorization: `Bearer ${fakeToken}` } });
    assert.equal(res.status, 401);
  });
});

test("BL-003-T15 verifyToken returns null for a token older than 7 days", () => {
  const oldTs = (Date.now() - 8 * 24 * 60 * 60 * 1000).toString(36);
  const payload = `fakeuser.${oldTs}`;
  const hmac = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  assert.equal(verifyToken(`${payload}.${hmac}`, SECRET), null);
});

test("BL-003-T16 too many login attempts from one IP get a 429", async () => {
  await withServer(makeRouter({ loginMax: 2 }), async (base) => {
    // 3 attempts against an unknown email — fast (no scrypt), still rate-limited
    await post(base, "/api/auth/login", { email: "ghost@test.com", password: "x" });
    await post(base, "/api/auth/login", { email: "ghost@test.com", password: "x" });
    const res = await post(base, "/api/auth/login", { email: "ghost@test.com", password: "x" });
    assert.equal(res.status, 429);
  });
});
