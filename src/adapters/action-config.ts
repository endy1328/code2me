import { readFile } from "node:fs/promises";
import type { AdapterContext, AdapterInputSet, AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AdapterWarning, ArtifactRecord, EntryPoint, GraphEdge, GraphNode } from "../core/model.js";
import { parseXmlFile } from "../utils/xml.js";
import { edgeId, nodeId } from "../utils/id.js";
import { actionExtensionFromPattern, appendActionEvent, inferActionRouteFromClassName } from "../utils/action-family.js";

type WebXml = {
  "web-app"?: {
    filter?:
      | Array<{ "filter-name"?: string; "filter-class"?: string; "init-param"?: Array<{ "param-name"?: string; "param-value"?: string }> }>
      | { "filter-name"?: string; "filter-class"?: string; "init-param"?: Array<{ "param-name"?: string; "param-value"?: string }> };
    "filter-mapping"?:
      | Array<{ "filter-name"?: string; "url-pattern"?: string }>
      | { "filter-name"?: string; "url-pattern"?: string };
  };
};

type StrutsConfig = {
  struts?: {
    package?: Record<string, unknown> | Array<Record<string, unknown>>;
  };
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function normalizeRoute(value: string): string {
  if (!value) {
    return value;
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeViewName(raw: string): string {
  return raw
    .trim()
    .replace(/^redirect:/, "")
    .replace(/^forward:/, "")
    .replace(/^\/+/, "")
    .replace(/\.jsp$/, "")
    .replace(/^WEB-INF\/views\//, "")
    .replace(/^WEB-INF\/jsp\//, "");
}

function readTextValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const text = (value as Record<string, unknown>)["#text"];
    return typeof text === "string" ? text.trim() : undefined;
  }
  return undefined;
}

function resolveTypeName(typeName: string, imports: string[], packageName: string | undefined): string {
  if (typeName.includes(".")) {
    return typeName;
  }
  const imported = imports.find((value) => value.endsWith(`.${typeName}`));
  if (imported) {
    return imported;
  }
  return packageName ? `${packageName}.${typeName}` : typeName;
}

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ");
}

function collectViewNamesFromMethodBody(content: string): string[] {
  const viewNames = new Set<string>();
  const localStringValues = new Map<string, string>();
  const patterns = [
    /return\s+"([^"]+)"/g,
    /new\s+ModelAndView\s*\(\s*"([^"]+)"/g,
    /\.setViewName\s*\(\s*"([^"]+)"/g,
    /new\s+ForwardResolution\s*\(\s*"([^"]+)"/g,
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

  for (const match of content.matchAll(/\bString\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]+)"/g)) {
    const variableName = match[1] ?? "";
    const variableValue = normalizeViewName(match[2] ?? "");
    if (!variableName || !variableValue || variableValue === "ERROR" || variableValue === "OK" || /^[0-9]+$/.test(variableValue)) {
      continue;
    }
    localStringValues.set(variableName, variableValue);
  }

  for (const match of content.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]+)"/g)) {
    const variableName = match[1] ?? "";
    const variableValue = normalizeViewName(match[2] ?? "");
    if (!variableName || !variableValue || variableValue === "ERROR" || variableValue === "OK" || /^[0-9]+$/.test(variableValue)) {
      continue;
    }
    localStringValues.set(variableName, variableValue);
  }

  const variablePatterns = [
    /return\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g,
    /new\s+ModelAndView\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[\),]/g,
    /\.setViewName\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
    /new\s+ForwardResolution\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[\),]/g,
  ];

  for (const pattern of variablePatterns) {
    for (const match of content.matchAll(pattern)) {
      const variableName = match[1] ?? "";
      const variableValue = localStringValues.get(variableName);
      if (!variableValue || variableValue === "ERROR" || variableValue === "OK" || /^[0-9]+$/.test(variableValue)) {
        continue;
      }
      viewNames.add(variableValue);
    }
  }

  return Array.from(viewNames);
}

