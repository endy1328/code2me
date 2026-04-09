import type {
  AdapterWarning,
  ArtifactRecord,
  EntryPoint,
  GraphEdge,
  GraphNode,
} from "./model.js";
import type { FileIndex } from "../scanner/file-index.js";

export interface AdapterCapabilities {
  supportedFilePatterns: string[];
  technologyTags: string[];
  produces: string[];
}

export interface AdapterContext {
  projectId: string;
  projectRoot: string;
  profileId: string;
  fileIndex: FileIndex;
  adapterConfig?: Record<string, unknown>;
  upstreamResults: Map<string, AdapterResult>;
}

export interface AdapterInputSet {
  files: string[];
}

export interface AdapterResult {
  adapterId: string;
  status: "success" | "partial_success" | "skipped" | "failed";
  nodes: GraphNode[];
  edges: GraphEdge[];
  entryPoints: EntryPoint[];
  artifacts: ArtifactRecord[];
  warnings: AdapterWarning[];
}

export interface AnalyzerAdapter {
  id: string;
  name: string;
  version: string;
  capabilities: AdapterCapabilities;
  canRun(context: AdapterContext): boolean;
  collectInputs(context: AdapterContext): Promise<AdapterInputSet>;
  run(context: AdapterContext, inputs: AdapterInputSet): Promise<AdapterResult>;
}
