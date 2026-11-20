import { createApp, resolveProvider } from "./app.js";

const port = Number(process.env.PORT) || 3000;
const { provider, label } = resolveProvider(process.env);
const app = createApp({ provider });
app.listen(port, () => {
  console.log(`Kidly Storiez running on http://localhost:${port} - ${label}`);
});
