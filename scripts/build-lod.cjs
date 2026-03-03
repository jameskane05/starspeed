const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const basename = process.argv[2];
if (!basename) {
  console.error("Usage: npm run build-lod -- <basename>");
  console.error("Example: npm run build-lod -- splats/charon-final");
  process.exit(1);
}

const publicDir = path.join(process.cwd(), "public");
const inputPath = path.join(publicDir, basename + ".spz");
if (!fs.existsSync(inputPath)) {
  console.error("Input not found:", inputPath);
  process.exit(1);
}

const exeName = "build-lod" + (process.platform === "win32" ? ".exe" : "");
const buildLodPath =
  process.env.BUILD_LOD_PATH ||
  path.join(process.cwd(), "spark-lod", "rust", "target", "release", exeName);
if (!fs.existsSync(buildLodPath)) {
  console.error("build-lod binary not found.");
  console.error("Set BUILD_LOD_PATH to your build-lod executable (e.g. spark-lod/rust/target/release/" + exeName + ").");
  process.exit(1);
}

const outDir = path.dirname(inputPath);
const outBase = path.basename(basename);
const outputPath = path.join(outDir, outBase + ".rad");

console.log("[build-lod] input:", inputPath);
console.log("[build-lod] output:", outputPath);

const child = spawn(buildLodPath, [inputPath, "-o", outputPath], {
  stdio: "inherit",
  cwd: process.cwd(),
});
child.on("close", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
