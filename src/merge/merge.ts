import type { AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AnalysisSnapshot, GraphEdge, GraphNode } from "../core/model.js";

function mergeStringArrays(left: unknown, right: unknown): string[] | undefined {
  const values = [
    ...(Array.isArray(left) ? left : []),
    ...(Array.isArray(right) ? right : []),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return values.length > 0 ? Array.from(new Set(values)) : undefined;
}

function mergeRequestHandlers(left: unknown, right: unknown): Record<string, unknown>[] | undefined {
  const handlers = [
    ...(Array.isArray(left) ? left : []),
    ...(Array.isArray(right) ? right : []),
  ].filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null);
  if (handlers.length === 0) {
    return undefined;
  }

  const merged = new Map<string, Record<string, unknown>>();
  for (const handler of handlers) {
    const methodName = typeof handler.methodName === "string" ? handler.methodName : "handler";
    const existing = merged.get(methodName);
    if (!existing) {
      merged.set(methodName, {
        methodName,
        requestMappings: mergeStringArrays(handler.requestMappings, []) ?? [],
        viewNames: mergeStringArrays(handler.viewNames, []) ?? [],
        responseBody: handler.responseBody === true,
        serviceCalls: Array.isArray(handler.serviceCalls) ? handler.serviceCalls : [],
      });
      continue;
    }
    existing.requestMappings = mergeStringArrays(existing.requestMappings, handler.requestMappings) ?? [];
    existing.viewNames = mergeStringArrays(existing.viewNames, handler.viewNames) ?? [];
    existing.responseBody = existing.responseBody === true || handler.responseBody === true;
    const mergedServiceCalls = [
      ...(Array.isArray(existing.serviceCalls) ? existing.serviceCalls : []),
      ...(Array.isArray(handler.serviceCalls) ? handler.serviceCalls : []),
    ].filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null);
    existing.serviceCalls = mergedServiceCalls.filter((call, index, array) =>
      array.findIndex((candidate) =>
        candidate.targetType === call.targetType &&
        candidate.targetName === call.targetName &&
        candidate.methodName === call.methodName,
      ) === index,
    );
  }
  return Array.from(merged.values());
}

function mergeMetadata(left: Record<string, unknown> | undefined, right: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const merged = { ...(left ?? {}), ...(right ?? {}) };
  const requestMappings = mergeStringArrays(left?.requestMappings, right?.requestMappings);
  if (requestMappings) {
    merged.requestMappings = requestMappings;
  }
  const requestHandlers = mergeRequestHandlers(left?.requestHandlers, right?.requestHandlers);
  if (requestHandlers) {
    merged.requestHandlers = requestHandlers;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeNodes(results: AdapterResult[]): GraphNode[] {
  const merged = new Map<string, GraphNode>();
  for (const result of results) {
    for (const node of result.nodes) {
      const existing = merged.get(node.id);
      if (!existing) {
        merged.set(node.id, { ...node });
        continue;
      }
      existing.sourceAdapterIds = Array.from(new Set([...existing.sourceAdapterIds, ...node.sourceAdapterIds]));
      existing.evidence = [...existing.evidence, ...node.evidence];
      existing.tags = Array.from(new Set([...(existing.tags ?? []), ...(node.tags ?? [])]));
      if (
        (!existing.path || existing.path.endsWith(".xml")) &&
        typeof node.path === "string" &&
        !node.path.endsWith(".xml")
      ) {
        existing.path = node.path;
      }
      const mergedMetadata = mergeMetadata(existing.metadata, node.metadata);
      if (mergedMetadata) {
        existing.metadata = mergedMetadata;
      }
      if (existing.confidence === "low" && node.confidence !== "low") {
        existing.confidence = node.confidence;
      }
    }
  }
  return Array.from(merged.values());
}

function mergeEdges(results: AdapterResult[]): GraphEdge[] {
  const merged = new Map<string, GraphEdge>();
  for (const result of results) {
    for (const edge of result.edges) {
      const existing = merged.get(edge.id);
      if (!existing) {
        merged.set(edge.id, { ...edge });
        continue;
      }
      existing.sourceAdapterIds = Array.from(new Set([...existing.sourceAdapterIds, ...edge.sourceAdapterIds]));
      existing.evidence = [...existing.evidence, ...edge.evidence];
      existing.metadata = { ...(existing.metadata ?? {}), ...(edge.metadata ?? {}) };
      if (existing.confidence === "low" && edge.confidence !== "low") {
        existing.confidence = edge.confidence;
      }
    }
  }
  return Array.from(merged.values());
}

export function mergeResults(
  projectId: string,
  profileId: string,
  _adapters: AnalyzerAdapter[],
  upstreamResults: Map<string, AdapterResult>,
): AnalysisSnapshot {
  const results = Array.from(upstreamResults.values());

  return {
    projectId,
    profileId,
    createdAt: new Date().toISOString(),
    nodes: mergeNodes(results),
    edges: mergeEdges(results),
    entryPoints: results.flatMap((result) => result.entryPoints),
    warnings: results.flatMap((result) => result.warnings),
    artifacts: results.flatMap((result) => result.artifacts),
  };
}
