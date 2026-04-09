import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterContext, AdapterInputSet, AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AdapterWarning, ArtifactRecord, GraphEdge, GraphNode } from "../core/model.js";
import { edgeId, nodeId } from "../utils/id.js";

function normalizeViewName(raw: string): string {
  return raw
    .trim()
    .replace(/^redirect:/, "")
    .replace(/^forward:/, "")
    .replace(/^\/+/, "")
    .replace(/\.jsp$/, "");
}

function extractControllerFqn(controllerFile: string): string {
  const packageMatch = /src\/(?:main\/)?java\/(.+)\.java$/.exec(controllerFile);
  if (packageMatch?.[1]) {
    return packageMatch[1].replaceAll("/", ".");
  }
  return controllerFile.split("/").pop()?.replace(".java", "") ?? controllerFile;
}

function collectViewNamesFromController(content: string): string[] {
  const viewNames = new Set<string>();
  const patterns = [
    /return\s+"([^"]+)"/g,
    /new\s+ModelAndView\s*\(\s*"([^"]+)"/g,
    /\.setViewName\s*\(\s*"([^"]+)"/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = normalizeViewName(match[1] ?? "");
      if (!value || value === "ERROR" || value === "OK" || /^[0-9]+$/.test(value)) {
        continue;
      }
      viewNames.add(value);
    }
  }

  return Array.from(viewNames);
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

