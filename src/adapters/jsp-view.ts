import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterContext, AdapterInputSet, AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AdapterWarning, ArtifactRecord, GraphEdge, GraphNode } from "../core/model.js";
import { edgeId, nodeId } from "../utils/id.js";
import { appendActionEvent, inferActionRouteFromClassName } from "../utils/action-family.js";

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

function extractStringConstants(content: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(content.matchAll(/(?:private|protected|public)\s+static\s+final\s+String\s+([A-Z0-9_]+)\s*=\s*"([^"]+)"/g))
      .map((match) => [match[1] ?? "", match[2] ?? ""])
      .filter((entry): entry is [string, string] => Boolean(entry[0]) && Boolean(entry[1])),
  );
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
  const stringConstants = extractStringConstants(content);
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

  for (const match of content.matchAll(/new\s+ForwardResolution\s*\(\s*([A-Z0-9_]+)\s*\)/g)) {
    const value = normalizeViewName(stringConstants[match[1] ?? ""] ?? "");
    if (!value || value === "ERROR" || value === "OK" || /^[0-9]+$/.test(value)) {
      continue;
    }
    viewNames.add(value);
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
      const variableValue = localStringValues.get(variableName) ?? normalizeViewName(stringConstants[variableName] ?? "");
      if (!variableValue || variableValue === "ERROR" || variableValue === "OK" || /^[0-9]+$/.test(variableValue)) {
        continue;
      }
      viewNames.add(variableValue);
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
  if (file.includes("src/main/webapp/")) {
    return file.split("src/main/webapp/")[1] ?? file;
  }
  if (file.includes("src/webapp/")) {
    return file.split("src/webapp/")[1] ?? file;
  }
  if (file.includes("WebContent/")) {
    return file.split("WebContent/")[1] ?? file;
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

interface HelperDefinition {
  name: string;
  parameters: string[];
  body: string;
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
  const noQuery = (normalized.split("?")[0]?.trim() ?? normalized).replace(/\/{2,}/g, "/");
  if (noQuery === "/") {
    return undefined;
  }
  if (!/\.(?:as|do|action)(?:$|[/?#])/.test(noQuery) && !noQuery.startsWith("/")) {
    return undefined;
  }
  return `/${noQuery.replace(/^\/+/, "")}`;
}

function extractActionTargetsFromExpression(expression: string | undefined): string[] {
  if (!expression) {
    return [];
  }
  const targets = new Set<string>();
  for (const match of expression.matchAll(/["']([^"'\n]+)["']/g)) {
    const target = normalizeActionTarget(match[1]);
    if (target) {
      targets.add(target);
    }
  }
  return Array.from(targets);
}

function splitCallArguments(raw: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | undefined;
  let depth = 0;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] ?? "";
    const previous = index > 0 ? raw[index - 1] : "";
    if (quote) {
      current += char;
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function collectHelperDefinitions(content: string): HelperDefinition[] {
  const helperDefinitions: HelperDefinition[] = [];
  for (const match of content.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{([\s\S]*?)^\s*\}/gm)) {
    const helperName = match[1] ?? "";
    const parameters = (match[2] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const body = match[3] ?? "";
    if (!helperName || parameters.length === 0 || !body) {
      continue;
    }
    helperDefinitions.push({ name: helperName, parameters, body });
  }
  return helperDefinitions;
}

function collectHelperUrlParameterIndices(content: string): Map<string, Set<number>> {
  const helperUrlParameterIndices = new Map<string, Set<number>>();
  const helperDefinitions = collectHelperDefinitions(content);
  const sinkPatterns = [
    /\bnew\s+Ajax\.Request\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,\)]/g,
    /\bfetch\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,\)]/g,
    /(?:document\.location\.href|location\.href|location\.assign|window\.open)\s*(?:=|\()\s*([A-Za-z_][A-Za-z0-9_]*)\s*[;\)]/g,
    /\.\s*action\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/g,
    /(?:\$|\$j|j\$)\.ajax\s*\(\s*\{[\s\S]*?\burl\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\b[\s\S]*?\}\s*\)/g,
  ];

  for (const helperDefinition of helperDefinitions) {
    for (const pattern of sinkPatterns) {
      for (const sinkMatch of helperDefinition.body.matchAll(pattern)) {
        const variableName = sinkMatch[1] ?? "";
        const parameterIndex = helperDefinition.parameters.indexOf(variableName);
        if (parameterIndex < 0) {
          continue;
        }
        const indices = helperUrlParameterIndices.get(helperDefinition.name) ?? new Set<number>();
        indices.add(parameterIndex);
        helperUrlParameterIndices.set(helperDefinition.name, indices);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const helperDefinition of helperDefinitions) {
      for (const [calleeName, calleeIndices] of helperUrlParameterIndices.entries()) {
        const callPattern = new RegExp(`\\b${calleeName}\\s*\\(([^)]*)\\)`, "g");
        for (const callMatch of helperDefinition.body.matchAll(callPattern)) {
          const prefix = helperDefinition.body.slice(Math.max(0, (callMatch.index ?? 0) - 16), callMatch.index ?? 0);
          if (/\bfunction\s+$/.test(prefix)) {
            continue;
          }
          const argumentExpressions = splitCallArguments(callMatch[1] ?? "");
          for (const calleeIndex of calleeIndices) {
            const argumentExpression = argumentExpressions[calleeIndex] ?? "";
            const variableMatch = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(argumentExpression);
            if (!variableMatch?.[1]) {
              continue;
            }
            const parameterIndex = helperDefinition.parameters.indexOf(variableMatch[1]);
            if (parameterIndex < 0) {
              continue;
            }
            const indices = helperUrlParameterIndices.get(helperDefinition.name) ?? new Set<number>();
            if (!indices.has(parameterIndex)) {
              indices.add(parameterIndex);
              helperUrlParameterIndices.set(helperDefinition.name, indices);
              changed = true;
            }
          }
        }
      }
    }
  }

  return helperUrlParameterIndices;
}

function extractUiActions(content: string): UiActionRecord[] {
  const actions = new Map<string, UiActionRecord>();
  const scriptUrlVariables = new Map<string, string[]>();
  const helperUrlParameterIndices = collectHelperUrlParameterIndices(content);

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
  const addScriptVariableTarget = (variableName: string, variableTarget: string): void => {
    const existingTargets = scriptUrlVariables.get(variableName) ?? [];
    if (!existingTargets.includes(variableTarget)) {
      existingTargets.push(variableTarget);
      scriptUrlVariables.set(variableName, existingTargets);
    }
  };
  const addVariableActions = (variableName: string | undefined): void => {
    if (!variableName) {
      return;
    }
    for (const variableTarget of scriptUrlVariables.get(variableName) ?? []) {
      addAction("script", variableTarget);
    }
  };

  for (const match of content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    addAction("link", match[1], match[2]);
  }

  for (const match of content.matchAll(/<form\b[^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/gi)) {
    const inner = stripTags(match[2] ?? "");
    addAction("form", match[1], inner && inner.length <= 80 ? inner : "submit");
  }

  const scriptPatterns = [
    /(?:document\.location\.href|location\.href|location\.assign|window\.location\.replace|window\.open)\s*=\s*["']([^"']+)["']/gi,
    /(?:document\.location\.href|location\.href|location\.assign|window\.location\.replace|window\.open)\s*\(\s*["']([^"']+)["']/gi,
    /\bfetch\s*\(\s*["']([^"']+)["']/gi,
    /(?:\$|\$j|j\$)\.ajax\s*\(\s*\{[\s\S]*?\burl\s*:\s*["']([^"']+)["']/gi,
    /\burl\s*:\s*["']([^"']+\.(?:as|do|action)[^"']*)["']/gi,
  ];

  for (const pattern of scriptPatterns) {
    for (const match of content.matchAll(pattern)) {
      addAction("script", match[1]);
    }
  }

  for (const match of content.matchAll(/(?:^|[;\s])(?:var\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;\n]+);?/gm)) {
    const variableName = match[1] ?? "";
    const variableTargets = extractActionTargetsFromExpression(match[2]);
    if (!variableName || variableTargets.length === 0) {
      continue;
    }
    for (const variableTarget of variableTargets) {
      addScriptVariableTarget(variableName, variableTarget);
    }
  }

  for (const match of content.matchAll(/(?:^|[;\s])(?:var\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;\n]+)\n/gm)) {
    const variableName = match[1] ?? "";
    const variableTargets = extractActionTargetsFromExpression(match[2]);
    if (!variableName || variableTargets.length === 0) {
      continue;
    }
    for (const variableTarget of variableTargets) {
      addScriptVariableTarget(variableName, variableTarget);
    }
  }

  for (const match of content.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;\n]+);?/gm)) {
    const variableName = match[1] ?? "";
    const variableTargets = extractActionTargetsFromExpression(match[2]);
    if (!variableName || variableTargets.length === 0) {
        continue;
    }
    for (const variableTarget of variableTargets) {
      addScriptVariableTarget(variableName, variableTarget);
    }
  }

  for (const match of content.matchAll(/\bnew\s+Ajax\.Request\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,\)]/g)) {
    addVariableActions(match[1]);
  }

  for (const match of content.matchAll(/\bfetch\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,\)]/g)) {
    addVariableActions(match[1]);
  }

  for (const match of content.matchAll(/(?:document\.location\.href|location\.href|location\.assign|window\.location\.replace|window\.open)\s*(?:=|\()\s*([A-Za-z_][A-Za-z0-9_]*)\s*[;\)]/g)) {
    addVariableActions(match[1]);
  }

  for (const match of content.matchAll(/\.\s*action\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/g)) {
    addVariableActions(match[1]);
  }

  for (const match of content.matchAll(/(?:\$|\$j|j\$)\.ajax\s*\(\s*\{[\s\S]*?\burl\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\b[\s\S]*?\}\s*\)/g)) {
    addVariableActions(match[1]);
  }

  for (const [helperName, parameterIndices] of helperUrlParameterIndices.entries()) {
    const callPattern = new RegExp(`\\b${helperName}\\s*\\(([^)]*)\\)`, "g");
    for (const match of content.matchAll(callPattern)) {
      const prefix = content.slice(Math.max(0, (match.index ?? 0) - 16), match.index ?? 0);
      if (/\bfunction\s+$/.test(prefix)) {
        continue;
      }
      const argumentExpressions = splitCallArguments(match[1] ?? "");
      for (const parameterIndex of parameterIndices) {
        const argumentExpression = argumentExpressions[parameterIndex];
        for (const target of extractActionTargetsFromExpression(argumentExpression)) {
          addAction("script", target);
        }
        const variableMatch = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(argumentExpression ?? "");
        if (variableMatch?.[1]) {
          addVariableActions(variableMatch[1]);
        }
      }
    }
  }

  for (const match of content.matchAll(/on(?:click|change|submit)\s*=\s*["']([^"']+)["']/gi)) {
    const script = match[1] ?? "";
    for (const nested of script.matchAll(/["']([^"']+\.(?:as|do|action)[^"']*)["']/g)) {
      addAction("script", nested[1]);
    }
  }

  return Array.from(actions.values());
}

