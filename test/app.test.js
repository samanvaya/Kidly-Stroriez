import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, resolveProvider, signPlan } from "../src/app.js";
import { createNvidiaProvider, DEFAULT_NVIDIA_MODEL } from "../src/nvidia.js";

const notes = { age: 5, hero: "pip", happened: "Fought over a toy car", felt: "Angry", did: "Grabbed it" };
const plan = { title: "T", theme: "Sharing", lesson: "Share", setting: "Meadow", echo: "Like today", choices: ["a", "b"] };
const sig = signPlan(plan, notes);

function fakeClient({ reply = "", content, chunks = [], events, stopReason = "end_turn", fail = false } = {}) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        async create(params) {
          calls.push(params);
          if (fail) throw new Error("boom");
          return { stop_reason: stopReason, content: content || [{ type: "text", text: reply }] };
        },
        stream(params) {
          calls.push(params);
          return {
            async *[Symbol.asyncIterator]() {
              if (fail) throw new Error("boom");
              if (events) for (const e of events) yield e;
              for (const t of chunks) yield { type: "content_block_delta", delta: { type: "text_delta", text: t } };
            },
            async finalMessage() {
              return { stop_reason: stopReason, content: [] };
            },
          };
        },
      },
    },
  };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

const post = (base, path, body) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("BL-001-T07 /api/plan returns a parsed plan and never sends the child's name", async () => {
  const client = fakeClient({ reply: JSON.stringify({ safe: true, ...plan }) });
  await withServer(createApp({ client }), async (base) => {
    const res = await post(base, "/api/plan", { ...notes, name: "Mia" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.theme, "Sharing");
    assert.equal(body.sig, signPlan(plan, notes));
    assert.ok(!JSON.stringify(client.calls[0]).includes("Mia"));
  });
});

test("BL-001-T08 /api/plan rejects missing notes and unknown heroes", async () => {
  await withServer(createApp({ client: fakeClient() }), async (base) => {
    assert.equal((await post(base, "/api/plan", { ...notes, happened: "" })).status, 400);
    assert.equal((await post(base, "/api/plan", { ...notes, hero: "dragon" })).status, 400);
    assert.equal((await post(base, "/api/plan", { ...notes, age: 12 })).status, 400);
  });
});

test("BL-001-T09 without an AI key the API reports offline so the app uses the built-in story", async () => {
  await withServer(createApp({ client: null }), async (base) => {
    assert.deepEqual(await (await fetch(base + "/api/config")).json(), { live: false });
    assert.equal((await post(base, "/api/plan", notes)).status, 503);
  });
});

test("BL-001-T10 /api/plan returns 502 when the AI call fails", async () => {
  await withServer(createApp({ client: fakeClient({ fail: true }) }), async (base) => {
    assert.equal((await post(base, "/api/plan", notes)).status, 502);
  });
});

test("BL-001-T11 /api/story refuses to write before the plan is approved", async () => {
  const client = fakeClient();
  await withServer(createApp({ client }), async (base) => {
    const res = await post(base, "/api/story", { ...notes, plan, partIndex: 0, history: [] });
    assert.equal(res.status, 400);
    assert.equal(client.calls.length, 0);
  });
});

test("BL-001-T12 /api/story streams text and options without the marker", async () => {
  const client = fakeClient({ chunks: ["Pip found ", "a kite.\n@@", '@\n{"options":["Share","Grab","Shout"]}'] });
  await withServer(createApp({ client }), async (base) => {
    const res = await post(base, "/api/story", { ...notes, plan, approved: true, sig, partIndex: 0, history: [] });
    assert.equal(res.status, 200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const text = lines.filter((l) => l.type === "text").map((l) => l.text).join("");
    assert.equal(text.trim(), "Pip found a kite.");
    assert.deepEqual(lines.at(-1), { type: "options", options: ["Share", "Grab", "Shout"] });
  });
});

test("BL-001-T13 /api/story sends the ending lesson and questions on the last part", async () => {
  const client = fakeClient({ chunks: ["They slept.\n@@@\n", '{"lesson":"Share","questions":["q1","q2"]}'] });
  const history = [{ text: "p1", choice: "c1" }, { text: "p2", choice: "c2" }];
  await withServer(createApp({ client }), async (base) => {
    const res = await post(base, "/api/story", { ...notes, plan, approved: true, sig, partIndex: 2, history });
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.at(-1), { type: "end", lesson: "Share", questions: ["q1", "q2"] });
  });
});

test("BL-001-T14 /api/story reports an error line when the AI call fails mid-way", async () => {
  await withServer(createApp({ client: fakeClient({ fail: true }) }), async (base) => {
    const res = await post(base, "/api/story", { ...notes, plan, approved: true, sig, partIndex: 0, history: [] });
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.at(-1).type, "error");
  });
});

