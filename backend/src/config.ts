import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  authToken: process.env.AUTH_TOKEN ?? "",
  hamelnMinIntervalMs: Number(process.env.HAMELN_MIN_INTERVAL_MS ?? 1500),
  // "name=value; name=value" - copied from a real logged-in browser session by
  // the user (never entered here programmatically; this project does not
  // automate the Hameln login flow itself). Used only for the favorites
  // import feature.
  hamelnCookie: process.env.HAMELN_COOKIE ?? "",
  // How often to re-fetch every novel's TOC to pick up new chapters. 0 = off.
  refreshIntervalHours: Number(process.env.REFRESH_INTERVAL_HOURS ?? 6),
};
