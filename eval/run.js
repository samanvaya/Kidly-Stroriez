#!/usr/bin/env node
// Live safety and quality eval for Kidly Storiez (BL-009).
//
//   npm run eval                          show cases and estimated cost, call nothing
//   npm run eval -- --yes                 run against the real Claude API (costs money)
//   npm run eval -- --dry-run             run the real app routes with a stand-in AI
//   npm run eval -- --dry-run=null        stand-in that gives useless answers (must fail)
//   npm run eval -- --dry-run=refuse      stand-in that refuses (counted, never scored)
//   options: --reps=N (1-10)  --max-usd=N (default 10)  --only=id,id  --label=before|after
//            --write-evidence  --out=DIR
//
// The eval drives the real app (createApp) over HTTP, so it tests exactly the prompts,
// parsing and safety rules that ship. See docs/requirements/BL-009.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnthropicProvider, createApp, resolveProvider } from "../src/app.js";
import { DEFAULT_NVIDIA_MODEL } from "../src/nvidia.js";
import { loadDotEnv } from "../src/env.js";
import { JUDGE_SYSTEM, codeChecks, judgeChecks, judgePrompt, parseJudge } from "./grade.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

// $ per million tokens (input, output), from the published price list (2026-11).
export const PRICES = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
// Rough tokens per case, for the estimate shown before a paid run.
const EST = { safe: { in: 8000, out: 4000 }, unsafe: { in: 2000, out: 1000 }, judge: { in: 3000, out: 1000 } };
const CASE_TIMEOUT_MS = 180_000;
const MAX_REPS = 10;
// The app answers a refused plan with this message (src/app.js); it is a refusal, not
// the model's own safety verdict.
const PLAN_REFUSAL = "We could not make a story from these notes";

export function parseArgs(argv) {
  const a = { yes: false, dryRun: null, reps: 1, maxUsd: 10, only: null, label: null, writeEvidence: false, out: null };
  for (const arg of argv) {
    if (arg === "--yes") a.yes = true;
    else if (arg === "--dry-run") a.dryRun = "oracle";
    else if (arg.startsWith("--dry-run=")) a.dryRun = arg.split("=")[1];
    else if (arg.startsWith("--reps=")) {
      const n = Number(arg.split("=")[1]);
      if (!Number.isInteger(n) || n < 1 || n > MAX_REPS) throw new Error(`--reps must be a whole number from 1 to ${MAX_REPS}`);
      a.reps = n;
    } else if (arg.startsWith("--max-usd=")) {
      const n = Number(arg.split("=")[1]);
      if (!Number.isFinite(n) || n <= 0) throw new Error("--max-usd must be a positive number");
      a.maxUsd = n;
    }
    else if (arg.startsWith("--only=")) a.only = arg.split("=")[1].split(",");
    else if (arg.startsWith("--label=")) a.label = arg.split("=")[1];
    else if (arg === "--write-evidence") a.writeEvidence = true;
    else if (arg.startsWith("--out=")) a.out = arg.split("=")[1];
    else throw new Error(`Unknown option ${arg}`);
  }
  return a;
}

export function loadCases(only) {
  const cases = JSON.parse(readFileSync(path.join(here, "cases.json"), "utf8"));
  return only ? cases.filter((c) => only.includes(c.id)) : cases;
}

const modelPrice = (model) => {
  const key = Object.keys(PRICES).find((k) => String(model).startsWith(k));
  return key ? PRICES[key] : null;
};

export function estimate(cases, reps, appModel, judgeModel) {
  const [ai, ao] = modelPrice(appModel) || PRICES["claude-opus-5-5"];
  const [ji, jo] = modelPrice(judgeModel) || PRICES["claude-opus-5-5"];
  let usd = 0;
  for (const c of cases) {
    const e = c.expectSafe ? EST.safe : EST.unsafe;
    usd += (e.in * ai + e.out * ao) / 1e6;
    if (c.expectSafe) usd += (EST.judge.in * ji + EST.judge.out * jo) / 1e6;
  }
  return usd * reps;
}

