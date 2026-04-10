import type { AnalysisSnapshot, EntryPoint, GraphEdge, GraphNode } from "./model.js";

export function renderMarkdownSummary(snapshot: AnalysisSnapshot): string {
  const nodeCounts = new Map<string, number>();
  for (const node of snapshot.nodes) {
    nodeCounts.set(node.type, (nodeCounts.get(node.type) ?? 0) + 1);
  }

  const lines = [
    "# code2me Analysis Summary",
    "",
    `- projectId: \`${snapshot.projectId}\``,
    `- profileId: \`${snapshot.profileId}\``,
    `- createdAt: \`${snapshot.createdAt}\``,
    `- nodes: \`${snapshot.nodes.length}\``,
    `- edges: \`${snapshot.edges.length}\``,
    `- entryPoints: \`${snapshot.entryPoints.length}\``,
    `- warnings: \`${snapshot.warnings.length}\``,
    "",
    "## Node Counts",
    "",
    ...Array.from(nodeCounts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([type, count]) => `- ${type}: \`${count}\``),
    "",
    "## Entry Points",
    "",
    ...(
      snapshot.entryPoints.length > 0
        ? snapshot.entryPoints.map((entry) => `- ${entry.title}: ${entry.reason}`)
        : ["- none"]
    ),
  ];

  return lines.join("\n") + "\n";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function collectNodeCounts(snapshot: AnalysisSnapshot): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of snapshot.nodes) {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
  }
  return counts;
}

function summarizeArtifactPayload(value: unknown, depth = 0): unknown {
  if (value == null || depth > 2) {
    return value ?? null;
  }
  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 200)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, 8).map((item) => summarizeArtifactPayload(item, depth + 1));
    return value.length > 8 ? [...items, `... (+${value.length - 8} more)`] : items;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record).slice(0, 12).map(([key, entry]) => [key, summarizeArtifactPayload(entry, depth + 1)]);
    const summary = Object.fromEntries(entries) as Record<string, unknown>;
    if (Object.keys(record).length > 12) {
      summary.__truncated__ = `+${Object.keys(record).length - 12} keys`;
    }
    return summary;
  }
  return String(value);
}

function buildUiSnapshot(
  snapshot: AnalysisSnapshot,
  options?: { compact?: boolean; includeEdges?: boolean; includeArtifacts?: boolean; nodeTypes?: string[] },
) {
  const compact = options?.compact === true;
  const includeEdges = options?.includeEdges !== false;
  const includeArtifacts = options?.includeArtifacts !== false;
  const nodeTypes = options?.nodeTypes;
  const nodeLimit = compact ? 400 : Number.POSITIVE_INFINITY;
  const edgeLimit = compact ? 800 : Number.POSITIVE_INFINITY;
  const entryLimit = compact ? 120 : Number.POSITIVE_INFINITY;
  const warningLimit = compact ? 120 : Number.POSITIVE_INFINITY;
  const artifactLimit = compact ? 120 : Number.POSITIVE_INFINITY;

  const filteredNodes = nodeTypes
    ? snapshot.nodes.filter((node) => nodeTypes.includes(node.type))
    : snapshot.nodes;

  return {
    projectId: snapshot.projectId,
    profileId: snapshot.profileId,
    createdAt: snapshot.createdAt,
    nodes: filteredNodes.slice(0, nodeLimit).map((node) => ({
      id: node.id,
      type: node.type,
      name: node.name,
      displayName: node.displayName,
      path: node.path,
      confidence: node.confidence,
    })),
    edges: (includeEdges ? snapshot.edges.slice(0, edgeLimit) : []).map((edge) => ({
      id: edge.id,
      type: edge.type,
      from: edge.from,
      to: edge.to,
      confidence: edge.confidence,
    })),
    entryPoints: snapshot.entryPoints.slice(0, entryLimit).map((entryPoint) => ({
      id: entryPoint.id,
      type: entryPoint.type,
      title: entryPoint.title,
      reason: entryPoint.reason,
      targetEntityId: entryPoint.targetEntityId,
      confidence: entryPoint.confidence,
    })),
    warnings: snapshot.warnings.slice(0, warningLimit).map((warning) => ({
      code: warning.code,
      message: warning.message,
      severity: warning.severity,
      filePath: warning.filePath,
    })),
    artifacts: (includeArtifacts ? snapshot.artifacts.slice(0, artifactLimit) : []).map((artifact) => ({
      ...artifact,
      payload: compact ? summarizeArtifactPayload(artifact.payload) : artifact.payload,
    })),
  };
}

interface ScreenCard {
  id: string;
  type: string;
  title: string;
  entryPattern: string | undefined;
  dispatcher: string | undefined;
  dispatcherConfig: string | undefined;
  controllerId: string | undefined;
  controller: string | undefined;
  controllerPath: string | undefined;
  action: string | undefined;
  view: string | undefined;
  layout: string | undefined;
  route: string | undefined;
  routeValues: string[];
  relatedDataSummary: string[];
  relatedDataSearchTerm: string | undefined;
  confidence: string;
}

interface PrimaryFlowCard {
  id: string;
  type: string;
  title: string;
  route: string;
  entryPattern: string | undefined;
  dispatcher: string | undefined;
  dispatcherConfig: string | undefined;
  controllerId: string | undefined;
  controller: string | undefined;
  controllerPath: string | undefined;
  action: string | undefined;
  view: string | undefined;
  layout: string | undefined;
  routeValues: string[];
  relatedDataSummary: string[];
  relatedDataSearchTerm: string | undefined;
  relatedDataCount: number;
  confidence: string;
}

interface DataFlowCard {
  id: string;
  type: string;
  route: string | undefined;
  routeValues: string[];
  controllerId: string | undefined;
  controller: string | undefined;
  service: string | undefined;
  biz: string | undefined;
  dao: string | undefined;
  mapper: string | undefined;
  sql: string | undefined;
  sqlCandidates: string[] | undefined;
  sqlEvidenceLabel: string | undefined;
  integration: string[] | undefined;
  evidenceLabel: string;
  inferenceLevel: "confirmed" | "inferred" | "heuristic";
  evidenceKinds: string[];
  hiddenByDefault: boolean;
  confidence: string;
}

interface FrameworkFlowCard {
  id: string;
  type: string;
  title: string;
  entryPattern: string | undefined;
  dispatcher: string | undefined;
  dispatcherConfig: string | undefined;
  contextConfigs: string[];
  sampleRoutes: string[];
  screenFlowCount: number;
  apiFlowCount: number;
  confidence: string;
  detailId: string;
}

interface RequestFlowCard {
  id: string;
  type: string;
  title: string;
  route: string | undefined;
  routeValues: string[];
  entryPattern: string | undefined;
  dispatcher: string | undefined;
  dispatcherConfig: string | undefined;
  controllerId: string | undefined;
  controller: string | undefined;
  controllerPath: string | undefined;
  controllerBeanId: string | undefined;
  controllerClassName: string | undefined;
  controllerConfigPath: string | undefined;
  handlerMappingPatterns: string[];
  methodResolverRef: string | undefined;
  action: string | undefined;
  service: string | undefined;
  biz: string | undefined;
  dao: string | undefined;
  mapper: string | undefined;
  sql: string | undefined;
  integration: string[] | undefined;
  view: string | undefined;
  layout: string | undefined;
  viewVariants: string[];
  layoutVariants: string[];
  variantCount: number;
  responseType: string | undefined;
  responseKind: string | undefined;
  responseTags: string[];
  logicalViewNames: string[];
  resolvedViewPaths: string[];
  viewResolverSummary: string | undefined;
  confidence: string;
  detailId: string;
  relatedDataSearchTerm: string | undefined;
}

interface FlowDetailCard {
  id: string;
  type: string;
  title: string;
  summary: string;
  confidence: string;
  responseKind?: string;
  responseTags?: string[];
  relatedDataSearchTerm: string | undefined;
  viewPaths?: string[];
  sections: Array<{
    key: string;
    lines: string[];
    actions?: Array<{
      kind: string;
      label: string;
      target: string;
      nextTitle?: string;
      nextDetailId?: string;
    }>;
  }>;
}

interface ModuleProfileCard {
  id: string;
  type: string;
  title: string;
  modulePath: string;
  profileLabel: string;
  evidence: string[];
  screenFlowCount: number;
  nonScreenFlowCount: number;
  controllerCount: number;
  serviceCount: number;
  configCount: number;
  sharedLibraryCount: number;
  responseKindCounts?: Record<string, number>;
  profileScores?: Record<string, number>;
}

interface ReportPayload {
  projectId: string;
  profileId: string;
  createdAt: string;
  counts: {
    nodes: number;
    edges: number;
    entryPoints: number;
    warnings: number;
  };
  nodeCounts: Record<string, number>;
  snapshot: ReturnType<typeof buildUiSnapshot>;
  screenCards: ScreenCard[];
  primaryFlowCards: PrimaryFlowCard[];
  dataFlowCards: DataFlowCard[];
  frameworkFlowCards: FrameworkFlowCard[];
  screenFlowCards: RequestFlowCard[];
  apiFlowCards: RequestFlowCard[];
  flowDetails: FlowDetailCard[];
  moduleProfileCards: ModuleProfileCard[];
  libraryAnchorCards: ReturnType<typeof collectLibraryAnchorCards>;
  largeSnapshotMode: boolean;
  rawSnapshotPath: string;
  detailPaths: {
    explore: string;
    evidence: string;
    raw: string;
    screenFlows: string;
    apiFlows: string;
    flowDetails: string;
    architecture: string;
  };
  flowTotals: {
    screenFlowCards: number;
    apiFlowCards: number;
    flowDetails: number;
    dataFlowCards: number;
  };
  snapshotTotals: {
    nodes: number;
    edges: number;
    entryPoints: number;
    warnings: number;
    artifacts: number;
  };
}

function inferenceLevelRank(value: DataFlowCard["inferenceLevel"]): number {
  if (value === "confirmed") {
    return 3;
  }
  if (value === "inferred") {
    return 2;
  }
  return 1;
}

function pickStrongerInferenceLevel(
  left: DataFlowCard["inferenceLevel"],
  right: DataFlowCard["inferenceLevel"],
): DataFlowCard["inferenceLevel"] {
  return inferenceLevelRank(left) >= inferenceLevelRank(right) ? left : right;
}

function shouldHideDataFlowCardByDefault(card: Pick<DataFlowCard, "inferenceLevel" | "confidence" | "evidenceKinds">): boolean {
  if (card.inferenceLevel === "heuristic") {
    return true;
  }
  if (card.confidence === "low") {
    return true;
  }
  return card.evidenceKinds.length < 2;
}

function findNode(snapshot: AnalysisSnapshot, id: string): GraphNode | undefined {
  return snapshot.nodes.find((node) => node.id === id);
}

function extractSharedLibraryName(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  const normalized = path.replaceAll("\\", "/");
  const match = normalized.match(/(^|\/)([^/]+-lib)(\/|$)/);
  return match?.[2];
}

function normalizeSymbolStem(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const lastToken = value.split(/[./:$\-_]/).filter(Boolean).pop()?.toLowerCase();
  if (!lastToken) {
    return undefined;
  }
  let stem = lastToken;
  let previous = "";
  while (stem !== previous) {
    previous = stem;
    stem = stem.replace(/(service|biz|dao|mapper|repository|sqlmap|ibatis|mybatis|impl)$/i, "");
  }
  return stem || lastToken;
}

function pickBestSqlCandidate(sqlCandidates: string[] | undefined, preferredNames: string[]): string | undefined {
  if (!Array.isArray(sqlCandidates) || sqlCandidates.length === 0) {
    return undefined;
  }
  const normalizedPreferences = uniqueStrings(
    preferredNames
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  if (normalizedPreferences.length === 0) {
    return sqlCandidates[0];
  }

  const scoreCandidate = (candidate: string): number => {
    const candidateLower = candidate.toLowerCase();
    const candidateTail = candidateLower.split(".").pop() ?? candidateLower;
    const candidateStem = normalizeSymbolStem(candidateTail);
    let bestScore = 0;
    for (const preferredName of normalizedPreferences) {
      const preferredLower = preferredName.toLowerCase();
      const preferredStem = normalizeSymbolStem(preferredName);
      if (candidateLower === preferredLower || candidateTail === preferredLower) {
        bestScore = Math.max(bestScore, 10);
      } else if (candidateLower.endsWith(`.${preferredLower}`) || candidateTail === preferredLower) {
        bestScore = Math.max(bestScore, 9);
      } else if (candidateTail.includes(preferredLower) || preferredLower.includes(candidateTail)) {
        bestScore = Math.max(bestScore, 7);
      } else if (candidateStem && preferredStem && candidateStem === preferredStem) {
        bestScore = Math.max(bestScore, 6);
      }
    }
    return bestScore;
  };

  return [...sqlCandidates]
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate) }))
    .sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate))[0]?.candidate
    ?? sqlCandidates[0];
}

function normalizeSqlCandidate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parts = trimmed.split(".");
  if (parts.length >= 3 && parts[0] === parts[1]) {
    return parts.slice(1).join(".");
  }
  return trimmed;
}

function firstEntryPointReason(snapshot: AnalysisSnapshot): string | undefined {
  return snapshot.entryPoints[0]?.reason;
}

function getControllerRequestMappings(node: GraphNode | undefined): string[] {
  const mappings = node?.metadata?.requestMappings;
  if (!Array.isArray(mappings)) {
    return [];
  }
  return mappings.filter((value): value is string => typeof value === "string" && value.length > 0);
}

function getControllerRequestHandlers(node: GraphNode | undefined): Array<{
  methodName: string;
  requestMappings: string[];
  viewNames: string[];
  responseBody: boolean;
  produces: string[];
  contentTypes: string[];
  redirectTargets: string[];
  fileResponseHints: string[];
  serviceCalls: Array<{ targetType: string; targetName: string; methodName: string }>;
}> {
  const handlers = node?.metadata?.requestHandlers;
  if (!Array.isArray(handlers)) {
    return [];
  }
  return handlers
    .map((handler) => ({
      methodName: typeof handler?.methodName === "string" ? handler.methodName : "handler",
      requestMappings: Array.isArray(handler?.requestMappings)
        ? handler.requestMappings.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : [],
      viewNames: Array.isArray(handler?.viewNames)
        ? handler.viewNames.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : [],
      responseBody: handler?.responseBody === true,
      produces: Array.isArray(handler?.produces)
        ? handler.produces.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : [],
      contentTypes: Array.isArray(handler?.contentTypes)
        ? handler.contentTypes.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : [],
      redirectTargets: Array.isArray(handler?.redirectTargets)
        ? handler.redirectTargets.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : [],
      fileResponseHints: Array.isArray(handler?.fileResponseHints)
        ? handler.fileResponseHints.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : [],
      serviceCalls: Array.isArray(handler?.serviceCalls)
        ? handler.serviceCalls
          .filter((value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null)
          .map((call: Record<string, unknown>) => ({
            targetType: typeof call.targetType === "string" ? call.targetType : "service",
            targetName: typeof call.targetName === "string" ? call.targetName : "-",
            methodName: typeof call.methodName === "string" ? call.methodName : "call",
          }))
        : [],
    }))
    .filter((handler) =>
      handler.requestMappings.length > 0 ||
      handler.viewNames.length > 0 ||
      handler.serviceCalls.length > 0 ||
      handler.produces.length > 0 ||
      handler.contentTypes.length > 0 ||
      handler.redirectTargets.length > 0 ||
      handler.fileResponseHints.length > 0,
    );
}

function shortTypeName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.split(".").pop() ?? value;
}

function getHandlerServiceCalls(
  node: GraphNode | undefined,
  action: string | undefined,
): Array<{ targetType: string; targetName: string; methodName: string }> {
  const handlers = getControllerRequestHandlers(node);
  const targetHandler = action
    ? handlers.find((handler) => handler.methodName === action)
    : handlers[0];
  return targetHandler?.serviceCalls ?? [];
}

function getHandlerResponseBody(node: GraphNode | undefined, action: string | undefined): boolean {
  const handlers = getControllerRequestHandlers(node);
  const targetHandler = action
    ? handlers.find((handler) => handler.methodName === action)
    : handlers[0];
  return targetHandler?.responseBody === true;
}

function getHandlerResponseMetadata(node: GraphNode | undefined, action: string | undefined): {
  produces: string[];
  contentTypes: string[];
  redirectTargets: string[];
  fileResponseHints: string[];
} {
  const handlers = getControllerRequestHandlers(node);
  const targetHandler = action
    ? handlers.find((handler) => handler.methodName === action)
    : handlers[0];
  return {
    produces: targetHandler?.produces ?? [],
    contentTypes: targetHandler?.contentTypes ?? [],
    redirectTargets: targetHandler?.redirectTargets ?? [],
    fileResponseHints: targetHandler?.fileResponseHints ?? [],
  };
}

function getDaoMethodSummaries(node: GraphNode | undefined): Array<{
  methodName: string;
  dependencyCalls: Array<{ targetType: string; targetName: string; methodName: string }>;
  sqlCalls: Array<{ statementId: string; operation: string }>;
  externalCalls: Array<{ kind: string; target: string }>;
}> {
  const summaries = node?.metadata?.methodSummaries;
  if (!Array.isArray(summaries)) {
    return [];
  }
  return summaries
    .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
    .map((summary) => ({
      methodName: typeof summary.methodName === "string" ? summary.methodName : "",
      dependencyCalls: Array.isArray(summary.dependencyCalls)
        ? summary.dependencyCalls
          .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
          .map((call) => ({
            targetType: typeof call.targetType === "string" ? call.targetType : "",
            targetName: typeof call.targetName === "string" ? call.targetName : "",
            methodName: typeof call.methodName === "string" ? call.methodName : "",
          }))
          .filter((call) => call.targetType.length > 0 && call.targetName.length > 0 && call.methodName.length > 0)
        : [],
      sqlCalls: Array.isArray(summary.sqlCalls)
        ? summary.sqlCalls
          .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
          .map((call) => ({
            statementId: typeof call.statementId === "string" ? call.statementId : "",
            operation: typeof call.operation === "string" ? call.operation : "",
          }))
          .filter((call) => call.statementId.length > 0)
        : [],
      externalCalls: Array.isArray(summary.externalCalls)
        ? summary.externalCalls
          .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
          .map((call) => ({
            kind: typeof call.kind === "string" ? call.kind : "",
            target: typeof call.target === "string" ? call.target : "",
          }))
          .filter((call) => call.kind.length > 0 && call.target.length > 0)
        : [],
    }))
    .filter((summary) => summary.methodName.length > 0 && (summary.sqlCalls.length > 0 || summary.dependencyCalls.length > 0 || summary.externalCalls.length > 0));
}

function inferNonScreenResponseTags(input: {
  route: string | undefined;
  action: string | undefined;
  handlerMappingPatterns: string[];
  requestMappings?: string[];
  responseBody: boolean;
  produces?: string[];
  contentTypes?: string[];
  internalCallerCount?: number;
}): string[] {
  const routeSignals = [input.route, ...(input.requestMappings ?? [])]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const haystacks = [
    input.action,
    ...routeSignals,
    ...(routeSignals.length === 0 ? input.handlerMappingPatterns : []),
    ...(input.produces ?? []),
    ...(input.contentTypes ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.toLowerCase());

  const tags: string[] = [];
  const hasPattern = (pattern: RegExp): boolean => haystacks.some((value) => pattern.test(value));

  if (hasPattern(/(^|\/)(download|excel|export)(\/|$|[._-])/i) || hasPattern(/(download|excel|export)/i)) {
    tags.push("download");
  }
  if (hasPattern(/ajax/i)) {
    tags.push("ajax");
  }
  if ((input.internalCallerCount ?? 0) > 0) {
    tags.push("internal-ui-linked");
  }
  if (
    input.responseBody ||
    (input.produces ?? []).some((value) => /(json|xml|javascript)/i.test(value)) ||
    (input.contentTypes ?? []).some((value) => /(json|xml|javascript)/i.test(value)) ||
    hasPattern(/(^|\/)(api|openapi|galaxyapi)(\/|$)/i) ||
    hasPattern(/\.json($|[/?])/i) ||
    hasPattern(/\/v[0-9]+(\/|$)/i)
  ) {
    tags.push("external-facing candidate");
  }

  return tags;
}

function inferNonScreenResponseKind(input: {
  route: string | undefined;
  action: string | undefined;
  handlerMappingPatterns: string[];
  requestMappings?: string[];
  logicalViewNames: string[];
  responseBody: boolean;
  responseTags: string[];
  produces: string[];
  contentTypes: string[];
  redirectTargets: string[];
  fileResponseHints: string[];
}): "json" | "file" | "redirect" | "action" | "unknown" {
  const routeSignals = [input.route, ...(input.requestMappings ?? [])]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const haystacks = [
    input.action,
    ...routeSignals,
    ...(routeSignals.length === 0 ? input.handlerMappingPatterns : []),
    ...input.logicalViewNames,
    ...input.produces,
    ...input.contentTypes,
    ...input.redirectTargets,
    ...input.fileResponseHints,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.toLowerCase());

  const hasPattern = (pattern: RegExp): boolean => haystacks.some((value) => pattern.test(value));

  if (input.redirectTargets.length > 0 || input.logicalViewNames.some((value) => /^redirect:/i.test(value))) {
    return "redirect";
  }
  if (
    input.fileResponseHints.length > 0 ||
    input.responseTags.includes("download") ||
    hasPattern(/(^|\/)(download|excel|export|file|csv|pdf|zip)(\/|$|[._-])/i) ||
    hasPattern(/(download|excel|export|attachment)/i)
  ) {
    return "file";
  }
  if (
    input.responseBody ||
    input.produces.some((value) => /(json|xml|javascript)/i.test(value)) ||
    input.contentTypes.some((value) => /(json|xml|javascript)/i.test(value)) ||
    hasPattern(/(^|\/)(api|openapi|galaxyapi)(\/|$)/i) ||
    hasPattern(/\.json($|[/?])/i) ||
    hasPattern(/\/v[0-9]+(\/|$)/i)
  ) {
    return "json";
  }
  if (haystacks.length > 0) {
    return "action";
  }
  return "unknown";
}

function getControllerResolutionInfo(node: GraphNode | undefined): {
  beanId: string | undefined;
  className: string | undefined;
  configPath: string | undefined;
  handlerMappingPatterns: string[];
  methodResolverRef: string | undefined;
} {
  const metadata = node?.metadata;
  return {
    beanId: typeof metadata?.beanId === "string" ? metadata.beanId : undefined,
    className: typeof metadata?.className === "string" ? metadata.className : node?.name,
    configPath: typeof metadata?.springConfigPath === "string"
      ? metadata.springConfigPath
      : findDeclaringConfigPathsFromMetadata(node),
    handlerMappingPatterns: Array.isArray(metadata?.handlerMappingPatterns)
      ? metadata.handlerMappingPatterns.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [],
    methodResolverRef: typeof metadata?.methodNameResolverRef === "string" ? metadata.methodNameResolverRef : undefined,
  };
}

function getControllerLogicalViewNames(
  node: GraphNode | undefined,
  action: string | undefined,
  fallbackViewPath: string | undefined,
): string[] {
  const handlers = getControllerRequestHandlers(node);
  const namedHandlers = action
    ? handlers.filter((handler) => handler.methodName === action)
    : handlers;
  const logicalViews = uniqueStrings(namedHandlers.flatMap((handler) => handler.viewNames));
  if (logicalViews.length > 0) {
    return logicalViews;
  }
  if (!fallbackViewPath) {
    return [];
  }
  const normalized = fallbackViewPath
    .replaceAll("\\", "/")
    .replace(/^.*\/WEB-INF\/(?:views|jsp)\//, "")
    .replace(/\.jsp$/, "")
    .replace(/^\/+/, "");
  return normalized ? [normalized] : [];
}

function collectViewResolverInfo(
  snapshot: AnalysisSnapshot,
  configPaths: string[],
): Array<{ prefix: string; suffix: string; configPath: string; beanName: string }> {
  const normalizedPaths = configPaths
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => normalizePathLike(value))
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const resolvers = snapshot.artifacts
    .filter((artifact) => artifact.type === "spring-view-resolver")
    .map((artifact) => ({
      prefix: typeof artifact.payload.prefix === "string" ? artifact.payload.prefix : "",
      suffix: typeof artifact.payload.suffix === "string" ? artifact.payload.suffix : "",
      configPath: typeof artifact.payload.file === "string" ? artifact.payload.file : "",
      beanName: typeof artifact.payload.beanName === "string" ? artifact.payload.beanName : "viewResolver",
    }))
    .filter((resolver) => resolver.prefix || resolver.suffix);

  const matched = resolvers.filter((resolver) => {
    const resolverPath = normalizePathLike(resolver.configPath);
    return resolverPath && normalizedPaths.some((path) => pathsSuffixMatch(path, resolverPath));
  });

  return matched.length > 0 ? matched : resolvers;
}

function resolveLogicalViewPaths(
  logicalViewNames: string[],
  resolvers: Array<{ prefix: string; suffix: string }>,
): string[] {
  if (logicalViewNames.length === 0 || resolvers.length === 0) {
    return [];
  }
  return uniqueStrings(logicalViewNames.flatMap((viewName) =>
    resolvers.map((resolver) => `${resolver.prefix ?? ""}${viewName}${resolver.suffix ?? ""}`),
  ));
}

function findDeclaringConfigPathsFromMetadata(node: GraphNode | undefined): string | undefined {
  const metadata = node?.metadata;
  if (typeof metadata?.declaringConfigPath === "string") {
    return metadata.declaringConfigPath;
  }
  return undefined;
}

function formatRouteLabel(values: string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }
  if (values.length <= 2) {
    return values.join(", ");
  }
  return `${values.slice(0, 2).join(", ")} 외 ${values.length - 2}개`;
}

