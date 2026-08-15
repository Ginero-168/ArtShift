import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { describe, expect, it } from "vitest";
import configExport from "../next.config";

type ConfigExport = NextConfig | ((phase: string) => NextConfig | Promise<NextConfig>);

async function resolveConfig(phase: string): Promise<NextConfig> {
  const config = configExport as ConfigExport;
  return typeof config === "function" ? config(phase) : config;
}

describe("Next.js build directories", () => {
  it("isolates development artifacts from production builds", async () => {
    await expect(resolveConfig(PHASE_DEVELOPMENT_SERVER)).resolves.toMatchObject({
      distDir: ".next-dev",
    });
    await expect(resolveConfig(PHASE_PRODUCTION_BUILD)).resolves.toMatchObject({
      distDir: ".next",
    });
  });
});
