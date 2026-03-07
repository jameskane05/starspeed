const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("Usage: npm run build-lod -- <args...>");
  console.error("Example: npm run build-lod -- public/splats/spaceship/spaceship.spz --chunked --quality");
  process.exit(1);
}

const exeName = "build-lod" + (process.platform === "win32" ? ".exe" : "");
const candidates = [
  process.env.BUILD_LOD_PATH,
  path.join(process.cwd(), "spark-lod", "rust", "build-lod", "target", "release", exeName),
  path.join(process.cwd(), "spark-lod", "rust", "target", "release", exeName),
  path.join(process.cwd(), "..", "spark-lod", "rust", "build-lod", "target", "release", exeName),
  path.join(process.cwd(), "..", "spark-lod", "rust", "target", "release", exeName),
].filter(Boolean);
const buildLodPath = candidates.find((p) => fs.existsSync(p));
if (!buildLodPath) {
  console.error("build-lod binary not found. Set BUILD_LOD_PATH or build from spark-lod.");
  process.exit(1);
}

const child = spawn(buildLodPath, argv, {
  stdio: "inherit",
  cwd: process.cwd(),
});
child.on("close", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
