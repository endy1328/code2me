import type { AnalyzerAdapter } from "./adapter.js";

export interface DetectionResult {
  matched: boolean;
  score: number;
  reasons: string[];
}

export interface AnalysisProfile {
  id: string;
  name: string;
  version: string;
  description: string;
  projectType: string;
  technologyTags: string[];
  detect(filePaths: string[]): DetectionResult;
  getRequiredAdapters(): AnalyzerAdapter[];
}