// Wraps a client so every call's served model and token usage land in `ledger.calls`,
// tagged with the case that started it. A call still running when its case times out
// is billed anyway, so `ledger.pending` lets the run wait for it before adding up cost.
function recording(inner, ledger, state) {
  const note = (caseId, role, message) => {
    if (message) ledger.calls.push({ caseId, role, model: message.model, usage: message.usage || {} });
  };
  const track = (promise) => {
    ledger.pending.add(promise);
    promise.then(() => ledger.pending.delete(promise), () => ledger.pending.delete(promise));
    return promise;
  };
  return {
    beta: {
      messages: {
        create(params, opts) {
          const caseId = state.case?.id;
          return track(inner.beta.messages.create(params, opts).then((m) => {
            note(caseId, params.system === JUDGE_SYSTEM ? "judge" : "app", m);
            return m;
          }));
        },
        stream(params, opts) {
          const caseId = state.case?.id;
          const s = inner.beta.messages.stream(params, opts);
          const final = s.finalMessage.bind(s);
          const done = track(final().then((m) => (note(caseId, "app", m), m)));
          done.catch(() => {});
          s.finalMessage = () => done;
          return s;
        },
      },
    },
  };
}

// ---------- stand-in AI for --dry-run ----------
const ORACLE_PART = [
  "Pip padded into Willow Meadow, where the grass swished softly in the evening breeze. Under the old oak tree, Moss the hedgehog was building a little house of acorns. Pip wanted to help, but Moss wanted to build it alone. Pip felt a hot, prickly feeling rise up inside, like a kettle starting to bubble. The acorns looked so shiny and perfect. Pip stood very still, paws curled, wondering what to do next while the first star peeped out above the trees.",
  "Pip took a slow breath, then another, and the prickly feeling began to melt like snow in sunshine. Moss looked up and gave a small, shy smile. Together they looked at the acorn house, which was leaning a little to one side. A gust of wind made it wobble. Moss's eyes went wide and worried. Pip noticed Moss's whiskers twitching and remembered how it felt when things went wrong. Now Pip had to decide how to help a friend who was feeling wobbly too.",
  "Pip and Moss pressed the acorns gently back into place, one by one, until the little house stood straight and proud. Moss laughed a soft, happy laugh, and Pip felt warm all the way to the tip of the tail. The moon rose round and silver over Willow Meadow. The two friends sat side by side, watching the fireflies blink like tiny lanterns. Pip yawned a big, sleepy yawn. Helping each other, Pip thought, makes everything feel better. Then Pip curled up, closed both eyes, and drifted into dreams.",
];

export function fakeClient(mode, state) {
  const planReply = () => {
    if (mode === "null") return '{"safe":true,"theme":"x","lesson":"x","choices":["a","b"]}';
    if (!state.case.expectSafe) return '{"safe":false,"message":"This sounds like something to talk through with someone you trust, such as a doctor or teacher."}';
    return JSON.stringify({
      safe: true, title: "The Acorn House", theme: "Helping when it feels hard", lesson: "Taking a breath helps us choose kindly.",
      setting: "Willow Meadow at dusk.", echo: "Like today, the hero has a big feeling about something a friend has.",
      choices: ["What to do with the hot, prickly feeling", "How to help a worried friend"],
    });
  };
  const partReply = (prompt) => {
    const i = prompt.includes("part 3 of 3") ? 2 : prompt.includes("part 2 of 3") ? 1 : 0;
    // Readable but useless: too short, two options, an empty ending.
    if (mode === "null") return i === 2 ? 'Okay.\n@@@\n{"lesson":"","questions":[]}' : 'Okay.\n@@@\n{"options":["a","b"]}';
    const tail = i === 2
      ? '@@@\n{"lesson":"Taking a breath helps us choose kindly.","questions":["When did you feel a prickly feeling today?","What helps you calm down?"]}'
      : '@@@\n{"options":["Take a slow breath","Grab the acorns","Ask to help"]}';
    return `${ORACLE_PART[i]}\n${tail}`;
  };
  const judgeReply = () =>
    mode === "null" ? "no idea" : '{"calm":5,"feelings":5,"ageFit":5,"calmEnding":5,"reason":"fine"}';
  const msg = (text) => ({ model: "stand-in", stop_reason: "end_turn", usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: "text", text }] });
  return {
    beta: {
      messages: {
        async create(params) {
          if (mode === "refuse" && params.system !== JUDGE_SYSTEM) return { ...msg(""), stop_reason: "refusal" };
          return msg(params.system === JUDGE_SYSTEM ? judgeReply() : planReply());
        },
        stream(params) {
          const text = partReply(params.messages[0].content);
          return {
            async *[Symbol.asyncIterator]() {
              for (let k = 0; k < text.length; k += 40) {
                yield { type: "content_block_delta", delta: { type: "text_delta", text: text.slice(k, k + 40) } };
              }
            },
            async finalMessage() {
              return msg(text);
            },
            abort() {},
          };
        },
      },
    },
  };
}

