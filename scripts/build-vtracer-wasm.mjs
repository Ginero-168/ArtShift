#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmProject = resolve(root, "wasm/vtracer-browser");
const wasmPackage = resolve(wasmProject, "pkg");
const publicRuntime = resolve(root, "public/wasm/vtracer");

execFileSync(
  "wasm-pack",
  ["build", "--target", "web", "--release", "--out-dir", "pkg", "--out-name", "vtracer_browser"],
  { cwd: wasmProject, stdio: "inherit" },
);

rmSync(publicRuntime, { recursive: true, force: true });
mkdirSync(publicRuntime, { recursive: true });
chmodSync(publicRuntime, 0o755);
for (const file of ["vtracer_browser.js", "vtracer_browser_bg.wasm"]) {
  const target = resolve(publicRuntime, file);
  cpSync(resolve(wasmPackage, file), target);
  chmodSync(target, 0o644);
}

console.log(`VTracer browser runtime copied to ${publicRuntime}`);
