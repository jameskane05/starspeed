const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const publicDir = path.join(process.cwd(), "public");
const srcPath = path.join(publicDir, "Starspeed_IOS_Icon.png");
if (!fs.existsSync(srcPath)) {
  console.error("Source not found:", srcPath);
  process.exit(1);
}

const tempDir = path.join(process.cwd(), "temp-pwa-large");
fs.mkdirSync(tempDir, { recursive: true });
fs.copyFileSync(srcPath, path.join(tempDir, "icon.png"));

try {
  execSync(
    `npx pwa-assets-generator --preset minimal-2023 "${path.join(tempDir, "icon.png")}"`,
    {
      stdio: "inherit",
      cwd: process.cwd(),
    },
  );
  const large = [
    "apple-touch-icon-180x180.png",
    "pwa-192x192.png",
    "pwa-512x512.png",
    "maskable-icon-512x512.png",
  ];
  for (const name of large) {
    fs.copyFileSync(path.join(tempDir, name), path.join(publicDir, name));
  }
  console.log("Large PWA/iOS icons updated from Starspeed_IOS_Icon.png");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
