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
