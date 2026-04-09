import type { AdapterContext, AdapterInputSet, AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AdapterWarning, ArtifactRecord, EntryPoint, GraphEdge, GraphNode } from "../core/model.js";
import { parseXmlFile } from "../utils/xml.js";
import { edgeId, nodeId } from "../utils/id.js";

type WebXml = {
  "web-app"?: {
    servlet?: Array<{ "servlet-name"?: string; "servlet-class"?: string; "init-param"?: Array<{ "param-name"?: string; "param-value"?: string }> }> | { "servlet-name"?: string; "servlet-class"?: string; "init-param"?: Array<{ "param-name"?: string; "param-value"?: string }> };
    "servlet-mapping"?: Array<{ "servlet-name"?: string; "url-pattern"?: string }> | { "servlet-name"?: string; "url-pattern"?: string };
    filter?: unknown;
    listener?: unknown;
  };
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export class WebXmlAdapter implements AnalyzerAdapter {
  readonly id = "web-xml";
  readonly name = "web.xml Adapter";
  readonly version = "0.1.0";
  readonly capabilities = {
    supportedFilePatterns: ["**/web.xml"],
    technologyTags: ["java", "servlet", "xml"],
    produces: ["config", "route", "entrypoint_hint"],
  };

  canRun(context: AdapterContext): boolean {
    return context.fileIndex.files.some((file) => file.endsWith("web.xml"));
  }

  async collectInputs(context: AdapterContext): Promise<AdapterInputSet> {
    return {
      files: context.fileIndex.files.filter((file) => file.endsWith("web.xml")),
    };
  }

  async run(context: AdapterContext, inputs: AdapterInputSet): Promise<AdapterResult> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const entryPoints: EntryPoint[] = [];
    const artifacts: ArtifactRecord[] = [];
    const warnings: AdapterWarning[] = [];

    for (const file of inputs.files) {
      const parsed = await parseXmlFile<WebXml>(context.projectRoot, file);
      const webApp = parsed["web-app"];
      const configNode = {
        id: nodeId(context.projectId, "config", file),
        type: "config",
        name: "web.xml",
        displayName: file,
        projectId: context.projectId,
        path: file,
        language: "xml",
        profileHints: [context.profileId],
        sourceAdapterIds: [this.id],
        confidence: "high" as const,
        evidence: [{ kind: "file", value: file }],
        metadata: {},
      };
      nodes.push(configNode);

      const servlets = asArray(webApp?.servlet);
      const mappings = asArray(webApp?.["servlet-mapping"]);
      for (const servlet of servlets) {
        const servletName = servlet["servlet-name"] ?? "unknown-servlet";
        const className = servlet["servlet-class"] ?? servletName;
        const mapping = mappings.find((candidate) => candidate["servlet-name"] === servletName);
        const initParams = asArray(servlet["init-param"]);
        const contextConfigLocation = initParams.find((param) => param["param-name"] === "contextConfigLocation")?.["param-value"];
        const routeNode = {
          id: nodeId(context.projectId, "route", `${file}:${servletName}`),
          type: "route",
          name: servletName,
          displayName: servletName,
          projectId: context.projectId,
          path: file,
          language: "xml",
          profileHints: [context.profileId],
          sourceAdapterIds: [this.id],
          confidence: "high" as const,
          evidence: [{ kind: "servlet-name", value: servletName }],
          metadata: {
            servletClass: className,
            servletName,
            urlPattern: mapping?.["url-pattern"],
            contextConfigLocation,
          },
        };
        nodes.push(routeNode);
        edges.push({
          id: edgeId(context.projectId, "configures", configNode.id, routeNode.id),
          type: "configures",
          from: configNode.id,
          to: routeNode.id,
          projectId: context.projectId,
          sourceAdapterIds: [this.id],
          confidence: "high" as const,
          directional: true,
          evidence: [{ kind: "servlet-name", value: servletName }],
        });

        entryPoints.push({
          id: nodeId(context.projectId, "entry", `${file}:${servletName}`),
          type: "web_entry",
          targetEntityId: routeNode.id,
          projectId: context.projectId,
          title: servletName,
          reason: mapping?.["url-pattern"] ? `Mapped by web.xml: ${mapping["url-pattern"]}` : "Declared in web.xml",
          priority: 100,
          sourceAdapterIds: [this.id],
          confidence: "high" as const,
          metadata: {
            urlPattern: mapping?.["url-pattern"],
            servletClass: className,
            servletName,
            contextConfigLocation,
          },
        });

        for (const initParam of initParams) {
          const name = initParam["param-name"];
          const value = initParam["param-value"];
          if (name === "contextConfigLocation" && value) {
            artifacts.push({
              id: nodeId(context.projectId, "artifact", `${file}:${servletName}:context`),
              type: "spring-context-hint",
              projectId: context.projectId,
              producerAdapterId: this.id,
              payload: {
                file,
                servletName,
                contextConfigLocation: value,
              },
            });
          }
        }
      }
    }

    return {
      adapterId: this.id,
      status: "success",
      nodes,
      edges,
      entryPoints,
      artifacts,
      warnings,
    };
  }
}
