import type { AssetAnalysisResult } from "./assetAnalysis";

export type AssetAnalysisWorkerRequest = {
  type: "analyze";
  id: number;
  fileId: string;
  dataURL: string;
  sourceWidth: number;
  sourceHeight: number;
  maxDimension: number;
};

export type AssetAnalysisWorkerCancel = { type: "cancel"; id: number };
export type AssetAnalysisWorkerMessage = AssetAnalysisWorkerRequest | AssetAnalysisWorkerCancel;

export type AssetAnalysisWorkerResponse =
  | { type: "result"; id: number; result: AssetAnalysisResult }
  | { type: "error"; id: number; name?: string; message: string };
