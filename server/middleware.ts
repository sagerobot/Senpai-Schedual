import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { AiEnvelope } from "./types";

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Deliberately no frame-ancestors / X-Frame-Options: AI Studio iframes the app.
  next();
}

/** One line per /api request: method, path, status, duration. No bodies. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const path = req.originalUrl.split("?")[0];
    console.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}

/** Registered after all API routes: unknown /api/* paths get JSON, not the SPA. */
export function apiNotFound(_req: Request, res: Response): void {
  res.status(404).json({ status: "error", message: "Unknown API route" });
}

// ---------------------------------------------------------------------------
// Rate limiting — all limits are per IP (trust proxy is set in index.ts)
// ---------------------------------------------------------------------------

function rateLimited(_req: Request, res: Response): void {
  const body: AiEnvelope<never> = {
    status: "error",
    message: "Too many requests — slow down and try again shortly",
  };
  res.status(429).json(body);
}

/** All /api/* routes: 60 req/min/IP. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimited,
});

/** AI routes: additionally 15 req/min/IP. */
export const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimited,
});

/** /api/recommendations (the Gemini fan-out route): 5 req/10min/IP. */
export const recommendationsLimiter = rateLimit({
  windowMs: 600_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimited,
});
