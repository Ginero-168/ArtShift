import type { AiImagePoseSkeletonInput } from "@/lib/ai-runtime/contracts";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import {
  type PoseSkeletonTicket,
  ReplicateAiAdapter,
} from "@/lib/server/ai/adapters/replicateAdapter";
import { createAiRouteTable } from "@/lib/server/ai/modelManifest";
import { poseSkeletonDeploymentFromEnv } from "@/lib/server/ai/poseSkeletonDeployment";

export type { PoseSkeletonTicket };

export function poseSkeletonModel(): string {
  const model = createAiRouteTable()["image.poseSkeleton"]?.quality?.[0]?.model;
  if (!model) {
    throw new AiRuntimeError("NO_PROVIDER", "The requested AI capability is unavailable.");
  }
  return model;
}

export function startPoseSkeletonJob(
  token: string,
  input: AiImagePoseSkeletonInput,
  signal: AbortSignal,
): Promise<PoseSkeletonTicket> {
  return new ReplicateAiAdapter(token).beginPoseSkeleton(
    poseSkeletonModel(),
    input,
    signal,
    poseSkeletonDeploymentFromEnv(),
  );
}

export function pollPoseSkeletonJob(
  token: string,
  predictionId: string,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<PoseSkeletonTicket> {
  return new ReplicateAiAdapter(token).pollPoseSkeleton(predictionId, width, height, signal);
}

export function cancelPoseSkeletonJob(token: string, predictionId: string): Promise<void> {
  return new ReplicateAiAdapter(token).cancelPoseSkeleton(predictionId);
}
