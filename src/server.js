import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./env.js";

// Read .env before anything looks at process.env (BL-017).
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  if (loadDotEnv(path.join(root, ".env")) === "unsupported") {
    console.warn("Node 20.12 or newer is needed to read .env; set the variables in the environment instead.");
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const { createApp, resolveProvider } = await import("./app.js");
const port = Number(process.env.PORT) || 3000;
const { provider, label } = resolveProvider(process.env);
const app = createApp({ provider });
app.listen(port, () => {
  console.log(`Kidly Storiez running on http://localhost:${port} - ${label}`);
});
