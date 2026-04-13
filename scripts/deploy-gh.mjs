/**
 * Client deploy to GitHub Pages: vite build + gh-pages publish.
 * gh-pages is quiet by default; we log phases and can enable Node/git tracing.
 *
 * Verbose git (HTTPS upload chatter): DEPLOY_GH_VERBOSE=1 npm run deploy:gh
 * PowerShell: $env:DEPLOY_GH_VERBOSE="1"; npm run deploy:gh
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.env.DEPLOY_GH_VERBOSE === "1";

function ts() {
  return new Date().toISOString().slice(11, 23);
}

function log(msg) {
  console.log(`[deploy:gh ${ts()}] ${msg}`);
}

function run(label, command, args, extraEnv = {}) {
  log(`${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status != null) {
    process.exit(result.status);
  }
}

log("1/2 — Vite production build (includes PWA / service worker)…");
run("npm", "npm", ["run", "build:client"]);

log(
  "2/2 — gh-pages: clone cached repo, copy dist, commit, push (often minutes; no byte meter unless verbose).",
);
const nodeDebug = process.env.NODE_DEBUG
  ? `${process.env.NODE_DEBUG},gh-pages`
  : "gh-pages";
const ghEnv = { NODE_DEBUG: nodeDebug };
if (verbose) {
  ghEnv.GIT_CURL_VERBOSE = "1";
  log("DEPLOY_GH_VERBOSE=1 — GIT_CURL_VERBOSE enabled (HTTPS remotes show upload chatter).");
}
run("gh-pages", "npx", ["gh-pages", "-d", "dist"], ghEnv);

log("Done — gh-pages finished (remote should update shortly).");
