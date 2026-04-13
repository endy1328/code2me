import type { AdapterContext, AdapterInputSet, AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AdapterWarning, ArtifactRecord, GraphEdge, GraphNode } from "../core/model.js";
import { parseXmlFile } from "../utils/xml.js";
import { edgeId, nodeId } from "../utils/id.js";

type SiteMeshXml = {
  decorators?: {
    "@_defaultdir"?: string;
    excludes?: {
      pattern?: string[] | string;
    };
    decorator?:
      | Array<{ page?: string; name?: string; pattern?: string[] | string }>
      | { page?: string; name?: string; pattern?: string[] | string };
  };
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizePathLike(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\.jsp$/, "");
}

function toModuleRelativeViewName(file: string): string {
  if (file.includes("/WEB-INF/views/")) {
    return file.split("/WEB-INF/views/")[1] ?? file;
  }
  if (file.includes("/WEB-INF/jsp/")) {
    return file.split("/WEB-INF/jsp/")[1] ?? file;
  }
  return file;
}

function routeMatchesPattern(route: string, pattern: string): boolean {
  if (!pattern) {
    return false;
  }
  if (pattern === "/" || pattern === "/*") {
    return true;
  }
  if (pattern.startsWith("*.")) {
    return route.endsWith(pattern.slice(1));
  }
  if (pattern.endsWith("/*")) {
    return route.startsWith(pattern.slice(0, -1));
  }
  if (pattern.startsWith("*")) {
    return route.endsWith(pattern.slice(1));
  }
  return route === pattern || route.startsWith(`${pattern.replace(/\/$/, "")}/`);
}

function resolveLayoutFile(
  jspFiles: string[],
  defaultDir: string | undefined,
  layoutRef: string,
): string | undefined {
  const normalizedLayout = normalizePathLike(layoutRef);
  const candidates = [
    normalizedLayout,
    defaultDir ? `${normalizePathLike(defaultDir)}/${normalizedLayout}` : normalizedLayout,
  ];

  for (const candidate of candidates) {
    const match = jspFiles.find((file) => normalizePathLike(file).endsWith(candidate));
    if (match) {
      return match;
    }
  }

  return undefined;
}

function resolveDecoratorTargets(
  jspFiles: string[],
  defaultDir: string | undefined,
  page: string,
  name: string,
): { layoutRef: string; directViewName: string | undefined } | undefined {
  const normalizedPage = normalizePathLike(page);
  const normalizedName = normalizePathLike(name);
  const pageLayoutFile = resolveLayoutFile(jspFiles, defaultDir, page);
  const nameLayoutFile = name ? resolveLayoutFile(jspFiles, defaultDir, name) : undefined;

  if (!page && !name) {
    return undefined;
  }

  if (page && !name) {
    return {
      layoutRef: page,
      directViewName: undefined,
    };
  }

  if (pageLayoutFile && !nameLayoutFile) {
    return {
      layoutRef: page,
      directViewName: undefined,
    };
  }

  if (!pageLayoutFile && nameLayoutFile) {
    return {
      layoutRef: name,
      directViewName: normalizedPage,
    };
  }

  if (pageLayoutFile && nameLayoutFile) {
    const pageLooksLikeDecorator = normalizedPage.includes("/decorator") || normalizedPage.includes("/layout");
    const nameLooksLikeDecorator = normalizedName.includes("/decorator") || normalizedName.includes("/layout");
    if (pageLooksLikeDecorator && !nameLooksLikeDecorator) {
      return {
        layoutRef: page,
        directViewName: undefined,
      };
    }
    if (!pageLooksLikeDecorator && nameLooksLikeDecorator) {
      return {
        layoutRef: name,
        directViewName: normalizedPage,
      };
    }
  }

  return {
    layoutRef: page || name,
    directViewName: page && name ? normalizedPage : undefined,
  };
}

