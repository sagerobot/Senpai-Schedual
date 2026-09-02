import { execSync } from "node:child_process";

/**
 * The build stamp: a short git sha that names the exact build, computed the
 * same way on both sides of the wire so the client can compare its own to the
 * server's. Render exports RENDER_GIT_COMMIT at build and run time; anywhere
 * else (local dev, CI) it comes from git; with neither it is "dev".
 *
 * Vite bakes the client's copy in at build time (`__APP_BUILD__`), the server
 * reads its own at boot and reports it from /api/health. A mismatch is how the
 * wake strip learns that a newer build is live before the service worker has
 * had a chance to notice.
 */

export const DEV_BUILD = "dev";

const SHORT_SHA = 7;

export function shortSha(sha: string): string {
  return sha.trim().slice(0, SHORT_SHA);
}

export function resolveBuildStamp(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.RENDER_GIT_COMMIT ?? env.GITHUB_SHA;
  if (fromEnv && fromEnv.trim() !== "") return shortSha(fromEnv);
  try {
    return shortSha(execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString());
  } catch {
    return DEV_BUILD;
  }
}
