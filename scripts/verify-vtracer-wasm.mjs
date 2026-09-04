#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  js: {
    path: resolve(root, "public/wasm/vtracer/vtracer_browser.js"),
    sha256: "bb81642e6070fc808c295b0768f4efbd1a148f646b48ed21f8cbc22f2dd10e2b",
  },
  wasm: {
    path: resolve(root, "public/wasm/vtracer/vtracer_browser_bg.wasm"),
    sha256: "70fd9fc0ffb2de78305dc2fe5c38d4ae2e82715a280f4df7a4d4b71c7da01cc9",
  },
};

const js = readFileSync(files.js.path);
const wasm = readFileSync(files.wasm.path);
const actualJsHash = createHash("sha256").update(js).digest("hex");
const actualWasmHash = createHash("sha256").update(wasm).digest("hex");

if (!js.toString("utf8").includes("vectorize_rgba")) {
  throw new Error("VTracer browser glue does not expose vectorize_rgba.");
}
if (!wasm.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) {
  throw new Error("VTracer browser runtime is not a valid WebAssembly binary.");
}
if (actualJsHash !== files.js.sha256 || actualWasmHash !== files.wasm.sha256) {
  throw new Error(
    `VTracer runtime hash mismatch (js=${actualJsHash}, wasm=${actualWasmHash}). Rebuild and review the artifact before deploying.`,
  );
}

console.log(`VTracer runtime verified (js=${actualJsHash}, wasm=${actualWasmHash})`);