function extractStripesUiActions(
  content: string,
  resolverPackages: string[],
  urlPattern: string | undefined,
): UiActionRecord[] {
  const actions = new Map<string, UiActionRecord>();
  const addAction = (kind: UiActionRecord["kind"], beanClass: string | undefined, eventName?: string, label?: string): void => {
    if (!beanClass) {
      return;
    }
    const baseRoute = inferActionRouteFromClassName(beanClass, resolverPackages, urlPattern);
    if (!baseRoute) {
      return;
    }
    const target = appendActionEvent(baseRoute, eventName);
    const key = `${kind}:${target}:${label ?? ""}`;
    if (!actions.has(key)) {
      actions.set(key, label ? { kind, target, label } : { kind, target });
    }
  };
  const readBeanClass = (attrs: string): string | undefined => {
    const raw = /beanclass\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrs)?.[2];
    if (!raw) {
      return undefined;
    }
    const resolved = raw
      .replace(/<%=\s*/g, "")
      .replace(/\s*%>/g, "")
      .replace(/\.class\b/g, "")
      .trim();
    return resolved || undefined;
  };

  for (const match of content.matchAll(/<stripes:link\b([^>]*?)>([\s\S]*?)<\/stripes:link>/gi)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const beanClass = readBeanClass(attrs);
    const eventName = /event\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    addAction("link", beanClass, eventName, stripTags(body));
  }

  for (const match of content.matchAll(/<stripes:form\b([^>]*?)>([\s\S]*?)<\/stripes:form>/gi)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const beanClass = readBeanClass(attrs);
    const eventName = /event\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (eventName) {
      addAction("form", beanClass, eventName, stripTags(body) || "submit");
    }
    for (const submit of body.matchAll(/<stripes:submit\b([^>]*?)\/?>/gi)) {
      const submitAttrs = submit[1] ?? "";
      const submitName = /name\s*=\s*["']([^"']+)["']/i.exec(submitAttrs)?.[1];
      const submitValue = /value\s*=\s*["']([^"']+)["']/i.exec(submitAttrs)?.[1];
      addAction("form", beanClass, submitName, submitValue ?? submitName ?? "submit");
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
    const controllerFiles = javaFiles.filter((file) =>
      file.endsWith("Controller.java") || file.endsWith("Action.java") || file.endsWith("ActionBean.java"),
    );
    const controllerReturns = new Map<string, string[]>();
    const controllerHandlers = new Map<string, Array<{ methodName: string; requestMappings: string[]; viewNames: string[] }>>();
    const resolverConfigs: Array<{ prefix: string; suffix: string }> = [];
    const actionResolverPackages = new Set<string>();
    let actionUrlPattern: string | undefined;

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

    const actionConfigResult = context.upstreamResults.get("action-config");
    for (const artifact of actionConfigResult?.artifacts ?? []) {
      if (artifact.type === "action-filter-summary") {
        if (!actionUrlPattern && typeof artifact.payload.urlPattern === "string") {
          actionUrlPattern = artifact.payload.urlPattern;
        }
        if (Array.isArray(artifact.payload.actionResolverPackages)) {
          for (const value of artifact.payload.actionResolverPackages) {
            if (typeof value === "string" && value.length > 0) {
              actionResolverPackages.add(value);
            }
          }
        }
      }
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
      const uiActions = [
        ...extractUiActions(content),
        ...extractStripesUiActions(content, Array.from(actionResolverPackages), actionUrlPattern),
      ].filter((action, index, array) =>
        array.findIndex((candidate) =>
          candidate.kind === action.kind &&
          candidate.target === action.target &&
          candidate.label === action.label,
        ) === index,
      );
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
