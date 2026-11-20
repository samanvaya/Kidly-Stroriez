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
import { createApp } from "../src/app.js";
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
    if (part.error) throw new InfraError(`unparseable: story part ${i + 1} had no usable ${i < 2 ? "options" : "ending"} (${part.error})`);
    const entry = { text: part.text, options: part.options };
    if (i < 2) entry.chosen = part.options[c.picks[i]] ?? part.options[0];
    output.parts.push(entry);
    if (part.end) output.ending = part.end;
  }
  return output;
}

async function judge(client, model, c, output, signal) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const m = await client.beta.messages.create(
      {
        model, max_tokens: 4000, output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        system: JUDGE_SYSTEM, messages: [{ role: "user", content: judgePrompt(c, output) }],
      },
      { signal },
    );
    const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    try {
      return parseJudge(text);
    } catch (err) {
      if (attempt === 2) throw new InfraError(`judge reply unusable: ${err.message}`);
    }
  }
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
  for (const cat of [...new Set(rows.map((r) => r.category))]) {
    const rs = rows.filter((r) => r.category === cat);
    const ok = rs.filter((r) => Object.values(r.checks).every((v) => v !== "fail")).length;
    lines.push(`| ${cat} | ${ok}/${rs.length} |`);
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
  lines.push(`Cost from recorded tokens: $${meta.cost.toFixed(3)}${meta.unpriced ? " (some calls had no known price)" : ""}`);
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
export async function main(argv, log = console.log) {
  const args = parseArgs(argv);
  if (existsSync(path.join(root, ".env")) && typeof process.loadEnvFile === "function" && !args.dryRun) {
    process.loadEnvFile(path.join(root, ".env"));
  }
  const model = process.env.CLAUDE_MODEL || "claude-opus-5-5";
  const judgeModel = process.env.EVAL_GRADER_MODEL || "claude-opus-5-5";
  const cases = loadCases(args.only);
  const est = estimate(cases, args.reps, model, judgeModel);

  if (!args.dryRun) {
    log(`${cases.length} cases x ${args.reps} rep(s) on ${model} (judge: ${judgeModel}).`);
    log(`Estimated cost: about $${est.toFixed(2)}. Spending limit: $${args.maxUsd.toFixed(2)}.`);
    if (!args.yes) {
      log("Nothing was sent. Run again with --yes to spend it, or --dry-run to test the eval for free.");
      return 0;
    }
    if (est > args.maxUsd) {
      log(`The estimate is above the spending limit. Nothing was sent. Raise it with --max-usd=${Math.ceil(est)} if you mean it.`);
      return 1;
    }
  }
  let inner;
  const state = { case: null };
  if (args.dryRun) {
    inner = fakeClient(args.dryRun, state);
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      log("ANTHROPIC_API_KEY is not set (put it in .env). Nothing was sent.");
      return 1;
    }
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    inner = new Anthropic();
  }

  const ledger = { calls: [], pending: new Set() };
  const client = recording(inner, ledger, state);
  const callsFor = (id) => ledger.calls.filter((c) => c.caseId === id);
  const app = createApp({ client, limit: { windowMs: 60_000, max: 100_000 } });
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
        if (cost(ledger.calls).usd >= args.maxUsd) {
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
            ? { checks: Object.fromEntries(Object.keys(codeChecks(c, { plan: {} }).checks).map((k) => [k, "n/a"])), details: {} }
            : codeChecks(c, output);
          let judged = null;
          let judgeError = null;
          const storyDone = output.parts.length === 3 && !output.refused;
          if (c.expectSafe && output.plan.safe !== false && storyDone) {
            // A grader failure must not throw away the code checks: its own checks
            // become n/a and the failure is counted separately.
            try {
              judged = await judge(client, judgeModel, c, output, controller.signal);
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
  const summary = (stoppedForBudget ? `STOPPED EARLY: spending limit $${args.maxUsd} reached.\n` : "") + summarise(rows, errors, { when, mode, model: args.dryRun ? "stand-in" : model, judgeModel: args.dryRun ? "stand-in" : judgeModel, reps: args.reps, label: args.label, cost: spent.usd, unpriced: spent.unpriced });
  writeFileSync(path.join(outDir, "summary.md"), summary + "\n");
  if (args.writeEvidence) writeEvidence(summary, args.label);
  log("");
  log(summary);
  log("");
  log(`Saved to ${path.relative(root, outDir) || outDir}`);
  return 0;
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
