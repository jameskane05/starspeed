const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "public");
const dest = path.join(__dirname, "..", "build", "public");
if (fs.existsSync(src)) {
  fs.cpSync(src, dest, { recursive: true });
  console.log("[copy-public] copied public/ to build/public/");
}