// ---------- one case ----------
class InfraError extends Error {}

async function postJson(base, route, body, signal) {
  const res = await fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  return res;
}

async function storyPart(base, body, signal) {
  const res = await postJson(base, "/api/story", body, signal);
  if (!res.ok) throw new InfraError(`/api/story HTTP ${res.status}`);
  const part = { text: "", options: [], end: null, error: null };
  for (const line of (await res.text()).split("\n")) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.type === "text") part.text += m.text;
    else if (m.type === "reset") part.text = "";
    else if (m.type === "options") part.options = m.options;
    else if (m.type === "end") part.end = { lesson: m.lesson, questions: m.questions };
    else if (m.type === "error") part.error = m.error;
  }
  if (part.error === "unavailable") throw new InfraError("AI unavailable during story");
  part.text = part.text.trim();
  return part;
}

export async function runCase(base, c, signal) {
  const notes = { age: c.age, hero: c.hero, happened: c.happened, felt: c.felt, did: c.did };
  const res = await postJson(base, "/api/plan", notes, signal);
  if (!res.ok) throw new InfraError(`/api/plan HTTP ${res.status}`);
  const plan = await res.json();
  const output = { plan, parts: [], ending: null, refused: false };
  if (plan.safe === false && String(plan.message || "").startsWith(PLAN_REFUSAL)) {
    output.refused = "plan";
    return output;
  }
  if (plan.safe === false) return output;
  for (let i = 0; i < 3; i++) {
    const history = output.parts.map((p) => ({ text: p.text, choice: p.chosen }));
    const part = await storyPart(base, { ...notes, plan, sig: plan.sig, approved: true, partIndex: i, history }, signal);
    if (part.error === "refused") {
      output.refused = `part ${i + 1}`;
      output.parts.push({ text: part.text, options: [] });
      break;
    }
    if (part.error === "no-options") throw new InfraError(`unparseable: story part ${i + 1} had no usable options`);
    if (part.error) throw new InfraError(`story part ${i + 1} failed (${part.error})`);
    const entry = { text: part.text, options: part.options };
    if (i < 2) entry.chosen = part.options[c.picks[i]] ?? part.options[0];
    output.parts.push(entry);
    if (part.end) output.ending = part.end;
  }
  return output;
}

// Judge with Claude: its own model and a higher effort than the app (EVAL_GRADER_MODEL).
function claudeJudge(client, model) {
  return async (user, signal) => {
    const m = await client.beta.messages.create(
      {
        model, max_tokens: 4000, output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        system: JUDGE_SYSTEM, messages: [{ role: "user", content: user }],
      },
      { signal },
    );
    return m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  };
}

// Judge with any app provider (e.g. NVIDIA): the same model grades its own stories,
// which can be lenient; the summary says so.
function providerJudge(provider) {
  return async (user, signal) => {
    const reply = await provider.plan({ system: JUDGE_SYSTEM, user, signal });
    if (reply.refused) throw new InfraError("judge refused to grade");
    return reply.text;
  };
}

// Records each call of a non-Claude provider (model, role) for the summary. NVIDIA
// does not report token usage to the app, so usage stays empty and cost is not priced.
function recordingProvider(provider, model, ledger, state) {
  const track = (promise) => {
    ledger.pending.add(promise);
    promise.then(() => ledger.pending.delete(promise), () => ledger.pending.delete(promise));
    return promise;
  };
  const note = (caseId, system) =>
    ledger.calls.push({ caseId, role: system === JUDGE_SYSTEM ? "judge" : "app", model, usage: {} });
  return {
    label: provider.label,
    plan(args) {
      const caseId = state.case?.id;
      return track(provider.plan(args).then((r) => (note(caseId, args.system), r)));
    },
    async *streamStory(args) {
      const caseId = state.case?.id;
      let done;
      const finished = new Promise((r) => (done = r));
      track(finished);
      try {
        yield* provider.streamStory(args);
        note(caseId, args.system);
      } finally {
        done();
      }
    },
  };
}

async function judge(judgeFn, c, output, signal) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await judgeFn(judgePrompt(c, output), signal);
    try {
      return parseJudge(text);
    } catch (err) {
      if (attempt === 2) throw new InfraError(`judge reply unusable: ${err.message}`);
    }
  }
}

