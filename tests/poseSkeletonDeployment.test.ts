import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import {
  parsePoseSkeletonDeployment,
  poseSkeletonDeploymentFromEnv,
  poseSkeletonDeploymentPredictionsUrl,
  REPLICATE_SKELETON_DEPLOYMENT_ENV,
} from "@/lib/server/ai/poseSkeletonDeployment";
import { startPoseSkeletonJob } from "@/lib/server/ai/poseSkeletonJob";

const poseInput = {
  image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" as const },
  width: 64,
  height: 64,
  modelSize: "n" as const,
};

describe("Skeleton deployment routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("treats a blank deployment env as the public-model fallback", () => {
    expect(parsePoseSkeletonDeployment(undefined)).toBeUndefined();
    expect(parsePoseSkeletonDeployment("  ")).toBeUndefined();
    expect(poseSkeletonDeploymentFromEnv({})).toBeUndefined();
  });

  it("accepts owner/name and builds the deployments predictions URL", () => {
    expect(parsePoseSkeletonDeployment(" marcomnaiin/artshift-yolo26-pose ")).toBe(
      "marcomnaiin/artshift-yolo26-pose",
    );
    expect(poseSkeletonDeploymentPredictionsUrl("marcomnaiin/artshift-yolo26-pose")).toBe(
      "https://api.replicate.com/v1/deployments/marcomnaiin/artshift-yolo26-pose/predictions",
    );
  });

  it("rejects a deployment value that is not owner/name", () => {
    expect(() =>
      parsePoseSkeletonDeployment("https://api.replicate.com/v1/deployments/a/b"),
    ).toThrow(AiRuntimeError);
    expect(() => parsePoseSkeletonDeployment("../secrets")).toThrow(AiRuntimeError);
    expect(() =>
      poseSkeletonDeploymentFromEnv({
        [REPLICATE_SKELETON_DEPLOYMENT_ENV]: "not a deployment",
      }),
    ).toThrow(AiRuntimeError);
  });

  it("starts against the deployment from REPLICATE_SKELETON_DEPLOYMENT", async () => {
    vi.stubEnv(REPLICATE_SKELETON_DEPLOYMENT_ENV, "marcomnaiin/artshift-yolo26-pose");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "preddeployjob1", status: "starting" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ticket = await startPoseSkeletonJob(
      "account-byok-token",
      poseInput,
      new AbortController().signal,
    );

    expect(ticket).toEqual({ predictionId: "preddeployjob1", status: "starting" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.replicate.com/v1/deployments/marcomnaiin/artshift-yolo26-pose/predictions",
    );
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer account-byok-token");
    expect(String(init.body)).not.toContain("version");
  });

  it("documents the deployment env for local and VPS setup", () => {
    const example = readFileSync(path.join(process.cwd(), ".env.local.example"), "utf8");
    const deploy = readFileSync(path.join(process.cwd(), "deploy/DEPLOY.md"), "utf8");
    const runtime = readFileSync(path.join(process.cwd(), "docs/AI_RUNTIME.md"), "utf8");
    for (const text of [example, deploy, runtime]) {
      expect(text).toContain("REPLICATE_SKELETON_DEPLOYMENT");
      expect(text).toContain("marcomnaiin/artshift-yolo26-pose");
    }
  });
});
