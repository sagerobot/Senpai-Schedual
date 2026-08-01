import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { anyExhausted } from "./budget";
import { apiLimiter, apiNotFound, requestLogger, securityHeaders } from "./middleware";
import { aiRouter } from "./routes/ai";
import { seasonRouter } from "./routes/season";

async function startServer(): Promise<void> {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  app.set("trust proxy", Number.isFinite(trustProxyHops) ? trustProxyHops : 1);
  app.disable("x-powered-by");

  app.use(securityHeaders);
  app.use(express.json({ limit: "50kb" }));

  app.use("/api", requestLogger);
  app.use("/api", apiLimiter);

  app.get("/api/health", (_req, res) => {
    const ai = !process.env.GEMINI_API_KEY ? "no_key" : anyExhausted() ? "resting" : "ready";
    res.json({ ok: true, ai });
  });

  // Not an AI route: no Gemini, no budget, no aiLimiter — the general 60/min
  // /api limiter above is the only one that applies.
  app.use("/api", seasonRouter);
  app.use("/api", aiRouter);
  app.all("/api/*", apiNotFound);

  if (process.env.NODE_ENV !== "production") {
    // Dynamic import so the production bundle never pulls Vite in — the build
    // bakes NODE_ENV=production via esbuild --define, which dead-codes this branch.
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // The bundled server lives at dist/server.cjs and serves the client build
    // from dist/client. Prefer the cwd-relative path (npm start from the repo
    // root); fall back to the bundle's own directory (dist/) + /client.
    const cwdClient = path.join(process.cwd(), "dist", "client");
    const clientDir =
      !fs.existsSync(cwdClient) && typeof __dirname !== "undefined"
        ? path.join(__dirname, "client")
        : cwdClient;
    app.use(express.static(clientDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal server startup error:", err);
  process.exit(1);
});
