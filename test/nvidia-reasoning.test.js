import { test } from "node:test";
import assert from "node:assert/strict";
import { createNvidiaProvider } from "../src/nvidia.js";
import { resolveProvider } from "../src/app.js";

const enc = new TextEncoder();
const sseOf = (deltas, finish = "stop") => {
  const lines = deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: d }] })}\n\n`);
  lines.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`);
  return new Response(new ReadableStream({ start(c) { for (const l of lines) c.enqueue(enc.encode(l)); c.close(); } }), {
    status: 200, headers: { "Content-Type": "text/event-stream" },
  });
};
const recorder = (reply) => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ init, body: JSON.parse(init.body) });
    return reply();
  };
  return { seen, fetchImpl };
};
const drain = async (gen) => {
  const out = [];
  for await (const e of gen) out.push(e);
  return out;
};

test("BL-021-T01 plans and stories are streamed with their reasoning level (plan medium, story none)", async () => {
  const { seen, fetchImpl } = recorder(() => sseOf([{ content: "hi" }]));
  const p = createNvidiaProvider({ apiKey: "nvapi-test", fetchImpl });
  await p.plan({ system: "s", user: "u" });
  await drain(p.streamStory({ system: "s", user: "u" }));
  assert.equal(seen[0].body.stream, true);
  assert.equal(seen[0].body.reasoning_effort, "medium");
  assert.equal(seen[0].init.headers.Accept, "text/event-stream");
  assert.equal(seen[1].body.stream, true);
  assert.equal(seen[1].body.reasoning_effort, "none");
});

test("BL-021-T02 a streamed plan is put back together, and a streamed refusal is a refusal", async () => {
  const ok = createNvidiaProvider({ apiKey: "nvapi-test", fetchImpl: async () => sseOf([{ reasoning_content: "thinking…" }, { content: '{"safe":' }, { content: "true}" }]) });
  assert.deepEqual(await ok.plan({ system: "s", user: "u" }), { refused: false, text: '{"safe":true}' });
  const no = createNvidiaProvider({ apiKey: "nvapi-test", fetchImpl: async () => sseOf([{ content: "{" }], "content_filter") });
  assert.deepEqual(await no.plan({ system: "s", user: "u" }), { refused: true, text: "" });
});

test("BL-021-T03 reasoning written into the reply as <think>…</think> never reaches the child", async () => {
  const story = createNvidiaProvider({
    apiKey: "nvapi-test",
    fetchImpl: async () => sseOf([{ content: " <thi" }, { content: "nk>the child is 5, keep it" }, { content: " calm</thi" }, { content: "nk>\n\nPip ran" }, { content: " home." }]),
  });
  const events = await drain(story.streamStory({ system: "s", user: "u" }));
  assert.equal(events.map((e) => e.text).join(""), "Pip ran home.");

  const json = createNvidiaProvider({
    apiKey: "nvapi-test",
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "<think>hmm</think>{\"safe\":true}" } }] }), { status: 200, headers: { "Content-Type": "application/json" } }),
  });
  assert.deepEqual(await json.plan({ system: "s", user: "u" }), { refused: false, text: '{"safe":true}' });

  const plain = createNvidiaProvider({ apiKey: "nvapi-test", fetchImpl: async () => sseOf([{ content: "<" }, { content: "3 hugs" }]) });
  assert.deepEqual(await plain.plan({ system: "s", user: "u" }), { refused: false, text: "<3 hugs" }, "a reply that only starts like a tag is kept");
});

test("BL-021-T04 reasoning levels can be set in the environment, and wrong values are rejected", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => (seen.push(JSON.parse(init.body)), sseOf([{ content: "x" }]));
  const { provider } = resolveProvider({ NVIDIA_API_KEY: "nvapi-test", NVIDIA_PLAN_REASONING: "high", NVIDIA_STORY_REASONING: "Medium" }, { fetchImpl });
  await provider.plan({ system: "s", user: "u" });
  await drain(provider.streamStory({ system: "s", user: "u" }));
  assert.deepEqual(seen.map((b) => b.reasoning_effort), ["high", "medium"]);
  assert.throws(() => createNvidiaProvider({ apiKey: "nvapi-test", storyReasoning: "max" }), /NVIDIA_STORY_REASONING must be one of none, medium, high/);
});
