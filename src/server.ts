import { createApp } from "./app.js";

// Starts the HTTP server and nothing else. API-01 replaces process.env with the
// validated config from src/config/env.ts and console with the pino logger.
const port = Number(process.env.PORT ?? 4000);

createApp().listen(port, () => {
  // eslint-disable-next-line no-console -- replaced by core/logger.ts in API-01
  console.log(`teazy-api listening on http://localhost:${port}`);
});