test("BL-001-T16 /api/story rejects a plan the server did not sign for these notes", async () => {
  const client = fakeClient({ chunks: ["x"] });
  await withServer(createApp({ client }), async (base) => {
    const forged = { ...plan, theme: "Something else" };
    const r1 = await post(base, "/api/story", { ...notes, plan: forged, sig, approved: true, partIndex: 0, history: [] });
    const r2 = await post(base, "/api/story", { ...notes, happened: "changed", plan, sig, approved: true, partIndex: 0, history: [] });
    assert.equal(r1.status, 400);
    assert.equal(r2.status, 400);
    assert.equal(client.calls.length, 0);
  });
});

test("BL-001-T17 /api/story restarts the part when a safety fallback switches models", async () => {
  const delta = (t) => ({ type: "content_block_delta", delta: { type: "text_delta", text: t } });
  const events = [delta("Declined start"), { type: "content_block_start", content_block: { type: "fallback" } }];
  const client = fakeClient({ events, chunks: ["Fresh start.\n@@@\n", '{"options":["a","b","c"]}'] });
  await withServer(createApp({ client }), async (base) => {
    const res = await post(base, "/api/story", { ...notes, plan, sig, approved: true, partIndex: 0, history: [] });
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const resetAt = lines.findIndex((l) => l.type === "reset");
    assert.ok(resetAt > 0);
    const after = lines.slice(resetAt).filter((l) => l.type === "text").map((l) => l.text).join("");
    assert.equal(after.trim(), "Fresh start.");
  });
});

test("BL-001-T18 /api/plan uses only the text after a safety fallback switch", async () => {
  const content = [
    { type: "text", text: '{"safe":true,"theme":"half' },
    { type: "fallback", from: { model: "a" }, to: { model: "b" } },
    { type: "text", text: JSON.stringify({ safe: true, ...plan }) },
  ];
  await withServer(createApp({ client: fakeClient({ content }) }), async (base) => {
    const res = await post(base, "/api/plan", notes);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).theme, "Sharing");
  });
});

test("BL-001-T19 too many requests from one visitor get a 429", async () => {
  const client = fakeClient({ reply: JSON.stringify({ safe: true, ...plan }) });
  await withServer(createApp({ client, limit: { windowMs: 60000, max: 2 } }), async (base) => {
    assert.equal((await post(base, "/api/plan", notes)).status, 200);
    assert.equal((await post(base, "/api/plan", notes)).status, 200);
    assert.equal((await post(base, "/api/plan", notes)).status, 429);
  });
});

function fakeSseFetch(chunks, { status = 200, onCall } = {}) {
  const encoder = new TextEncoder();
  return async (url, init) => {
    onCall?.({ url, init, body: JSON.parse(init.body) });
    if (status !== 200) return new Response("error", { status });
    const stream = new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
}

function fakeJsonFetch(payload, { status = 200, onCall } = {}) {
  return async (url, init) => {
    onCall?.({ url, init, body: JSON.parse(init.body) });
    if (status !== 200) return new Response("error", { status });
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

test("BL-012-T01 /api/plan uses NVIDIA provider with Bearer auth and default model, omitting child's name", async () => {
  const seen = [];
  const fetchImpl = fakeJsonFetch(
    { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ safe: true, ...plan }) } }] },
    { onCall: (c) => seen.push(c) }
  );
  const provider = createNvidiaProvider({ apiKey: "nvapi-test-key", fetchImpl });
  await withServer(createApp({ provider }), async (base) => {
    assert.deepEqual(await (await fetch(base + "/api/config")).json(), { live: true });
    const res = await post(base, "/api/plan", { ...notes, name: "Mia" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.theme, "Sharing");
    assert.equal(body.sig, signPlan(plan, notes));
    assert.equal(seen[0].url, "https://integrate.api.nvidia.com/v1/chat/completions");
    assert.equal(seen[0].init.headers.Authorization, "Bearer nvapi-test-key");
    assert.equal(seen[0].body.model, DEFAULT_NVIDIA_MODEL);
    assert.ok(!JSON.stringify(seen[0].body).includes("Mia"));
  });
});

