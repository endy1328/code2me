import type { AdapterContext, AdapterInputSet, AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AdapterWarning, ArtifactRecord, GraphEdge, GraphNode } from "../core/model.js";
import { parseXmlFile } from "../utils/xml.js";
import { edgeId, nodeId } from "../utils/id.js";

type SqlMapXml = {
  sqlMap?: {
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

export class IbatisSqlMapAdapter implements AnalyzerAdapter {
  readonly id = "ibatis-sql-map";
  readonly name = "iBATIS sql-map Adapter";
  readonly version = "0.1.0";
  readonly capabilities = {
    supportedFilePatterns: ["**/*sql-map*.xml"],
    technologyTags: ["java", "ibatis", "xml"],
    produces: ["mapper", "sql_statement"],
  };

  canRun(context: AdapterContext): boolean {
    return context.fileIndex.files.some((file) => /sql-map.*\.xml$/.test(file));
  }

  async collectInputs(context: AdapterContext): Promise<AdapterInputSet> {
    return {
      files: context.fileIndex.files.filter((file) => /sql-map.*\.xml$/.test(file)),
    };
  }

  async run(context: AdapterContext, inputs: AdapterInputSet): Promise<AdapterResult> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const artifacts: ArtifactRecord[] = [];
    const warnings: AdapterWarning[] = [];

    for (const file of inputs.files) {
      const parsed = await parseXmlFile<SqlMapXml>(context.projectRoot, file);
      const namespace = parsed.sqlMap?.namespace;
      if (!namespace) {
        warnings.push({
          code: "IBATIS_NAMESPACE_MISSING",
          message: "iBATIS sqlMap namespace is missing",
          severity: "warning",
          filePath: file,
          recoverable: true,
        });
        continue;
      }

      const mapperNodeId = nodeId(context.projectId, "mapper", `${namespace}:ibatis`);
      nodes.push({
        id: mapperNodeId,
        type: "mapper",
        name: namespace,
        displayName: namespace.split(".").pop() ?? namespace,
        projectId: context.projectId,
        path: file,
        language: "xml",
        profileHints: [context.profileId],
        sourceAdapterIds: [this.id],
        confidence: "high",
        evidence: [{ kind: "sqlmap-namespace", value: namespace }],
        metadata: { namespace, mapperStyle: "ibatis" },
      });

      const statements = [
        ...asArray(parsed.sqlMap?.select).map((item) => ({ kind: "select", id: item.id ?? "unknown-select" })),
        ...asArray(parsed.sqlMap?.insert).map((item) => ({ kind: "insert", id: item.id ?? "unknown-insert" })),
        ...asArray(parsed.sqlMap?.update).map((item) => ({ kind: "update", id: item.id ?? "unknown-update" })),
        ...asArray(parsed.sqlMap?.delete).map((item) => ({ kind: "delete", id: item.id ?? "unknown-delete" })),
      ];

      const daoNodeId = nodeId(context.projectId, "dao", namespace);
      edges.push({
        id: edgeId(context.projectId, "queries", daoNodeId, mapperNodeId),
        type: "queries",
        from: daoNodeId,
        to: mapperNodeId,
        projectId: context.projectId,
        sourceAdapterIds: [this.id],
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
          sourceAdapterIds: [this.id],
          confidence: "high",
          evidence: [{ kind: "statement-id", value: statement.id }],
          metadata: { namespace, statementKind: statement.kind, mapperStyle: "ibatis" },
        });
        edges.push({
          id: edgeId(context.projectId, "contains", mapperNodeId, sqlNodeId),
          type: "contains",
          from: mapperNodeId,
          to: sqlNodeId,
          projectId: context.projectId,
          sourceAdapterIds: [this.id],
          confidence: "high",
          directional: true,
          evidence: [{ kind: "statement-id", value: statement.id }],
        });
      }

      artifacts.push({
        id: nodeId(context.projectId, "artifact", `ibatis:${file}`),
        type: "ibatis-sqlmap-summary",
        projectId: context.projectId,
        producerAdapterId: this.id,
        payload: { file, namespace, statementCount: statements.length },
      });
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
