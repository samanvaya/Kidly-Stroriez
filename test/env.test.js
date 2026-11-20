import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const envModule = fileURLToPath(new URL("../src/env.js", import.meta.url));

// Runs loadDotEnv in a fresh Node process so the test's own environment stays clean.
function run(file, extraEnv = {}) {
  const code = `import { loadDotEnv } from ${JSON.stringify(envModule)};
const result = loadDotEnv(${JSON.stringify(file)});
console.log(JSON.stringify({ result, key: process.env.KIDLY_TEST_KEY ?? null, other: process.env.KIDLY_TEST_OTHER ?? null }));`;
  const env = { PATH: process.env.PATH, ...extraEnv };
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code], { env }).toString());
}

test("BL-017-T01 a value in .env is loaded when the variable is not set yet", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kidly-env-"));
  const file = path.join(dir, ".env");
  writeFileSync(file, "KIDLY_TEST_KEY=from-file\nKIDLY_TEST_OTHER=two\n");
  assert.deepEqual(run(file), { result: "loaded", key: "from-file", other: "two" });
});

test("BL-017-T02 existing variables win over .env, and a missing .env is fine", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kidly-env-"));
  const file = path.join(dir, ".env");
  writeFileSync(file, "KIDLY_TEST_KEY=from-file\n");
  assert.deepEqual(run(file, { KIDLY_TEST_KEY: "from-host" }), { result: "loaded", key: "from-host", other: null });
  assert.deepEqual(run(path.join(dir, "missing.env")), { result: "none", key: null, other: null });
});

// Starts the real server from a copy of the project with a temporary .env and returns
// its first line of output. Proves .env is loaded before the app reads its settings.
async function startServer(envFileContent) {
  const { cpSync, mkdirSync, symlinkSync, rmSync } = await import("node:fs");
  const { spawn } = await import("node:child_process");
  const repo = fileURLToPath(new URL("..", import.meta.url));
  const dir = mkdtempSync(path.join(tmpdir(), "kidly-start-"));
  cpSync(path.join(repo, "src"), path.join(dir, "src"), { recursive: true });
  cpSync(path.join(repo, "package.json"), path.join(dir, "package.json"));
  symlinkSync(path.join(repo, "node_modules"), path.join(dir, "node_modules"));
  mkdirSync(path.join(dir, "public"));
  if (envFileContent !== null) writeFileSync(path.join(dir, ".env"), envFileContent);
  const env = { PATH: process.env.PATH, PORT: "0" };
  const child = spawn(process.execPath, [path.join(dir, "src", "server.js")], { env });
  try {
    return await new Promise((resolve, reject) => {
      let out = "";
      const done = () => resolve(out.split("\n")[0]);
      child.stdout.on("data", (d) => { out += d; if (out.includes("\n")) done(); });
      child.stderr.on("data", (d) => { out += d; });
      child.on("exit", () => resolve(out.split("\n")[0]));
      setTimeout(() => reject(new Error(`no start-up line: ${out}`)), 8000);
    });
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("BL-017-T03 npm start reads .env before the app chooses its AI provider", async () => {
  assert.match(await startServer("NVIDIA_API_KEY=test-placeholder\n"), /live \(NVIDIA Nemotron\)/);
  assert.match(await startServer(null), /offline demo story only/);
});

test("BL-017-T04 an unreadable .env stops the server with a clear message", async () => {
  const { mkdirSync, rmSync } = await import("node:fs");
  const dir = mkdtempSync(path.join(tmpdir(), "kidly-envdir-"));
  const asFolder = path.join(dir, ".env");
  mkdirSync(asFolder); // a folder named .env cannot be read as a file
  const code = `import { loadDotEnv } from ${JSON.stringify(envModule)};
try { loadDotEnv(${JSON.stringify(asFolder)}); console.log("no error"); } catch (e) { console.log(e.message); }`;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", code], { env: { PATH: process.env.PATH } }).toString();
  rmSync(dir, { recursive: true, force: true });
  assert.match(out, /Could not read .*\.env: \w+\. Fix or remove the file\./);
});