function normalizeResolverSegment(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

function collectViewAliases(
  file: string,
  resolverConfigs: Array<{ prefix: string; suffix: string }>,
): string[] {
  const aliases = new Set<string>([normalizeViewName(toModuleRelativeViewName(file))]);
  const normalizedFile = file.replaceAll("\\", "/");

  for (const resolver of resolverConfigs) {
    const prefix = normalizeResolverSegment(resolver.prefix);
    const suffix = resolver.suffix ?? ".jsp";
    if (!prefix) {
      continue;
    }
    const index = normalizedFile.indexOf(prefix);
    if (index < 0) {
      continue;
    }
    let candidate = normalizedFile.slice(index + prefix.length);
    if (suffix && candidate.endsWith(suffix)) {
      candidate = candidate.slice(0, -suffix.length);
    }
    const alias = normalizeViewName(candidate);
    if (alias) {
      aliases.add(alias);
    }
  }

  return Array.from(aliases).filter(Boolean);
}

interface UiActionRecord {
  kind: "link" | "form" | "script";
  target: string;
  label?: string;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeActionTarget(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw
    .replace(/<%=.*?%>/g, "")
    .replace(/\$\{[^}]+\}/g, "")
    .replace(/<c:url\s+value=['"]([^'"]+)['"]\s*\/?>/g, "$1")
    .trim();
  if (!normalized || normalized.startsWith("#") || /^javascript:/i.test(normalized)) {
    return undefined;
  }
  if (/^https?:\/\//i.test(normalized) || /^mailto:/i.test(normalized)) {
    return undefined;
  }
  const noQuery = normalized.split("?")[0]?.trim() ?? normalized;
  if (!/\.(?:as|do)(?:$|[/?#])/.test(noQuery) && !noQuery.startsWith("/")) {
    return undefined;
  }
  return noQuery.startsWith("/") ? noQuery : `/${noQuery.replace(/^\/+/, "")}`;
}

function extractUiActions(content: string): UiActionRecord[] {
  const actions = new Map<string, UiActionRecord>();

  const addAction = (kind: UiActionRecord["kind"], rawTarget: string | undefined, rawLabel?: string): void => {
    const target = normalizeActionTarget(rawTarget);
    if (!target) {
      return;
    }
    const label = rawLabel ? stripTags(rawLabel) : undefined;
    const key = `${kind}:${target}:${label ?? ""}`;
    if (!actions.has(key)) {
      actions.set(key, label ? { kind, target, label } : { kind, target });
    }
  };

  for (const match of content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    addAction("link", match[1], match[2]);
  }

  for (const match of content.matchAll(/<form\b[^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/gi)) {
    const inner = stripTags(match[2] ?? "");
    addAction("form", match[1], inner || "submit");
  }

  const scriptPatterns = [
    /(?:location\.href|location\.assign|window\.open)\s*=\s*["']([^"']+)["']/gi,
    /(?:location\.href|location\.assign|window\.open)\s*\(\s*["']([^"']+)["']/gi,
    /\bfetch\s*\(\s*["']([^"']+)["']/gi,
    /\$.ajax\s*\(\s*\{[\s\S]*?\burl\s*:\s*["']([^"']+)["']/gi,
    /\burl\s*:\s*["']([^"']+\.(?:as|do)[^"']*)["']/gi,
  ];

  for (const pattern of scriptPatterns) {
    for (const match of content.matchAll(pattern)) {
      addAction("script", match[1]);
    }
  }

  for (const match of content.matchAll(/on(?:click|change|submit)\s*=\s*["']([^"']+)["']/gi)) {
    const script = match[1] ?? "";
    for (const nested of script.matchAll(/["']([^"']+\.(?:as|do)[^"']*)["']/g)) {
      addAction("script", nested[1]);
    }
  }

  return Array.from(actions.values());
}

export class JspViewAdapter implements AnalyzerAdapter {
  readonly id = "jsp-view";
  readonly name = "JSP view Adapter";
  readonly version = "0.1.0";
  readonly capabilities = {
    supportedFilePatterns: ["**/*.jsp"],
    technologyTags: ["java", "jsp"],
    produces: ["view"],
  };

  canRun(context: AdapterContext): boolean {
    return context.fileIndex.files.some((file) => file.endsWith(".jsp"));
  }

  async collectInputs(context: AdapterContext): Promise<AdapterInputSet> {
    return {
      files: context.fileIndex.files.filter((file) => file.endsWith(".jsp")),
    };
  }

  async run(context: AdapterContext, inputs: AdapterInputSet): Promise<AdapterResult> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const artifacts: ArtifactRecord[] = [];
    const warnings: AdapterWarning[] = [];

    const javaFiles = context.fileIndex.files.filter((file) => file.endsWith(".java"));
    const controllerFiles = javaFiles.filter((file) => file.endsWith("Controller.java") || file.endsWith("Action.java"));
    const controllerReturns = new Map<string, string[]>();
    const controllerHandlers = new Map<string, Array<{ methodName: string; requestMappings: string[]; viewNames: string[] }>>();
    const resolverConfigs: Array<{ prefix: string; suffix: string }> = [];

    const javaResult = context.upstreamResults.get("java-source-basic");
    for (const node of javaResult?.nodes ?? []) {
      if (node.type !== "controller" || !node.path || !Array.isArray(node.metadata?.requestHandlers)) {
        continue;
      }
      controllerHandlers.set(
        node.path,
        (node.metadata.requestHandlers as Array<Record<string, unknown>>)
          .map((handler) => ({
            methodName: typeof handler.methodName === "string" ? handler.methodName : "handler",
            requestMappings: Array.isArray(handler.requestMappings)
              ? handler.requestMappings.filter((value): value is string => typeof value === "string")
              : [],
            viewNames: Array.isArray(handler.viewNames)
              ? handler.viewNames.filter((value): value is string => typeof value === "string")
              : [],
          })),
      );
    }

    const springResult = context.upstreamResults.get("spring-xml");
    for (const artifact of springResult?.artifacts ?? []) {
      if (artifact.type !== "spring-view-resolver") {
        continue;
      }
      resolverConfigs.push({
        prefix: typeof artifact.payload.prefix === "string" ? artifact.payload.prefix : "",
        suffix: typeof artifact.payload.suffix === "string" ? artifact.payload.suffix : ".jsp",
      });
    }

    for (const file of controllerFiles) {
      const content = await readFile(join(context.projectRoot, file), "utf8");
      const matches = collectViewNamesFromController(content);
      controllerReturns.set(file, matches.filter(Boolean));
    }

    for (const file of inputs.files) {
      const content = await readFile(join(context.projectRoot, file), "utf8");
      const viewAliases = collectViewAliases(file, resolverConfigs);
      const viewName = viewAliases[0] ?? normalizeViewName(toModuleRelativeViewName(file));
      const viewNodeId = nodeId(context.projectId, "view", viewName);
      const uiActions = extractUiActions(content);
      nodes.push({
        id: viewNodeId,
        type: "view",
        name: viewName,
        displayName: viewName.split("/").pop() ?? viewName,
        projectId: context.projectId,
        path: file,
        language: "jsp",
        profileHints: [context.profileId],
        sourceAdapterIds: [this.id],
        confidence: "high",
        evidence: [{ kind: "jsp-file", value: file }],
        metadata: {
          uiActions,
          viewAliases,
        },
      });

      for (const [controllerFile, returns] of controllerReturns.entries()) {
        const matchedAliases = viewAliases.filter((alias) => returns.includes(alias));
        if (matchedAliases.length === 0) {
          continue;
        }
        const controllerFqn = extractControllerFqn(controllerFile);
        const controllerNodeId = nodeId(context.projectId, "controller", controllerFqn);
        const matchedHandlers = (controllerHandlers.get(controllerFile) ?? [])
          .filter((handler) => handler.viewNames.some((handlerViewName) => matchedAliases.includes(handlerViewName)))
          .map((handler) => handler.methodName);
        const renderEdge: GraphEdge = {
          id: edgeId(context.projectId, "renders", controllerNodeId, viewNodeId),
          type: "renders",
          from: controllerNodeId,
          to: viewNodeId,
          projectId: context.projectId,
          sourceAdapterIds: [this.id],
          confidence: "medium",
          directional: true,
          evidence: [{ kind: "controller-return-view", value: matchedAliases[0] ?? viewName }],
        };
        if (matchedHandlers.length > 0) {
          renderEdge.metadata = { handlerMethods: matchedHandlers, matchedViewAliases: matchedAliases };
        }
        edges.push(renderEdge);
      }

      artifacts.push({
        id: nodeId(context.projectId, "artifact", `jsp-actions:${file}`),
        type: "jsp-ui-actions",
        projectId: context.projectId,
        producerAdapterId: this.id,
        payload: {
          file,
          viewName,
          viewAliases,
          uiActions,
        },
      });
    }

    artifacts.push({
      id: nodeId(context.projectId, "artifact", "jsp-summary"),
      type: "jsp-view-summary",
      projectId: context.projectId,
      producerAdapterId: this.id,
      payload: { jspCount: inputs.files.length },
    });

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
