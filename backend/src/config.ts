import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  authToken: process.env.AUTH_TOKEN ?? "",
  hamelnMinIntervalMs: Number(process.env.HAMELN_MIN_INTERVAL_MS ?? 1500),
};