// A refused case is not scored, except that text already written is still checked for
// names and banned labels (those must never reach the child, refusal or not).
function refusedChecks(c, output) {
  const keys = Object.keys(codeChecks(c, { plan: {} }).checks);
  const checks = Object.fromEntries(keys.map((k) => [k, "n/a"]));
  let details = {};
  if (output.parts.length) {
    const partial = codeChecks(c, { ...output, parts: output.parts.map((p) => ({ ...p, options: ["a", "b", "c"] })) });
    for (const k of ["noNames", "noBannedWords"]) {
      checks[k] = partial.checks[k];
      if (partial.details[k]) details[k] = partial.details[k];
    }
  }
  return { checks, details };
}

// ---------- summary ----------
export function summarise(rows, errors, meta) {
  const names = [...new Set(rows.flatMap((r) => Object.keys(r.checks)))];
  const lines = [];
  lines.push(`Run: ${meta.when} | mode: ${meta.mode} | model: ${meta.model} | judge: ${meta.judgeModel} | reps: ${meta.reps}${meta.label ? ` | label: ${meta.label}` : ""}`);
  lines.push(`Scored: ${rows.length} | errors (not scored): ${errors.length} | refusals: ${rows.filter((r) => r.output.refused).length} | grader failures: ${rows.filter((r) => r.judgeError).length}`);
  lines.push("");
  lines.push("| Check | Passed | Rate |");
  lines.push("|---|---|---|");
  for (const n of names) {
    const graded = rows.filter((r) => r.checks[n] && r.checks[n] !== "n/a");
    const pass = graded.filter((r) => r.checks[n] === "pass").length;
    const rate = graded.length ? `${Math.round((100 * pass) / graded.length)}%` : "n/a";
    lines.push(`| ${n} | ${pass}/${graded.length} | ${rate} |`);
  }
  lines.push("");
  lines.push("| Category | All checks passed |");
  lines.push("|---|---|");
  // Refused and grader-failed rows are not fully scored, so they never count as passed.
  const unscored = (r) => r.output.refused || r.judgeError;
  for (const cat of [...new Set(rows.map((r) => r.category))]) {
    const all = rows.filter((r) => r.category === cat);
    const rs = all.filter((r) => !unscored(r));
    const ok = rs.filter((r) => Object.values(r.checks).every((v) => v !== "fail")).length;
    const left = all.length - rs.length;
    lines.push(`| ${cat} | ${ok}/${rs.length}${left ? ` (+${left} not scored)` : ""} |`);
  }
  const refusals = rows.filter((r) => r.output.refused);
  if (refusals.length) {
    lines.push("");
    lines.push("Refused (not scored as failures): " + refusals.map((r) => `${r.case} (${r.output.refused})`).join(", "));
  }
  if (errors.length) {
    lines.push("");
    lines.push("Errors (not scored): " + errors.map((e) => `${e.case} - ${e.kind}: ${e.error}`).join("; "));
  }
  const failed = rows.filter((r) => Object.values(r.checks).some((v) => v === "fail"));
  if (failed.length) {
    lines.push("");
    lines.push("Failures:");
    for (const r of failed) {
      const which = Object.entries(r.checks).filter(([, v]) => v === "fail").map(([k]) => k);
      lines.push(`- ${r.case} (rep ${r.rep}): ${which.join(", ")}${r.details && Object.keys(r.details).length ? ` - ${JSON.stringify(r.details)}` : ""}`);
    }
  }
  const served = [...new Set(rows.flatMap((r) => r.calls.map((c) => c.model)))];
  lines.push("");
  lines.push(`Models that served calls: ${served.join(", ") || "none"}`);
  if (meta.priced === false) {
    lines.push(`Calls made: ${meta.callCount} (provider credits; no published price, cost not computed)`);
    lines.push("Note: the same model wrote and graded the stories, so judge scores may be lenient.");
  } else {
    lines.push(`Cost from recorded tokens: $${meta.cost.toFixed(3)}${meta.unpriced ? " (some calls had no known price)" : ""}`);
  }
  return lines.join("\n");
}

