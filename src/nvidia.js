// Server-side NVIDIA NIM Chat Completions adapter (OpenAI-compatible).
// Uses Node 20+ built-in fetch so no extra dependencies are needed (ADR-005, ADR-006).

export const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
export const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 8192;

function createTimeoutController(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let timer = null;

  const onParentAbort = () => controller.abort(parentSignal.reason);
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        const err = new Error(`NVIDIA API timed out after ${timeoutMs}ms`);
        err.status = 504;
        controller.abort(err);
      }, timeoutMs);
    }
  };

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
  };

  resetTimer();
  return { signal: controller.signal, resetTimer, cleanup };
}

function isRefusal(choice, msgOrDelta) {
  return (
    choice?.finish_reason === "content_filter" ||
    choice?.finish_reason === "refusal" ||
    Boolean(msgOrDelta?.refusal)
  );
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizeBaseUrl(rawUrl) {
  const candidate = (typeof rawUrl === "string" && rawUrl.trim()) || DEFAULT_NVIDIA_BASE_URL;
  const parsed = new URL(candidate);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("NVIDIA_BASE_URL must not contain credentials, query strings, or fragments");
  }
  const isHttps = parsed.protocol === "https:";
  const isLoopbackHttp = parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
  if (!isHttps && !isLoopbackHttp) {
    throw new Error("NVIDIA_BASE_URL must use https:// (or http:// for localhost only)");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function readWithAbort(reader, signal) {
  if (signal.aborted) return Promise.reject(signal.reason || new Error("Aborted"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason || new Error("Aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (res) => {
        signal.removeEventListener("abort", onAbort);
        resolve(res);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

export const REASONING_LEVELS = ["none", "medium", "high"];
// Plans decide whether a note is safe to turn into a story, so they get some reasoning;
// story parts are read live by a child, so they start fast without it (NFR-01).
export const DEFAULT_PLAN_REASONING = "medium";
export const DEFAULT_STORY_REASONING = "none";

function checkReasoning(value, fallback, name) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!v) return fallback;
  if (!REASONING_LEVELS.includes(v)) throw new Error(`${name} must be one of ${REASONING_LEVELS.join(", ")}`);
  return v;
}

// Reasoning must never reach the child (BL-021). The API may return it in
// `reasoning_content` (ignored) or inside the reply text as <think>...</think>, and some
// model templates leave out the opening <think>, so only "</think>" shows. The filter
// recomputes the visible text from the whole reply each time:
// - everything up to the last "</think>" is reasoning;
// - an unclosed "<think>" cuts the text from there;
// - an ending that could still become a tag is held back until the next chunk.
// If already-sent text turns out to be reasoning, it asks the caller to reset.
const OPEN_RE = /<\s*think\s*>/i;
const CLOSE_RE = /<\s*\/\s*think\s*>/i;
const PAIR_RE = /<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi;
// An ending that could still grow into <think> or </think> ("<", "</th", "<THI ").
const PARTIAL_TAG_RE = /<\s*\/?\s*(?:t(?:h(?:i(?:n(?:k\s*)?)?)?)?)?$/i;

export function visibleText(raw, { final = false } = {}) {
  let t = raw;
  for (let guard = 0; guard < 50; guard++) {
    const close = t.search(CLOSE_RE);
    const open = t.search(OPEN_RE);
    if (close !== -1 && (open === -1 || close < open)) {
      // "</think>" with no "<think>" before it: everything before it is reasoning.
      t = t.slice(close).replace(CLOSE_RE, "");
      continue;
    }
    const before = t;
    t = t.replace(PAIR_RE, ""); // whole <think>...</think> blocks
    if (t === before) break;
  }
  const open = t.search(OPEN_RE);
  if (open !== -1) t = t.slice(0, open); // unclosed: reasoning until the end
  if (!final) t = t.replace(PARTIAL_TAG_RE, "");
  return t.replace(/^\s+/, "");
}

function createReasoningFilter() {
  let raw = "";
  let sent = "";
  let sawAngle = false;
  const step = (final) => {
    const visible = visibleText(raw, { final });
    if (visible.startsWith(sent)) {
      const add = visible.slice(sent.length);
      sent = visible;
      return add ? [{ type: "text", text: add }] : [];
    }
    // Text already shown was reasoning: start this part again with the clean text.
    sent = visible;
    return visible ? [{ type: "reset" }, { type: "text", text: visible }] : [{ type: "reset" }];
  };
  return {
    push(chunk) {
      raw += chunk;
      if (!sawAngle && !chunk.includes("<")) {
        // Fast path: no tag has appeared yet, so the text is shown as it comes.
        const visible = raw.replace(/^\s+/, "");
        const add = visible.slice(sent.length);
        sent = visible;
        return add ? [{ type: "text", text: add }] : [];
      }
      sawAngle = true;
      return step(false);
    },
    flush() {
      return step(true);
    },
  };
}

export function createNvidiaProvider({
  apiKey,
  model,
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  planReasoning,
  storyReasoning,
} = {}) {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) throw new Error("NVIDIA API key is required");

  const resolvedModel = (typeof model === "string" && model.trim()) || DEFAULT_NVIDIA_MODEL;
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl);
  const endpoint = `${resolvedBaseUrl}/chat/completions`;
  const planEffort = checkReasoning(planReasoning, DEFAULT_PLAN_REASONING, "NVIDIA_PLAN_REASONING");
  const storyEffort = checkReasoning(storyReasoning, DEFAULT_STORY_REASONING, "NVIDIA_STORY_REASONING");

  async function postChat({ system, user, temperature, reasoning, signal }) {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // Always streamed: a non-streamed call can be answered with 202 "pending",
        // which would need polling. Streaming also keeps the idle timeout honest.
        stream: true,
        temperature,
        max_tokens: MAX_TOKENS,
        reasoning_effort: reasoning,
      }),
      signal,
    });
    if (!res.ok || res.status === 202) {
      const err = new Error(`NVIDIA API error: HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  const isEventStream = (res) => /text\/event-stream/i.test(res.headers?.get?.("content-type") || "");

  // Reads an SSE reply and yields { type: "text" } / { type: "refused" } events.
  async function* readSse(res, timeout, { requireFinish = false } = {}) {
    if (!res.body || typeof res.body.getReader !== "function") {
      throw new Error("NVIDIA API response has no readable stream");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const filter = createReasoningFilter();
    let buffer = "";
    let finished = false;

    const parseLine = (rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith(":") || !line.startsWith("data:")) return { done: false };
      const payloadStr = line.slice(5).trim();
      if (payloadStr === "[DONE]") {
        finished = true;
        return { done: true };
      }
      let payload;
      try {
        payload = JSON.parse(payloadStr);
      } catch {
        const err = new Error("Invalid SSE JSON from NVIDIA API");
        err.status = 502;
        throw err;
      }
      if (payload?.error) {
        const err = new Error(payload.error.message || "NVIDIA stream error");
        err.status = 502;
        throw err;
      }
      const choice = payload?.choices?.[0];
      const delta = choice?.delta;
      if (isRefusal(choice, delta)) return { done: true, events: [{ type: "refused" }] };
      if (choice?.finish_reason === "length") {
        const err = new Error("NVIDIA response truncated (length)");
        err.status = 502;
        throw err;
      }
      if (choice?.finish_reason) finished = true;
      if (typeof delta?.content === "string" && delta.content.length > 0) {
        return { done: false, events: filter.push(delta.content) };
      }
      return { done: false };
    };

    try {
      while (true) {
        const { value, done } = await readWithAbort(reader, timeout.signal);
        if (done) break;
        timeout.resetTimer();
        buffer += typeof value === "string" ? value : decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const parsed = parseLine(line);
          if (parsed.events) yield* parsed.events;
          if (parsed.done) {
            if (!parsed.events?.some((e) => e.type === "refused")) yield* filter.flush();
            return;
          }
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        const parsed = parseLine(buffer);
        if (parsed.events) yield* parsed.events;
        if (parsed.events?.some((e) => e.type === "refused")) return;
      }
      yield* filter.flush();
      if (!finished && requireFinish) {
        const err = new Error("NVIDIA stream ended early");
        err.status = 502;
        throw err;
      }
    } finally {
      try {
        await reader.cancel?.();
      } catch {
        // Ignore stream cancel errors on cleanup.
      }
    }
  }

  return {
    label: "live (NVIDIA Nemotron)",

    async plan({ system, user, signal } = {}) {
      const timeout = createTimeoutController(signal, timeoutMs);
      try {
        const res = await postChat({ system, user, temperature: 0.4, reasoning: planEffort, signal: timeout.signal });
        let stream = isEventStream(res) ? res : null;
        if (!stream) {
          const rawBody = await res.text();
          if (rawBody.trimStart().startsWith("data:")) {
            // An SSE body sent without the event-stream header is still read as SSE.
            stream = new Response(rawBody);
          } else {
            // Some servers ignore `stream` and answer with one JSON object.
            let data;
            try {
              data = JSON.parse(rawBody);
            } catch {
              const err = new Error("NVIDIA API reply was neither JSON nor a stream");
              err.status = 502;
              throw err;
            }
            const choice = data?.choices?.[0];
            const msg = choice?.message;
            if (isRefusal(choice, msg)) return { refused: true, text: "" };
            if (choice?.finish_reason === "length") {
              const err = new Error("NVIDIA plan response truncated (length)");
              err.status = 502;
              throw err;
            }
            const raw = typeof msg?.content === "string" ? msg.content : "";
            return { refused: false, text: visibleText(raw, { final: true }) };
          }
        }
        let text = "";
        for await (const event of readSse(stream, timeout, { requireFinish: true })) {
          if (event.type === "refused") return { refused: true, text: "" };
          if (event.type === "reset") text = "";
          else text += event.text;
        }
        return { refused: false, text };
      } finally {
        timeout.cleanup();
      }
    },

    async *streamStory({ system, user, signal } = {}) {
      const timeout = createTimeoutController(signal, timeoutMs);
      try {
        const res = await postChat({ system, user, temperature: 0.8, reasoning: storyEffort, signal: timeout.signal });
        yield* readSse(res, timeout);
      } finally {
        timeout.cleanup();
      }
    },
  };
}
