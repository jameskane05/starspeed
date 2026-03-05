const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "../src/ui/MenuManager.js");
const lines = fs.readFileSync(file, "utf8").split("\n");
const keep = lines.slice(0, 271).concat(lines.slice(619));
fs.writeFileSync(file, keep.join("\n"));
console.log("Removed lines 272-619");