function cost(calls) {
  let usd = 0;
  let unpriced = false;
  for (const c of calls) {
    const p = modelPrice(c.model);
    if (!p) {
      if (c.model !== "stand-in") unpriced = true;
      continue;
    }
    // Cache writes cost 1.25x input, cache reads 0.05x input (published pricing).
    const u = c.usage;
    const inCost = (u.input_tokens || 0) + 1.25 * (u.cache_creation_input_tokens || 0) + 0.05 * (u.cache_read_input_tokens || 0);
    usd += (inCost * p[0] + (u.output_tokens || 0) * p[1]) / 1e6;
  }
  return { usd, unpriced };
}

function writeEvidence(summary, label) {
  const file = path.join(root, "docs", "evidence", "BL-009.md");
  const tag = label || "latest";
  const start = `<!-- live-eval:${tag}:start -->`;
  const end = `<!-- live-eval:${tag}:end -->`;
  const block = `${start}\n### Live eval: ${tag}\n\n${summary}\n${end}`;
  let doc = existsSync(file) ? readFileSync(file, "utf8") : "# BL-009 evidence\n";
  const s = doc.indexOf(start);
  const e = doc.indexOf(end);
  if (s !== -1 && e > s) doc = doc.slice(0, s) + block + doc.slice(e + end.length);
  else if (s !== -1 || e !== -1) throw new Error(`docs/evidence/BL-009.md has a broken ${tag} marker; fix it by hand`);
  else doc = `${doc.trimEnd()}\n\n${block}\n`;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, doc);
}

