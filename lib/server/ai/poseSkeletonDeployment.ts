import { AiRuntimeError } from "@/lib/ai-runtime/errors";

/** `owner/name` of a warm Replicate deployment for Skeleton. Unset uses the public model. */
export const REPLICATE_SKELETON_DEPLOYMENT_ENV = "REPLICATE_SKELETON_DEPLOYMENT";

const DEPLOYMENT_NAME = /^[a-z0-9][a-z0-9_-]{0,62}\/[a-z0-9][a-z0-9_-]{0,62}$/i;

/**
 * `owner/name`, or undefined when the variable is unset.
 * A non-empty value that is not `owner/name` is a configuration error.
 */
export function parsePoseSkeletonDeployment(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!DEPLOYMENT_NAME.test(trimmed) || trimmed.includes("..")) {
    throw new AiRuntimeError(
      "INVALID_INPUT",
      `${REPLICATE_SKELETON_DEPLOYMENT_ENV} must be owner/name.`,
      { provider: "replicate" },
    );
  }
  return trimmed;
}

export function poseSkeletonDeploymentFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return parsePoseSkeletonDeployment(env[REPLICATE_SKELETON_DEPLOYMENT_ENV]);
}

export function poseSkeletonDeploymentPredictionsUrl(ownerName: string): string {
  const deployment = parsePoseSkeletonDeployment(ownerName);
  if (!deployment) {
    throw new AiRuntimeError(
      "INVALID_INPUT",
      `${REPLICATE_SKELETON_DEPLOYMENT_ENV} must be owner/name.`,
      { provider: "replicate" },
    );
  }
  const [owner, name] = deployment.split("/");
  return `https://api.replicate.com/v1/deployments/${owner}/${name}/predictions`;
}
