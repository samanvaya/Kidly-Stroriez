import { existsSync } from "node:fs";

// Loads KEY=value lines from a .env file into process.env (BL-017), using Node's
// built-in loader. Variables already set win, so hosting settings override the file.
// Returns "loaded", "none" (no file) or "unsupported" (Node older than 20.12).
// Note: Node skips lines it cannot parse; check the start-up label ("live ...") after
// editing .env.
export function loadDotEnv(file) {
  if (!existsSync(file)) return "none";
  if (typeof process.loadEnvFile !== "function") return "unsupported";
  try {
    process.loadEnvFile(file);
  } catch (err) {
    // A folder named .env, no permission, and similar: say so plainly instead of a stack trace.
    throw new Error(`Could not read ${file}: ${err.code || err.message}. Fix or remove the file.`);
  }
  return "loaded";
}
