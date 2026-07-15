import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";

/** No-op when AUTH_TOKEN is unset, for frictionless local dev. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.authToken) {
    next();
    return;
  }
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (token !== config.authToken) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
