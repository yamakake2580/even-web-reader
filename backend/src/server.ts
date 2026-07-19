import express, { type ErrorRequestHandler } from "express";
import { requireAuth } from "./auth.js";
import { config } from "./config.js";
import { shutdownFetcher } from "./fetcher.js";
import { refreshRouter } from "./routes/refresh.js";
import { favoritesRouter } from "./routes/favorites.js";
import { novelsRouter } from "./routes/novels.js";
import { startRefreshScheduler } from "./refresh.js";

const app = express();
app.use(express.json());

// Single-user personal tool served to a WebView with an origin we don't
// control (Even Hub's companion app / local dev on a different Vite port) -
// a permissive CORS policy is the right tradeoff here, not a security gap.
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/novels", requireAuth, novelsRouter);
app.use("/favorites", requireAuth, favoritesRouter);
app.use("/refresh", requireAuth, refreshRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal error" });
};
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`even-web-reader backend listening on :${config.port}`);
  startRefreshScheduler();
});

async function shutdown(): Promise<void> {
  server.close();
  await shutdownFetcher();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
