#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_WASM_PACK_VERSION = "wasm-pack 0.13.1";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmProject = resolve(root, "wasm/vtracer-browser");
const wasmPackage = resolve(wasmProject, "pkg");
const publicParent = resolve(root, "public/wasm");
const publicRuntime = resolve(publicParent, "vtracer");

let wasmPackVersion;
try {
  wasmPackVersion = execFileSync("wasm-pack", ["--version"], { encoding: "utf8" }).trim();
} catch {
  throw new Error(`Missing wasm-pack. Install exactly ${REQUIRED_WASM_PACK_VERSION}.`);
}
if (wasmPackVersion !== REQUIRED_WASM_PACK_VERSION) {
  throw new Error(
    `Unsupported ${wasmPackVersion}; this build requires exactly ${REQUIRED_WASM_PACK_VERSION}.`,
  );
}

execFileSync(
  "wasm-pack",
  ["build", "--target", "web", "--release", "--out-dir", "pkg", "--out-name", "vtracer_browser"],
  { cwd: wasmProject, stdio: "inherit" },
);

mkdirSync(publicParent, { recursive: true, mode: 0o755 });
chmodSync(publicParent, 0o755);
const staging = mkdtempSync(resolve(publicParent, ".vtracer-staging-"));
chmodSync(staging, 0o755);
const previous = resolve(publicParent, `.vtracer-previous-${process.pid}`);
let previousMoved = false;
let activated = false;

function validateRuntime(directory) {
  const jsPath = resolve(directory, "vtracer_browser.js");
  const wasmPath = resolve(directory, "vtracer_browser_bg.wasm");
  const js = readFileSync(jsPath, "utf8");
  const wasm = readFileSync(wasmPath);
  if (!js.includes("vectorize_rgba")) {
    throw new Error("Generated VTracer glue does not expose vectorize_rgba.");
  }
  if (!wasm.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) {
    throw new Error("Generated VTracer output is not a valid WebAssembly binary.");
  }
  if (statSync(jsPath).size === 0 || statSync(wasmPath).size === 0) {
    throw new Error("Generated VTracer runtime files are empty.");
  }
}

try {
  for (const file of ["vtracer_browser.js", "vtracer_browser_bg.wasm"]) {
    const target = resolve(staging, file);
    cpSync(resolve(wasmPackage, file), target);
    chmodSync(target, 0o644);
  }
  validateRuntime(staging);

  if (existsSync(previous)) rmSync(previous, { recursive: true, force: true });
  if (existsSync(publicRuntime)) {
    renameSync(publicRuntime, previous);
    previousMoved = true;
  }
  renameSync(staging, publicRuntime);
  activated = true;
  if (existsSync(previous)) rmSync(previous, { recursive: true, force: true });
  console.log(`VTracer browser runtime copied atomically to ${publicRuntime}`);
} catch (error) {
  if (!activated && previousMoved && !existsSync(publicRuntime) && existsSync(previous)) {
    renameSync(previous, publicRuntime);
  }
  throw error;
} finally {
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  if (activated && existsSync(previous)) rmSync(previous, { recursive: true, force: true });
}
