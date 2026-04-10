import type { AdapterResult, AnalyzerAdapter } from "./adapter.js";
import type { AnalysisProfile, DetectionResult } from "./profile.js";
import type { AnalysisSnapshot } from "./model.js";
import { buildFileIndex, type FileIndex } from "../scanner/file-index.js";
import { mergeResults } from "../merge/merge.js";
import { writeSnapshot, type OutputPaths } from "./store.js";

export interface AnalyzeProjectInput {
  projectRoot: string;
  projectId: string;
  profile: AnalysisProfile;
  adaptersOverride?: AnalyzerAdapter[];
  fileIndex?: FileIndex;
  onProgress?: (event: AnalyzeProgressEvent) => void;
}

export interface AnalyzeProjectResult {
  snapshot: AnalysisSnapshot;
  outputPaths: OutputPaths;
  profileDetection?: DetectionResult;
}

export interface AnalyzeProgressEvent {
  phase: "scan" | "adapter" | "merge" | "write" | "done";
  percent: number;
  message: string;
  adapterId?: string;
  adapterName?: string;
  completedAdapters?: number;
  totalAdapters?: number;
}

export interface ProfileDetectionMatch {
  profile: AnalysisProfile;
  detection: DetectionResult;
}

export async function analyzeProject(input: AnalyzeProjectInput): Promise<AnalyzeProjectResult> {
  if (!input.fileIndex) {
    input.onProgress?.({
      phase: "scan",
      percent: 5,
      message: "Building file index",
    });
  }

  const fileIndex = input.fileIndex ?? await buildFileIndex(input.projectRoot);
  const upstreamResults = new Map<string, AdapterResult>();
  const adapters = input.adaptersOverride ?? input.profile.getRequiredAdapters();
  const runnableAdapters = adapters.filter((adapter) => adapter.canRun({
    projectId: input.projectId,
    projectRoot: input.projectRoot,
    profileId: input.profile.id,
    fileIndex,
    upstreamResults,
  }));
  const totalAdapters = runnableAdapters.length;
  let completedAdapters = 0;

  for (const adapter of adapters) {
    const context = {
      projectId: input.projectId,
      projectRoot: input.projectRoot,
      profileId: input.profile.id,
      fileIndex,
      upstreamResults,
    };
    if (!adapter.canRun(context)) {
      upstreamResults.set(adapter.id, {
        adapterId: adapter.id,
        status: "skipped",
        nodes: [],
        edges: [],
        entryPoints: [],
        artifacts: [],
        warnings: [],
      });
      continue;
    }

    const adapterPercent = totalAdapters === 0
      ? 80
      : 20 + Math.floor((completedAdapters / totalAdapters) * 60);
    input.onProgress?.({
      phase: "adapter",
      percent: adapterPercent,
      message: `Running adapter ${adapter.name}`,
      adapterId: adapter.id,
      adapterName: adapter.name,
      completedAdapters,
      totalAdapters,
    });

    const inputs = await adapter.collectInputs(context);
    const result = await adapter.run(context, inputs);
    upstreamResults.set(adapter.id, result);
    completedAdapters += 1;
  }

  input.onProgress?.({
    phase: "merge",
    percent: 85,
    message: "Merging analysis results",
    completedAdapters,
    totalAdapters,
  });
  const snapshot = mergeResults(input.projectId, input.profile.id, adapters, upstreamResults);

  input.onProgress?.({
    phase: "write",
    percent: 95,
    message: "Rendering and writing output files",
  });
  const outputPaths = await writeSnapshot(input.projectRoot, input.projectId, snapshot);

  input.onProgress?.({
    phase: "done",
    percent: 100,
    message: "Analysis complete",
  });
  return {
    snapshot,
    outputPaths,
    profileDetection: input.profile.detect(fileIndex.files),
  };
}

export function detectBestProfile(filePaths: string[], profiles: AnalysisProfile[]): AnalysisProfile | null {
  return detectBestProfileMatch(filePaths, profiles)?.profile ?? null;
}

export function detectBestProfileMatch(filePaths: string[], profiles: AnalysisProfile[]): ProfileDetectionMatch | null {
  let best: { profile: AnalysisProfile; score: number } | null = null;
  let bestDetection: DetectionResult | null = null;
  for (const profile of profiles) {
    const result = profile.detect(filePaths);
    if (!result.matched) {
      continue;
    }
    if (!best || result.score > best.score) {
      best = { profile, score: result.score };
      bestDetection = result;
    }
  }
  return best && bestDetection
    ? { profile: best.profile, detection: bestDetection }
    : null;
}