function collectDirectViewIds(
  context: AdapterContext,
  jspFiles: string[],
  directViewName: string,
): string[] {
  const normalizedView = normalizePathLike(directViewName);
  const resolvedFile = jspFiles.find((file) => normalizePathLike(file).endsWith(normalizedView));
  const candidates = new Set<string>([normalizedView]);

  if (normalizedView.includes("/WEB-INF/jsp/") || normalizedView.includes("/WEB-INF/views/")) {
    candidates.add(normalizePathLike(toModuleRelativeViewName(normalizedView)));
  }
  if (resolvedFile) {
    candidates.add(normalizePathLike(toModuleRelativeViewName(resolvedFile)));
  }

  return Array.from(candidates)
    .filter((candidate) => candidate.length > 0)
    .map((candidate) => nodeId(context.projectId, "view", candidate));
}

function getControllerHandlers(node: GraphNode): Array<{ methodName: string; requestMappings: string[] }> {
  if (!Array.isArray(node.metadata?.requestHandlers)) {
    return [];
  }
  return (node.metadata.requestHandlers as Array<Record<string, unknown>>)
    .map((handler) => ({
      methodName: typeof handler.methodName === "string" ? handler.methodName : "handler",
      requestMappings: Array.isArray(handler.requestMappings)
        ? handler.requestMappings.filter((value): value is string => typeof value === "string" && value.length > 0)
        : [],
    }));
}

export class SiteMeshConfigAdapter implements AnalyzerAdapter {
  readonly id = "sitemesh-config";
  readonly name = "SiteMesh config Adapter";
  readonly version = "0.1.0";
  readonly capabilities = {
    supportedFilePatterns: ["**/*sitemesh*.xml", "**/*decorator*.xml"],
    technologyTags: ["java", "sitemesh", "xml"],
    produces: ["config", "view"],
  };

  canRun(context: AdapterContext): boolean {
    return context.fileIndex.files.some((file) => /sitemesh|decorator/i.test(file) && file.endsWith(".xml"));
  }

  async collectInputs(context: AdapterContext): Promise<AdapterInputSet> {
    return {
      files: context.fileIndex.files.filter((file) => /sitemesh|decorator/i.test(file) && file.endsWith(".xml")),
    };
  }

  async run(context: AdapterContext, inputs: AdapterInputSet): Promise<AdapterResult> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const artifacts: ArtifactRecord[] = [];
    const warnings: AdapterWarning[] = [];

    const jspFiles = context.fileIndex.files.filter((file) => file.endsWith(".jsp"));
    const jspResult = context.upstreamResults.get("jsp-view");
    const controllerNodes = (context.upstreamResults.get("java-source-basic")?.nodes ?? [])
      .filter((node) => node.type === "controller");
    const renderEdges = (jspResult?.edges ?? [])
      .filter((edge) => edge.type === "renders");