function normalizePathLike(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

function pathsSuffixMatch(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizePathLike(left);
  const normalizedRight = normalizePathLike(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft.endsWith(normalizedRight) || normalizedRight.endsWith(normalizedLeft);
}

function routeMatchesPattern(route: string, pattern: string | undefined): boolean {
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
  return route === pattern || route.startsWith(`${pattern.replace(/\/$/, "")}/`);
}

function extractModuleKey(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }
  const normalized = filePath.replaceAll("\\", "/");
  const webContentIndex = normalized.indexOf("/WebContent/");
  if (webContentIndex >= 0) {
    return normalized.slice(0, webContentIndex);
  }
  const sourceIndex = normalized.indexOf("/src/");
  if (sourceIndex >= 0) {
    return normalized.slice(0, sourceIndex);
  }
  return normalized.split("/").slice(0, -1).join("/") || undefined;
}

function findEntryPointReasonForNode(snapshot: AnalysisSnapshot, node: GraphNode | undefined): string | undefined {
  const nodeModuleKey = extractModuleKey(node?.path);
  if (!nodeModuleKey) {
    return firstEntryPointReason(snapshot);
  }

  for (const entryPoint of snapshot.entryPoints) {
    const targetNode = findNode(snapshot, entryPoint.targetEntityId);
    const targetModuleKey = extractModuleKey(targetNode?.path);
    if (targetModuleKey && targetModuleKey === nodeModuleKey) {
      return entryPoint.reason;
    }
  }

  return firstEntryPointReason(snapshot);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function splitConfigLocations(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function summarizeValueGroup(values: string[], noun: string): string | undefined {
  if (values.length === 0) {
    return undefined;
  }
  if (values.length === 1) {
    return values[0];
  }
  const preview = values.slice(0, 2).join(", ");
  return `${values.length} ${noun}: ${preview}${values.length > 2 ? ` ... (+${values.length - 2})` : ""}`;
}

function getEntryPointPatterns(entryPoint: EntryPoint | undefined): string[] {
  const pattern = entryPoint?.metadata?.urlPattern;
  if (typeof pattern === "string" && pattern.length > 0) {
    return [pattern];
  }
  if (Array.isArray(pattern)) {
    return pattern.filter((value): value is string => typeof value === "string" && value.length > 0);
  }
  return [];
}

function getEntryPointPattern(entryPoint: EntryPoint | undefined): string | undefined {
  return formatRouteLabel(getEntryPointPatterns(entryPoint));
}

function getRelevantEntryPointPattern(entryPoint: EntryPoint | undefined, requestMappings: string[]): string | undefined {
  const patterns = getEntryPointPatterns(entryPoint);
  if (patterns.length === 0 || requestMappings.length === 0) {
    return formatRouteLabel(patterns);
  }

  const matchedPatterns = patterns.filter((pattern) => requestMappings.some((route) => routeMatchesPattern(route, pattern)));
  const exactMatches = matchedPatterns.filter((pattern) => !pattern.includes("*"));
  if (exactMatches.length > 0) {
    return formatRouteLabel(exactMatches);
  }
  if (matchedPatterns.length > 0) {
    return formatRouteLabel(matchedPatterns);
  }
  return formatRouteLabel(patterns);
}

function getEntryPointContextConfig(entryPoint: EntryPoint | undefined): string | undefined {
  const configPath = entryPoint?.metadata?.contextConfigLocation;
  return typeof configPath === "string" && configPath.length > 0 ? configPath : undefined;
}

function describeDependencyEvidence(snapshot: AnalysisSnapshot, fromId: string | undefined, toName: string | undefined): string | undefined {
  if (!fromId || !toName) {
    return undefined;
  }
  const edge = snapshot.edges.find((candidate) => {
    if (candidate.type !== "depends_on" || candidate.from !== fromId) {
      return false;
    }
    const target = findNode(snapshot, candidate.to);
    return target?.displayName === toName || target?.name === toName;
  });
  if (!edge) {
    return undefined;
  }
  const evidenceValues = uniqueStrings(edge.evidence.map((item) => item.value));
  return evidenceValues.length > 0 ? evidenceValues.join(" | ") : undefined;
}

function findDeclaringConfigPaths(snapshot: AnalysisSnapshot, node: GraphNode | undefined): string[] {
  if (!node) {
    return [];
  }

  const paths = new Set<string>();
  for (const edge of snapshot.edges) {
    if (edge.type !== "declares" || edge.to !== node.id) {
      continue;
    }
    const configNode = findNode(snapshot, edge.from);
    if (configNode?.type === "config" && configNode.path) {
      paths.add(configNode.path);
    }
  }

  return Array.from(paths);
}

function extractSharedModuleNames(paths: Array<string | undefined>): string[] {
  const names = new Set<string>();
  for (const path of paths) {
    if (!path) {
      continue;
    }
    const match = path.match(/\/([^/]*-lib)(?:\/|$)/);
    if (match?.[1]) {
      names.add(match[1]);
    }
  }
  return Array.from(names);
}

function buildControllerDataContext(snapshot: AnalysisSnapshot, controllerNode: GraphNode | undefined): {
  serviceNames: string[];
  bizNames: string[];
  daoNames: string[];
  sharedModuleNames: string[];
  searchTerm: string | undefined;
} {
  if (!controllerNode) {
    return { serviceNames: [], bizNames: [], daoNames: [], sharedModuleNames: [], searchTerm: undefined };
  }

  const directTargets = snapshot.edges
    .filter((edge) => edge.type === "depends_on" && edge.from === controllerNode.id)
    .map((edge) => findNode(snapshot, edge.to))
    .filter((node): node is GraphNode => Boolean(node));

  const services = directTargets.filter((node) => node.type === "service");
  const directBizs = directTargets.filter((node) => node.type === "biz");
  const directDaos = directTargets.filter((node) => node.type === "dao");
  const serviceBizs = services.flatMap((serviceNode) =>
    snapshot.edges
      .filter((edge) => edge.type === "depends_on" && edge.from === serviceNode.id)
      .map((edge) => findNode(snapshot, edge.to))
      .filter((node): node is GraphNode => node?.type === "biz"),
  );
  const serviceDaos = services.flatMap((serviceNode) =>
    snapshot.edges
      .filter((edge) => edge.type === "depends_on" && edge.from === serviceNode.id)
      .map((edge) => findNode(snapshot, edge.to))
      .filter((node): node is GraphNode => node?.type === "dao"),
  );
  const bizDaos = [...directBizs, ...serviceBizs].flatMap((bizNode) =>
    snapshot.edges
      .filter((edge) => edge.type === "depends_on" && edge.from === bizNode.id)
      .map((edge) => findNode(snapshot, edge.to))
      .filter((node): node is GraphNode => node?.type === "dao"),
  );

  const serviceNames = uniqueStrings(services.map((node) => node.displayName ?? node.name));
  const bizNames = uniqueStrings([...directBizs, ...serviceBizs].map((node) => node.displayName ?? node.name));
  const daoNames = uniqueStrings([...directDaos, ...serviceDaos, ...bizDaos].map((node) => node.displayName ?? node.name));
  const sharedModuleNames = extractSharedModuleNames([
    ...directTargets.map((node) => node.path),
    ...serviceBizs.map((node) => node.path),
    ...serviceDaos.map((node) => node.path),
    ...bizDaos.map((node) => node.path),
  ]);
  const searchTerm = daoNames[0] ?? bizNames[0] ?? serviceNames[0];

  return { serviceNames, bizNames, daoNames, sharedModuleNames, searchTerm };
}

function buildDataFlowSummary(serviceNames: string[], bizNames: string[], daoNames: string[], sharedModuleNames: string[] = []): string[] {
  const lines: string[] = [];
  if (serviceNames.length > 0) {
    lines.push(`service: ${formatRouteLabel(serviceNames) ?? serviceNames[0]}`);
  }
  if (bizNames.length > 0) {
    lines.push(`biz: ${formatRouteLabel(bizNames) ?? bizNames[0]}`);
  }
  if (daoNames.length > 0) {
    lines.push(`dao: ${formatRouteLabel(daoNames) ?? daoNames[0]}`);
  }
  if (sharedModuleNames.length > 0) {
    lines.push(`shared lib: ${formatRouteLabel(sharedModuleNames) ?? sharedModuleNames[0]}`);
  }
  return lines;
}

function pickBestEntryPoint(
  snapshot: AnalysisSnapshot,
  node: GraphNode | undefined,
  requestMappings: string[],
  extraPaths: string[],
): { entryPoint: EntryPoint | undefined; routeNode: GraphNode | undefined; dispatcherConfig: string | undefined } {
  if (!node) {
    return { entryPoint: undefined, routeNode: undefined, dispatcherConfig: undefined };
  }

  const candidatePaths = new Set<string>();
  if (node.path) {
    candidatePaths.add(node.path);
  }
  for (const path of extraPaths) {
    if (path) {
      candidatePaths.add(path);
    }
  }

  let best:
    | { score: number; entryPoint: EntryPoint; routeNode: GraphNode | undefined; dispatcherConfig: string | undefined }
    | undefined;

  for (const entryPoint of snapshot.entryPoints) {
    const routeNode = findNode(snapshot, entryPoint.targetEntityId);
    let score = 0;

    const entryPatterns = getEntryPointPatterns(entryPoint);
    if (requestMappings.length > 0 && entryPatterns.length > 0) {
      const matchedPatterns = entryPatterns.filter((pattern) => requestMappings.some((route) => routeMatchesPattern(route, pattern)));
      if (matchedPatterns.length > 0) {
        const exactMatchCount = matchedPatterns.filter((pattern) => !pattern.includes("*")).length;
        const wildcardMatchCount = matchedPatterns.length - exactMatchCount;
        score += exactMatchCount * 6;
        score += wildcardMatchCount * 3;
        score -= Math.max(0, entryPatterns.length - matchedPatterns.length);
      }
    } else if (entryPatterns.length > 0) {
      score += 1;
    }

    const nodeModule = extractModuleKey(node.path);
    const routeModule = extractModuleKey(routeNode?.path);
    if (nodeModule && routeModule && nodeModule === routeModule) {
      score += 4;
    }

    const dispatcherConfig = getEntryPointContextConfig(entryPoint);
    if (dispatcherConfig && Array.from(candidatePaths).some((path) => pathsSuffixMatch(path, dispatcherConfig))) {
      score += 8;
    }

    if (routeNode?.path && Array.from(candidatePaths).some((path) => extractModuleKey(path) === extractModuleKey(routeNode.path))) {
      score += 2;
    }

    if (!best || score > best.score) {
      best = { score, entryPoint, routeNode, dispatcherConfig };
    }
  }

  if (!best || best.score <= 0) {
    return { entryPoint: undefined, routeNode: undefined, dispatcherConfig: undefined };
  }

  return best;
}

function collectScreenCards(snapshot: AnalysisSnapshot): ScreenCard[] {
  const renderEdges = snapshot.edges.filter((edge) => edge.type === "renders");
  const cards: ScreenCard[] = [];
  const seen = new Set<string>();
  const renderedControllerIds = new Set<string>();

  for (const edge of renderEdges) {
    const fromNode = findNode(snapshot, edge.from);
    const toNode = findNode(snapshot, edge.to);
    if (!fromNode || !toNode) {
      continue;
    }

    if (fromNode.type === "controller" && toNode.type === "view") {
      const layoutEdge = renderEdges.find((candidate) => candidate.from === toNode.id);
      const layoutNode = layoutEdge ? findNode(snapshot, layoutEdge.to) : undefined;
      const requestHandlers = getControllerRequestHandlers(fromNode);
      const handlerMethodsFromEdge = Array.isArray(edge.metadata?.handlerMethods)
        ? edge.metadata.handlerMethods.filter((value): value is string => typeof value === "string")
        : [];
      const matchedHandlers = requestHandlers.filter((handler) =>
        handlerMethodsFromEdge.length > 0
          ? handlerMethodsFromEdge.includes(handler.methodName)
          : handler.viewNames.includes(toNode.name),
      );
      const handlerCandidates = matchedHandlers.length > 0
        ? matchedHandlers
        : [{ methodName: "handler", requestMappings: getControllerRequestMappings(fromNode), viewNames: [toNode.name], responseBody: false }];

      for (const handler of handlerCandidates) {
        const requestMappings = handler.requestMappings.length > 0 ? handler.requestMappings : getControllerRequestMappings(fromNode);
        const declaringConfigPaths = findDeclaringConfigPaths(snapshot, fromNode);
        const entryContext = pickBestEntryPoint(snapshot, fromNode, requestMappings, [
          ...declaringConfigPaths,
          toNode.path ?? "",
          layoutNode?.path ?? "",
        ]);
        const controllerDataContext = buildControllerDataContext(snapshot, fromNode);
        const routeLabel = formatRouteLabel(requestMappings);
        const cardId = `${fromNode.id}:${handler.methodName}->${toNode.id}`;
        if (seen.has(cardId)) {
          continue;
        }
        cards.push({
          id: cardId,
          type: "entry_flow",
          title: requestMappings[0] ?? toNode.displayName ?? toNode.name,
          entryPattern: getRelevantEntryPointPattern(entryContext.entryPoint, requestMappings),
          dispatcher: entryContext.routeNode?.displayName ?? entryContext.entryPoint?.title,
          dispatcherConfig: entryContext.dispatcherConfig ?? declaringConfigPaths[0],
          controllerId: fromNode.id,
          controller: fromNode.displayName ?? fromNode.name,
          controllerPath: fromNode.path,
          action: handler.methodName,
          view: toNode.path ?? toNode.name,
          layout: layoutNode?.path ?? layoutNode?.name,
          route: routeLabel ?? findEntryPointReasonForNode(snapshot, fromNode) ?? findEntryPointReasonForNode(snapshot, toNode),
          routeValues: requestMappings,
          relatedDataSummary: buildDataFlowSummary(controllerDataContext.serviceNames, controllerDataContext.bizNames, controllerDataContext.daoNames, controllerDataContext.sharedModuleNames),
          relatedDataSearchTerm: controllerDataContext.searchTerm,
          confidence: edge.confidence,
        });
        seen.add(cardId);
      }
      renderedControllerIds.add(fromNode.id);
    }
  }

  const controllerNodes = snapshot.nodes.filter((node) => node.type === "controller");
  for (const controllerNode of controllerNodes) {
    const requestHandlers = getControllerRequestHandlers(controllerNode);
    if (requestHandlers.length > 0) {
      for (const handler of requestHandlers) {
        const key = `controller-only:${controllerNode.id}:${handler.methodName}`;
        const requestMappings = handler.requestMappings;
        const handlerHasRenderedView = cards.some((card) => card.id.startsWith(`${controllerNode.id}:${handler.methodName}->`));
        if (handlerHasRenderedView || requestMappings.length === 0 || seen.has(key)) {
          continue;
        }
        const declaringConfigPaths = findDeclaringConfigPaths(snapshot, controllerNode);
        const entryContext = pickBestEntryPoint(snapshot, controllerNode, requestMappings, declaringConfigPaths);
        const controllerDataContext = buildControllerDataContext(snapshot, controllerNode);
        cards.push({
          id: key,
          type: "entry_flow",
          title: requestMappings[0] ?? (controllerNode.displayName ?? controllerNode.name),
          entryPattern: getRelevantEntryPointPattern(entryContext.entryPoint, requestMappings),
          dispatcher: entryContext.routeNode?.displayName ?? entryContext.entryPoint?.title,
          dispatcherConfig: entryContext.dispatcherConfig ?? declaringConfigPaths[0],
          controllerId: controllerNode.id,
          controller: controllerNode.displayName ?? controllerNode.name,
          controllerPath: controllerNode.path,
          action: handler.methodName,
          view: undefined,
          layout: undefined,
          route: formatRouteLabel(requestMappings) ?? findEntryPointReasonForNode(snapshot, controllerNode),
          routeValues: requestMappings,
          relatedDataSummary: buildDataFlowSummary(controllerDataContext.serviceNames, controllerDataContext.bizNames, controllerDataContext.daoNames, controllerDataContext.sharedModuleNames),
          relatedDataSearchTerm: controllerDataContext.searchTerm,
          confidence: controllerNode.confidence,
        });
        seen.add(key);
      }
      continue;
    }
    if (renderedControllerIds.has(controllerNode.id)) {
      continue;
    }
    const requestMappings = getControllerRequestMappings(controllerNode);
    if (requestMappings.length === 0) {
      continue;
    }
    const declaringConfigPaths = findDeclaringConfigPaths(snapshot, controllerNode);
    const entryContext = pickBestEntryPoint(snapshot, controllerNode, requestMappings, declaringConfigPaths);
    const controllerDataContext = buildControllerDataContext(snapshot, controllerNode);
    const key = `controller-only:${controllerNode.id}`;
    if (seen.has(key)) {
      continue;
    }
    cards.push({
      id: key,
      type: "entry_flow",
      title: requestMappings[0] ?? (controllerNode.displayName ?? controllerNode.name),
      entryPattern: getRelevantEntryPointPattern(entryContext.entryPoint, requestMappings),
      dispatcher: entryContext.routeNode?.displayName ?? entryContext.entryPoint?.title,
      dispatcherConfig: entryContext.dispatcherConfig ?? declaringConfigPaths[0],
      controllerId: controllerNode.id,
      controller: controllerNode.displayName ?? controllerNode.name,
      controllerPath: controllerNode.path,
      action: undefined,
      view: undefined,
      layout: undefined,
      route: formatRouteLabel(requestMappings) ?? findEntryPointReasonForNode(snapshot, controllerNode),
      routeValues: requestMappings,
      relatedDataSummary: buildDataFlowSummary(controllerDataContext.serviceNames, controllerDataContext.bizNames, controllerDataContext.daoNames, controllerDataContext.sharedModuleNames),
      relatedDataSearchTerm: controllerDataContext.searchTerm,
      confidence: controllerNode.confidence,
    });
    seen.add(key);
  }

  if (cards.length > 0) {
    return cards.sort((left, right) => {
      const leftRoute = left.route ?? left.title;
      const rightRoute = right.route ?? right.title;
      return leftRoute.localeCompare(rightRoute);
    });
  }

  const layoutEdges = renderEdges.filter((edge) => {
    const fromNode = findNode(snapshot, edge.from);
    const toNode = findNode(snapshot, edge.to);
    return fromNode?.type === "view" && toNode?.type === "view";
  });
  const layoutByView = new Map<string, GraphNode>();
  const layoutTargetIds = new Set<string>();
  for (const edge of layoutEdges) {
    const fromNode = findNode(snapshot, edge.from);
    const toNode = findNode(snapshot, edge.to);
    if (!fromNode || !toNode) {
      continue;
    }
    layoutByView.set(fromNode.id, toNode);
    layoutTargetIds.add(toNode.id);
  }

  const candidateViews = snapshot.nodes.filter((node) => {
    if (node.type !== "view") {
      return false;
    }
    if (node.metadata?.role === "layout") {
      return false;
    }
    return !layoutTargetIds.has(node.id) || layoutByView.has(node.id);
  });

  for (const viewNode of candidateViews) {
    const layoutNode = layoutByView.get(viewNode.id);
    const entryContext = pickBestEntryPoint(snapshot, viewNode, [], [viewNode.path ?? "", layoutNode?.path ?? ""]);
    const key = `view-only:${viewNode.id}`;
    if (seen.has(key)) {
      continue;
    }
    cards.push({
      id: key,
      type: "entry_flow",
      title: viewNode.displayName ?? viewNode.name,
      entryPattern: getEntryPointPattern(entryContext.entryPoint),
      dispatcher: entryContext.routeNode?.displayName ?? entryContext.entryPoint?.title,
      dispatcherConfig: entryContext.dispatcherConfig,
      controllerId: undefined,
      controller: undefined,
      controllerPath: undefined,
      action: undefined,
      view: viewNode.path ?? viewNode.name,
      layout: layoutNode?.path ?? layoutNode?.name,
      route: findEntryPointReasonForNode(snapshot, viewNode),
      routeValues: [],
      relatedDataSummary: [],
      relatedDataSearchTerm: undefined,
      confidence: layoutNode ? "medium" : "low",
    });
    seen.add(key);
  }

  return cards.sort((left, right) => {
    const leftRoute = left.route ?? left.title;
    const rightRoute = right.route ?? right.title;
    return leftRoute.localeCompare(rightRoute);
  });
}

function collectDataFlowCards(snapshot: AnalysisSnapshot): DataFlowCard[] {
  const cards = new Map<string, DataFlowCard>();

  const inboundDependencyNodes = (targetNodeId: string, type: string): GraphNode[] =>
    snapshot.edges
      .filter((candidate) => candidate.type === "depends_on" && candidate.to === targetNodeId)
      .map((candidate) => findNode(snapshot, candidate.from))
      .filter((node): node is GraphNode => node?.type === type);

  const relatedServiceNodes = (serviceNode: GraphNode): GraphNode[] => {
    const serviceStem = normalizeSymbolStem(serviceNode.displayName ?? serviceNode.name);
    if (!serviceStem) {
      return [serviceNode];
    }
    return snapshot.nodes.filter((node) =>
      node.type === "service" && normalizeSymbolStem(node.displayName ?? node.name) === serviceStem,
    );
  };

  const controllerNodesForService = (serviceNode: GraphNode): GraphNode[] =>
    uniqueStrings(
      relatedServiceNodes(serviceNode).flatMap((candidate) =>
        inboundDependencyNodes(candidate.id, "controller").map((node) => node.id),
      ),
    )
      .map((id) => findNode(snapshot, id))
      .filter((node): node is GraphNode => Boolean(node));

  const controllersCallingService = (serviceNodes: GraphNode[]): GraphNode[] => {
    const serviceStems = uniqueStrings(serviceNodes.map((node) => normalizeSymbolStem(node.displayName ?? node.name)).filter(Boolean));
    if (serviceStems.length === 0) {
      return [];
    }
    return snapshot.nodes
      .filter((node) => node.type === "controller")
      .filter((node) => {
        const handlers = getControllerRequestHandlers(node);
        return handlers.some((handler) =>
          handler.serviceCalls.some((call) =>
            call.targetType === "service" &&
            serviceStems.includes(normalizeSymbolStem(shortTypeName(call.targetName)) ?? ""),
          ),
        );
      });
  };

  const candidateControllersForDao = (daoNodeId: string, serviceNodes: GraphNode[], bizNodes: GraphNode[] = []): GraphNode[] =>
    uniqueStrings([
      ...inboundDependencyNodes(daoNodeId, "controller").map((node) => node.id),
      ...serviceNodes.flatMap((serviceNode) => controllerNodesForService(serviceNode).map((node) => node.id)),
      ...controllersCallingService(serviceNodes).map((node) => node.id),
      ...bizNodes.flatMap((bizNode) => inboundDependencyNodes(bizNode.id, "controller").map((node) => node.id)),
      ...bizNodes.flatMap((bizNode) =>
        inboundDependencyNodes(bizNode.id, "service").flatMap((serviceNode) =>
          controllerNodesForService(serviceNode).map((node) => node.id),
        ),
      ),
    ])
      .map((id) => findNode(snapshot, id))
      .filter((node): node is GraphNode => Boolean(node));

  const inboundServiceNodesForDao = (daoNodeId: string): { serviceNodes: GraphNode[]; bizNodes: GraphNode[] } => {
    const bizNodes = inboundDependencyNodes(daoNodeId, "biz");
    const serviceNodes = uniqueStrings([
      ...inboundDependencyNodes(daoNodeId, "service").map((node) => node.id),
      ...bizNodes.flatMap((bizNode) => inboundDependencyNodes(bizNode.id, "service").map((node) => node.id)),
    ])
      .map((id) => findNode(snapshot, id))
      .filter((node): node is GraphNode => Boolean(node));
    return { serviceNodes, bizNodes };
  };

  const availableMapperNodes = snapshot.nodes.filter((node) => node.type === "mapper");
  const mapperSqlIndex = new Map<string, GraphNode[]>();
  for (const mapperNode of availableMapperNodes) {
    const sqlNodes = snapshot.edges
      .filter((edge) => edge.type === "contains" && edge.from === mapperNode.id)
      .map((edge) => findNode(snapshot, edge.to))
      .filter((node): node is GraphNode => node?.type === "sql_statement");
    mapperSqlIndex.set(mapperNode.id, sqlNodes);
  }

  const daoSqlIndex = new Map<string, Array<{ methodName: string; statementId: string; operation: string }>>();
  for (const daoNode of snapshot.nodes.filter((node) => node.type === "dao")) {
    const methodEntries = getDaoMethodSummaries(daoNode).flatMap((summary) =>
      summary.sqlCalls.map((call) => ({
        methodName: summary.methodName,
        statementId: normalizeSqlCandidate(call.statementId) ?? call.statementId,
        operation: call.operation,
      })),
    );
    daoSqlIndex.set(daoNode.id, methodEntries);
  }

  const pickFallbackMapper = (daoNode: GraphNode): { mapperNode: GraphNode; sqlNodes: GraphNode[] } | undefined => {
    const daoCandidates = uniqueStrings([
      daoNode.name,
      daoNode.displayName,
      typeof daoNode.metadata?.className === "string" ? daoNode.metadata.className : undefined,
    ]).filter((value): value is string => typeof value === "string" && value.length > 0);
    const daoStem = daoCandidates.map((value) => normalizeSymbolStem(value)).find(Boolean);
    let bestMatch: { mapperNode: GraphNode; sqlNodes: GraphNode[]; score: number } | undefined;

    for (const mapperNode of availableMapperNodes) {
      const namespace = typeof mapperNode.metadata?.namespace === "string" ? mapperNode.metadata.namespace : mapperNode.name;
      const mapperCandidates = uniqueStrings([mapperNode.name, mapperNode.displayName, namespace])
        .filter((value): value is string => typeof value === "string" && value.length > 0);
      const mapperStem = mapperCandidates.map((value) => normalizeSymbolStem(value)).find(Boolean);
      let score = 0;

      for (const daoCandidate of daoCandidates) {
        for (const mapperCandidate of mapperCandidates) {
          const daoValue = daoCandidate.toLowerCase();
          const mapperValue = mapperCandidate.toLowerCase();
          if (daoValue === mapperValue) {
            score = Math.max(score, 5);
          } else if (mapperValue.endsWith(daoValue) || daoValue.endsWith(mapperValue)) {
            score = Math.max(score, 4);
          }
        }
      }

      if (daoStem && mapperStem && daoStem === mapperStem) {
        score = Math.max(score, 3);
      }

      if (score === 0) {
        continue;
      }

      const sqlNodes = mapperSqlIndex.get(mapperNode.id) ?? [];
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { mapperNode, sqlNodes, score };
      }
    }

    return bestMatch && bestMatch.score >= 3
      ? { mapperNode: bestMatch.mapperNode, sqlNodes: bestMatch.sqlNodes }
      : undefined;
  };

  const upsertCard = (card: DataFlowCard): void => {
    const existing = cards.get(card.id);
    if (!existing) {
      cards.set(card.id, card);
      return;
    }

    cards.set(card.id, {
      ...existing,
      route: existing.route ?? card.route,
      routeValues: existing.routeValues.length > 0 ? existing.routeValues : card.routeValues,
      controllerId: existing.controllerId ?? card.controllerId,
      controller: existing.controller ?? card.controller,
      service: existing.service ?? card.service,
      biz: existing.biz ?? card.biz,
      dao: existing.dao ?? card.dao,
      mapper: existing.mapper ?? card.mapper,
      sql: existing.sql ?? card.sql,
      sqlCandidates: existing.sqlCandidates && existing.sqlCandidates.length > 0
        ? existing.sqlCandidates
        : card.sqlCandidates,
      sqlEvidenceLabel: existing.sqlEvidenceLabel ?? card.sqlEvidenceLabel,
      integration: existing.integration && existing.integration.length > 0 ? existing.integration : card.integration,
      evidenceLabel: existing.evidenceLabel || card.evidenceLabel,
      inferenceLevel: pickStrongerInferenceLevel(existing.inferenceLevel, card.inferenceLevel),
      evidenceKinds: uniqueStrings([...existing.evidenceKinds, ...card.evidenceKinds]),
      hiddenByDefault: shouldHideDataFlowCardByDefault({
        inferenceLevel: pickStrongerInferenceLevel(existing.inferenceLevel, card.inferenceLevel),
        confidence: existing.confidence === "high" || card.confidence !== "high" ? existing.confidence : "high",
        evidenceKinds: uniqueStrings([...existing.evidenceKinds, ...card.evidenceKinds]),
      }),
      confidence: existing.confidence === "high" || card.confidence !== "high" ? existing.confidence : "high",
    });
  };

  const serviceNodes = snapshot.nodes.filter((node) => node.type === "service");
  for (const serviceNode of serviceNodes) {
    const daoTargets = snapshot.edges
      .filter((candidate) => candidate.type === "depends_on" && candidate.from === serviceNode.id)
      .map((candidate) => findNode(snapshot, candidate.to))
      .filter((node): node is GraphNode => node?.type === "dao");
    const bizTargets = snapshot.edges
      .filter((candidate) => candidate.type === "depends_on" && candidate.from === serviceNode.id)
      .map((candidate) => findNode(snapshot, candidate.to))
      .filter((node): node is GraphNode => node?.type === "biz");
    if (daoTargets.length > 0 || bizTargets.length > 0) {
      continue;
    }

    const controllerNodes = controllerNodesForService(serviceNode);
    if (controllerNodes.length === 0) {
      continue;
    }

    const controllerNode = controllerNodes[0];
    const route = formatRouteLabel(getControllerRequestMappings(controllerNode));
    upsertCard({
      id: `data-flow:${serviceNode.id}`,
      type: "data_flow",
      route,
      routeValues: getControllerRequestMappings(controllerNode),
      controllerId: controllerNode?.id,
      controller: controllerNode?.displayName ?? controllerNode?.name,
      service: serviceNode.displayName ?? serviceNode.name,
      biz: undefined,
      dao: undefined,
      mapper: undefined,
      sql: undefined,
      sqlCandidates: undefined,
      sqlEvidenceLabel: undefined,
      integration: undefined,
      evidenceLabel: "controller -> service dependency",
      inferenceLevel: "inferred",
      evidenceKinds: ["controller-service-edge"],
      hiddenByDefault: true,
      confidence: controllerNode ? "medium" : serviceNode.confidence,
    });
  }

  const daoNodes = snapshot.nodes.filter((node) => node.type === "dao");
  for (const daoNode of daoNodes) {
    const { serviceNodes, bizNodes } = inboundServiceNodesForDao(daoNode.id);
    const daoMethodSummaries = getDaoMethodSummaries(daoNode);
    const daoExternalCalls = uniqueStrings(daoMethodSummaries.flatMap((summary) =>
      summary.externalCalls.map((call) => `${call.kind}: ${call.target}`),
    ));
    const controllerNodes = candidateControllersForDao(daoNode.id, serviceNodes, bizNodes);
    const controllerCandidates = controllerNodes.length > 0 ? controllerNodes : [undefined];
    for (const controllerNode of controllerCandidates) {
      const route = formatRouteLabel(getControllerRequestMappings(controllerNode));
      upsertCard({
        id: `data-flow:${daoNode.id}:${controllerNode?.id ?? "unbound"}`,
        type: "data_flow",
        route,
        routeValues: getControllerRequestMappings(controllerNode),
        controllerId: controllerNode?.id,
        controller: controllerNode?.displayName ?? controllerNode?.name,
        service: uniqueStrings(serviceNodes.map((node) => node.displayName ?? node.name))[0],
        biz: uniqueStrings(bizNodes.map((node) => node.displayName ?? node.name))[0],
        dao: daoNode.displayName ?? daoNode.name,
        mapper: undefined,
        sql: undefined,
        sqlCandidates: undefined,
        sqlEvidenceLabel: undefined,
        integration: daoExternalCalls.length > 0 ? daoExternalCalls : undefined,
        evidenceLabel: bizNodes.length > 0 ? "controller/service -> biz -> dao dependency" : "controller/service -> dao dependency",
        inferenceLevel: "inferred",
        evidenceKinds: uniqueStrings([
          controllerNode ? "controller-binding" : undefined,
          serviceNodes.length > 0 ? "service-dao-edge" : undefined,
          bizNodes.length > 0 ? "biz-dao-edge" : undefined,
          daoExternalCalls.length > 0 ? "integration-call" : undefined,
        ]),
        hiddenByDefault: true,
        confidence: serviceNodes.length > 0 || controllerNode ? "medium" : daoNode.confidence,
      });
    }
  }

  const queryEdges = snapshot.edges.filter((edge) => edge.type === "queries");
  for (const edge of queryEdges) {
    const daoNode = findNode(snapshot, edge.from);
    const mapperNode = findNode(snapshot, edge.to);
    if (!daoNode) {
      continue;
    }
    const sqlNodes = snapshot.edges
      .filter((candidate) => candidate.type === "contains" && candidate.from === edge.to)
      .map((candidate) => findNode(snapshot, candidate.to))
      .filter((node): node is GraphNode => node?.type === "sql_statement");
    const { serviceNodes, bizNodes } = inboundServiceNodesForDao(daoNode.id);
    const daoSqlEntries = daoSqlIndex.get(daoNode.id) ?? [];
    const daoSqlCandidates = uniqueStrings(daoSqlEntries.flatMap((entry) => [entry.statementId, entry.statementId.split(".").pop()]));
    const daoMethodSummaries = getDaoMethodSummaries(daoNode);
    const daoExternalCalls = uniqueStrings(daoMethodSummaries.flatMap((summary) =>
      summary.externalCalls.map((call) => `${call.kind}: ${call.target}`),
    ));
    const controllerNodes = candidateControllersForDao(daoNode.id, serviceNodes, bizNodes);
    const controllerCandidates = controllerNodes.length > 0 ? controllerNodes : [undefined];
    for (const controllerNode of controllerCandidates) {
      const route = formatRouteLabel(getControllerRequestMappings(controllerNode));
      upsertCard({
        id: `data-flow:${daoNode.id}:${controllerNode?.id ?? "unbound"}`,
        type: "data_flow",
        route,
        routeValues: getControllerRequestMappings(controllerNode),
        controllerId: controllerNode?.id,
        controller: controllerNode?.displayName ?? controllerNode?.name,
        service: uniqueStrings(serviceNodes.map((node) => node.displayName ?? node.name))[0],
        biz: uniqueStrings(bizNodes.map((node) => node.displayName ?? node.name))[0],
        dao: daoNode.displayName ?? daoNode.name,
        mapper: mapperNode?.displayName ?? mapperNode?.name ?? edge.to,
        sql: normalizeSqlCandidate(daoSqlCandidates[0] ?? sqlNodes[0]?.name ?? sqlNodes[0]?.displayName),
        sqlCandidates: daoSqlCandidates.length > 0
          ? daoSqlCandidates
          : uniqueStrings(sqlNodes.flatMap((sqlNode) => [normalizeSqlCandidate(sqlNode.name), sqlNode.displayName])),
        sqlEvidenceLabel: daoSqlEntries.length > 0
          ? `dao method sql call: ${daoSqlEntries.map((entry) => `${entry.methodName} -> ${entry.statementId}`).join(" | ")}`
          : "dao -> mapper query edge",
        integration: daoExternalCalls.length > 0 ? daoExternalCalls : undefined,
        evidenceLabel: "dao -> mapper query edge",
        inferenceLevel: daoSqlEntries.length > 0 ? "confirmed" : "inferred",
        evidenceKinds: uniqueStrings([
          controllerNode ? "controller-binding" : undefined,
          serviceNodes.length > 0 ? "service-dao-edge" : undefined,
          bizNodes.length > 0 ? "biz-dao-edge" : undefined,
          "dao-mapper-edge",
          daoSqlEntries.length > 0 ? "sql-call" : undefined,
          daoExternalCalls.length > 0 ? "integration-call" : undefined,
        ]),
        hiddenByDefault: daoSqlEntries.length === 0,
        confidence: edge.confidence,
      });
    }
  }

  for (const daoNode of daoNodes) {
    const fallback = pickFallbackMapper(daoNode);
    if (!fallback) {
      continue;
    }
    const existingCards = Array.from(cards.values()).filter((card) => card.id.startsWith(`data-flow:${daoNode.id}:`) && !card.mapper);
    for (const existing of existingCards) {
      upsertCard({
        ...existing,
        mapper: fallback.mapperNode.displayName ?? fallback.mapperNode.name,
        sql: normalizeSqlCandidate(fallback.sqlNodes[0]?.name ?? fallback.sqlNodes[0]?.displayName),
        sqlCandidates: uniqueStrings(fallback.sqlNodes.flatMap((sqlNode) => [normalizeSqlCandidate(sqlNode.name), sqlNode.displayName])),
        sqlEvidenceLabel: "mapper fallback match",
        integration: existing.integration,
        evidenceLabel: "mapper fallback match",
        inferenceLevel: "heuristic",
        evidenceKinds: uniqueStrings([...existing.evidenceKinds, "name-fallback"]),
        hiddenByDefault: true,
        confidence: "low",
      });
    }
  }

  return Array.from(cards.values())
    .map((card) => ({
      ...card,
      hiddenByDefault: shouldHideDataFlowCardByDefault(card),
    }))
    .sort((left, right) => {
    const leftKey = left.route ?? left.dao ?? left.service ?? left.id;
    const rightKey = right.route ?? right.dao ?? right.service ?? right.id;
    return leftKey.localeCompare(rightKey);
    });
}

function collectPrimaryFlowCards(screenCards: ScreenCard[]): PrimaryFlowCard[] {
  const grouped = new Map<string, ScreenCard[]>();

  for (const card of screenCards.filter((candidate) => Boolean(candidate.route))) {
    const groupingKey = card.controllerId ?? card.route ?? card.title;
    const existing = grouped.get(groupingKey) ?? [];
    existing.push(card);
    grouped.set(groupingKey, existing);
  }

  return Array.from(grouped.values())
    .map((group) => {
      const [card] = group;
      if (card === undefined) {
        return null;
      }
      const viewSummary = summarizeValueGroup(uniqueStrings(group.map((item) => item.view)), "views");
      const layoutSummary = summarizeValueGroup(uniqueStrings(group.map((item) => item.layout)), "layouts");
      const relatedDataSummary = uniqueStrings(group.flatMap((item) => item.relatedDataSummary));

      return {
        id: `primary:${card.id}`,
        type: "primary_entry_flow",
        title: card.route ?? card.title,
        route: card.route ?? card.title,
        entryPattern: card.entryPattern,
        dispatcher: card.dispatcher,
        dispatcherConfig: card.dispatcherConfig,
        controllerId: card.controllerId,
        controller: card.controller,
        controllerPath: card.controllerPath,
        action: card.action,
        view: viewSummary,
        layout: layoutSummary,
        routeValues: uniqueStrings(group.flatMap((item) => item.routeValues)),
        relatedDataSummary,
        relatedDataSearchTerm: card.relatedDataSearchTerm,
        relatedDataCount: relatedDataSummary.length,
        confidence: card.confidence,
      };
    })
    .filter((card): card is PrimaryFlowCard => Boolean(card))
    .slice(0, 12);
}

function enrichScreenCardsWithDataFlow(screenCards: ScreenCard[], dataFlowCards: DataFlowCard[]): ScreenCard[] {
  return screenCards.map((card) => {
    const controllerMatches = card.controllerId
      ? dataFlowCards.filter((dataFlowCard) => dataFlowCard.controllerId === card.controllerId)
      : [];
    const fallbackMatches = !card.controllerId && card.relatedDataSearchTerm
      ? dataFlowCards.filter((dataFlowCard) =>
          JSON.stringify(dataFlowCard).toLowerCase().includes(card.relatedDataSearchTerm?.toLowerCase() ?? ""),
        )
      : [];
    const matches = controllerMatches.length > 0
      ? controllerMatches
      : fallbackMatches;

    if (matches.length === 0) {
      return {
        ...card,
        relatedDataSearchTerm: undefined,
      };
    }

    const relatedDataSummary = uniqueStrings([
      ...card.relatedDataSummary,
      `data flows: ${matches.length}`,
    ]);

    return {
      ...card,
      relatedDataSummary,
      relatedDataSearchTerm: controllerMatches.length > 0
        ? card.controllerId
        : card.relatedDataSearchTerm,
    };
  });
}

function findMatchingDataFlowCards(screenCard: ScreenCard, dataFlowCards: DataFlowCard[]): DataFlowCard[] {
  const controllerMatches = screenCard.controllerId
    ? dataFlowCards.filter((dataFlowCard) => dataFlowCard.controllerId === screenCard.controllerId)
    : [];
  const fallbackMatches = !screenCard.controllerId && screenCard.relatedDataSearchTerm
    ? dataFlowCards.filter((dataFlowCard) =>
        JSON.stringify(dataFlowCard).toLowerCase().includes(screenCard.relatedDataSearchTerm?.toLowerCase() ?? ""),
      )
    : [];
  return controllerMatches.length > 0 ? controllerMatches : fallbackMatches;
}

function shortenPath(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return parts.pop() ?? normalized;
}

function buildRequestFlowCards(
  snapshot: AnalysisSnapshot,
  screenCards: ScreenCard[],
  dataFlowCards: DataFlowCard[],
): { screenFlowCards: RequestFlowCard[]; apiFlowCards: RequestFlowCard[]; flowDetails: FlowDetailCard[] } {
  const screenFlowCards: RequestFlowCard[] = [];
  const apiFlowCards: RequestFlowCard[] = [];
  const flowDetails: FlowDetailCard[] = [];
  const inboundUiActionCounts = collectInboundUiActionCounts(snapshot);

  const groupedScreenCards = new Map<string, ScreenCard[]>();
  for (const card of screenCards) {
    const groupingKey = card.view || card.layout
      ? `screen:${card.controllerId ?? card.controller ?? card.title}:${card.action ?? "handler"}:${card.route ?? card.title}`
      : `api:${card.id}`;
    const existing = groupedScreenCards.get(groupingKey) ?? [];
    existing.push(card);
    groupedScreenCards.set(groupingKey, existing);
  }

  for (const group of groupedScreenCards.values()) {
    const card = group[0];
    if (!card) {
      continue;
    }
    const controllerDataMatches = findMatchingDataFlowCards(card, dataFlowCards);
    const isScreenFlow = Boolean(card.view || card.layout);
    const viewVariants = uniqueStrings(group.map((item) => item.view));
    const layoutVariants = uniqueStrings(group.map((item) => item.layout));
    const variantCount = Math.max(viewVariants.length, layoutVariants.length, group.length);
    const detailId = `detail:${card.id}`;
    const routeTitle = card.route ?? card.title;
    const internalCallerCount = card.routeValues.reduce((count, route) => count + (inboundUiActionCounts.get(route) ?? 0), 0);
    const controllerNode = card.controllerId ? findNode(snapshot, card.controllerId) : undefined;
    const resolution = getControllerResolutionInfo(controllerNode);
    const handlerServiceCalls = getHandlerServiceCalls(controllerNode, card.action);
    const handlerResponseBody = getHandlerResponseBody(controllerNode, card.action);
    const handlerResponseMetadata = getHandlerResponseMetadata(controllerNode, card.action);
    const calledServices = uniqueStrings(
      handlerServiceCalls
        .filter((call) => call.targetType === "service")
        .map((call) => shortTypeName(call.targetName)),
    );
    const calledMethodNames = uniqueStrings(handlerServiceCalls.map((call) => call.methodName));
    const fallbackService = controllerDataMatches[0]?.service;
    const displayedService = calledServices[0] ?? fallbackService;
    const serviceStem = normalizeSymbolStem(displayedService);
    const serviceDataMatches = serviceStem
      ? dataFlowCards.filter((match) =>
          normalizeSymbolStem(match.service) === serviceStem ||
          normalizeSymbolStem(match.biz) === serviceStem,
        )
      : [];
    const dataMatches = uniqueStrings([
      ...controllerDataMatches.map((match) => match.id),
      ...serviceDataMatches.map((match) => match.id),
    ]).map((id) => dataFlowCards.find((match) => match.id === id)).filter((match): match is DataFlowCard => Boolean(match));
    const scoreDataMatch = (match: DataFlowCard): number => (
      (match.controllerId === card.controllerId ? 5 : 0) +
      (match.routeValues.includes(card.route ?? "") ? 3 : 0) +
      (normalizeSymbolStem(match.service) === normalizeSymbolStem(displayedService) ? 4 : 0) +
      (normalizeSymbolStem(match.biz) === normalizeSymbolStem(displayedService) ? 3 : 0) +
      (pickBestSqlCandidate(match.sqlCandidates, calledMethodNames) ? 6 : 0) +
      (match.integration && match.integration.length > 0 ? 5 : 0) +
      (match.inferenceLevel === "confirmed" ? 4 : match.inferenceLevel === "inferred" ? 2 : 0) +
      (match.biz ? 2 : 0) +
      (match.dao ? 3 : 0) +
      (match.mapper ? 2 : 0) +
      (match.sql ? 2 : 0)
    );
    const rankedDataMatches = [...dataMatches].sort((left, right) => scoreDataMatch(right) - scoreDataMatch(left));
    const strongestDataScore = rankedDataMatches[0] ? scoreDataMatch(rankedDataMatches[0]) : 0;
    const visibleDataMatches = rankedDataMatches.filter((match) => scoreDataMatch(match) >= Math.max(strongestDataScore - 4, 6));
    const primaryDataMatch = displayedService
      ? rankedDataMatches.find((match) =>
          normalizeSymbolStem(match.service) === normalizeSymbolStem(displayedService) ||
          normalizeSymbolStem(match.biz) === normalizeSymbolStem(displayedService),
        ) ?? rankedDataMatches[0]
      : rankedDataMatches[0];
    const displayedBiz = primaryDataMatch?.biz;
    const displayedSql = pickBestSqlCandidate(
      primaryDataMatch?.sqlCandidates ?? (primaryDataMatch?.sql ? [primaryDataMatch.sql] : []),
      calledMethodNames,
    ) ?? normalizeSqlCandidate(primaryDataMatch?.sql);
    const serviceEvidence = handlerServiceCalls.length > 0
      ? handlerServiceCalls
        .filter((call) => call.targetType === "service")
        .map((call) => `${shortTypeName(call.targetName) ?? call.targetName}.${call.methodName}()`)
        .join(" | ")
      : describeDependencyEvidence(snapshot, card.controllerId, displayedService);
    const serviceNode = displayedService
      ? snapshot.nodes.find((node) => node.type === "service" && (node.displayName === displayedService || node.name === displayedService))
      : undefined;
    const bizNode = displayedBiz
      ? snapshot.nodes.find((node) => node.type === "biz" && (node.displayName === displayedBiz || node.name === displayedBiz))
      : undefined;
    const serviceMethodSummaries = getDaoMethodSummaries(serviceNode);
    const bizMethodSummaries = getDaoMethodSummaries(bizNode);
    const matchingServiceSummary = serviceMethodSummaries.find((summary) =>
      calledMethodNames.includes(summary.methodName) ||
      calledMethodNames.includes(summary.dependencyCalls[0]?.methodName ?? ""),
    );
    const serviceToBizEvidence = displayedBiz
      ? matchingServiceSummary?.dependencyCalls.find((call) =>
          call.targetType === "biz" &&
          normalizeSymbolStem(shortTypeName(call.targetName)) === normalizeSymbolStem(displayedBiz),
        )
        ? `${displayedService}.${matchingServiceSummary.methodName}() -> ${displayedBiz}.${matchingServiceSummary.dependencyCalls.find((call) =>
            call.targetType === "biz" &&
            normalizeSymbolStem(shortTypeName(call.targetName)) === normalizeSymbolStem(displayedBiz),
          )?.methodName}()`
        : describeDependencyEvidence(snapshot, serviceNode?.id, displayedBiz)
      : undefined;
    const matchingBizSummary = bizMethodSummaries.find((summary) =>
      calledMethodNames.includes(summary.methodName) ||
      calledMethodNames.includes(summary.dependencyCalls[0]?.methodName ?? ""),
    );
    const daoEvidence = matchingBizSummary?.dependencyCalls.find((call) =>
      call.targetType === "dao" &&
      normalizeSymbolStem(shortTypeName(call.targetName)) === normalizeSymbolStem(primaryDataMatch?.dao),
    )
      ? `${displayedBiz ?? displayedService}.${matchingBizSummary.methodName}() -> ${primaryDataMatch?.dao}.${matchingBizSummary.dependencyCalls.find((call) =>
          call.targetType === "dao" &&
          normalizeSymbolStem(shortTypeName(call.targetName)) === normalizeSymbolStem(primaryDataMatch?.dao),
        )?.methodName}()`
      : describeDependencyEvidence(snapshot, bizNode?.id ?? serviceNode?.id, primaryDataMatch?.dao);
    const logicalViewNames = getControllerLogicalViewNames(controllerNode, card.action, card.view);
    const viewResolvers = isScreenFlow
      ? collectViewResolverInfo(snapshot, [card.dispatcherConfig, resolution.configPath].filter(Boolean) as string[])
      : [];
    const resolvedViewPaths = isScreenFlow ? resolveLogicalViewPaths(logicalViewNames, viewResolvers) : [];
    const viewResolverSummary = viewResolvers.length > 0
      ? viewResolvers.map((resolver) => `${resolver.beanName}: ${resolver.prefix || ""}*${resolver.suffix || ""}`).join(" | ")
      : undefined;
    const viewSummary = isScreenFlow
      ? summarizeValueGroup(viewVariants.map((value) => shortenPath(value) ?? value), "views") ?? shortenPath(card.view) ?? "screen"
      : undefined;
    const title = isScreenFlow
      ? `${routeTitle} -> ${viewSummary}`
      : `${routeTitle} -> Non-screen response`;
    const responseTags = isScreenFlow
      ? []
      : inferNonScreenResponseTags({
          route: card.route,
          action: card.action,
          requestMappings: card.routeValues,
          handlerMappingPatterns: resolution.handlerMappingPatterns,
          responseBody: handlerResponseBody,
          produces: handlerResponseMetadata.produces,
          contentTypes: handlerResponseMetadata.contentTypes,
          internalCallerCount,
        });
    const responseKind = isScreenFlow
      ? undefined
      : inferNonScreenResponseKind({
          route: card.route,
          action: card.action,
          requestMappings: card.routeValues,
          handlerMappingPatterns: resolution.handlerMappingPatterns,
          logicalViewNames,
          responseBody: handlerResponseBody,
          responseTags,
          produces: handlerResponseMetadata.produces,
          contentTypes: handlerResponseMetadata.contentTypes,
          redirectTargets: handlerResponseMetadata.redirectTargets,
          fileResponseHints: handlerResponseMetadata.fileResponseHints,
        });
    const requestFlowCard: RequestFlowCard = {
      id: card.id,
      type: isScreenFlow ? "screen_flow" : "api_flow",
      title,
      route: card.route,
      routeValues: card.routeValues,
      entryPattern: card.entryPattern,
      dispatcher: card.dispatcher,
      dispatcherConfig: card.dispatcherConfig,
      controllerId: card.controllerId,
      controller: card.controller,
      controllerPath: card.controllerPath,
      controllerBeanId: resolution.beanId,
      controllerClassName: resolution.className,
      controllerConfigPath: resolution.configPath,
      handlerMappingPatterns: resolution.handlerMappingPatterns,
      methodResolverRef: resolution.methodResolverRef,
      action: card.action,
      service: displayedService,
      biz: displayedBiz,
      dao: primaryDataMatch?.dao,
      mapper: primaryDataMatch?.mapper,
      sql: displayedSql,
      integration: primaryDataMatch?.integration,
      view: card.view,
      layout: card.layout,
      viewVariants,
      layoutVariants,
      variantCount,
      responseType: isScreenFlow ? undefined : "Non-screen response",
      responseKind,
      responseTags,
      logicalViewNames,
      resolvedViewPaths,
      viewResolverSummary,
      confidence: card.confidence,
      detailId,
      relatedDataSearchTerm: card.relatedDataSearchTerm,
    };

    const sections: FlowDetailCard["sections"] = [
      {
        key: "detailEntrySetup",
        lines: [
          `request URL: ${routeTitle ?? "-"}`,
          `entry pattern: ${card.entryPattern ?? "-"}`,
          `dispatcher: ${card.dispatcher ?? "-"}`,
          `spring config: ${card.dispatcherConfig ?? "-"}`,
          `mapping file: ${resolution.configPath ?? "-"}`,
        ],
      },
      {
        key: "detailRequestPath",
        lines: [
          `handler mapping: ${resolution.handlerMappingPatterns.join(", ") || "-"}`,
          `method resolver: ${resolution.methodResolverRef ?? "-"}`,
          `bean: ${resolution.beanId ?? card.controller ?? "-"}`,
          `controller/action: ${card.controller ?? "-"}`,
          `class: ${resolution.className ?? card.controller ?? "-"}`,
          `controller file: ${card.controllerPath ?? "-"}`,
          `handler method: ${card.action ?? "-"}`,
          `request mappings: ${card.routeValues.length > 0 ? card.routeValues.join(", ") : routeTitle ?? "-"}`,
          `framework route: ${card.dispatcher ?? "-"}`,
        ],
      },
      {
        key: "detailBusinessSteps",
        lines: [
          `business path: ${[
            card.controller ?? "-",
            displayedService ?? "-",
            displayedBiz ?? "-",
            primaryDataMatch?.dao ?? "-",
          ].join(" -> ")}`,
          `service: ${displayedService ?? "-"}`,
          `biz: ${displayedBiz ?? "-"}`,
          `controller -> service evidence: ${serviceEvidence ?? "-"}`,
          `service -> biz evidence: ${serviceToBizEvidence ?? "-"}`,
          `dao: ${primaryDataMatch?.dao ?? "-"}`,
          `${displayedBiz ? "biz -> dao evidence" : "service -> dao evidence"}: ${daoEvidence ?? "-"}`,
          `sql evidence: ${primaryDataMatch?.sqlEvidenceLabel ?? "-"}`,
          `inference level: ${primaryDataMatch?.inferenceLevel ?? "-"}`,
          `evidence kinds: ${primaryDataMatch?.evidenceKinds.join(" | ") ?? "-"}`,
          `integration: ${primaryDataMatch?.integration?.join(" | ") ?? "-"}`,
          `shared data summary: ${card.relatedDataSummary.join(" | ") || "-"}`,
        ],
      },
      {
        key: "detailDataAccess",
        lines: visibleDataMatches.length > 0
          ? visibleDataMatches.map((match) =>
              [
                `controller=${match.controller ?? "-"}`,
                `service=${match.service ?? "-"}`,
                `dao=${match.dao ?? "-"}`,
                `mapper=${match.mapper ?? "-"}`,
                `sql=${pickBestSqlCandidate(match.sqlCandidates ?? (match.sql ? [match.sql] : []), calledMethodNames) ?? normalizeSqlCandidate(match.sql) ?? "-"}`,
                `level=${match.inferenceLevel}`,
                `evidenceKinds=${match.evidenceKinds.join(", ") || "-"}`,
                `integration=${match.integration?.join(" ; ") ?? "-"}`,
                `evidence=${match.sqlEvidenceLabel ?? match.evidenceLabel}`,
              ].join(" | "),
            )
          : ["No related data flow identified"],
      },
      {
        key: "detailOutput",
        lines: isScreenFlow
          ? [
              `logical view: ${logicalViewNames.join(" | ") || "-"}`,
              `view resolver: ${viewResolverSummary ?? "-"}`,
              `resolved jsp candidates: ${resolvedViewPaths.join(" | ") || "-"}`,
              `view: ${card.view ?? "-"}`,
              `layout: ${card.layout ?? "-"}`,
              `view variants: ${viewVariants.join(" | ") || "-"}`,
              `layout variants: ${layoutVariants.join(" | ") || "-"}`,
              "result: rendered screen",
            ]
          : [
              `response type: Non-screen response`,
              `response kind: ${responseKind ?? "unknown"}`,
              `content types: ${handlerResponseMetadata.contentTypes.join(" | ") || handlerResponseMetadata.produces.join(" | ") || "-"}`,
              `redirect target: ${handlerResponseMetadata.redirectTargets.join(" | ") || "-"}`,
              `file response hints: ${handlerResponseMetadata.fileResponseHints.join(" | ") || "-"}`,
              `view/layout: -`,
              "result: non-screen response",
            ],
      },
      {
        key: "detailConfigs",
        lines: [
          `dispatcher config: ${card.dispatcherConfig ?? "-"}`,
          `entry pattern: ${card.entryPattern ?? "-"}`,
        ],
      },
    ];

    const detailCard: FlowDetailCard = {
      id: detailId,
      type: isScreenFlow ? "screen_flow_detail" : "api_flow_detail",
      title,
      summary: isScreenFlow
        ? `${routeTitle} -> ${card.controller ?? "-"} -> ${displayedService ?? "-"} -> ${primaryDataMatch?.dao ?? "-"} -> ${shortenPath(card.view) ?? "screen"}`
        : `${routeTitle} -> ${card.controller ?? "-"} -> ${displayedService ?? "-"} -> ${primaryDataMatch?.dao ?? "-"} -> Non-screen response`,
      confidence: card.confidence,
      responseTags,
      relatedDataSearchTerm: card.relatedDataSearchTerm,
      sections,
    };
    if (responseKind) {
      detailCard.responseKind = responseKind;
    }
    if (isScreenFlow) {
      detailCard.viewPaths = viewVariants;
    }
    flowDetails.push(detailCard);

    if (isScreenFlow) {
      screenFlowCards.push(requestFlowCard);
    } else {
      apiFlowCards.push(requestFlowCard);
    }
  }

  return {
    screenFlowCards,
    apiFlowCards,
    flowDetails,
  };
}

function collectViewUiActions(snapshot: AnalysisSnapshot, viewPaths: string[]): Array<{
  kind: string;
  label: string;
  target: string;
}> {
  const actions = new Map<string, { kind: string; label: string; target: string }>();

  for (const viewPath of viewPaths) {
    const viewNode = snapshot.nodes.find((node) => node.type === "view" && node.path === viewPath);
    const uiActions = Array.isArray(viewNode?.metadata?.uiActions)
      ? viewNode.metadata.uiActions as Array<Record<string, unknown>>
      : [];
    for (const action of uiActions) {
      const target = typeof action.target === "string" ? action.target : undefined;
      if (!target) {
        continue;
      }
      const kind = typeof action.kind === "string" ? action.kind : "action";
      const label = typeof action.label === "string" && action.label.length > 0
        ? action.label
        : `${kind}: ${target}`;
      const key = `${kind}:${target}:${label}`;
      if (!actions.has(key)) {
        actions.set(key, { kind, label, target });
      }
    }
  }

  return Array.from(actions.values());
}

function collectInboundUiActionCounts(snapshot: AnalysisSnapshot): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of snapshot.nodes) {
    if (node.type !== "view" || !Array.isArray(node.metadata?.uiActions)) {
      continue;
    }
    for (const action of node.metadata.uiActions as Array<Record<string, unknown>>) {
      const target = typeof action.target === "string" ? action.target : undefined;
      if (!target) {
        continue;
      }
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
  }
  return counts;
}

function enrichFlowDetailsWithBrowserEntry(
  snapshot: AnalysisSnapshot,
  flowDetails: FlowDetailCard[],
  requestFlowCards: RequestFlowCard[],
): FlowDetailCard[] {
  const flowByDetailId = new Map(requestFlowCards.map((flow) => [flow.detailId, flow]));
  const viewPathToFlow = new Map<string, { title: string; detailId: string }>();

  for (const detail of flowDetails) {
    if (detail.type !== "screen_flow_detail" || !detail.viewPaths) {
      continue;
    }
    for (const viewPath of detail.viewPaths) {
      viewPathToFlow.set(viewPath, { title: detail.title, detailId: detail.id });
    }
  }

  return flowDetails.map((detail) => {
    const flow = flowByDetailId.get(detail.id);
    if (!flow || flow.routeValues.length === 0) {
      return detail;
    }

    const inboundActions = new Map<string, {
      kind: string;
      label: string;
      target: string;
      nextTitle?: string;
      nextDetailId?: string;
    }>();

    for (const node of snapshot.nodes) {
      if (node.type !== "view" || !node.path || !Array.isArray(node.metadata?.uiActions)) {
        continue;
      }
      const sourceFlow = viewPathToFlow.get(node.path);
      for (const action of node.metadata.uiActions as Array<Record<string, unknown>>) {
        const target = typeof action.target === "string" ? action.target : undefined;
        if (!target || !flow.routeValues.includes(target)) {
          continue;
        }
        const key = `${node.path}:${target}`;
        if (inboundActions.has(key)) {
          continue;
        }
        const sourceLabel = sourceFlow?.title ?? (shortenPath(node.path) ?? node.displayName ?? node.name);
        const actionItem: {
          kind: string;
          label: string;
          target: string;
          nextTitle?: string;
          nextDetailId?: string;
        } = {
          kind: typeof action.kind === "string" ? action.kind : "browser",
          label: sourceLabel,
          target,
        };
        if (sourceFlow?.title) {
          actionItem.nextTitle = sourceFlow.title;
        }
        if (sourceFlow?.detailId) {
          actionItem.nextDetailId = sourceFlow.detailId;
        }
        inboundActions.set(key, actionItem);
      }
    }

    const entrySectionIndex = detail.sections.findIndex((section) => section.key === "detailEntrySetup");
    if (entrySectionIndex < 0) {
      return detail;
    }

    const sections = [...detail.sections];
    const currentEntrySection = sections[entrySectionIndex];
    if (!currentEntrySection) {
      return detail;
    }
    const lines = [...currentEntrySection.lines];
    if (inboundActions.size > 0) {
      lines.push(`browser entry: linked from ${inboundActions.size} prior screen action(s)`);
    } else {
      lines.push("browser entry: direct URL, bookmark, or external navigation");
    }
    const entrySection: FlowDetailCard["sections"][number] = {
      key: currentEntrySection.key,
      lines,
    };
    if (inboundActions.size > 0) {
      entrySection.actions = Array.from(inboundActions.values());
    }
    sections[entrySectionIndex] = entrySection;

    return {
      ...detail,
      sections,
    };
  });
}

function enrichFlowDetailsWithUiActions(
  snapshot: AnalysisSnapshot,
  flowDetails: FlowDetailCard[],
  requestFlowCards: RequestFlowCard[],
): FlowDetailCard[] {
  const flowByTarget = new Map<string, { title: string; detailId: string }>();
  for (const flow of requestFlowCards) {
    for (const route of flow.routeValues) {
      if (!flowByTarget.has(route)) {
        flowByTarget.set(route, { title: flow.title, detailId: flow.detailId });
      }
    }
  }

  return flowDetails.map((detail) => {
    if (detail.type !== "screen_flow_detail" || !detail.viewPaths || detail.viewPaths.length === 0) {
      return detail;
    }
    const uiActions = collectViewUiActions(snapshot, detail.viewPaths);
    if (uiActions.length === 0) {
      return detail;
    }

    const actionSection = {
      key: "detailUiActions",
      lines: [
        `actions detected: ${uiActions.length}`,
      ],
      actions: uiActions.map((action) => {
        const nextFlow = flowByTarget.get(action.target);
        const actionItem: {
          kind: string;
          label: string;
          target: string;
          nextTitle?: string;
          nextDetailId?: string;
        } = {
          kind: action.kind,
          label: action.label,
          target: action.target,
        };
        if (nextFlow?.title) {
          actionItem.nextTitle = nextFlow.title;
        }
        if (nextFlow?.detailId) {
          actionItem.nextDetailId = nextFlow.detailId;
        }
        return actionItem;
      }),
    };

    const sections = [...detail.sections];
    sections.splice(Math.max(0, sections.length - 1), 0, actionSection);
    return {
      ...detail,
      sections,
    };
  });
}

function collectFrameworkFlowCards(
  snapshot: AnalysisSnapshot,
  screenFlowCards: RequestFlowCard[],
  apiFlowCards: RequestFlowCard[],
): { frameworkFlowCards: FrameworkFlowCard[]; frameworkDetails: FlowDetailCard[] } {
  const frameworkFlowCards: FrameworkFlowCard[] = [];
  const frameworkDetails: FlowDetailCard[] = [];

  for (const entryPoint of snapshot.entryPoints) {
    const routeNode = findNode(snapshot, entryPoint.targetEntityId);
    const entryPatterns = getEntryPointPatterns(entryPoint);
    const dispatcherConfig = getEntryPointContextConfig(entryPoint);
    const contextConfigPaths = uniqueStrings([
      ...splitConfigLocations(dispatcherConfig),
      dispatcherConfig,
    ]);
    const linkedScreenFlows = screenFlowCards.filter((flow) =>
      flow.routeValues.some((route) => entryPatterns.some((pattern) => routeMatchesPattern(route, pattern))),
    );
    const linkedApiFlows = apiFlowCards.filter((flow) =>
      flow.routeValues.some((route) => entryPatterns.some((pattern) => routeMatchesPattern(route, pattern))),
    );
    const linkedHandlerMappings = uniqueStrings([
      ...linkedScreenFlows.flatMap((flow) => flow.handlerMappingPatterns),
      ...linkedApiFlows.flatMap((flow) => flow.handlerMappingPatterns),
    ]);
    const linkedMethodResolvers = uniqueStrings([
      ...linkedScreenFlows.map((flow) => flow.methodResolverRef),
      ...linkedApiFlows.map((flow) => flow.methodResolverRef),
    ]);
    const linkedViewResolvers = uniqueStrings(linkedScreenFlows.map((flow) => flow.viewResolverSummary));
    const linkedResolvedViews = uniqueStrings(linkedScreenFlows.flatMap((flow) => flow.resolvedViewPaths)).slice(0, 6);
    const detailId = `detail:framework:${entryPoint.id}`;
    const card: FrameworkFlowCard = {
      id: `framework:${entryPoint.id}`,
      type: "framework_flow",
      title: `${entryPoint.title} -> ${getEntryPointPattern(entryPoint) ?? entryPoint.reason}`,
      entryPattern: getEntryPointPattern(entryPoint),
      dispatcher: routeNode?.displayName ?? entryPoint.title,
      dispatcherConfig,
      contextConfigs: uniqueStrings([
        ...contextConfigPaths,
        routeNode?.path,
        ...linkedScreenFlows.map((flow) => flow.controllerConfigPath),
        ...linkedApiFlows.map((flow) => flow.controllerConfigPath),
      ]),
      sampleRoutes: uniqueStrings([
        ...linkedScreenFlows.flatMap((flow) => flow.routeValues),
        ...linkedApiFlows.flatMap((flow) => flow.routeValues),
      ]).slice(0, 6),
      screenFlowCount: linkedScreenFlows.length,
      apiFlowCount: linkedApiFlows.length,
      confidence: entryPoint.confidence,
      detailId,
    };
    frameworkFlowCards.push(card);
    frameworkDetails.push({
      id: detailId,
      type: "framework_flow_detail",
      title: card.title,
      summary: `${routeNode?.displayName ?? entryPoint.title} -> ${dispatcherConfig ?? "-"} -> request mappings`,
      confidence: entryPoint.confidence,
      relatedDataSearchTerm: undefined,
      sections: [
        {
          key: "detailFrameworkBootstrap",
          lines: [
            "client entry: browser or external HTTP client",
            `web entry: ${entryPoint.title}`,
            `entry pattern: ${card.entryPattern ?? "-"}`,
            `dispatcher: ${card.dispatcher ?? "-"}`,
            `dispatcher config: ${dispatcherConfig ?? "-"}`,
            `spring contexts: ${contextConfigPaths.join(", ") || "-"}`,
          ],
        },
        {
          key: "detailFrameworkRouting",
          lines: [
            `routing reason: ${entryPoint.reason}`,
            `sample request URLs: ${card.sampleRoutes.join(", ") || "-"}`,
            `handler mappings observed: ${linkedHandlerMappings.join(", ") || "-"}`,
            `method resolvers observed: ${linkedMethodResolvers.join(", ") || "-"}`,
            `view resolvers observed: ${linkedViewResolvers.join(" | ") || "-"}`,
            `resolved jsp examples: ${linkedResolvedViews.join(" | ") || "-"}`,
            `screen flows connected: ${linkedScreenFlows.length}`,
            `api flows connected: ${linkedApiFlows.length}`,
          ],
        },
        {
          key: "detailConfigs",
          lines: card.contextConfigs.length > 0
            ? card.contextConfigs.map((value) => `config: ${value}`)
            : ["config: -"],
        },
      ],
    });
  }

  return { frameworkFlowCards, frameworkDetails };
}

function collectLibraryAnchorCards(snapshot: AnalysisSnapshot): Array<{
  id: string;
  type: string;
  title: string;
  modulePath: string;
  classCount: number;
  configCount: number;
  serviceCount: number;
  daoCount: number;
  sampleConfigs: string[];
  topControllers: string[];
}> {
  const grouped = new Map<string, GraphNode[]>();

  for (const node of snapshot.nodes) {
    const libraryName = extractSharedLibraryName(node.path);
    if (!libraryName) {
      continue;
    }
    const existing = grouped.get(libraryName) ?? [];
    existing.push(node);
    grouped.set(libraryName, existing);
  }

  return Array.from(grouped.entries())
    .map(([libraryName, libraryNodes]) => {
      const configNodes = libraryNodes.filter((node) => node.type === "config");
      const serviceNodes = libraryNodes.filter((node) => node.type === "service");
      const daoNodes = libraryNodes.filter((node) => node.type === "dao");
      const classNodes = libraryNodes.filter((node) => node.type === "class");
      const libraryNodeIds = new Set(libraryNodes.map((node) => node.id));
      const samplePath = libraryNodes.find((node) => typeof node.path === "string")?.path ?? libraryName;
      const pathPrefix = samplePath.split(`${libraryName}/`)[0];
      const topControllers = snapshot.nodes
        .filter((node) => node.type === "controller")
        .map((controllerNode) => {
          const dependencyCount = snapshot.edges.filter((edge) =>
            edge.type === "depends_on" &&
            edge.from === controllerNode.id &&
            libraryNodeIds.has(edge.to),
          ).length;
          return {
            name: controllerNode.displayName ?? controllerNode.name,
            dependencyCount,
          };
        })
        .filter((item) => item.dependencyCount > 0)
        .sort((left, right) => right.dependencyCount - left.dependencyCount)
        .slice(0, 3)
        .map((item) => `${item.name} (${item.dependencyCount})`);

      return {
        id: `library-anchor:${libraryName}`,
        type: "library_anchor",
        title: libraryName,
        modulePath: pathPrefix ? `${pathPrefix}${libraryName}/` : `${libraryName}/`,
        classCount: classNodes.length,
        configCount: configNodes.length,
        serviceCount: serviceNodes.length,
        daoCount: daoNodes.length,
        sampleConfigs: uniqueStrings(configNodes.map((node) => node.path)).slice(0, 3),
        topControllers,
      };
    })
    .sort((left, right) =>
      (right.classCount + right.configCount + right.serviceCount + right.daoCount) -
      (left.classCount + left.configCount + left.serviceCount + left.daoCount),
    )
    .slice(0, 3);
}

function collectModuleProfileCards(
  snapshot: AnalysisSnapshot,
  screenFlowCards: RequestFlowCard[],
  apiFlowCards: RequestFlowCard[],
): ModuleProfileCard[] {
  const isApiStyleRoute = (route: string): boolean =>
    /(^|\/)(api|openapi|galaxyapi)(\/|$)|\/v[0-9]+(\/|$)|\.json($|[/?])/i.test(route);
  const isApiConfigPath = (path: string): boolean =>
    /(applicationContext(Api|Auth|Search|Bixby)|openapi|swagger)/i.test(path);
  const grouped = new Map<string, GraphNode[]>();

  for (const node of snapshot.nodes) {
    const moduleKey = extractModuleKey(node.path);
    if (!moduleKey || extractSharedLibraryName(node.path)) {
      continue;
    }
    const existing = grouped.get(moduleKey) ?? [];
    existing.push(node);
    grouped.set(moduleKey, existing);
  }

  return Array.from(grouped.entries())
    .map(([modulePath, nodes]) => {
      const screenFlows = screenFlowCards.filter((flow) => extractModuleKey(flow.controllerPath) === modulePath);
      const nonScreenFlows = apiFlowCards.filter((flow) => extractModuleKey(flow.controllerPath) === modulePath);
      const controllerNodes = nodes.filter((node) => node.type === "controller");
      const controllerHandlers = controllerNodes.flatMap((node) => getControllerRequestHandlers(node));
      const controllerCount = nodes.filter((node) => node.type === "controller").length;
      const serviceCount = nodes.filter((node) => node.type === "service").length;
      const configCount = nodes.filter((node) => node.type === "config").length;
      const apiConfigCount = nodes.filter((node) => typeof node.path === "string" && isApiConfigPath(node.path)).length;
      const responseBodyHandlerCount = controllerHandlers.filter((handler) => handler.responseBody).length;
      const totalHandlerCount = controllerHandlers.length;
      const sharedLibraryCount = uniqueStrings(nodes.map((node) => extractSharedLibraryName(node.path))).length;
      const moduleRoutes = uniqueStrings([
        ...screenFlows.flatMap((flow) => flow.routeValues),
        ...nonScreenFlows.flatMap((flow) => flow.routeValues),
        ...controllerHandlers.flatMap((handler) => handler.requestMappings),
      ]);
      const apiLikeRoutes = moduleRoutes.filter((route) => isApiStyleRoute(route));
      const routeHints = moduleRoutes.slice(0, 4);
      const hasApiStyleRoutes = apiLikeRoutes.length > 0;
      const apiRouteRatio = moduleRoutes.length > 0 ? apiLikeRoutes.length / moduleRoutes.length : 0;
      const responseBodyRatio = totalHandlerCount > 0 ? responseBodyHandlerCount / totalHandlerCount : 0;
      const hasLegacyWebSignals = nodes.some((node) => typeof node.path === "string" && /\/WebContent\/|\/WEB-INF\/jsp\//.test(node.path));
      const responseKindCounts = nonScreenFlows.reduce<Record<string, number>>((counts, flow) => {
        const key = flow.responseKind ?? "unknown";
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
      const jsonFlowCount = responseKindCounts.json ?? 0;
      const fileFlowCount = responseKindCounts.file ?? 0;
      const redirectFlowCount = responseKindCounts.redirect ?? 0;
      const actionFlowCount = responseKindCounts.action ?? 0;
      const apiStyleNonScreenRatio = nonScreenFlows.length > 0 ? (jsonFlowCount + fileFlowCount) / nonScreenFlows.length : 0;
      const apiScore = Math.min(5,
        (apiLikeRoutes.length >= 3 ? 1 : 0) +
        (apiRouteRatio >= 0.2 ? 1 : 0) +
        (responseBodyRatio >= 0.2 ? 1 : 0) +
        (apiConfigCount >= 2 ? 1 : 0) +
        (apiStyleNonScreenRatio >= 0.45 ? 1 : 0),
      );
      const webMvcScore = Math.min(5,
        (hasLegacyWebSignals ? 2 : 0) +
        (screenFlows.length > 0 ? 2 : 0) +
        (screenFlows.length >= nonScreenFlows.length ? 1 : 0),
      );
      const internalActionScore = Math.min(5,
        (nonScreenFlows.length > 0 && (actionFlowCount / nonScreenFlows.length) >= 0.5 ? 2 : 0) +
        (actionFlowCount >= fileFlowCount + jsonFlowCount ? 2 : 0) +
        (responseBodyRatio < 0.15 ? 1 : 0),
      );

      let profileLabel = "mixed web app";
      if (nonScreenFlows.length > 0 && screenFlows.length === 0 && apiScore >= 3 && webMvcScore <= 2) {
        profileLabel = "API-centric app";
      } else if (apiScore >= 3 && webMvcScore >= 3) {
        profileLabel = "API-centric mixed app";
      } else if (webMvcScore >= 4 && apiScore <= 2) {
        profileLabel = "MVC-heavy web app";
      } else if (screenFlows.length === 0 && nonScreenFlows.length > 0 && internalActionScore >= 3) {
        profileLabel = "non-screen endpoint app";
      }

      const evidence = uniqueStrings([
        `screen flows: ${screenFlows.length}`,
        `non-screen flows: ${nonScreenFlows.length}`,
        `profile scores: api=${apiScore}, web=${webMvcScore}, internal-action=${internalActionScore}`,
        nonScreenFlows.length > 0 ? `response kinds: json=${jsonFlowCount}, file=${fileFlowCount}, redirect=${redirectFlowCount}, action=${actionFlowCount}` : undefined,
        hasApiStyleRoutes ? `api-style routes: ${routeHints.join(", ")}` : undefined,
        apiLikeRoutes.length > 0 ? `api-like routes observed: ${apiLikeRoutes.length}/${moduleRoutes.length}` : undefined,
        totalHandlerCount > 0 ? `responseBody handlers: ${responseBodyHandlerCount}/${totalHandlerCount}` : undefined,
        apiConfigCount > 0 ? `api configs: ${apiConfigCount}` : undefined,
        hasLegacyWebSignals ? "web mvc signals: WebContent/JSP detected" : undefined,
        controllerCount > 0 ? `controllers: ${controllerCount}` : undefined,
        serviceCount > 0 ? `services: ${serviceCount}` : undefined,
        configCount > 0 ? `configs: ${configCount}` : undefined,
      ]);

      return {
        id: `module-profile:${modulePath}`,
        type: "module_profile",
        title: modulePath.split("/").pop() ?? modulePath,
        modulePath,
        profileLabel,
        evidence,
        screenFlowCount: screenFlows.length,
        nonScreenFlowCount: nonScreenFlows.length,
        controllerCount,
        serviceCount,
        configCount,
        sharedLibraryCount,
        responseKindCounts,
        profileScores: {
          api: apiScore,
          webMvc: webMvcScore,
          internalAction: internalActionScore,
        },
      };
    })
    .filter((card) => card.controllerCount > 0 || card.screenFlowCount > 0 || card.nonScreenFlowCount > 0)
    .sort((left, right) =>
      (right.screenFlowCount + right.nonScreenFlowCount + right.controllerCount) -
      (left.screenFlowCount + left.nonScreenFlowCount + left.controllerCount),
    )
    .slice(0, 8);
}

export function renderInteractiveHtmlReport(snapshot: AnalysisSnapshot): string {
  const title = `code2me report - ${snapshot.projectId}`;
  const dataFlowCards = collectDataFlowCards(snapshot);
  const screenCards = enrichScreenCardsWithDataFlow(collectScreenCards(snapshot), dataFlowCards);
  const { screenFlowCards, apiFlowCards, flowDetails } = buildRequestFlowCards(snapshot, screenCards, dataFlowCards);
  const { frameworkFlowCards, frameworkDetails } = collectFrameworkFlowCards(snapshot, screenFlowCards, apiFlowCards);
  const enrichedFlowDetails = enrichFlowDetailsWithBrowserEntry(
    snapshot,
    enrichFlowDetailsWithUiActions(
      snapshot,
      [...frameworkDetails, ...flowDetails],
      [...screenFlowCards, ...apiFlowCards],
    ),
    [...screenFlowCards, ...apiFlowCards],
  );
  const largeSnapshotMode = snapshot.nodes.length + snapshot.edges.length + snapshot.artifacts.length > 6000;
  const uiSnapshot = buildUiSnapshot(snapshot, {
    compact: largeSnapshotMode,
    includeEdges: false,
    includeArtifacts: false,
    nodeTypes: ["project", "module", "deployment_unit", "config"],
  });
  const reportData: ReportPayload = {
    projectId: snapshot.projectId,
    profileId: snapshot.profileId,
    createdAt: snapshot.createdAt,
    counts: {
      nodes: snapshot.nodes.length,
      edges: snapshot.edges.length,
      entryPoints: snapshot.entryPoints.length,
      warnings: snapshot.warnings.length,
    },
    snapshot: uiSnapshot,
    nodeCounts: collectNodeCounts(snapshot),
    screenCards,
    primaryFlowCards: collectPrimaryFlowCards(screenCards),
    dataFlowCards,
    frameworkFlowCards,
    screenFlowCards,
    apiFlowCards,
    flowDetails: enrichedFlowDetails,
    moduleProfileCards: collectModuleProfileCards(snapshot, screenFlowCards, apiFlowCards),
    libraryAnchorCards: collectLibraryAnchorCards(snapshot),
    largeSnapshotMode,
    rawSnapshotPath: "snapshot.json",
    detailPaths: {
      explore: "explore.html",
      evidence: "evidence.html",
      raw: "raw.html",
      screenFlows: "screen-flows.html",
      apiFlows: "api-flows.html",
      flowDetails: "flow-details.html",
      architecture: "architecture-context.html",
    },
    flowTotals: {
      screenFlowCards: screenFlowCards.length,
      apiFlowCards: apiFlowCards.length,
      flowDetails: enrichedFlowDetails.length,
      dataFlowCards: dataFlowCards.length,
    },
    snapshotTotals: {
      nodes: snapshot.nodes.length,
      edges: snapshot.edges.length,
      entryPoints: snapshot.entryPoints.length,
      warnings: snapshot.warnings.length,
      artifacts: snapshot.artifacts.length,
    },
  };

  const translations = {
    ko: {
      reportTag: "인터랙티브 분석 리포트",
      reportTitle: "code2me 분석 요약",
      profile: "프로파일",
      generatedAt: "생성 시각",
      language: "언어",
      viewMode: "보기 방식",
      listView: "가로형",
      cardView: "카드형",
      searchPlaceholder: "이름, 경로, 타입, 설명으로 검색...",
      allTypes: "전체 타입",
      allConfidence: "전체 신뢰도",
      high: "높음",
      medium: "보통",
      low: "낮음",
      nodes: "객체 수",
      edges: "관계 수",
      entryPoints: "진입점 수",
      warnings: "경고 수",
      startHere: "시작점 / Start Here",
      frameworkFlow: "프레임워크 흐름 / Framework Flow",
      screenFlow: "화면 흐름 / Screen Flows",
      apiFlow: "논스크린 흐름 / Non-screen Flows",
      flowDetail: "흐름 상세 / Flow Details",
      supporting: "아키텍처 맥락 / Architecture Context",
      explore: "탐색 / Explore",
      evidence: "근거 / Evidence",
      raw: "원본 / JSON",
      projectSummary: "프로젝트 요약",
      howToRead: "어떻게 보면 되나",
      startHereGuide1: "먼저 Framework Flow에서 web.xml 부터 프론트 컨트롤러 설정 흐름을 본다.",
      startHereGuide2: "그다음 Screen Flows 또는 Non-screen Flows에서 요청 흐름을 고른다.",
      startHereGuide3: "각 카드의 흐름 상세 보기에서 Controller -> Service -> DAO -> View/Response를 따라간다.",
      representativeScreenFlows: "대표 화면 흐름",
      representativeApiFlows: "대표 논스크린 흐름",
      bootstrapSummary: "부트스트랩 요약",
      keyFlows: "핵심 흐름",
      screenCount: "화면 흐름 수",
      apiCount: "논스크린 흐름 수",
      dataCount: "데이터 흐름 수",
      libraryAnchor: "공통 모듈 허브",
      libraryClasses: "관련 클래스",
      libraryConfigs: "관련 설정",
      libraryServices: "관련 서비스",
      libraryDaos: "관련 DAO",
      topControllers: "주요 연결 컨트롤러",
      relatedData: "추정 데이터 경로",
      sharedModules: "공통 모듈",
      moduleProfiles: "모듈 성격",
      moduleProfileLabel: "모듈 프로파일",
      moduleEvidence: "판단 신호",
      runtimeContext: "런타임 맥락",
      runtimeContextGuide: "이 탭은 현재 흐름 뒤의 추정 데이터 경로와 공통 모듈을 요약한다. 전체 구조 인벤토리는 Explore에서 본다.",
      possibleBackendPath: "추정 경로",
      dataFlowMeaning: "이 카드는 이 요청들 뒤에서 공통으로 보이는 추정 데이터 경로를 요약한다.",
      inferredWarning: "정적 분석 기반 추정 결과이며 실제 실행 경로와 다를 수 있다.",
      inferenceLevelLabel: "추정 등급",
      evidenceKindsLabel: "근거 종류",
      hiddenCandidateReason: "약한 근거 또는 fallback 기반 후보라서 기본적으로 숨겨진다.",
      showHiddenDataPaths: "숨겨진 추정 후보 보기",
      hideHiddenDataPaths: "숨겨진 추정 후보 숨기기",
      hiddenCandidatesSummary: "기본 숨김 후보",
      inferenceLevelConfirmed: "근거 강함",
      inferenceLevelInferred: "추정",
      inferenceLevelHeuristic: "휴리스틱",
      evidenceKindControllerServiceEdge: "컨트롤러-서비스 의존",
      evidenceKindControllerBinding: "요청-컨트롤러 연결",
      evidenceKindServiceDaoEdge: "서비스-DAO 의존",
      evidenceKindBizDaoEdge: "비즈-DAO 의존",
      evidenceKindDaoMapperEdge: "DAO-매퍼 직접 연결",
      evidenceKindSqlCall: "DAO SQL 호출",
      evidenceKindIntegrationCall: "외부 연동 호출",
      evidenceKindNameFallback: "이름 기반 fallback",
      linkedRequests: "연결된 요청",
      requestList: "요청 URL 목록",
      evidenceBasis: "판단 근거",
      showAllRequests: "전체 요청 보기",
      notConfirmed: "미확인",
      notLinked: "미연결",
      notTracedYet: "추적 실패",
      modulesCount: "모듈 수",
      deploymentsCount: "배포 단위 수",
      configsCount: "핵심 설정 수",
      viewInExplore: "Explore에서 전체 구조 보기",
      service: "서비스",
      biz: "비즈",
      openDataFlow: "데이터 흐름 보기",
      openFlowDetail: "흐름 상세 보기",
      showAllRoutes: "전체 URL 보기",
      noItems: "일치하는 항목이 없습니다",
      resultCount: "조회 건수",
      requestUrl: "요청 URL",
      entryPattern: "진입 패턴",
      dispatcher: "프론트 컨트롤러",
      dispatcherConfig: "스프링 설정",
      mappingFile: "매핑 설정 파일",
      handlerMapping: "핸들러 매핑",
      methodResolver: "메서드 리졸버",
      bean: "빈",
      controller: "컨트롤러",
      className: "클래스",
      controllerFile: "컨트롤러 파일",
      actionMethod: "액션 메서드",
      view: "화면",
      layout: "레이아웃",
      response: "응답",
      responseKindLabel: "응답 종류",
      responseKindJson: "JSON",
      responseKindFile: "파일",
      responseKindRedirect: "리다이렉트",
      responseKindAction: "액션",
      responseKindUnknown: "미확인",
      dao: "DAO",
      integration: "외부 연동",
      mapper: "매퍼",
      sql: "SQL",
      responseTagsLabel: "응답 태그",
      downloadTag: "다운로드",
      ajaxTag: "AJAX",
      internalUiLinkedTag: "화면 내부 연결",
      externalFacingCandidateTag: "외부 연동 후보",
      path: "경로",
      confidence: "신뢰도",
      modules: "모듈",
      deployments: "배포 단위",
      configs: "설정 파일",
      rawSnapshot: "원본 스냅샷",
      largeSnapshotNotice: "대형 결과라서 먼저 일부만 보여준다. 검색/필터를 쓰거나 상세 페이지로 이동할 수 있다.",
      openSnapshotFile: "snapshot.json 열기",
      screenFlowEmpty: "화면 흐름이 아직 식별되지 않았습니다",
      apiFlowEmpty: "논스크린 흐름이 아직 식별되지 않았습니다",
      frameworkFlowEmpty: "프레임워크 흐름이 아직 식별되지 않았습니다",
      flowDetailEmpty: "먼저 흐름 하나를 선택하면 상세가 표시됩니다",
      structureEmpty: "구조 항목이 없습니다",
      artifactsTab: "분석 근거",
      type: "타입",
      detailEntrySetup: "1. Entry Setup",
      detailRequestPath: "2. Request Path",
      detailBusinessSteps: "3. Business Steps",
      detailDataAccess: "4. Data Access",
      detailOutput: "5. View / Response",
      detailUiActions: "6. UI Actions",
      detailConfigs: "7. Related Configs",
      detailFrameworkBootstrap: "1. Framework Bootstrap",
      detailFrameworkRouting: "2. Routing Rules",
      selectedFlow: "선택된 흐름",
      nextFlow: "다음 흐름",
      currentSelection: "현재 선택된 흐름",
      selectedRoute: "선택된 경로",
      flowKind: "흐름 종류",
      resultTarget: "결과 대상",
      sourceTab: "진입 위치",
      backToList: "원래 목록으로 돌아가기",
      selectedFlowHint: "지금 보고 있는 흐름과 진입 위치를 먼저 확인한 뒤 상세 단계를 읽으면 된다.",
      openFullPage: "전체 목록 페이지 열기",
      largeFlowPreviewNotice: "대형 프로젝트라서 이 탭은 미리보기만 보여준다. 전체 목록은 분리 페이지에서 연다.",
    },
    en: {
      reportTag: "Interactive analysis report",
      reportTitle: "code2me Analysis Summary",
      profile: "Profile",
      generatedAt: "Generated at",
      language: "Language",
      viewMode: "View",
      listView: "List",
      cardView: "Cards",
      searchPlaceholder: "Search by name, path, type, reason...",
      allTypes: "All Types",
      allConfidence: "All Confidence",
      high: "High",
      medium: "Medium",
      low: "Low",
      nodes: "Nodes",
      edges: "Edges",
      entryPoints: "Entry Points",
      warnings: "Warnings",
      startHere: "Start Here",
      frameworkFlow: "Framework Flow",
      screenFlow: "Screen Flows",
      apiFlow: "Non-screen Flows",
      flowDetail: "Flow Details",
      supporting: "Architecture Context",
      explore: "Explore",
      evidence: "Evidence",
      raw: "Raw / JSON",
      projectSummary: "Project Summary",
      howToRead: "How to read this report",
      startHereGuide1: "Start with Framework Flow to see how web.xml and the front controller route requests.",
      startHereGuide2: "Then choose a screen flow or a non-screen flow.",
      startHereGuide3: "Open flow details to follow Controller -> Service -> DAO -> View/Response.",
      representativeScreenFlows: "Representative Screen Flows",
      representativeApiFlows: "Representative Non-screen Flows",
      bootstrapSummary: "Bootstrap Summary",
      keyFlows: "Key Flows",
      screenCount: "Screen flows",
      apiCount: "Non-screen flows",
      dataCount: "Data flows",
      libraryAnchor: "Shared Module Hubs",
      libraryClasses: "Classes",
      libraryConfigs: "Config files",
      libraryServices: "Services",
      libraryDaos: "DAOs",
      topControllers: "Top Controllers",
      relatedData: "Inferred Data Paths",
      sharedModules: "Shared Modules",
      moduleProfiles: "Module Profiles",
      moduleProfileLabel: "Module profile",
      moduleEvidence: "Evidence",
      runtimeContext: "Runtime Context",
      runtimeContextGuide: "This tab summarizes inferred data paths and shared modules behind the current flows. Use Explore for the full structure inventory.",
      possibleBackendPath: "Inferred path",
      dataFlowMeaning: "This card summarizes an inferred data path that these requests appear to share.",
      inferredWarning: "This is an inferred result from static analysis and may differ from the actual runtime path.",
      inferenceLevelLabel: "Inference level",
      evidenceKindsLabel: "Evidence kinds",
      hiddenCandidateReason: "Hidden by default because the evidence is weak or relies on fallback matching.",
      showHiddenDataPaths: "Show hidden inferred candidates",
      hideHiddenDataPaths: "Hide hidden inferred candidates",
      hiddenCandidatesSummary: "Hidden candidates",
      inferenceLevelConfirmed: "Confirmed",
      inferenceLevelInferred: "Inferred",
      inferenceLevelHeuristic: "Heuristic",
      evidenceKindControllerServiceEdge: "controller-service dependency",
      evidenceKindControllerBinding: "request-controller binding",
      evidenceKindServiceDaoEdge: "service-dao dependency",
      evidenceKindBizDaoEdge: "biz-dao dependency",
      evidenceKindDaoMapperEdge: "dao-mapper direct edge",
      evidenceKindSqlCall: "dao sql call",
      evidenceKindIntegrationCall: "integration call",
      evidenceKindNameFallback: "name-based fallback",
      linkedRequests: "Linked Requests",
      requestList: "Request URLs",
      evidenceBasis: "Evidence Basis",
      showAllRequests: "Show all requests",
      notConfirmed: "Not confirmed",
      notLinked: "Not linked",
      notTracedYet: "Not traced yet",
      modulesCount: "Modules",
      deploymentsCount: "Deployments",
      configsCount: "Key Configs",
      viewInExplore: "View full structure in Explore",
      service: "Service",
      biz: "Biz",
      openDataFlow: "Open Data Flow",
      openFlowDetail: "Open Flow Details",
      showAllRoutes: "Show all URLs",
      noItems: "No matching items",
      resultCount: "Results",
      requestUrl: "Request URL",
      entryPattern: "Entry Pattern",
      dispatcher: "Front Controller",
      dispatcherConfig: "Spring Config",
      mappingFile: "Mapping File",
      handlerMapping: "Handler Mapping",
      methodResolver: "Method Resolver",
      bean: "Bean",
      controller: "Controller",
      className: "Class",
      controllerFile: "Controller File",
      actionMethod: "Action Method",
      view: "View",
      layout: "Layout",
      response: "Response",
      responseKindLabel: "Response kind",
      responseKindJson: "JSON",
      responseKindFile: "File",
      responseKindRedirect: "Redirect",
      responseKindAction: "Action",
      responseKindUnknown: "Unknown",
      dao: "DAO",
      integration: "Integration",
      mapper: "Mapper",
      sql: "SQL",
      responseTagsLabel: "Response tags",
      downloadTag: "Download",
      ajaxTag: "Ajax",
      internalUiLinkedTag: "Screen-linked",
      externalFacingCandidateTag: "External-facing candidate",
      path: "Path",
      confidence: "Confidence",
      modules: "Modules",
      deployments: "Deployments",
      configs: "Config files",
      rawSnapshot: "Raw Snapshot",
      largeSnapshotNotice: "Large result detected. Showing a preview first. Use search/filter or the detail pages.",
      openSnapshotFile: "Open snapshot.json",
      screenFlowEmpty: "No screen flow identified yet",
      apiFlowEmpty: "No non-screen flow identified yet",
      frameworkFlowEmpty: "No framework flow identified yet",
      flowDetailEmpty: "Select a flow first to see the detail view",
      structureEmpty: "No structural items",
      artifactsTab: "Evidence",
      type: "Type",
      detailEntrySetup: "1. Entry Setup",
      detailRequestPath: "2. Request Path",
      detailBusinessSteps: "3. Business Steps",
      detailDataAccess: "4. Data Access",
      detailOutput: "5. View / Response",
      detailUiActions: "6. UI Actions",
      detailConfigs: "7. Related Configs",
      detailFrameworkBootstrap: "1. Framework Bootstrap",
      detailFrameworkRouting: "2. Routing Rules",
      selectedFlow: "Selected Flow",
      nextFlow: "Next Flow",
      currentSelection: "Current Selection",
      selectedRoute: "Selected Route",
      flowKind: "Flow Kind",
      resultTarget: "Result Target",
      sourceTab: "Opened From",
      backToList: "Back to Source List",
      selectedFlowHint: "Check the selected flow and where it came from before reading the detailed steps.",
      openFullPage: "Open Full Page",
      largeFlowPreviewNotice: "This tab shows only a preview for large projects. Open the split page for the full list.",
    },
  };

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(title)}</title>`,
    "  <style>",
    "    :root { --bg: #f3efe7; --panel: #fffdf8; --ink: #1d1d1b; --muted: #6d665f; --line: #ded5c7; --accent: #14532d; --accent-soft: #dff3e5; --warn: #92400e; --warn-soft: #ffedd5; --shadow: 0 12px 30px rgba(29, 29, 27, 0.08); }",
    "    * { box-sizing: border-box; }",
    '    body { margin: 0; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; color: var(--ink); background: radial-gradient(circle at top left, #fff8e8 0, transparent 30%), linear-gradient(180deg, #f7f2e8 0%, #efe8dc 100%); }',
    "    .layout { max-width: 1440px; margin: 0 auto; padding: 24px; display: grid; gap: 20px; }",
    "    .hero, .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }",
    "    .hero { padding: 24px; display: grid; gap: 16px; }",
    "    .hero-top { display: flex; justify-content: space-between; gap: 12px; align-items: start; flex-wrap: wrap; }",
    "    .hero h1 { margin: 0; font-size: clamp(28px, 4vw, 42px); line-height: 1.05; }",
    "    .meta { color: var(--muted); font-size: 14px; }",
    "    .toolbar-stack { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }",
    "    .lang-btn, .view-btn { border: 1px solid var(--line); background: white; border-radius: 999px; padding: 8px 12px; cursor: pointer; font: inherit; }",
    "    .lang-btn.active, .view-btn.active { background: var(--accent); color: white; border-color: var(--accent); }",
    "    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }",
    "    .card { padding: 14px; border-radius: 16px; background: #faf6ee; border: 1px solid var(--line); }",
    "    .card strong { display: block; font-size: 28px; margin-bottom: 4px; }",
    "    .controls { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }",
    "    input, select { width: 100%; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; font: inherit; background: white; }",
    "    .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }",
    "    .tab { border: 0; border-radius: 999px; padding: 10px 14px; font: inherit; background: #ece4d6; color: var(--ink); cursor: pointer; }",
    "    .tab.active { background: var(--accent); color: white; }",
    "    .panel { padding: 20px; }",
    "    .list { display: grid; gap: 10px; }",
    "    .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }",
    "    .wide-list { display: grid; gap: 12px; }",
    "    .item { padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: white; }",
    "    .item.supporting { background: #fcfaf5; border-style: dashed; }",
    "    .item.supporting.heuristic { background: #fff8ef; border-color: #efc38a; }",
    "    .item.selected { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: #f7fcf8; }",
    "    .item.wide { width: 100%; }",
    "    .item-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }",
    "    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; }",
    "    .flow-chain { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 10px 0 12px; padding: 12px; border-radius: 14px; background: #f6f1e7; border: 1px solid var(--line); }",
    "    .flow-step { display: inline-flex; align-items: baseline; gap: 6px; padding: 6px 10px; border-radius: 999px; background: white; border: 1px solid var(--line); }",
    "    .flow-step strong { font-size: 12px; color: var(--muted); }",
    "    .flow-step span { font-size: 13px; }",
    "    .flow-arrow { color: var(--muted); font-size: 14px; }",
    "    .action-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }",
    "    .action-btn { border: 1px solid var(--line); background: white; border-radius: 999px; padding: 8px 12px; cursor: pointer; font: inherit; }",
    "    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 10px; font-size: 12px; background: #efe7da; color: #4c463f; }",
    "    .pill.conf-high { background: var(--accent-soft); color: var(--accent); }",
    "    .pill.conf-medium { background: #e0ecff; color: #1d4ed8; }",
    "    .pill.conf-low { background: var(--warn-soft); color: var(--warn); }",
    "    .pill.tag-confirmed { background: #dff3e5; color: #14532d; }",
    "    .pill.tag-inferred { background: #e0ecff; color: #1d4ed8; }",
    "    .pill.tag-heuristic { background: #ffedd5; color: #9a3412; }",
    "    .secondary { color: var(--muted); font-size: 14px; word-break: break-word; }",
    "    .secondary.warning { color: #7c4a12; }",
    "    .supporting-note { margin-bottom: 12px; padding: 12px 14px; border: 1px solid #efc38a; border-radius: 14px; background: #fff6e8; color: #7c4a12; }",
    "    .supporting-note strong { display: block; margin-bottom: 4px; }",
    "    .details { margin-top: 10px; }",
    "    .details summary { cursor: pointer; color: var(--accent); font-size: 13px; }",
    "    .details-body { margin-top: 8px; display: grid; gap: 6px; }",
    "    .detail-panel { display: grid; gap: 14px; }",
    "    .context-bar { position: sticky; top: 12px; z-index: 2; padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: linear-gradient(180deg, #f7fcf8 0%, #eef6f1 100%); box-shadow: 0 8px 18px rgba(29, 29, 27, 0.06); }",
    "    .context-top { display: flex; justify-content: space-between; align-items: start; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }",
    "    .context-breadcrumb { color: var(--muted); font-size: 13px; }",
    "    .context-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }",
    "    .context-cell { padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.72); border: 1px solid var(--line); }",
    "    .context-cell strong { display: block; margin-bottom: 4px; font-size: 12px; color: var(--muted); }",
    "    .context-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }",
    "    .detail-section { padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: #fcfaf5; }",
    "    .detail-section h4 { margin: 0 0 10px; font-size: 15px; }",
    "    .empty { padding: 20px; border: 1px dashed var(--line); border-radius: 14px; color: var(--muted); text-align: center; background: #fcfaf5; }",
    "    .hidden { display: none; }",
    "    .section-title { margin: 0 0 12px; font-size: 18px; }",
    "    @media (max-width: 900px) { .controls { grid-template-columns: 1fr; } }",
    "  </style>",
    "</head>",
    "<body>",
    '  <div class="layout">',
    '    <section class="hero">',
    '      <div class="hero-top">',
    "        <div>",
    '          <div id="report-tag" class="meta"></div>',
    '          <div id="report-title" class="meta"></div>',
    `          <h1>${escapeHtml(snapshot.projectId)}</h1>`,
    `          <div class="meta"><span id="profile-label"></span>: <strong>${escapeHtml(snapshot.profileId)}</strong> · <span id="generated-label"></span> ${escapeHtml(snapshot.createdAt)}</div>`,
    "        </div>",
    '        <div class="toolbar-stack">',
    '          <span id="view-mode-label" class="meta"></span>',
    '          <button id="view-list" class="view-btn" type="button"></button>',
    '          <button id="view-cards" class="view-btn" type="button"></button>',
    "        </div>",
    '        <div class="toolbar-stack">',
    '          <span id="language-label" class="meta"></span>',
    '          <button id="lang-ko" class="lang-btn" type="button">KR</button>',
    '          <button id="lang-en" class="lang-btn" type="button">EN</button>',
    "        </div>",
    "      </div>",
    '      <div class="cards">',
    `        <div class="card"><strong>${snapshot.nodes.length}</strong><span data-i18n="nodes"></span></div>`,
    `        <div class="card"><strong>${snapshot.edges.length}</strong><span data-i18n="edges"></span></div>`,
    `        <div class="card"><strong>${screenFlowCards.length}</strong><span data-i18n="screenCount"></span></div>`,
    `        <div class="card"><strong>${apiFlowCards.length}</strong><span data-i18n="apiCount"></span></div>`,
    "      </div>",
    '      <div class="controls">',
    '        <input id="search" type="search" />',
    '        <select id="type-filter"><option value=""></option></select>',
    '        <select id="confidence-filter"><option value=""></option><option value="high"></option><option value="medium"></option><option value="low"></option></select>',
    "      </div>",
    "    </section>",
    '    <section class="panel">',
    '      <div class="tabs">',
    '        <button class="tab active" data-tab="start-here"></button>',
    '        <button class="tab" data-tab="framework-flow"></button>',
    '        <button class="tab" data-tab="screen-flow"></button>',
    '        <button class="tab" data-tab="api-flow"></button>',
    '        <button class="tab" data-tab="flow-detail"></button>',
    '        <button class="tab" data-tab="supporting"></button>',
    '        <button class="tab" data-tab="explore"></button>',
    '        <button class="tab" data-tab="evidence"></button>',
    '        <button class="tab" data-tab="raw"></button>',
    "      </div>",
    '      <div id="start-here" class="tab-panel"></div>',
    '      <div id="framework-flow" class="tab-panel hidden"></div>',
    '      <div id="screen-flow" class="tab-panel hidden"></div>',
    '      <div id="api-flow" class="tab-panel hidden"></div>',
    '      <div id="flow-detail" class="tab-panel hidden"></div>',
    '      <div id="supporting" class="tab-panel hidden"></div>',
    '      <div id="explore" class="tab-panel hidden"></div>',
    '      <div id="evidence" class="tab-panel hidden"></div>',
    '      <div id="raw" class="tab-panel hidden"></div>',
    "    </section>",
    "  </div>",
    "  <script>",
    `    const report = ${JSON.stringify(reportData)};`,
    `    const translations = ${JSON.stringify(translations)};`,
    '    const savedLanguage = localStorage.getItem("code2me-lang");',
    '    const savedViewMode = localStorage.getItem("code2me-view-mode");',
    '    const browserLanguage = (navigator.language || "en").toLowerCase().startsWith("ko") ? "ko" : "en";',
    '    const state = { tab: "start-here", search: "", type: "", confidence: "", lang: savedLanguage || browserLanguage, viewMode: savedViewMode || "list", selectedFlowId: report.flowDetails[0]?.id || "", showHiddenDataPaths: false };',
    '    const searchCache = new Map();',
    '    const panelCache = new Map();',
    '    const tabs = Array.from(document.querySelectorAll(".tab"));',
    '    const searchInput = document.getElementById("search");',
    '    const typeFilter = document.getElementById("type-filter");',
    '    const confidenceFilter = document.getElementById("confidence-filter");',
    '    const langKo = document.getElementById("lang-ko");',
    '    const langEn = document.getElementById("lang-en");',
    '    const viewList = document.getElementById("view-list");',
    '    const viewCards = document.getElementById("view-cards");',
    '    function esc(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll(\'"\', "&quot;").replaceAll("\'", "&#39;"); }',
    '    function t(key) { return translations[state.lang][key] || key; }',
    '    function confidenceLabel(value) { return value ? t(value) : ""; }',
    '    function inferenceLevelLabel(value) { if (value === "confirmed") return t("inferenceLevelConfirmed"); if (value === "inferred") return t("inferenceLevelInferred"); if (value === "heuristic") return t("inferenceLevelHeuristic"); return value || ""; }',
    '    function evidenceKindLabel(value) { if (value === "controller-service-edge") return t("evidenceKindControllerServiceEdge"); if (value === "controller-binding") return t("evidenceKindControllerBinding"); if (value === "service-dao-edge") return t("evidenceKindServiceDaoEdge"); if (value === "biz-dao-edge") return t("evidenceKindBizDaoEdge"); if (value === "dao-mapper-edge") return t("evidenceKindDaoMapperEdge"); if (value === "sql-call") return t("evidenceKindSqlCall"); if (value === "integration-call") return t("evidenceKindIntegrationCall"); if (value === "name-fallback") return t("evidenceKindNameFallback"); return value || ""; }',
    '    function pill(content, extra) { return \'<span class="pill \' + (extra || "") + \'">\' + esc(content) + "</span>"; }',
    '    function itemHtml(title, lines, pills, wide) { return \'<div class="item\' + (wide ? " wide" : "") + \'"><div class="item-top"><div><strong>\' + esc(title) + \'</strong></div><div class="pill-row">\' + (pills || []).join("") + \'</div></div>\' + lines.map((line) => \'<div class="secondary">\' + line + "</div>").join("") + "</div>"; }',
    '    function flowStep(label, value) { return \'<span class="flow-step"><strong>\' + esc(label) + \'</strong><span>\' + esc(value || "-") + "</span></span>"; }',
    '    function openDataFlow(searchTerm) { state.tab = "supporting"; state.search = String(searchTerm || "").toLowerCase(); state.showHiddenDataPaths = true; searchInput.value = searchTerm || ""; invalidatePanelCache(); render(); }',
    '    function openFlowDetail(detailId) { state.selectedFlowId = detailId; state.tab = "flow-detail"; invalidatePanelCache(); render(); }',
    '    function inferSourceTab(detail) { if (!detail) return "screen-flow"; if (detail.type === "framework_flow_detail") return "framework-flow"; if (detail.type === "api_flow_detail") return "api-flow"; return "screen-flow"; }',
    '    function sourceTabLabel(detail) { const tabId = inferSourceTab(detail); if (tabId === "framework-flow") return t("frameworkFlow"); if (tabId === "api-flow") return t("apiFlow"); return t("screenFlow"); }',
    '    function detailResultTarget(detail) { const outputSection = (detail.sections || []).find((section) => section.key === "detailOutput"); const sectionLines = outputSection && Array.isArray(outputSection.lines) ? outputSection.lines : []; const resultLine = sectionLines.find((line) => line.startsWith("view: ") || line.startsWith("layout: ") || line.startsWith("result: ") || line.startsWith("resolved jsp candidates: ")); if (resultLine && resultLine.includes(": ")) { return resultLine.split(": ").slice(1).join(": ") || "-"; } return detail.summary || "-"; }',
    '    function detailPrimaryRoute(detail) { const requestSection = (detail.sections || []).find((section) => section.key === "detailRequestPath" || section.key === "detailFrameworkRouting"); const sectionLines = requestSection && Array.isArray(requestSection.lines) ? requestSection.lines : []; const routeLine = sectionLines.find((line) => line.startsWith("request URL: ") || line.startsWith("sample request URLs: ")); if (routeLine && routeLine.includes(": ")) { return routeLine.split(": ").slice(1).join(": ") || detail.title; } return detail.title; }',
    '    function detailControllerName(detail) { const requestSection = (detail.sections || []).find((section) => section.key === "detailRequestPath" || section.key === "detailFrameworkRouting"); const sectionLines = requestSection && Array.isArray(requestSection.lines) ? requestSection.lines : []; const controllerLine = sectionLines.find((line) => line.startsWith("controller: ") || line.startsWith("dispatcher: ")); if (controllerLine && controllerLine.includes(": ")) { return controllerLine.split(": ").slice(1).join(": ") || "-"; } return (detail.summary.split(" -> ")[1]) || "-"; }',
    '    function responseTagLabel(tag) { if (tag === "download") return t("downloadTag"); if (tag === "ajax") return t("ajaxTag"); if (tag === "internal-ui-linked") return t("internalUiLinkedTag"); if (tag === "external-facing candidate") return t("externalFacingCandidateTag"); return tag; }',
    '    function responseKindLabel(kind) { if (kind === "json") return t("responseKindJson"); if (kind === "file") return t("responseKindFile"); if (kind === "redirect") return t("responseKindRedirect"); if (kind === "action") return t("responseKindAction"); if (kind === "unknown") return t("responseKindUnknown"); return kind || t("responseKindUnknown"); }',
    '    function requestFlowHtml(flow, wide) { const routeText = flow.route || flow.title; const outputLabel = flow.view || flow.layout ? t("view") : t("response"); const outputValue = flow.view || flow.layout || flow.responseType || "-"; const chain = \'<div class="flow-chain">\' + [flowStep(t("requestUrl"), routeText), flowStep(t("dispatcher"), flow.dispatcher || "-"), flowStep(t("controller"), flow.controller || "-"), flowStep(outputLabel, outputValue)].join(\'<span class="flow-arrow">→</span>\') + "</div>"; const routeDetails = (flow.routeValues || []).length > 2 ? \'<details class="details"><summary>\' + esc(t("showAllRoutes") + " (" + flow.routeValues.length + ")") + \'</summary><div class="details-body">\' + flow.routeValues.map((value) => \'<div class="secondary">\' + esc(value) + "</div>").join("") + "</div></details>" : ""; const responseKind = flow.responseKind ? [esc(t("responseKindLabel") + ": " + responseKindLabel(flow.responseKind))] : []; const responseTags = Array.isArray(flow.responseTags) && flow.responseTags.length > 0 ? [esc(t("responseTagsLabel") + ": " + flow.responseTags.map(responseTagLabel).join(", "))] : []; const integration = Array.isArray(flow.integration) && flow.integration.length > 0 ? [esc(t("integration") + ": " + flow.integration.join(", "))] : []; const lines = [esc(t("entryPattern") + ": " + (flow.entryPattern || "-")), esc(t("dispatcherConfig") + ": " + (flow.dispatcherConfig || "-")), esc(t("controllerFile") + ": " + (flow.controllerPath || "-")), esc(t("actionMethod") + ": " + (flow.action || "-")), esc(t("service") + ": " + (flow.service || "-")), esc(t("biz") + ": " + (flow.biz || "-")), esc(t("dao") + ": " + (flow.dao || "-")), esc(t("mapper") + ": " + (flow.mapper || "-")), esc(t("sql") + ": " + (flow.sql || "-")), ...integration, ...responseKind, ...responseTags, esc("variants: " + String(flow.variantCount || 1))]; const extraPills = (flow.responseKind ? [pill(responseKindLabel(flow.responseKind), "tag-response-kind")] : []).concat(Array.isArray(flow.responseTags) ? flow.responseTags.map((tag) => pill(responseTagLabel(tag), "tag-" + tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase())) : []); const actions = [\'<button class="action-btn" type="button" data-open-flow-detail="\' + esc(flow.detailId) + \'">\' + esc(t("openFlowDetail")) + "</button>"]; if (flow.relatedDataSearchTerm) { actions.push(\'<button class="action-btn" type="button" data-open-data-flow="\' + esc(flow.relatedDataSearchTerm) + \'">\' + esc(t("openDataFlow")) + "</button>"); } const selectedClass = state.selectedFlowId === flow.detailId ? " selected" : ""; return \'<div class="item\' + selectedClass + (wide ? " wide" : "") + \'"><div class="item-top"><div><strong>\' + esc(flow.title) + \'</strong></div><div class="pill-row">\' + [pill(flow.type), ...extraPills, pill(confidenceLabel(flow.confidence), "conf-" + flow.confidence)].join("") + \'</div></div>\' + chain + routeDetails + lines.map((line) => \'<div class="secondary">\' + line + "</div>").join("") + \'<div class="action-row">\' + actions.join("") + "</div></div>"; }',
    '    function frameworkFlowHtml(flow, wide) { const chain = \'<div class="flow-chain">\' + [flowStep(t("entryPattern"), flow.entryPattern || "-"), flowStep(t("dispatcher"), flow.dispatcher || "-"), flowStep(t("dispatcherConfig"), flow.dispatcherConfig || "-"), flowStep(t("screenFlow"), String(flow.screenFlowCount) + " / " + t("apiFlow") + " " + String(flow.apiFlowCount))].join(\'<span class="flow-arrow">→</span>\') + "</div>"; const lines = [esc(t("requestUrl") + ": " + ((flow.sampleRoutes || []).slice(0, 3).join(", ") || "-")), esc(t("dispatcherConfig") + ": " + (flow.contextConfigs || []).join(", "))]; const actions = \'<div class="action-row"><button class="action-btn" type="button" data-open-flow-detail="\' + esc(flow.detailId) + \'">\' + esc(t("openFlowDetail")) + "</button></div>"; const selectedClass = state.selectedFlowId === flow.detailId ? " selected" : ""; return \'<div class="item\' + selectedClass + (wide ? " wide" : "") + \'"><div class="item-top"><div><strong>\' + esc(flow.title) + \'</strong></div><div class="pill-row">\' + [pill(flow.type), pill(confidenceLabel(flow.confidence), "conf-" + flow.confidence)].join("") + \'</div></div>\' + chain + lines.map((line) => \'<div class="secondary">\' + line + "</div>").join("") + actions + "</div>"; }',
    '    function sectionHtml(title, inner, useGrid) { const modeClass = useGrid ? (state.viewMode === "cards" ? "grid" : "wide-list") : "list"; return \'<div><h3 class="section-title">\' + esc(title) + \'</h3><div class="\' + modeClass + \'">\' + inner + "</div></div>"; }',
    '    function titleWithCount(title, count) { return title + " (" + count + ")"; }',
    '    function renderList(items, renderItem) { if (!items.length) { return \'<div class="empty">\' + esc(t("noItems")) + "</div>"; } return items.map(renderItem).join(""); }',
    '    function getSearchText(record) { if (searchCache.has(record)) return searchCache.get(record); const skipKeys = new Set(["evidence", "payload", "metadata"]); const parts = []; const visit = (value, depth) => { if (value == null || depth > 2) return; if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") { parts.push(String(value)); return; } if (Array.isArray(value)) { value.slice(0, 12).forEach((item) => visit(item, depth + 1)); return; } if (typeof value === "object") { Object.entries(value).forEach(([key, entry]) => { if (!skipKeys.has(key)) visit(entry, depth + 1); }); } }; visit(record, 0); const haystack = parts.join(" ").toLowerCase(); searchCache.set(record, haystack); return haystack; }',
    '    function matchesCommon(record) { if (state.search && !getSearchText(record).includes(state.search)) return false; if (state.type && record.type !== state.type) return false; if (state.confidence && record.confidence !== state.confidence) return false; return true; }',
    '    function invalidatePanelCache() { panelCache.clear(); }',
    '    function updateStaticText() {',
    '      document.getElementById("report-tag").textContent = t("reportTag");',
    '      document.getElementById("report-title").textContent = t("reportTitle");',
    '      document.getElementById("profile-label").textContent = t("profile");',
    '      document.getElementById("generated-label").textContent = t("generatedAt");',
    '      document.getElementById("language-label").textContent = t("language");',
    '      document.getElementById("view-mode-label").textContent = t("viewMode");',
    '      viewList.textContent = t("listView");',
    '      viewCards.textContent = t("cardView");',
    '      searchInput.placeholder = t("searchPlaceholder");',
    '      typeFilter.options[0].textContent = t("allTypes");',
    '      confidenceFilter.options[0].textContent = t("allConfidence");',
    '      confidenceFilter.options[1].textContent = t("high");',
    '      confidenceFilter.options[2].textContent = t("medium");',
    '      confidenceFilter.options[3].textContent = t("low");',
    '      document.querySelector(\'button[data-tab="start-here"]\').textContent = t("startHere");',
    '      document.querySelector(\'button[data-tab="framework-flow"]\').textContent = t("frameworkFlow");',
    '      document.querySelector(\'button[data-tab="screen-flow"]\').textContent = t("screenFlow");',
    '      document.querySelector(\'button[data-tab="api-flow"]\').textContent = t("apiFlow");',
    '      document.querySelector(\'button[data-tab="flow-detail"]\').textContent = t("flowDetail");',
    '      document.querySelector(\'button[data-tab="supporting"]\').textContent = t("supporting");',
    '      document.querySelector(\'button[data-tab="explore"]\').textContent = t("explore");',
    '      document.querySelector(\'button[data-tab="evidence"]\').textContent = t("evidence");',
    '      document.querySelector(\'button[data-tab="raw"]\').textContent = t("raw");',
    '      document.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });',
    '      langKo.classList.toggle("active", state.lang === "ko");',
    '      langEn.classList.toggle("active", state.lang === "en");',
    '      viewList.classList.toggle("active", state.viewMode === "list");',
    '      viewCards.classList.toggle("active", state.viewMode === "cards");',
    '    }',
    '    const typeValues = new Set([].concat(report.snapshot.nodes.map((node) => node.type), report.frameworkFlowCards.map((card) => card.type), report.screenFlowCards.map((card) => card.type), report.apiFlowCards.map((card) => card.type), report.dataFlowCards.map((card) => card.type), report.flowDetails.map((detail) => detail.type)));',
    '    Array.from(typeValues).sort().forEach((type) => { const option = document.createElement("option"); option.value = type; option.textContent = type; typeFilter.appendChild(option); });',
    '    tabs.forEach((tab) => { tab.addEventListener("click", () => { state.tab = tab.dataset.tab; render(); }); });',
    '    document.addEventListener("click", (event) => { const element = event.target instanceof Element ? event.target : null; if (!element) return; const dataFlowTarget = element.closest("[data-open-data-flow]"); if (dataFlowTarget) { const searchTerm = dataFlowTarget.getAttribute("data-open-data-flow") || ""; openDataFlow(searchTerm); return; } const hiddenToggleTarget = element.closest("[data-toggle-hidden-data-paths]"); if (hiddenToggleTarget) { state.showHiddenDataPaths = !state.showHiddenDataPaths; invalidatePanelCache(); render(); return; } const detailTarget = element.closest("[data-open-flow-detail]"); if (detailTarget) { const detailId = detailTarget.getAttribute("data-open-flow-detail") || ""; openFlowDetail(detailId); return; } const tabTarget = element.closest("[data-tab-target]"); if (tabTarget) { state.tab = tabTarget.getAttribute("data-tab-target") || "start-here"; invalidatePanelCache(); render(); } });',
    '    searchInput.addEventListener("input", () => { state.search = searchInput.value.toLowerCase(); invalidatePanelCache(); render(); });',
    '    typeFilter.addEventListener("change", () => { state.type = typeFilter.value; invalidatePanelCache(); render(); });',
    '    confidenceFilter.addEventListener("change", () => { state.confidence = confidenceFilter.value; invalidatePanelCache(); render(); });',
    '    langKo.addEventListener("click", () => { state.lang = "ko"; localStorage.setItem("code2me-lang", state.lang); invalidatePanelCache(); render(); });',
    '    langEn.addEventListener("click", () => { state.lang = "en"; localStorage.setItem("code2me-lang", state.lang); invalidatePanelCache(); render(); });',
    '    viewList.addEventListener("click", () => { state.viewMode = "list"; localStorage.setItem("code2me-view-mode", state.viewMode); invalidatePanelCache(); render(); });',
    '    viewCards.addEventListener("click", () => { state.viewMode = "cards"; localStorage.setItem("code2me-view-mode", state.viewMode); invalidatePanelCache(); render(); });',
    '    function renderStartHere() { const guides = [t("startHereGuide1"), t("startHereGuide2"), t("startHereGuide3")].map((line) => \'<div class="secondary">• \' + esc(line) + "</div>").join(""); const bootstrapItems = renderList(report.frameworkFlowCards.filter(matchesCommon), (flow) => frameworkFlowHtml(flow, true)); const screenItems = renderList(report.screenFlowCards.filter(matchesCommon).slice(0, 5), (flow) => requestFlowHtml(flow, true)); const apiItems = renderList(report.apiFlowCards.filter(matchesCommon).slice(0, 5), (flow) => requestFlowHtml(flow, true)); const keyItems = renderList([{ id: "flows" }], () => itemHtml(t("keyFlows"), [esc(t("screenCount") + ": " + report.screenFlowCards.length), esc(t("apiCount") + ": " + report.apiFlowCards.length), esc(t("dataCount") + ": " + report.dataFlowCards.length)], [], true)); return sectionHtml(t("howToRead"), guides, false) + sectionHtml(t("bootstrapSummary"), bootstrapItems, false) + sectionHtml(t("representativeScreenFlows"), screenItems, false) + sectionHtml(t("representativeApiFlows"), apiItems, false) + sectionHtml(t("projectSummary"), keyItems, false); }',
    '    function renderFrameworkFlow() { const filtered = report.frameworkFlowCards.filter(matchesCommon); const items = renderList(filtered, (card) => frameworkFlowHtml(card, state.viewMode === "list")); return sectionHtml(titleWithCount(t("frameworkFlow"), filtered.length), items, true); }',
    '    function hasActiveFilter() { return Boolean(state.search || state.type || state.confidence); }',
    '    function renderLargePreview(tabKey, detailPath, previewCount, totalCount, itemsHtml) {',
    '      const summary = itemHtml(t(tabKey), [esc(t("largeFlowPreviewNotice")), esc(t("resultCount") + ": " + String(totalCount)), esc("preview: " + String(previewCount))], [], true);',
    '      const actions = \'<div class="action-row"><a class="action-btn" href="\' + esc(detailPath) + \'" target="_blank" rel="noreferrer">\' + esc(t("openFullPage")) + "</a></div>";',
    '      return sectionHtml(titleWithCount(t(tabKey), totalCount), summary + actions + itemsHtml, false);',
    '    }',
    '    function renderScreenFlow() {',
    '      const filtered = report.screenFlowCards.filter(matchesCommon);',
    '      if (report.largeSnapshotMode) {',
    '        const previewItems = hasActiveFilter() ? filtered : filtered.slice(0, 40);',
    '        const items = renderList(previewItems, (card) => requestFlowHtml(card, true));',
    '        return renderLargePreview("screenFlow", report.detailPaths.screenFlows, previewItems.length, filtered.length, items);',
    '      }',
    '      return sectionHtml(titleWithCount(t("screenFlow"), filtered.length), renderList(filtered, (card) => requestFlowHtml(card, state.viewMode === "list")), true);',
    '    }',
    '    function renderApiFlow() {',
    '      const filtered = report.apiFlowCards.filter(matchesCommon);',
    '      if (report.largeSnapshotMode) {',
    '        const previewItems = hasActiveFilter() ? filtered : filtered.slice(0, 40);',
    '        const items = renderList(previewItems, (card) => requestFlowHtml(card, true));',
    '        return renderLargePreview("apiFlow", report.detailPaths.apiFlows, previewItems.length, filtered.length, items);',
    '      }',
    '      return sectionHtml(titleWithCount(t("apiFlow"), filtered.length), renderList(filtered, (card) => requestFlowHtml(card, state.viewMode === "list")), true);',
    '    }',
    '    function renderFlowDetail() {',
    '      if (report.largeSnapshotMode) {',
    '        const filtered = report.flowDetails.filter(matchesCommon);',
    '        const visible = hasActiveFilter() ? filtered : filtered.slice(0, 8);',
    '        const previewItems = visible.map((detail) => itemHtml(detail.title, [esc(detail.summary)], [pill(detail.type)].concat(detail.responseKind ? [pill(responseKindLabel(detail.responseKind), "tag-response-kind")] : []).concat((detail.responseTags || []).map((tag) => pill(responseTagLabel(tag), "tag-" + tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase()))).concat([pill(confidenceLabel(detail.confidence), "conf-" + detail.confidence)]), true)).join("");',
    '        return renderLargePreview("flowDetail", report.detailPaths.flowDetails, visible.length, filtered.length, previewItems);',
    '      }',
    '      const detail = report.flowDetails.find((item) => item.id === state.selectedFlowId);',
    '      if (!detail) {',
    '        return sectionHtml(t("flowDetail"), \'<div class="empty">\' + esc(t("flowDetailEmpty")) + "</div>", false);',
    '      }',
    '      const sections = detail.sections.map((section) => {',
    '        const linesHtml = section.lines.map((line) => \'<div class="secondary">\' + esc(line) + "</div>").join("");',
    '        const actionHtml = (section.actions || []).map((action) => {',
    '          const nextText = action.nextTitle ? \' <span class="secondary">→ \' + esc(action.nextTitle) + "</span>" : "";',
    '          const openBtn = action.nextDetailId ? \' <button class="action-btn" type="button" data-open-flow-detail="\' + esc(action.nextDetailId) + \'">\' + esc(t("nextFlow")) + "</button>" : "";',
    '          return \'<div class="action-row"><span class="secondary">\' + esc(action.kind + ": " + action.label + " -> " + action.target) + "</span>" + nextText + openBtn + "</div>";',
    '        }).join("");',
    '        return \'<div class="detail-section"><h4>\' + esc(t(section.key)) + \'</h4><div class="list">\' + linesHtml + actionHtml + "</div></div>";',
    '      }).join("");',
    '      const actions = detail.relatedDataSearchTerm ? \'<div class="action-row"><button class="action-btn" type="button" data-open-data-flow="\' + esc(detail.relatedDataSearchTerm) + \'">\' + esc(t("openDataFlow")) + "</button></div>" : "";',
    '      const contextBar = [',
    '        \'<div class="context-bar" aria-live="polite"><div class="context-top"><div><div class="context-breadcrumb">\' + esc(sourceTabLabel(detail) + " > " + detail.title + " > " + t("flowDetail")) + \'</div><strong>\' + esc(t("currentSelection")) + \'</strong><div class="secondary">\' + esc(t("selectedFlowHint")) + \'</div></div>\',',
    '        \'<div class="pill-row">\' + [pill(detail.type), pill(confidenceLabel(detail.confidence), "conf-" + detail.confidence)].join("") + \'</div></div>\',',
    '        \'<div class="context-grid"><div class="context-cell"><strong>\' + esc(t("selectedRoute")) + \'</strong><span>\' + esc(detailPrimaryRoute(detail)) + \'</span></div><div class="context-cell"><strong>\' + esc(t("flowKind")) + \'</strong><span>\' + esc(sourceTabLabel(detail)) + \'</span></div><div class="context-cell"><strong>\' + esc(t("controller")) + \'</strong><span>\' + esc(detailControllerName(detail)) + \'</span></div><div class="context-cell"><strong>\' + esc(t("resultTarget")) + \'</strong><span>\' + esc(detailResultTarget(detail)) + \'</span></div></div>\',',
    '        \'<div class="context-actions"><button class="action-btn" type="button" data-tab-target="\' + esc(inferSourceTab(detail)) + \'">\' + esc(t("backToList")) + \'</button></div></div>\',',
    '      ].join("");',
    '      const summary = \'<div class="item wide"><div class="item-top"><div><strong>\' + esc(detail.title) + \'</strong></div><div class="pill-row">\' + [pill(detail.type)].concat(detail.responseKind ? [pill(responseKindLabel(detail.responseKind), "tag-response-kind")] : []).concat((detail.responseTags || []).map((tag) => pill(responseTagLabel(tag), "tag-" + tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase()))).concat([pill(confidenceLabel(detail.confidence), "conf-" + detail.confidence)]).join("") + \'</div></div><div class="secondary">\' + esc(detail.summary) + "</div>" + actions + "</div>";',
    '      return sectionHtml(t("selectedFlow"), contextBar + summary + \'<div class="detail-panel">\' + sections + "</div>", false);',
    '    }',
    '    function renderSupporting() {',
    '      const filteredData = report.dataFlowCards.filter(matchesCommon);',
    '      const defaultVisibleData = filteredData.filter((card) => !card.hiddenByDefault);',
    '      const hiddenData = filteredData.filter((card) => card.hiddenByDefault);',
    '      const selectedData = state.showHiddenDataPaths ? filteredData : defaultVisibleData;',
    '      const visibleData = report.largeSnapshotMode && !hasActiveFilter() ? selectedData.slice(0, 40) : selectedData;',
    '      const dataItems = renderList(visibleData, (card) => {',
    '        const pathTitle = [card.controller || "-", card.service || card.biz || card.dao || "-", card.biz || card.dao || card.mapper || card.sql || "-", card.dao || card.mapper || card.sql ? (card.dao || card.mapper || card.sql || "-") : null].filter(Boolean).join(" → ");',
    '        const requestSummary = (card.routeValues || []).length > 0 ? ((card.routeValues || []).slice(0, 2).join(", ") + ((card.routeValues || []).length > 2 ? " +" + String((card.routeValues || []).length - 2) : "")) : (card.route || "-");',
    '        const requestDetails = (card.routeValues || []).length > 0 ? \'<details class="details"><summary>\' + esc(t("showAllRequests") + " (" + card.routeValues.length + ")") + \'</summary><div class="details-body"><div class="secondary">\' + esc(t("requestList")) + "</div>" + card.routeValues.map((value) => \'<div class="secondary">\' + esc(value) + "</div>").join("") + "</div></details>" : "";',
    '        const lines = [esc(t("inferredWarning")), esc(t("dataFlowMeaning")), esc(t("linkedRequests") + ": " + requestSummary), esc(t("inferenceLevelLabel") + ": " + inferenceLevelLabel(card.inferenceLevel)), esc(t("evidenceKindsLabel") + ": " + (card.evidenceKinds || []).map(evidenceKindLabel).join(", ")), esc(t("controller") + ": " + (card.controller || "-")), esc(t("service") + ": " + (card.service || t("notConfirmed"))), esc(t("biz") + ": " + (card.biz || t("notConfirmed"))), esc(t("dao") + ": " + (card.dao || t("notConfirmed"))), esc(t("mapper") + ": " + (card.mapper || t("notLinked"))), esc(t("sql") + ": " + (card.sql || t("notTracedYet"))), esc(t("integration") + ": " + ((card.integration || []).join(", ") || t("notConfirmed"))), esc(t("evidenceBasis") + ": " + (card.evidenceLabel || t("notConfirmed")))].concat(card.hiddenByDefault ? [esc(t("hiddenCandidateReason"))] : []);',
    '        return \'<div class="item supporting \' + (card.inferenceLevel === "heuristic" ? "heuristic " : "") + (state.viewMode === "list" ? "wide" : "") + \'"><div class="item-top"><div><strong>\' + esc(pathTitle || (card.route || card.id)) + \'</strong></div><div class="pill-row">\' + [pill(t("possibleBackendPath")), pill(inferenceLevelLabel(card.inferenceLevel), "tag-" + card.inferenceLevel), pill(card.type), pill(confidenceLabel(card.confidence), "conf-" + card.confidence)].join("") + \'</div></div>\' + lines.map((line) => \'<div class="secondary">\' + line + "</div>").join("") + requestDetails + "</div>";',
    '      });',
    '      const dataSummary = \'<div class="supporting-note"><strong>\' + esc(t("relatedData")) + \'</strong><div class="secondary">\' + esc(t("inferredWarning")) + \'</div><div class="secondary">\' + esc(t("hiddenCandidatesSummary") + ": " + hiddenData.length) + \'</div><div class="action-row"><button class="action-btn" type="button" data-toggle-hidden-data-paths="true">\' + esc(state.showHiddenDataPaths ? t("hideHiddenDataPaths") : t("showHiddenDataPaths")) + "</button></div></div>";',
    '      const filteredProfiles = report.moduleProfileCards.filter(matchesCommon);',
    '      const profileItems = renderList(filteredProfiles, (card) => itemHtml(card.title, [esc(t("moduleProfileLabel") + ": " + card.profileLabel), esc(t("path") + ": " + card.modulePath)].concat((card.evidence || []).map((line) => esc(t("moduleEvidence") + ": " + line))), [pill(card.type)], true));',
    '      const filteredLibraries = report.libraryAnchorCards.filter(matchesCommon);',
    '      const libraryItems = renderList(filteredLibraries, (card) => itemHtml(card.title, [esc(t("path") + ": " + card.modulePath), esc(t("libraryClasses") + ": " + card.classCount), esc(t("libraryConfigs") + ": " + card.configCount), esc(t("libraryServices") + ": " + card.serviceCount), esc(t("libraryDaos") + ": " + card.daoCount), esc(t("topControllers") + ": " + ((card.topControllers || []).join(", ") || "-"))], [pill(card.type)], true));',
    '      const structures = report.snapshot.nodes.filter((node) => ["module", "deployment_unit", "config"].includes(node.type));',
    '      const structureSummary = itemHtml(t("runtimeContext"), [esc(t("runtimeContextGuide")), esc(t("modulesCount") + ": " + String(structures.filter((node) => node.type === "module").length)), esc(t("deploymentsCount") + ": " + String(structures.filter((node) => node.type === "deployment_unit").length)), esc(t("configsCount") + ": " + String(structures.filter((node) => node.type === "config").length))], [], true) + \'<div class="action-row"><button class="action-btn" type="button" data-tab-target="explore">\' + esc(t("viewInExplore")) + "</button></div>";',
    '      if (report.largeSnapshotMode) {',
    '        return renderLargePreview("supporting", report.detailPaths.architecture, visibleData.length + filteredProfiles.length + filteredLibraries.length, selectedData.length + filteredProfiles.length + filteredLibraries.length, dataSummary + profileItems + dataItems + libraryItems + structureSummary);',
    '      }',
    '      return sectionHtml(titleWithCount(t("moduleProfiles"), filteredProfiles.length), profileItems, false) + sectionHtml(titleWithCount(t("relatedData"), selectedData.length), dataSummary + dataItems, true) + sectionHtml(titleWithCount(t("sharedModules"), filteredLibraries.length), libraryItems, false) + sectionHtml(t("runtimeContext"), structureSummary, false);',
    '    }',
    '    function renderExplore() { const lines = [esc(t("largeSnapshotNotice")), esc("nodes: " + report.snapshotTotals.nodes), esc("edges: " + report.snapshotTotals.edges), esc("entry points: " + report.snapshotTotals.entryPoints)]; const actions = \'<div class="action-row"><a class="action-btn" href="\' + esc(report.detailPaths.explore) + \'" target="_blank" rel="noreferrer">\' + esc(t("explore")) + ".html</a></div>"; return sectionHtml(t("explore"), itemHtml(t("explore"), lines, [], true) + actions, false); }',
    '    function renderEvidence() { const lines = [esc(t("largeSnapshotNotice")), esc("artifacts: " + report.snapshotTotals.artifacts), esc("warnings: " + report.snapshotTotals.warnings)]; const actions = \'<div class="action-row"><a class="action-btn" href="\' + esc(report.detailPaths.evidence) + \'" target="_blank" rel="noreferrer">\' + esc(t("evidence")) + ".html</a></div>"; return sectionHtml(t("evidence"), itemHtml(t("artifactsTab"), lines, [], true) + actions, false); }',
    '    function renderRaw() { const actions = \'<div class="action-row"><a class="action-btn" href="\' + esc(report.detailPaths.raw) + \'" target="_blank" rel="noreferrer">raw.html</a><a class="action-btn" href="\' + esc(report.rawSnapshotPath) + \'" target="_blank" rel="noreferrer">\' + esc(t("openSnapshotFile")) + "</a></div>"; return sectionHtml(t("rawSnapshot"), itemHtml(t("rawSnapshot"), [esc("nodes: " + report.snapshotTotals.nodes), esc("edges: " + report.snapshotTotals.edges), esc("artifacts: " + report.snapshotTotals.artifacts)], [], true) + actions, false); }',
    '    function renderPanel(tabId) { const cacheKey = [tabId, state.lang, state.search, state.type, state.confidence, state.selectedFlowId, state.viewMode, state.showHiddenDataPaths].join("::"); if (panelCache.has(cacheKey)) { document.getElementById(tabId).innerHTML = panelCache.get(cacheKey); return; } const html = (() => { if (tabId === "start-here") return renderStartHere(); if (tabId === "framework-flow") return renderFrameworkFlow(); if (tabId === "screen-flow") return renderScreenFlow(); if (tabId === "api-flow") return renderApiFlow(); if (tabId === "flow-detail") return renderFlowDetail(); if (tabId === "supporting") return renderSupporting(); if (tabId === "explore") return renderExplore(); if (tabId === "evidence") return renderEvidence(); if (tabId === "raw") return renderRaw(); return ""; })(); panelCache.set(cacheKey, html); document.getElementById(tabId).innerHTML = html; }',
    '    function render() { updateStaticText(); tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.tab)); document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== state.tab)); renderPanel(state.tab); }',
    '    render();',
    "  </script>",
    "</body>",
    "</html>",
  ].join("\n");
}

function renderStandalonePage(options: {
  title: string;
  heading: string;
  summaryLines: string[];
  sections: Array<{ title: string; items: string[] }>;
  links: Array<{ href: string; label: string }>;
}): string {
  const summaryHtml = options.summaryLines
    .map((line) => `<div class="secondary">${escapeHtml(line)}</div>`)
    .join("");
  const sectionsHtml = options.sections
    .map((section) => [
      `<div><h3 class="section-title">${escapeHtml(section.title)}</h3><div class="list">`,
      ...(section.items.length > 0
        ? section.items.map((item) => `<div class="item"><div class="secondary">${escapeHtml(item)}</div></div>`)
        : ['<div class="empty">No items</div>']),
      "</div></div>",
    ].join(""))
    .join("");
  const linksHtml = options.links
    .map((link) => `<a class="action-btn" href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`)
    .join("");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(options.title)}</title>`,
    "  <style>",
    "    :root { --bg: #f3efe7; --panel: #fffdf8; --ink: #1d1d1b; --muted: #6d665f; --line: #ded5c7; --accent: #14532d; --shadow: 0 12px 30px rgba(29, 29, 27, 0.08); }",
    "    * { box-sizing: border-box; }",
    '    body { margin: 0; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; color: var(--ink); background: radial-gradient(circle at top left, #fff8e8 0, transparent 30%), linear-gradient(180deg, #f7f2e8 0%, #efe8dc 100%); }',
    "    .layout { max-width: 1200px; margin: 0 auto; padding: 24px; display: grid; gap: 20px; }",
    "    .hero, .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }",
    "    .hero, .panel { padding: 20px; }",
    "    .list { display: grid; gap: 10px; }",
    "    .item { padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: white; }",
    "    .secondary { color: var(--muted); font-size: 14px; word-break: break-word; }",
    "    .action-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }",
    "    .action-btn { border: 1px solid var(--line); background: white; border-radius: 999px; padding: 8px 12px; cursor: pointer; font: inherit; color: inherit; text-decoration: none; }",
    "    .section-title { margin: 0 0 12px; font-size: 18px; }",
    "    .empty { padding: 20px; border: 1px dashed var(--line); border-radius: 14px; color: var(--muted); text-align: center; background: #fcfaf5; }",
    "  </style>",
    "</head>",
    "<body>",
    '  <div class="layout">',
    `    <section class="hero"><h1>${escapeHtml(options.heading)}</h1>${summaryHtml}<div class="action-row">${linksHtml}</div></section>`,
    `    <section class="panel">${sectionsHtml}</section>`,
    "  </div>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function renderExploreHtmlReport(snapshot: AnalysisSnapshot): string {
  const largeSnapshotMode = snapshot.nodes.length + snapshot.edges.length + snapshot.artifacts.length > 6000;
  const preview = buildUiSnapshot(snapshot, { compact: largeSnapshotMode, includeArtifacts: false });
  return renderStandalonePage({
    title: `code2me explore - ${snapshot.projectId}`,
    heading: `${snapshot.projectId} Explore`,
    summaryLines: [
      largeSnapshotMode ? "Large snapshot mode: preview only. Open snapshot.json for full raw data." : "Explore preview.",
      `nodes: ${snapshot.nodes.length}`,
      `edges: ${snapshot.edges.length}`,
      `entry points: ${snapshot.entryPoints.length}`,
    ],
    links: [
      { href: "report.html", label: "report.html" },
      { href: "snapshot.json", label: "snapshot.json" },
    ],
    sections: [
      {
        title: "Nodes Preview",
        items: preview.nodes.map((node) => `${node.type}: ${node.displayName ?? node.name}${node.path ? ` (${node.path})` : ""}`),
      },
      {
        title: "Edges Preview",
        items: preview.edges.map((edge) => `${edge.type}: ${edge.from} -> ${edge.to}`),
      },
      {
        title: "Entry Points Preview",
        items: preview.entryPoints.map((entryPoint) => `${entryPoint.title}: ${entryPoint.reason}`),
      },
    ],
  });
}

export function renderEvidenceHtmlReport(snapshot: AnalysisSnapshot): string {
  const largeSnapshotMode = snapshot.nodes.length + snapshot.edges.length + snapshot.artifacts.length > 6000;
  const preview = buildUiSnapshot(snapshot, { compact: largeSnapshotMode, includeEdges: false });
  return renderStandalonePage({
    title: `code2me evidence - ${snapshot.projectId}`,
    heading: `${snapshot.projectId} Evidence`,
    summaryLines: [
      largeSnapshotMode ? "Large snapshot mode: preview only. Open snapshot.json for full raw data." : "Evidence preview.",
      `artifacts: ${snapshot.artifacts.length}`,
      `warnings: ${snapshot.warnings.length}`,
    ],
    links: [
      { href: "report.html", label: "report.html" },
      { href: "snapshot.json", label: "snapshot.json" },
      { href: "summary.md", label: "summary.md" },
    ],
    sections: [
      {
        title: "Artifacts Preview",
        items: preview.artifacts.map((artifact) => `${artifact.type}: ${artifact.producerAdapterId} ${JSON.stringify(artifact.payload)}`),
      },
      {
        title: "Warnings",
        items: preview.warnings.map((warning) => `${warning.code}: ${warning.message}${warning.filePath ? ` (${warning.filePath})` : ""}`),
      },
    ],
  });
}

interface FlowReportData {
  dataFlowCards: DataFlowCard[];
  screenFlowCards: RequestFlowCard[];
  apiFlowCards: RequestFlowCard[];
  flowDetails: FlowDetailCard[];
  frameworkFlowCards: FrameworkFlowCard[];
  libraryAnchorCards: ReturnType<typeof collectLibraryAnchorCards>;
}

function buildFlowReportData(snapshot: AnalysisSnapshot): FlowReportData {
  const dataFlowCards = collectDataFlowCards(snapshot);
  const screenCards = enrichScreenCardsWithDataFlow(collectScreenCards(snapshot), dataFlowCards);
  const { screenFlowCards, apiFlowCards, flowDetails } = buildRequestFlowCards(snapshot, screenCards, dataFlowCards);
  const { frameworkFlowCards } = collectFrameworkFlowCards(snapshot, screenFlowCards, apiFlowCards);
  const enrichedFlowDetails = enrichFlowDetailsWithBrowserEntry(
    snapshot,
    enrichFlowDetailsWithUiActions(
      snapshot,
      flowDetails,
      [...screenFlowCards, ...apiFlowCards],
    ),
    [...screenFlowCards, ...apiFlowCards],
  );
  return {
    dataFlowCards,
    screenFlowCards,
    apiFlowCards,
    flowDetails: enrichedFlowDetails,
    frameworkFlowCards,
    libraryAnchorCards: collectLibraryAnchorCards(snapshot),
  };
}

export function renderScreenFlowsHtmlReport(snapshot: AnalysisSnapshot, flowData?: FlowReportData): string {
  const { screenFlowCards } = flowData ?? buildFlowReportData(snapshot);
  return renderStandalonePage({
    title: `code2me screen flows - ${snapshot.projectId}`,
    heading: `${snapshot.projectId} Screen Flows`,
    summaryLines: [
      "Full screen flow list split out of report.html for large-project viewing.",
      `screen flows: ${screenFlowCards.length}`,
    ],
    links: [
      { href: "report.html", label: "report.html" },
      { href: "flow-details.html", label: "flow-details.html" },
    ],
    sections: [
      {
        title: "Screen Flows",
        items: screenFlowCards.map((card) =>
          `${card.title} | route=${card.route ?? "-"} | controller=${card.controller ?? "-"} | action=${card.action ?? "-"} | view=${card.view ?? card.layout ?? "-"}`,
        ),
      },
    ],
  });
}

export function renderApiFlowsHtmlReport(snapshot: AnalysisSnapshot, flowData?: FlowReportData): string {
  const { apiFlowCards } = flowData ?? buildFlowReportData(snapshot);
  return renderStandalonePage({
    title: `code2me api flows - ${snapshot.projectId}`,
    heading: `${snapshot.projectId} Non-screen Flows`,
    summaryLines: [
      "Full non-screen flow list split out of report.html for large-project viewing.",
      `non-screen flows: ${apiFlowCards.length}`,
    ],
    links: [
      { href: "report.html", label: "report.html" },
      { href: "flow-details.html", label: "flow-details.html" },
    ],
    sections: [
      {
        title: "Non-screen Flows",
        items: apiFlowCards.map((card) =>
          `${card.title} | route=${card.route ?? "-"} | controller=${card.controller ?? "-"} | action=${card.action ?? "-"} | response=${card.responseType ?? "-"}`,
        ),
      },
    ],
  });
}

export function renderFlowDetailsHtmlReport(snapshot: AnalysisSnapshot, flowData?: FlowReportData): string {
  const { flowDetails } = flowData ?? buildFlowReportData(snapshot);
  return renderStandalonePage({
    title: `code2me flow details - ${snapshot.projectId}`,
    heading: `${snapshot.projectId} Flow Details`,
    summaryLines: [
      "Full flow detail index split out of report.html for large-project viewing.",
      `flow details: ${flowDetails.length}`,
    ],
    links: [
      { href: "report.html", label: "report.html" },
      { href: "screen-flows.html", label: "screen-flows.html" },
      { href: "api-flows.html", label: "api-flows.html" },
    ],
    sections: [
      {
        title: "Flow Detail Summaries",
        items: flowDetails.map((detail) => `${detail.title} | ${detail.summary}`),
      },
    ],
  });
}

export function renderArchitectureContextHtmlReport(snapshot: AnalysisSnapshot, flowData?: FlowReportData): string {
  const { dataFlowCards, libraryAnchorCards } = flowData ?? buildFlowReportData(snapshot);
  const visibleCards = dataFlowCards.filter((card) => !card.hiddenByDefault);
  const hiddenCards = dataFlowCards.filter((card) => card.hiddenByDefault);
  return renderStandalonePage({
    title: `code2me architecture context - ${snapshot.projectId}`,
    heading: `${snapshot.projectId} Architecture Context`,
    summaryLines: [
      "Full architecture context split out of report.html for large-project viewing.",
      `visible inferred data paths: ${visibleCards.length}`,
      `hidden inferred candidates: ${hiddenCards.length}`,
      `shared module hubs: ${libraryAnchorCards.length}`,
    ],
    links: [
      { href: "report.html", label: "report.html" },
      { href: "explore.html", label: "explore.html" },
    ],
    sections: [
      {
        title: "Inferred Data Paths",
        items: visibleCards.map((card) =>
          `${card.controller ?? "-"} -> ${card.service ?? "-"} -> ${card.dao ?? "-"} -> ${card.mapper ?? "-"} -> ${card.sql ?? "-"} | level=${card.inferenceLevel} | evidenceKinds=${card.evidenceKinds.join(",")} | evidence=${card.evidenceLabel}`,
        ),
      },
      {
        title: "Hidden Inferred Candidates",
        items: hiddenCards.map((card) =>
          `${card.controller ?? "-"} -> ${card.service ?? "-"} -> ${card.dao ?? "-"} -> ${card.mapper ?? "-"} -> ${card.sql ?? "-"} | level=${card.inferenceLevel} | hiddenByDefault=true | evidenceKinds=${card.evidenceKinds.join(",")} | evidence=${card.evidenceLabel}`,
        ),
      },
      {
        title: "Shared Modules",
        items: libraryAnchorCards.map((card) =>
          `${card.title} | path=${card.modulePath} | class=${card.classCount} | config=${card.configCount} | service=${card.serviceCount} | dao=${card.daoCount}`,
        ),
      },
    ],
  });
}

export function renderRawHtmlReport(snapshot: AnalysisSnapshot): string {
  return renderStandalonePage({
    title: `code2me raw - ${snapshot.projectId}`,
    heading: `${snapshot.projectId} Raw Data`,
    summaryLines: [
      "Open the raw snapshot file directly for the full result.",
      `nodes: ${snapshot.nodes.length}`,
      `edges: ${snapshot.edges.length}`,
      `artifacts: ${snapshot.artifacts.length}`,
    ],
    links: [
      { href: "report.html", label: "report.html" },
      { href: "screen-flows.html", label: "screen-flows.html" },
      { href: "api-flows.html", label: "api-flows.html" },
      { href: "flow-details.html", label: "flow-details.html" },
      { href: "architecture-context.html", label: "architecture-context.html" },
      { href: "explore.html", label: "explore.html" },
      { href: "evidence.html", label: "evidence.html" },
      { href: "snapshot.json", label: "snapshot.json" },
      { href: "summary.md", label: "summary.md" },
    ],
    sections: [
      {
        title: "Raw Access",
        items: [
          "Use snapshot.json for the full merged graph.",
          "Use summary.md for the compact markdown summary.",
          "Use report.html for the stable user-facing summary report.",
        ],
      },
    ],
  });
}

export function renderSplitFlowHtmlReports(snapshot: AnalysisSnapshot): {
  screenFlows: string;
  apiFlows: string;
  flowDetails: string;
  architecture: string;
} {
  const flowData = buildFlowReportData(snapshot);
  return {
    screenFlows: renderScreenFlowsHtmlReport(snapshot, flowData),
    apiFlows: renderApiFlowsHtmlReport(snapshot, flowData),
    flowDetails: renderFlowDetailsHtmlReport(snapshot, flowData),
    architecture: renderArchitectureContextHtmlReport(snapshot, flowData),
  };
}