function extractStripesViewNamesByMethod(content: string): Map<string, string[]> {
  const cleanContent = stripComments(content);
  const result = new Map<string, string[]>();
  const signaturePattern = /((?:@\w+(?:\([^)]*\))?\s*)*)(?:public|protected|private)?\s*[\w<>\[\], ?.]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\{/g;
  let match: RegExpExecArray | null;
  while ((match = signaturePattern.exec(cleanContent)) !== null) {
    const methodName = match[2] ?? "";
    const openBraceIndex = cleanContent.indexOf("{", match.index + match[0].length - 1);
    let depth = 1;
    let cursor = openBraceIndex + 1;
    while (cursor < cleanContent.length && depth > 0) {
      const char = cleanContent[cursor];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      cursor += 1;
    }
    const methodBody = cleanContent.slice(openBraceIndex + 1, Math.max(openBraceIndex + 1, cursor - 1));
    const viewNames = collectViewNamesFromMethodBody(methodBody);
    if (viewNames.length > 0) {
      result.set(methodName, viewNames);
    }
    signaturePattern.lastIndex = Math.max(signaturePattern.lastIndex, cursor);
  }
  return result;
}

function extractStripesSessionRouteHintsByMethod(content: string, classFqn: string): Map<string, string[]> {
  const cleanContent = stripComments(content);
  const packageName = /^\s*package\s+([\w.]+)\s*;/m.exec(cleanContent)?.[1];
  const imports = Array.from(cleanContent.matchAll(/^\s*import\s+([\w.]+)\s*;/gm)).map((match) => match[1]).filter(Boolean) as string[];
  const result = new Map<string, string[]>();
  const signaturePattern = /((?:@\w+(?:\([^)]*\))?\s*)*)(?:public|protected|private)?\s*[\w<>\[\], ?.]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\{/g;
  let match: RegExpExecArray | null;
  while ((match = signaturePattern.exec(cleanContent)) !== null) {
    const methodName = match[2] ?? "";
    const openBraceIndex = cleanContent.indexOf("{", match.index + match[0].length - 1);
    let depth = 1;
    let cursor = openBraceIndex + 1;
    while (cursor < cleanContent.length && depth > 0) {
      const char = cleanContent[cursor];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      cursor += 1;
    }
    const methodBody = cleanContent.slice(openBraceIndex + 1, Math.max(openBraceIndex + 1, cursor - 1));
    const hints = new Set(Array.from(methodBody.matchAll(/getAttribute\s*\(\s*"(\/actions\/[^"]+\.action)"\s*\)/g))
      .map((aliasMatch) => (aliasMatch[1] ?? "").replace(/^\/actions/, ""))
      .filter(Boolean));
    for (const aliasMatch of methodBody.matchAll(/([A-Z][A-Za-z0-9_<>.]*)\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*\(\s*([A-Z][A-Za-z0-9_<>.]*)\s*\)\s*[^;\n]*?getAttribute\s*\(\s*"([^"]+)"\s*\)/g)) {
      const rawTypeName = ((aliasMatch[1] ?? aliasMatch[2]) ?? "").replace(/<.*$/, "").trim();
      const alias = (aliasMatch[3] ?? "").trim();
      if (!rawTypeName || !/^[a-zA-Z][A-Za-z0-9_]*Bean$/.test(alias)) {
        continue;
      }
      const resolvedType = resolveTypeName(rawTypeName, imports, packageName);
      const inferredRoute = inferActionRouteFromClassName(resolvedType || classFqn, uniqueStrings([]), "*.action");
      if (inferredRoute) {
        hints.add(inferredRoute);
      }
    }
    if (hints.size > 0) {
      result.set(methodName, Array.from(hints));
    }
    signaturePattern.lastIndex = Math.max(signaturePattern.lastIndex, cursor);
  }
  return result;
}

function extractStripesRedirectActionClassesByMethod(content: string, classFqn: string): Map<string, string[]> {
  const cleanContent = stripComments(content);
  const packageName = /^\s*package\s+([\w.]+)\s*;/m.exec(cleanContent)?.[1];
  const imports = Array.from(cleanContent.matchAll(/^\s*import\s+([\w.]+)\s*;/gm)).map((match) => match[1]).filter(Boolean) as string[];
  const result = new Map<string, string[]>();
  const signaturePattern = /((?:@\w+(?:\([^)]*\))?\s*)*)(?:public|protected|private)?\s*[\w<>\[\], ?.]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\{/g;
  let match: RegExpExecArray | null;
  while ((match = signaturePattern.exec(cleanContent)) !== null) {
    const methodName = match[2] ?? "";
    const openBraceIndex = cleanContent.indexOf("{", match.index + match[0].length - 1);
    let depth = 1;
    let cursor = openBraceIndex + 1;
    while (cursor < cleanContent.length && depth > 0) {
      const char = cleanContent[cursor];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      cursor += 1;
    }
    const methodBody = cleanContent.slice(openBraceIndex + 1, Math.max(openBraceIndex + 1, cursor - 1));
    const redirectMatches = Array.from(
      methodBody.matchAll(/new\s+(?:RedirectResolution|ForwardResolution)\s*\(\s*([A-Z][A-Za-z0-9_.]*)\.class/g),
    );
    const redirects = new Set(
      redirectMatches
        .map((redirectMatch) => resolveTypeName(redirectMatch[1] ?? "", imports, packageName))
        .filter(Boolean),
    );
    if (/new\s+(?:RedirectResolution|ForwardResolution)\s*\(\s*getClass\s*\(\s*\)\s*\)/.test(methodBody)) {
      redirects.add(classFqn);
    }
    const redirectList = Array.from(redirects);
    if (redirectList.length > 0) {
      result.set(methodName, redirectList);
    }
    signaturePattern.lastIndex = Math.max(signaturePattern.lastIndex, cursor);
  }
  return result;
}

function buildActionRoute(namespace: string | undefined, actionName: string, extension: string): string {
  const normalizedNamespace = namespace && namespace !== "/"
    ? normalizeRoute(namespace).replace(/\/$/, "")
    : "";
  return `${normalizedNamespace}/${actionName}${extension}`.replace(/\/{2,}/g, "/");
}

function readStrutsResultParam(result: Record<string, unknown>, name: string): string | undefined {
  const params = asArray(result.param).filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
  const matched = params.find((param) => param.name === name);
  return readTextValue(matched);
}

function substituteStrutsWildcardTokens(value: string, actionName: string): string {
  const wildcardMatches = actionName.includes("*")
    ? actionName.match(/\*/g)?.map(() => "*") ?? []
    : [];
  return value.replace(/\{(\d+)\}/g, (_match, index: string) => wildcardMatches[Number(index) - 1] ?? "*");
}

function extractStrutsRedirectTarget(result: Record<string, unknown>, namespace: string | undefined, actionName: string, extension: string): string | undefined {
  const type = typeof result.type === "string" ? result.type : "";
  if (!/^(redirect|redirectAction|chain)/i.test(type)) {
    return undefined;
  }
  const rawValue = readTextValue(result);
  if (/^(redirectAction|chain)$/i.test(type)) {
    const targetActionName = readStrutsResultParam(result, "actionName") ?? rawValue;
    const targetNamespace = readStrutsResultParam(result, "namespace") ?? namespace;
    const normalizedActionName = targetActionName
      ? substituteStrutsWildcardTokens(targetActionName, actionName).replace(/^\/+/, "").trim()
      : "";
    return normalizedActionName ? buildActionRoute(targetNamespace, normalizedActionName, extension) : undefined;
  }
  if (!rawValue) {
    return undefined;
  }
  const target = substituteStrutsWildcardTokens(rawValue.replace(/^\$\{/, "").replace(/\}$/, ""), actionName);
  return normalizeRoute(target);
}

export class ActionConfigAdapter implements AnalyzerAdapter {
  readonly id = "action-config";
  readonly name = "Action config Adapter";
  readonly version = "0.1.0";
  readonly capabilities = {
    supportedFilePatterns: ["**/web.xml", "**/struts.xml", "**/*ActionBean.java"],
    technologyTags: ["java", "xml", "struts", "stripes"],
    produces: ["route", "entrypoint_hint", "controller", "view"],
  };

  canRun(context: AdapterContext): boolean {
    return context.fileIndex.files.some((file) =>
      file.endsWith("web.xml") || file.endsWith("struts.xml") || file.endsWith("ActionBean.java"),
    );
  }

  async collectInputs(context: AdapterContext): Promise<AdapterInputSet> {
    return {
      files: context.fileIndex.files.filter((file) =>
        file.endsWith("web.xml") || file.endsWith("struts.xml") || file.endsWith("ActionBean.java"),
      ),
    };
  }

  async run(context: AdapterContext, inputs: AdapterInputSet): Promise<AdapterResult> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const entryPoints: EntryPoint[] = [];
    const artifacts: ArtifactRecord[] = [];
    const warnings: AdapterWarning[] = [];

    const webXmlFiles = inputs.files.filter((file) => file.endsWith("web.xml"));
    const strutsFiles = inputs.files.filter((file) => file.endsWith("struts.xml"));

    const strutsUrlPatterns: string[] = [];
    const stripesUrlPatterns: string[] = [];
    const stripesResolverPackages: string[] = [];

    for (const file of webXmlFiles) {
      const parsed = await parseXmlFile<WebXml>(context.projectRoot, file);
      const webApp = parsed["web-app"];
      const filters = asArray(webApp?.filter);
      const filterMappings = asArray(webApp?.["filter-mapping"]);

      for (const filter of filters) {
        const filterName = filter["filter-name"] ?? "unknown-filter";
        const filterClass = filter["filter-class"] ?? "";
        const mapping = filterMappings.find((candidate) => candidate["filter-name"] === filterName);
        const urlPattern = mapping?.["url-pattern"];
        const initParams = asArray(filter["init-param"]);
        const resolverPackages = initParams
          .filter((param) => param["param-name"] === "ActionResolver.Packages")
          .flatMap((param) => (param["param-value"] ?? "").split(/[,\s]+/))
          .filter(Boolean);

        const framework = filterClass.includes("StrutsPrepareAndExecuteFilter")
          ? "struts"
          : filterClass.includes("StripesFilter")
            ? "stripes"
            : undefined;
        if (!framework || !urlPattern) {
          continue;
        }

        const routeNodeId = nodeId(context.projectId, "route", `${file}:${filterName}`);
        nodes.push({
          id: routeNodeId,
          type: "route",
          name: filterName,
          displayName: filterName,
          projectId: context.projectId,
          path: file,
          language: "xml",
          profileHints: [context.profileId],
          sourceAdapterIds: [this.id],
          confidence: "high",
          evidence: [{ kind: "filter-name", value: filterName }],
          metadata: {
            filterClass,
            filterName,
            urlPattern,
            framework,
          },
        });

        entryPoints.push({
          id: nodeId(context.projectId, "entry", `${file}:${filterName}`),
          type: "web_entry",
          targetEntityId: routeNodeId,
          projectId: context.projectId,
          title: filterName,
          reason: `Mapped by web.xml filter: ${urlPattern}`,
          priority: 100,
          sourceAdapterIds: [this.id],
          confidence: "high",
          metadata: {
            urlPattern,
            filterClass,
            filterName,
            framework,
          },
        });

        artifacts.push({
          id: nodeId(context.projectId, "artifact", `${file}:${filterName}:action-filter`),
          type: "action-filter-summary",
          projectId: context.projectId,
          producerAdapterId: this.id,
          payload: {
            file,
            filterName,
            filterClass,
            urlPattern,
            framework,
            actionResolverPackages: resolverPackages,
          },
        });

        if (framework === "struts") {
          strutsUrlPatterns.push(urlPattern);
        } else {
          stripesUrlPatterns.push(urlPattern);
          stripesResolverPackages.push(...resolverPackages);
        }
      }
    }

    for (const file of strutsFiles) {
      const parsed = await parseXmlFile<StrutsConfig>(context.projectRoot, file);
      const packages = asArray(parsed.struts?.package).filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
      const actionExtension = actionExtensionFromPattern(strutsUrlPatterns[0]);
      let actionCount = 0;

      nodes.push({
        id: nodeId(context.projectId, "config", file),
        type: "config",
        name: file.split("/").pop() ?? file,
        displayName: file,
        projectId: context.projectId,
        path: file,
        language: "xml",
        profileHints: [context.profileId],
        sourceAdapterIds: [this.id],
        confidence: "high",
        evidence: [{ kind: "file", value: file }],
        metadata: {},
      });

      for (const pkg of packages) {
        const namespace = typeof pkg.namespace === "string" ? pkg.namespace : "/";
        const actions = asArray(pkg.action).filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);

        for (const action of actions) {
          const actionName = typeof action.name === "string" ? action.name : undefined;
          const className = typeof action.class === "string" ? action.class : undefined;
          if (!actionName || !className) {
            continue;
          }
          const methodName = typeof action.method === "string" ? action.method : "execute";
          const requestMappings = [buildActionRoute(namespace, actionName, actionExtension)];
          const results = asArray(action.result).filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
          const viewNames = uniqueStrings(results
            .map((result) => {
              const type = typeof result.type === "string" ? result.type : "dispatcher";
              const value = readTextValue(result);
              if (!value || /^(redirect|redirectAction|stream)$/i.test(type) || !value.endsWith(".jsp")) {
                return undefined;
              }
              return normalizeViewName(value);
            })
            .filter((value): value is string => Boolean(value)));
          const redirectTargets = uniqueStrings(results
            .map((result) => extractStrutsRedirectTarget(result, namespace, actionName, actionExtension))
            .filter((value): value is string => Boolean(value)));
          const fileResponseHints = results.some((result) => typeof result.type === "string" && result.type === "stream")
            ? ["stream-result"]
            : [];

          const controllerNodeId = nodeId(context.projectId, "controller", className);
          nodes.push({
            id: controllerNodeId,
            type: "controller",
            name: className,
            displayName: className.split(".").pop() ?? className,
            projectId: context.projectId,
            path: file,
            language: "java",
            profileHints: [context.profileId],
            sourceAdapterIds: [this.id],
            confidence: "high",
            evidence: [{ kind: "struts-action", value: actionName }],
            metadata: {
              requestMappings,
              requestHandlers: [{
                methodName,
                requestMappings,
                viewNames,
                responseBody: false,
                produces: [],
                contentTypes: [],
                redirectTargets,
                fileResponseHints,
                serviceCalls: [],
              }],
              actionFramework: "struts2",
              declaringConfigPath: file,
            },
          });
          edges.push({
            id: edgeId(context.projectId, "declares", nodeId(context.projectId, "config", file), controllerNodeId),
            type: "declares",
            from: nodeId(context.projectId, "config", file),
            to: controllerNodeId,
            projectId: context.projectId,
            sourceAdapterIds: [this.id],
            confidence: "high",
            directional: true,
            evidence: [{ kind: "struts-action", value: actionName }],
          });

          for (const viewName of viewNames) {
            edges.push({
              id: edgeId(context.projectId, "renders", controllerNodeId, nodeId(context.projectId, "view", viewName)),
              type: "renders",
              from: controllerNodeId,
              to: nodeId(context.projectId, "view", viewName),
              projectId: context.projectId,
              sourceAdapterIds: [this.id],
              confidence: "medium",
              directional: true,
              evidence: [{ kind: "struts-result", value: viewName }],
              metadata: { handlerMethods: [methodName], matchedViewAliases: [viewName] },
            });
          }
          actionCount += 1;
        }
      }

      artifacts.push({
        id: nodeId(context.projectId, "artifact", `struts:${file}`),
        type: "action-config-summary",
        projectId: context.projectId,
        producerAdapterId: this.id,
        payload: {
          file,
          framework: "struts2",
          actionCount,
          urlPatterns: uniqueStrings(strutsUrlPatterns),
        },
      });
    }

    const javaResult = context.upstreamResults.get("java-source-basic");
    const stripeControllers = (javaResult?.nodes ?? []).filter((node) =>
      node.type === "controller" &&
      (node.metadata?.actionFramework === "stripes" || String(node.metadata?.className ?? node.name).endsWith("ActionBean")),
    );
    for (const node of stripeControllers) {
      const className = typeof node.name === "string" ? node.name : typeof node.metadata?.className === "string" ? node.metadata.className : undefined;
      if (!className) {
        continue;
      }
      const inferredBaseRoute = inferActionRouteFromClassName(className, uniqueStrings(stripesResolverPackages), stripesUrlPatterns[0]);
      const originalMappings = Array.isArray(node.metadata?.requestMappings)
        ? node.metadata.requestMappings.filter((value): value is string => typeof value === "string" && value.length > 0)
        : [];
      const baseRoute = originalMappings.find((value) => !value.includes("?")) ?? inferredBaseRoute;
      if (!baseRoute) {
        continue;
      }
      const sourcePath = typeof node.path === "string" ? node.path : undefined;
      const sourceContent = sourcePath ? await readFile(`${context.projectRoot}/${sourcePath}`, "utf8").catch(() => "") : "";
      const viewNamesByMethod = sourceContent ? extractStripesViewNamesByMethod(sourceContent) : new Map<string, string[]>();
      const redirectActionClassesByMethod = sourceContent ? extractStripesRedirectActionClassesByMethod(sourceContent, className) : new Map<string, string[]>();
      const sessionRouteHintsByMethod = sourceContent ? extractStripesSessionRouteHintsByMethod(sourceContent, className) : new Map<string, string[]>();
      const originalHandlers = Array.isArray(node.metadata?.requestHandlers)
        ? node.metadata.requestHandlers.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
        : [];
      const requestHandlers = originalHandlers.map((handler) => {
        const methodName = typeof handler.methodName === "string" ? handler.methodName : undefined;
        const redirectActionClasses = uniqueStrings([
          ...(Array.isArray(handler.redirectActionClasses)
            ? handler.redirectActionClasses.filter((value): value is string => typeof value === "string" && value.length > 0)
            : []),
          ...(methodName ? (redirectActionClassesByMethod.get(methodName) ?? []) : []),
        ]);
        const sessionRouteHints = uniqueStrings([
          ...(Array.isArray(handler.sessionRouteHints)
            ? handler.sessionRouteHints.filter((value): value is string => typeof value === "string" && value.length > 0)
            : []),
          ...(methodName ? (sessionRouteHintsByMethod.get(methodName) ?? []) : []),
        ]);
        const eventName = typeof handler.eventName === "string" ? handler.eventName : undefined;
        const isDefaultHandler = handler.isDefaultHandler === true;
        const existingMappings = Array.isArray(handler.requestMappings)
          ? handler.requestMappings.filter((value): value is string => typeof value === "string" && value.length > 0)
          : [];
        const fallbackMappings = existingMappings.length > 0
          ? existingMappings
          : [appendActionEvent(baseRoute, isDefaultHandler ? undefined : eventName ?? methodName)];
        const computedRedirectTargets = redirectActionClasses.map((targetClass) => {
          if (targetClass === className || className.endsWith(`.${targetClass}`) || className.split(".").pop() === targetClass) {
            return baseRoute;
          }
          return inferActionRouteFromClassName(targetClass, uniqueStrings(stripesResolverPackages), stripesUrlPatterns[0]);
        }).filter((value): value is string => Boolean(value));
        const redirectTargets = uniqueStrings([
          ...(redirectActionClasses.length === 0 && Array.isArray(handler.redirectTargets)
            ? handler.redirectTargets.filter((value): value is string => typeof value === "string" && value.length > 0)
            : []),
          ...computedRedirectTargets,
        ]);
        const viewNames = uniqueStrings([
          ...(Array.isArray(handler.viewNames)
            ? handler.viewNames.filter((value): value is string => typeof value === "string" && value.length > 0)
            : []),
          ...(methodName ? (viewNamesByMethod.get(methodName) ?? []) : []),
        ]);
        return {
          ...handler,
          requestMappings: uniqueStrings(fallbackMappings),
          viewNames,
          redirectActionClasses,
          sessionRouteHints,
          redirectTargets,
        };
      });
      const synthesizedMappings = uniqueStrings([
        baseRoute,
        ...requestHandlers.flatMap((handler) => Array.isArray(handler.requestMappings) ? handler.requestMappings.filter((value): value is string => typeof value === "string") : []),
      ]);
      nodes.push({
        ...node,
        sourceAdapterIds: [this.id],
        confidence: node.confidence === "high" ? "high" : "medium",
        evidence: [{ kind: "action-resolver-package", value: uniqueStrings(stripesResolverPackages).join(", ") || baseRoute }],
        metadata: {
          ...(node.metadata ?? {}),
          requestMappings: synthesizedMappings,
          requestHandlers,
          actionFramework: "stripes",
        },
      });
    }
    if (stripeControllers.length > 0) {
      artifacts.push({
        id: nodeId(context.projectId, "artifact", "stripes:summary"),
        type: "action-config-summary",
        projectId: context.projectId,
        producerAdapterId: this.id,
        payload: {
          framework: "stripes",
          controllerCount: stripeControllers.length,
          urlPatterns: uniqueStrings(stripesUrlPatterns),
          actionResolverPackages: uniqueStrings(stripesResolverPackages),
        },
      });
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