    for (const file of inputs.files) {
      const parsed = await parseXmlFile<SiteMeshXml>(context.projectRoot, file);
      const configNodeId = nodeId(context.projectId, "config", file);
      const defaultDir = parsed.decorators?.["@_defaultdir"];
      const excludePatterns = asArray(parsed.decorators?.excludes?.pattern)
        .filter((pattern): pattern is string => typeof pattern === "string" && pattern.length > 0);
      nodes.push({
        id: configNodeId,
        type: "config",
        name: file.split("/").pop() ?? file,
        displayName: file,
        projectId: context.projectId,
        path: file,
        language: "xml",
        profileHints: [context.profileId],
        sourceAdapterIds: [this.id],
        confidence: "high",
        evidence: [{ kind: "sitemesh-file", value: file }],
        metadata: {},
      });

      for (const decorator of asArray(parsed.decorators?.decorator)) {
        const page = decorator.page ?? "";
        const name = decorator.name ?? "";
        const explicitPatterns = asArray(decorator.pattern)
          .filter((pattern): pattern is string => typeof pattern === "string" && pattern.length > 0);

        let layoutRef = "";
        let includePatterns: string[] = [];
        let directViewName: string | undefined;

        if (explicitPatterns.length > 0) {
          layoutRef = page;
          includePatterns = explicitPatterns;
        } else {
          const resolvedTargets = resolveDecoratorTargets(jspFiles, defaultDir, page, name);
          if (resolvedTargets) {
            layoutRef = resolvedTargets.layoutRef;
            directViewName = resolvedTargets.directViewName;
          }
        }

        if (!layoutRef) {
          continue;
        }

        const layoutFile = resolveLayoutFile(jspFiles, defaultDir, layoutRef);
        const normalizedLayoutName = normalizePathLike(
          layoutFile ? toModuleRelativeViewName(layoutFile) : layoutRef,
        );
        const layoutNodeId = nodeId(context.projectId, "view", normalizedLayoutName);
        nodes.push({
          id: layoutNodeId,
          type: "view",
          name: normalizedLayoutName,
          displayName: normalizedLayoutName.split("/").pop() ?? normalizedLayoutName,
          projectId: context.projectId,
          path: layoutFile ?? layoutRef,
          language: "jsp",
          profileHints: [context.profileId],
          sourceAdapterIds: [this.id],
          confidence: "medium",
          evidence: [{ kind: "decorator-name", value: layoutRef }],
          metadata: { role: "layout" },
        });
        edges.push({
          id: edgeId(context.projectId, "configures", configNodeId, layoutNodeId),
          type: "configures",
          from: configNodeId,
          to: layoutNodeId,
          projectId: context.projectId,
          sourceAdapterIds: [this.id],
          confidence: "medium",
          directional: true,
          evidence: [{ kind: "decorator-name", value: layoutRef }],
        });

        const matchedViewIds = new Set<string>();

        if (directViewName) {
          for (const directViewId of collectDirectViewIds(context, jspFiles, directViewName)) {
            matchedViewIds.add(directViewId);
          }
        }

        if (includePatterns.length > 0) {
          for (const controllerNode of controllerNodes) {
            const handlers = getControllerHandlers(controllerNode);
            if (handlers.length === 0) {
              const requestMappings = Array.isArray(controllerNode.metadata?.requestMappings)
                ? controllerNode.metadata?.requestMappings.filter((value): value is string => typeof value === "string")
                : [];
              const included = requestMappings.some((route) => includePatterns.some((pattern) => routeMatchesPattern(route, pattern)));
              const excluded = requestMappings.some((route) => excludePatterns.some((pattern) => routeMatchesPattern(route, pattern)));
              if (!included || excluded) {
                continue;
              }
              for (const renderEdge of renderEdges) {
                if (renderEdge.from === controllerNode.id) {
                  matchedViewIds.add(renderEdge.to);
                }
              }
              continue;
            }

            for (const handler of handlers) {
              const included = handler.requestMappings.some((route) => includePatterns.some((pattern) => routeMatchesPattern(route, pattern)));
              const excluded = handler.requestMappings.some((route) => excludePatterns.some((pattern) => routeMatchesPattern(route, pattern)));
              if (!included || excluded) {
                continue;
              }
              for (const renderEdge of renderEdges) {
                const handlerMethods = Array.isArray(renderEdge.metadata?.handlerMethods)
                  ? renderEdge.metadata.handlerMethods.filter((value): value is string => typeof value === "string")
                  : [];
                if (renderEdge.from === controllerNode.id && (handlerMethods.length === 0 || handlerMethods.includes(handler.methodName))) {
                  matchedViewIds.add(renderEdge.to);
                }
              }
            }
          }
        }

        for (const viewNodeId of matchedViewIds) {
          edges.push({
            id: edgeId(context.projectId, "renders", viewNodeId, layoutNodeId),
            type: "renders",
            from: viewNodeId,
            to: layoutNodeId,
            projectId: context.projectId,
            sourceAdapterIds: [this.id],
            confidence: includePatterns.length > 0 ? "medium" : "high",
            directional: true,
            evidence: [{ kind: "decorator-page", value: includePatterns[0] ?? page }],
          });
        }
      }

      artifacts.push({
        id: nodeId(context.projectId, "artifact", `sitemesh:${file}`),
        type: "sitemesh-summary",
        projectId: context.projectId,
        producerAdapterId: this.id,
        payload: { file },
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
