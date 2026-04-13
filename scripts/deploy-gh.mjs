/**
 * Client deploy to GitHub Pages: vite build + gh-pages publish.
 *
 * gh-pages is NOT merged from main. main = source; gh-pages = built static files
 * from dist/. `npm run deploy:gh` builds your *current working tree* and pushes
 * that output to branch gh-pages. No merge step.
 *
 * If gh-pages is a mess: `npm run deploy:gh:fresh` (--no-history, force-style push).
 * Still run from main (or whatever branch has the source you want), after pull.
 *
 * Verbose: DEPLOY_GH_VERBOSE=1 npm run deploy:gh
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.env.DEPLOY_GH_VERBOSE === "1";
const noHistory = process.argv.includes("--no-history");

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
  noHistory
    ? "2/2 — gh-pages: publish with --no-history (replaces branch tip; no merge with main needed)."
    : "2/2 — gh-pages: clone cached repo, copy dist, commit, push (often minutes; no byte meter unless verbose).",
);
const nodeDebug = process.env.NODE_DEBUG
  ? `${process.env.NODE_DEBUG},gh-pages`
  : "gh-pages";
const ghEnv = { NODE_DEBUG: nodeDebug };
if (verbose) {
  ghEnv.GIT_CURL_VERBOSE = "1";
  log("DEPLOY_GH_VERBOSE=1 — GIT_CURL_VERBOSE enabled (HTTPS remotes show upload chatter).");
}
const ghArgs = ["gh-pages", "-d", "dist"];
if (noHistory) ghArgs.push("--no-history");
run("gh-pages", "npx", ghArgs, ghEnv);

log("Done — gh-pages finished (remote should update shortly).");
