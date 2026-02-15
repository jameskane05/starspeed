const { execSync } = require("child_process");
const path = require("path");

const base = process.argv[2] || "your-file";
const buildLod =
  process.env.BUILD_LOD_PATH ||
  "c:/Users/James/work/spark-lod/rust/target/release/build-lod.exe";
const plyPath = path.join("public", "splats", `${base}.ply`);

console.log(`Running: ${buildLod} --chunked ${plyPath}`);
try {
  execSync(`"${buildLod}" --chunked "${plyPath}"`, { stdio: "inherit" });
} catch (e) {
  if (base === "your-file") {
    console.error(
      "Usage: npm run build-lod -- <basename>\nExample: npm run build-lod -- scifi"
    );
  }
  process.exit(1);
}
