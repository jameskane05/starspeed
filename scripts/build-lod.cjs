const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const base = process.argv[2] || "your-file";
const buildLod =
  process.env.BUILD_LOD_PATH ||
  "c:/Users/James/work/spark-lod/rust/target/release/build-lod.exe";
const splatsDir = path.join("public", "splats");
const plyPath = path.join(splatsDir, `${base}.ply`);
const spzPath = path.join(splatsDir, `${base}.spz`);

const inputPath = fs.existsSync(plyPath) ? plyPath : fs.existsSync(spzPath) ? spzPath : null;
if (!inputPath) {
  console.error(`Input not found: ${plyPath} or ${spzPath}`);
  if (base === "your-file") {
    console.error(
      "Usage: npm run build-lod -- <basename>\nExample: npm run build-lod -- scifi\nExample: npm run build-lod -- spaceship/spaceship"
    );
  }
  process.exit(1);
}

console.log(`Running: ${buildLod} --chunked ${inputPath}`);
try {
  execSync(`"${buildLod}" --chunked "${inputPath}"`, { stdio: "inherit" });
} catch (e) {
  process.exit(1);
}
