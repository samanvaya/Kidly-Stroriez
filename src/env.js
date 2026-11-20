import { existsSync } from "node:fs";

// Loads KEY=value lines from a .env file into process.env (BL-017), using Node's
// built-in loader. Variables already set win, so hosting settings override the file.
// Returns "loaded", "none" (no file) or "unsupported" (Node older than 20.12).
export function loadDotEnv(file) {
  if (!existsSync(file)) return "none";
  if (typeof process.loadEnvFile !== "function") return "unsupported";
  process.loadEnvFile(file);
  return "loaded";
}