test("BL-012-T02 /api/story streams NVIDIA SSE delta.content chunks, ignores reasoning_content/null, and strips @@@", async () => {
  const sseChunks = [
    ': keep-alive\r\n\r\ndata: {"choices":[{"delta":{"role":"assistant","content":null,"reasoning_content":"think"}}]}\r\n',
    'data: {"choices":[{"delta":{"content":"Pip found "}}]}\r\ndata: {"choices":[{"delta":{"content":"a ',
    'kite.\\n@@"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"@\\n{\\"options\\":[\\"Share\\",\\"Grab\\",\\"Wait\\"]}"}}]}\r\n',
    "data: [DONE]\r\n",
  ];
  const provider = createNvidiaProvider({ apiKey: "nvapi-test-key", fetchImpl: fakeSseFetch(sseChunks) });
  await withServer(createApp({ provider }), async (base) => {
    const res = await post(base, "/api/story", { ...notes, plan, approved: true, sig, partIndex: 0, history: [] });
    assert.equal(res.status, 200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const text = lines.filter((l) => l.type === "text").map((l) => l.text).join("");
    assert.equal(text.trim(), "Pip found a kite.");
    assert.ok(!text.includes("think"));
    assert.ok(!text.includes("null"));
    assert.deepEqual(lines.at(-1), { type: "options", options: ["Share", "Grab", "Wait"] });
  });
});

test("BL-012-T03 NVIDIA provider maps HTTP errors, length truncation, and content_filter refusals", async () => {
  const errProvider = createNvidiaProvider({ apiKey: "nvapi-test-key", fetchImpl: fakeJsonFetch({}, { status: 500 }) });
  await withServer(createApp({ provider: errProvider }), async (base) => {
    assert.equal((await post(base, "/api/plan", notes)).status, 502);
    const storyRes = await post(base, "/api/story", { ...notes, plan, approved: true, sig, partIndex: 0, history: [] });
    const lines = (await storyRes.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.at(-1), { type: "error", error: "unavailable" });
  });

  const lengthProvider = createNvidiaProvider({
    apiKey: "nvapi-test-key",
    fetchImpl: fakeJsonFetch({ choices: [{ finish_reason: "length", message: { content: "" } }] }),
  });
  await withServer(createApp({ provider: lengthProvider }), async (base) => {
    assert.equal((await post(base, "/api/plan", notes)).status, 502);
  });

  const planRefused = createNvidiaProvider({
    apiKey: "nvapi-test-key",
    fetchImpl: fakeJsonFetch({ choices: [{ finish_reason: "content_filter", message: { content: null } }] }),
  });
  await withServer(createApp({ provider: planRefused }), async (base) => {
    const res = await post(base, "/api/plan", notes);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).safe, false);
  });

  const storyRefused = createNvidiaProvider({
    apiKey: "nvapi-test-key",
    fetchImpl: fakeSseFetch([
      'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
      'data: {"choices":[{"finish_reason":"content_filter","delta":{}}]}\n\n',
    ]),
  });
  await withServer(createApp({ provider: storyRefused }), async (base) => {
    const res = await post(base, "/api/story", { ...notes, plan, approved: true, sig, partIndex: 0, history: [] });
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.at(-1), { type: "error", error: "refused" });
    assert.ok(!lines.some((l) => l.type === "options" || l.type === "end"));
  });
});

test("BL-012-T04 resolveProvider and createApp respect AI_PROVIDER, blank strings, base URL slash, and client: null", async () => {
  const urls = [];
  const fetchImpl = (url, init) => {
    urls.push(url);
    return fakeJsonFetch({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] })(url, init);
  };
  const nvidiaAuto = resolveProvider(
    { AI_PROVIDER: "  ", NVIDIA_API_KEY: " nvapi-1 ", ANTHROPIC_API_KEY: "sk-1", NVIDIA_BASE_URL: "https://nim.test/v1///" },
    { fetchImpl }
  );
  assert.equal(nvidiaAuto.label, "live (NVIDIA Nemotron)");
  await nvidiaAuto.provider.plan({ system: "s", user: "u" });
  assert.equal(urls[0], "https://nim.test/v1/chat/completions");

  assert.equal(resolveProvider({ AI_PROVIDER: "anthropic", NVIDIA_API_KEY: "nvapi-1", ANTHROPIC_API_KEY: "sk-1" }).label, "live (Claude)");
  assert.equal(resolveProvider({ AI_PROVIDER: "nvidia", ANTHROPIC_API_KEY: "sk-1" }).provider, null);
  assert.equal(resolveProvider({ AI_PROVIDER: "unknown", NVIDIA_API_KEY: "nvapi-1" }).provider, null);

  await withServer(createApp({ client: null, env: { NVIDIA_API_KEY: "nvapi-1" } }), async (base) => {
    assert.deepEqual(await (await fetch(base + "/api/config")).json(), { live: false });
    assert.equal((await post(base, "/api/plan", notes)).status, 503);
  });
});

test("BL-012-T05 client disconnect aborts upstream fetch and idle timeout aborts stalled calls", async () => {
  let abortedOnDisconnect = false;
  let upstreamStarted;
  const startedPromise = new Promise((r) => (upstreamStarted = r));
  const slowFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      upstreamStarted();
      init.signal.addEventListener("abort", () => {
        abortedOnDisconnect = true;
        reject(new Error("aborted"));
      });
    });
  const disconnectProvider = createNvidiaProvider({ apiKey: "nvapi-test-key", fetchImpl: slowFetch, timeoutMs: 5000 });
  await withServer(createApp({ provider: disconnectProvider }), async (base) => {
    const clientAbort = new AbortController();
    const reqPromise = fetch(base + "/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notes),
      signal: clientAbort.signal,
    }).catch(() => {});
    await startedPromise;
    clientAbort.abort();
    await reqPromise;
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(abortedOnDisconnect, true);
  });

  const stalledProvider = createNvidiaProvider({
    apiKey: "nvapi-test-key",
    timeoutMs: 30,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      }),
  });
  await withServer(createApp({ provider: stalledProvider }), async (base) => {
    const res = await post(base, "/api/plan", notes);
    assert.equal(res.status, 502);
  });
});
