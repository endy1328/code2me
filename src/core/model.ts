export type ConfidenceLevel = "high" | "medium" | "low";

export interface SourceLocation {
  filePath: string;
  line?: number;
}

export interface Evidence {
  kind: string;
  value: string;
  location?: SourceLocation;
}

export interface GraphNode {
  id: string;
  type: string;
  name: string;
  displayName?: string;
  projectId: string;
  path?: string;
  language?: string;
  profileHints?: string[];
  sourceAdapterIds: string[];
  confidence: ConfidenceLevel;
  evidence: Evidence[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  type: string;
  from: string;
  to: string;
  projectId: string;
  sourceAdapterIds: string[];
  confidence: ConfidenceLevel;
  directional: boolean;
  evidence: Evidence[];
  metadata?: Record<string, unknown>;
}

export interface EntryPoint {
  id: string;
  type: string;
  targetEntityId: string;
  projectId: string;
  title: string;
  reason: string;
  priority: number;
  sourceAdapterIds: string[];
  confidence: ConfidenceLevel;
  metadata?: Record<string, unknown>;
}

export interface AdapterWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  filePath?: string;
  line?: number;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export interface ArtifactRecord {
  id: string;
  type: string;
  projectId: string;
  producerAdapterId: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AnalysisSnapshot {
  projectId: string;
  profileId: string;
  createdAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  entryPoints: EntryPoint[];
  warnings: AdapterWarning[];
  artifacts: ArtifactRecord[];
}