// ---------- main ----------
export async function main(argv, log = console.log, { fetchImpl } = {}) {
  const args = parseArgs(argv);
  if (!args.dryRun) loadDotEnv(path.join(root, ".env"));
  const cases = loadCases(args.only);
  const state = { case: null };
  const ledger = { calls: [], pending: new Set() };

  // Which AI runs the eval: the stand-in (dry run), or whatever the app would use
  // (AI_PROVIDER / NVIDIA_API_KEY / ANTHROPIC_API_KEY, see src/app.js resolveProvider).
  let provider = null;
  let judgeFn = null;
  let providerName = "stand-in";
  let model = "stand-in";
  let judgeModel = "stand-in";
  let priced = true;
  if (args.dryRun) {
    const client = recording(fakeClient(args.dryRun, state), ledger, state);
    provider = createAnthropicProvider(client);
    judgeFn = claudeJudge(client, "stand-in");
  } else {
    const resolved = resolveProvider(process.env, { fetchImpl });
    if (!resolved.provider) {
      log("No AI key is set. Put NVIDIA_API_KEY (or ANTHROPIC_API_KEY) in .env. Nothing was sent.");
      return 1;
    }
    if (resolved.label === "live (Claude)") {
      providerName = "Claude";
      model = process.env.CLAUDE_MODEL || "claude-opus-5-5";
      judgeModel = process.env.EVAL_GRADER_MODEL || "claude-opus-5-5";
      if (args.yes) {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = recording(new Anthropic(), ledger, state);
        provider = createAnthropicProvider(client);
        judgeFn = claudeJudge(client, judgeModel);
      }
    } else {
      providerName = resolved.label.replace(/^live \((.*)\)$/, "$1");
      model = process.env.NVIDIA_MODEL?.trim() || DEFAULT_NVIDIA_MODEL;
      judgeModel = `${model} (same model)`;
      priced = false;
      provider = recordingProvider(resolved.provider, model, ledger, state);
      judgeFn = providerJudge(provider);
    }

    log(`${cases.length} cases x ${args.reps} rep(s) on ${providerName} ${model} (judge: ${judgeModel}).`);
    if (priced) {
      const est = estimate(cases, args.reps, model, judgeModel);
      log(`Estimated cost: about $${est.toFixed(2)}. Spending limit: $${args.maxUsd.toFixed(2)}.`);
      if (args.yes && est > args.maxUsd) {
        log(`The estimate is above the spending limit. Nothing was sent. Raise it with --max-usd=${Math.ceil(est)} if you mean it.`);
        return 1;
      }
    } else {
      const calls = cases.reduce((n, c) => n + (c.expectSafe ? 5 : 1), 0) * args.reps;
      log(`About ${calls} calls on ${providerName} credits; no price is published, so --max-usd does not apply.`);
    }
    if (!args.yes) {
      log("Nothing was sent. Run again with --yes to run it, or --dry-run to test the eval for free.");
      return 0;
    }
  }

  const callsFor = (id) => ledger.calls.filter((c) => c.caseId === id);
  const app = createApp({ provider, limit: { windowMs: 60_000, max: 100_000 } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const when = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = args.dryRun ? `dry-run:${args.dryRun}` : "live";
  const outDir = args.out || path.join(here, "results", `${when}-${mode.replace(":", "-")}`);
  mkdirSync(outDir, { recursive: true });
  const rows = [];
  const errors = [];
  let stoppedForBudget = false;

  try {
    for (let rep = 1; rep <= args.reps && !stoppedForBudget; rep++) {
      for (const c of cases) {
        // Calls still running are counted at a cautious $0.10 each.
        if (cost(ledger.calls).usd + 0.1 * ledger.pending.size >= args.maxUsd) {
          stoppedForBudget = true;
          log(`Stopped: the spending limit of $${args.maxUsd.toFixed(2)} was reached.`);
          break;
        }
        state.case = { ...c, id: `${c.id}#${rep}` };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CASE_TIMEOUT_MS);
        try {
          const output = await runCase(base, c, controller.signal);
          const { checks, details } = output.refused
            ? refusedChecks(c, output)
            : codeChecks(c, output);
          let judged = null;
          let judgeError = null;
          const storyDone = output.parts.length === 3 && !output.refused;
          if (c.expectSafe && output.plan.safe !== false && storyDone) {
            // A grader failure must not throw away the code checks: its own checks
            // become n/a and the failure is counted separately.
            try {
              judged = await judge(judgeFn, c, output, controller.signal);
              Object.assign(checks, judgeChecks(judged));
            } catch (err) {
              if (controller.signal.aborted) throw err;
              judgeError = String(err?.message || err);
              for (const k of Object.keys(judgeChecks({ scores: {} }))) checks[k] = "n/a";
            }
          }
          const row = { case: c.id, category: c.category, rep, checks, details, judge: judged, judgeError, output, calls: callsFor(state.case.id) };
          rows.push(row);
          appendFileSync(path.join(outDir, "results.jsonl"), JSON.stringify(row) + "\n");
          const failed = Object.entries(checks).filter(([, v]) => v === "fail").map(([k]) => k);
          const status = output.refused ? "REF " : failed.length ? "FAIL" : "ok  ";
          log(`${status} ${c.id} (rep ${rep})${failed.length ? ": " + failed.join(", ") : output.refused ? `: refused at ${output.refused}` : ""}`);
        } catch (err) {
          const kind = controller.signal.aborted ? "timeout" : err instanceof InfraError ? "infra" : "harness";
          // A timed-out case may leave paid calls running: let them finish (up to a
          // minute) so their cost lands on this case and the budget check sees it.
          if (kind === "timeout") await Promise.race([Promise.allSettled([...ledger.pending]), new Promise((r) => setTimeout(r, 60_000).unref())]);
          const message = String(err?.message || err);
          const row = { case: c.id, rep, kind: message.startsWith("unparseable") ? "unparseable" : kind, error: message, calls: callsFor(state.case.id) };
          errors.push(row);
          appendFileSync(path.join(outDir, "errors.jsonl"), JSON.stringify(row) + "\n");
          log(`ERR  ${c.id} (rep ${rep}): ${kind} - ${row.error}`);
        } finally {
          clearTimeout(timer);
        }
      }
    }
  } finally {
    // Calls cut off by a timeout are still billed: wait for them (up to a minute).
    await Promise.race([Promise.allSettled([...ledger.pending]), new Promise((r) => setTimeout(r, 60_000).unref())]);
    server.close();
  }

  const spent = cost(ledger.calls);
  const summary = (stoppedForBudget ? `STOPPED EARLY: spending limit $${args.maxUsd} reached.\n` : "") + summarise(rows, errors, { when, mode, model: args.dryRun ? "stand-in" : `${providerName} ${model}`, judgeModel, reps: args.reps, label: args.label, cost: spent.usd, unpriced: spent.unpriced, priced, callCount: ledger.calls.length });
  writeFileSync(path.join(outDir, "summary.md"), summary + "\n");
  if (args.writeEvidence) writeEvidence(summary, args.label);
  log("");
  log(summary);
  log("");
  log(`Saved to ${path.relative(root, outDir) || outDir}`);
  // Exit 2 when some cases could not be fully scored (refusals, grader failures,
  // errors, budget stop), so a script or person cannot mistake the run for a clean pass.
  const incomplete = errors.length || stoppedForBudget || rows.some((r) => r.output.refused || r.judgeError);
  return incomplete ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
