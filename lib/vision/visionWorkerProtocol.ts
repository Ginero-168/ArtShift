export type VisionWorkerProgressStage = "loading" | "decoding" | "inference" | "postprocess";

export type VisionWorkerRequest = {
  type: "execute";
  id: number;
  imageDataUrl: string;
  taskPrompt: string;
};

export type VisionWorkerCancelRequest = { type: "cancel"; id: number };
export type VisionWorkerMessage = VisionWorkerRequest | VisionWorkerCancelRequest;

export type VisionWorkerResult = {
  output: unknown;
  width: number;
  height: number;
};

export type VisionWorkerResponse =
  | {
      type: "progress";
      id: number;
      progress: number;
      stage: VisionWorkerProgressStage;
    }
  | { type: "result"; id: number; result: VisionWorkerResult }
  | { type: "error"; id: number; name?: string; message: string };
