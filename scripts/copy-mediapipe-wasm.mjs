// Copies the MediaPipe WASM runtime into public/ so it is served by the app
// itself instead of a CDN. Runs on postinstall, predev and prebuild.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join(root, "public", "mediapipe", "wasm");

if (!existsSync(from)) {
  console.warn("[mediapipe] @mediapipe/tasks-vision is not installed; skipping WASM copy.");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log("[mediapipe] Copied WASM runtime to public/mediapipe/wasm");
