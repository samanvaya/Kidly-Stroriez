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

test("BL-021-T05 reasoning without an opening <think>, or in the middle, never stays on screen", async () => {
  // Some templates leave out "<think>": the reply starts with reasoning and only "</think>" shows.
  const noOpen = createNvidiaProvider({
    apiKey: "nvapi-test",
    fetchImpl: async () => sseOf([{ content: "The child is 5 so keep" }, { content: " calm.</think>" }, { content: "\n\nPip ran" }, { content: " home." }]),
  });
  const events = await drain(noOpen.streamStory({ system: "s", user: "u" }));
  // What the child ends up seeing: text after the last reset.
  const lastReset = events.map((e) => e.type).lastIndexOf("reset");
  assert.ok(lastReset !== -1, "already-shown reasoning is withdrawn with a reset");
  assert.equal(events.slice(lastReset + 1).map((e) => e.text).join(""), "Pip ran home.");

  const middle = createNvidiaProvider({
    apiKey: "nvapi-test",
    fetchImpl: async () => sseOf([{ content: "Pip ran.<thi" }, { content: "nk>secret plan" }, { content: "</think> Home." }]),
  });
  const mid = await drain(middle.streamStory({ system: "s", user: "u" }));
  assert.ok(!mid.some((e) => e.type === "text" && e.text.includes("secret")), "text inside <think> is never sent");
});

test("BL-021-T06 at the end of a reply: unclosed reasoning is dropped, held-back text is sent", async () => {
  const unclosed = createNvidiaProvider({ apiKey: "nvapi-test", fetchImpl: async () => sseOf([{ content: "Pip ran. <think>still thinking" }]) });
  assert.equal((await drain(unclosed.streamStory({ system: "s", user: "u" }))).map((e) => e.text).join(""), "Pip ran. ");
  const lt = createNvidiaProvider({ apiKey: "nvapi-test", fetchImpl: async () => sseOf([{ content: "Hugs <" }]) });
  assert.equal((await drain(lt.streamStory({ system: "s", user: "u" }))).map((e) => e.text).join(""), "Hugs <");
});

test("BL-021-T07 plans: 202 pending and unfinished streams are errors; an SSE body without the header still works", async () => {
  const pending = createNvidiaProvider({ apiKey: "nvapi-test", fetchImpl: async () => new Response("", { status: 202 }) });
  await assert.rejects(pending.plan({ system: "s", user: "u" }), (e) => e.status === 202);

  const cutOff = createNvidiaProvider({
    apiKey: "nvapi-test",
    fetchImpl: async () => new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"safe":' } }] })}\n\n`)); c.close(); } }), { status: 200, headers: { "Content-Type": "text/event-stream" } }),
  });
  await assert.rejects(cutOff.plan({ system: "s", user: "u" }), (e) => e.status === 502);

  const noHeader = createNvidiaProvider({
    apiKey: "nvapi-test",
    fetchImpl: async () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"safe":true}' } }] })}\n\ndata: [DONE]\n\n`, { status: 200 }),
  });
  assert.deepEqual(await noHeader.plan({ system: "s", user: "u" }), { refused: false, text: '{"safe":true}' });
});

test("BL-021-T08 reasoning tags in any case or spacing are removed, and story text around them is kept", async () => {
  const { visibleText } = await import("../src/nvidia.js");
  assert.equal(visibleText("<THINK>plan</THINK>Pip ran.", { final: true }), "Pip ran.");
  assert.equal(visibleText("< think >plan</ think >Pip ran.", { final: true }), "Pip ran.");
  assert.equal(visibleText("Once upon a time<think>x</think> the cat slept.", { final: true }), "Once upon a time the cat slept.");
  assert.equal(visibleText("A<think>1</think>B<think>2</think>C", { final: true }), "ABC");
  assert.equal(visibleText("<think>a<think>b</think> c</think>Pip", { final: true }), "Pip");
  assert.equal(visibleText("Pip ran <TH"), "Pip ran ", "a partial tag is held back while streaming");
  assert.equal(visibleText("Pip ran <3"), "Pip ran <3");

  // Streamed one character at a time, the child never sees the reasoning.
  const reply = "Pip <Think>do not show this</Think>ran home.";
  const p = createNvidiaProvider({ apiKey: "nvapi-test", fetchImpl: async () => sseOf([...reply].map((ch) => ({ content: ch }))) });
  const events = await drain(p.streamStory({ system: "s", user: "u" }));
  assert.ok(!events.some((e) => e.type === "text" && /show|this/.test(e.text)));
  const lastReset = events.map((e) => e.type).lastIndexOf("reset");
  assert.equal(events.slice(lastReset + 1).map((e) => e.text).join(""), "Pip ran home.");
});
