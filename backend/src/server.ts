import express, { type ErrorRequestHandler } from "express";
import { requireAuth } from "./auth.js";
import { config } from "./config.js";
import { shutdownFetcher } from "./fetcher.js";
import { novelsRouter } from "./routes/novels.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/novels", requireAuth, novelsRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal error" });
};
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`even-web-reader backend listening on :${config.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await shutdownFetcher();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
