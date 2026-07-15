import express from "express";
import { config } from "./config.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(config.port, () => {
  console.log(`even-web-reader backend listening on :${config.port}`);
});
