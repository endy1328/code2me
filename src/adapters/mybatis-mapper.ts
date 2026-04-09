import type { AdapterContext, AdapterInputSet, AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AdapterWarning, ArtifactRecord, GraphEdge, GraphNode } from "../core/model.js";
import { parseXmlFile } from "../utils/xml.js";
import { edgeId, nodeId } from "../utils/id.js";

type MapperXml = {
  mapper?: {
    namespace?: string;
    select?: Array<{ id?: string }> | { id?: string };
    insert?: Array<{ id?: string }> | { id?: string };
    update?: Array<{ id?: string }> | { id?: string };
    delete?: Array<{ id?: string }> | { id?: string };
  };
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function createMapperResult(
  context: AdapterContext,
  adapterId: string,
  file: string,
  namespace: string,
  statements: Array<{ kind: string; id: string }>,
): { nodes: GraphNode[]; edges: GraphEdge[]; artifacts: ArtifactRecord[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const artifacts: ArtifactRecord[] = [];

  const mapperNodeId = nodeId(context.projectId, "mapper", namespace);
  nodes.push({
    id: mapperNodeId,
    type: "mapper",
    name: namespace,
    displayName: namespace.split(".").pop() ?? namespace,
    projectId: context.projectId,
    path: file,
    language: "xml",
    profileHints: [context.profileId],
    sourceAdapterIds: [adapterId],
    confidence: "high",
    evidence: [{ kind: "mapper-namespace", value: namespace }],
    metadata: { namespace, mapperStyle: "mybatis" },
  });

  const daoNodeId = nodeId(context.projectId, "dao", namespace);
  edges.push({
    id: edgeId(context.projectId, "queries", daoNodeId, mapperNodeId),
    type: "queries",
    from: daoNodeId,
    to: mapperNodeId,
    projectId: context.projectId,
    sourceAdapterIds: [adapterId],
    confidence: "medium",
    directional: true,
    evidence: [{ kind: "namespace-match", value: namespace }],
  });

  for (const statement of statements) {
    const sqlNodeId = nodeId(context.projectId, "sql_statement", `${namespace}.${statement.id}`);
    nodes.push({
      id: sqlNodeId,
      type: "sql_statement",
      name: `${namespace}.${statement.id}`,
      displayName: statement.id,
      projectId: context.projectId,
      path: file,
      language: "sql",
      profileHints: [context.profileId],
      sourceAdapterIds: [adapterId],
      confidence: "high",
      evidence: [{ kind: "statement-id", value: statement.id }],
      metadata: { namespace, statementKind: statement.kind },
    });
    edges.push({
      id: edgeId(context.projectId, "contains", mapperNodeId, sqlNodeId),
      type: "contains",
      from: mapperNodeId,
      to: sqlNodeId,
      projectId: context.projectId,
      sourceAdapterIds: [adapterId],
      confidence: "high",
      directional: true,
      evidence: [{ kind: "statement-id", value: statement.id }],
    });
  }

  artifacts.push({
    id: nodeId(context.projectId, "artifact", `mybatis:${file}`),
    type: "mybatis-mapper-summary",
    projectId: context.projectId,
    producerAdapterId: adapterId,
    payload: { file, namespace, statementCount: statements.length },
  });

  return { nodes, edges, artifacts };
}

export class MyBatisMapperAdapter implements AnalyzerAdapter {
  readonly id = "mybatis-mapper";
  readonly name = "MyBatis mapper Adapter";
  readonly version = "0.1.0";
  readonly capabilities = {
    supportedFilePatterns: ["**/*mapper.xml"],
    technologyTags: ["java", "mybatis", "xml"],
    produces: ["mapper", "sql_statement"],
  };

  canRun(context: AdapterContext): boolean {
    return context.fileIndex.files.some((file) => file.endsWith("mapper.xml"));
  }

  async collectInputs(context: AdapterContext): Promise<AdapterInputSet> {
    return {
      files: context.fileIndex.files.filter((file) => file.endsWith("mapper.xml")),
    };
  }

  async run(context: AdapterContext, inputs: AdapterInputSet): Promise<AdapterResult> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const artifacts: ArtifactRecord[] = [];
    const warnings: AdapterWarning[] = [];

    for (const file of inputs.files) {
      const parsed = await parseXmlFile<MapperXml>(context.projectRoot, file);
      const namespace = parsed.mapper?.namespace;
      if (!namespace) {
        warnings.push({
          code: "MYBATIS_NAMESPACE_MISSING",
          message: "MyBatis mapper namespace is missing",
          severity: "warning",
          filePath: file,
          recoverable: true,
        });
        continue;
      }

      const statements = [
        ...asArray(parsed.mapper?.select).map((item) => ({ kind: "select", id: item.id ?? "unknown-select" })),
        ...asArray(parsed.mapper?.insert).map((item) => ({ kind: "insert", id: item.id ?? "unknown-insert" })),
        ...asArray(parsed.mapper?.update).map((item) => ({ kind: "update", id: item.id ?? "unknown-update" })),
        ...asArray(parsed.mapper?.delete).map((item) => ({ kind: "delete", id: item.id ?? "unknown-delete" })),
      ];

      const result = createMapperResult(context, this.id, file, namespace, statements);
      nodes.push(...result.nodes);
      edges.push(...result.edges);
      artifacts.push(...result.artifacts);
    }

    return {
      adapterId: this.id,
      status: "success",
      nodes,
      edges,
      entryPoints: [],
      artifacts,
      warnings,
    };
  }
}
