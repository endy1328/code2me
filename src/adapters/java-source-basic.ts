import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "java-parser";
import type { AdapterContext, AdapterInputSet, AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AdapterWarning, ArtifactRecord, GraphEdge, GraphNode } from "../core/model.js";
import { edgeId, nodeId } from "../utils/id.js";

function inferJavaRole(content: string, className: string): string {
  if (/@Controller\b/.test(content) || className.endsWith("Controller") || className.endsWith("Action")) {
    return "controller";
  }
  if (/@Service\b/.test(content) || className.endsWith("Service") || className.endsWith("ServiceImpl")) {
    return "service";
  }
  if (className.endsWith("Biz") || className.endsWith("BizImpl") || className.endsWith("BIZ")) {
    return "biz";
  }
  if (
    /@Repository\b/.test(content) ||
    className.endsWith("Dao") ||
    className.endsWith("DAO") ||
    className.endsWith("DaoImpl") ||
    className.endsWith("DAOImpl") ||
    className.endsWith("RepositoryImpl")
  ) {
    return "dao";
  }
  return "class";
}

function extractPackageName(content: string): string | undefined {
  return /^\s*package\s+([\w.]+)\s*;/m.exec(content)?.[1];
}

function extractImports(content: string): string[] {
  return Array.from(content.matchAll(/^\s*import\s+([\w.]+)\s*;/gm)).map((match) => match[1]).filter(Boolean) as string[];
}

function extractClassName(content: string): string | undefined {
  return /\b(class|interface)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(content)?.[2];
}

function inferDependencyType(typeName: string): string {
  if (typeName.endsWith("Controller") || typeName.endsWith("Action")) {
    return "controller";
  }
  if (typeName.endsWith("Service") || typeName.endsWith("ServiceImpl")) {
    return "service";
  }
  if (typeName.endsWith("Biz") || typeName.endsWith("BizImpl") || typeName.endsWith("BIZ")) {
    return "biz";
  }
  if (
    typeName.endsWith("Dao") ||
    typeName.endsWith("DAO") ||
    typeName.endsWith("DaoImpl") ||
    typeName.endsWith("DAOImpl") ||
    typeName.endsWith("Repository") ||
    typeName.endsWith("RepositoryImpl")
  ) {
    return "dao";
  }
  return "class";
}

function simplifyTypeName(rawType: string): string {
  return rawType
    .replace(/@\w+(?:\([^)]*\))?\s*/g, " ")
    .replace(/\b(final|volatile|transient)\b/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\]/g, " ")
    .trim()
    .split(/\s+/)
    .pop()
    ?.replace(/\? extends |\? super /g, "")
    ?? rawType.trim();
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

function extractParameterTypes(signature: string): string[] {
  return signature
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => simplifyTypeName(segment))
    .filter((value) => /^[A-Z][A-Za-z0-9_]*$/.test(value));
}

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ");
}

function extractTypedMembers(
  content: string,
  packageName: string | undefined,
  imports: string[],
): Array<{
  memberName: string;
  targetFqn: string;
  targetType: string;
  confidence: "medium" | "high";
  evidenceKind: string;
  evidenceValue: string;
}> {
  const members = new Map<string, {
    memberName: string;
    targetFqn: string;
    targetType: string;
    confidence: "medium" | "high";
    evidenceKind: string;
    evidenceValue: string;
  }>();

  const addMember = (
    memberName: string,
    simpleTypeName: string,
    confidence: "medium" | "high",
    evidenceKind: string,
    evidenceValue: string,
  ): void => {
    const targetType = inferDependencyType(simpleTypeName);
    if (targetType === "class") {
      return;
    }
    const targetFqn = resolveTypeName(simpleTypeName, imports, packageName);
    const existing = members.get(memberName);
    if (!existing || (existing.confidence === "medium" && confidence === "high")) {
      members.set(memberName, {
        memberName,
        targetFqn,
        targetType,
        confidence,
        evidenceKind,
        evidenceValue,
      });
    }
  };

  const fieldPattern = /((?:@\w+(?:\([^)]*\))?\s*)*)(?:(?:private|protected|public)\s+)?(?:static\s+)?(?:final\s+)?([A-Z][\w<>, ?\[\]]+)\s+([a-zA-Z_][A-Za-z0-9_]*)\s*(?:=|;)/g;
  for (const match of content.matchAll(fieldPattern)) {
    const annotationBlock = match[1] ?? "";
    const simpleTypeName = simplifyTypeName(match[2] ?? "");
    const fieldName = match[3] ?? simpleTypeName;
    const confidence = /@(Autowired|Inject|Resource)\b/.test(annotationBlock) ? "high" : "medium";
    addMember(fieldName, simpleTypeName, confidence, "java-field-type", `${fieldName}:${simpleTypeName}`);
  }

  return Array.from(members.values());
}

function extractTypedDependencies(
  content: string,
  className: string,
  packageName: string | undefined,
  imports: string[],
): Array<{ targetFqn: string; targetType: string; evidenceKind: string; evidenceValue: string; confidence: "medium" | "high" }> {
  const dependencies = new Map<string, { targetFqn: string; targetType: string; evidenceKind: string; evidenceValue: string; confidence: "medium" | "high" }>();

  const addDependency = (
    simpleTypeName: string,
    evidenceKind: string,
    evidenceValue: string,
    confidence: "medium" | "high",
  ): void => {
    const targetType = inferDependencyType(simpleTypeName);
    if (targetType === "class") {
      return;
    }
    const targetFqn = resolveTypeName(simpleTypeName, imports, packageName);
    const key = `${targetType}:${targetFqn}`;
    const existing = dependencies.get(key);
    if (!existing || (existing.confidence === "medium" && confidence === "high")) {
      dependencies.set(key, {
        targetFqn,
        targetType,
        evidenceKind,
        evidenceValue,
        confidence,
      });
    }
  };

  for (const member of extractTypedMembers(content, packageName, imports)) {
    addDependency(
      member.targetFqn.split(".").pop() ?? member.targetFqn,
      member.evidenceKind,
      member.evidenceValue,
      member.confidence,
    );
  }

  const constructorPattern = new RegExp(`(?:public|protected|private)\\s+${className}\\s*\\(([^)]*)\\)`, "g");
  for (const match of content.matchAll(constructorPattern)) {
    const parameterTypes = extractParameterTypes(match[1] ?? "");
    for (const parameterType of parameterTypes) {
      addDependency(parameterType, "java-constructor-param", parameterType, "high");
    }
  }

  const setterPattern = /(?:public|protected)\s+void\s+set[A-Z][A-Za-z0-9_]*\s*\(([^)]*)\)/g;
  for (const match of content.matchAll(setterPattern)) {
    const parameterTypes = extractParameterTypes(match[1] ?? "");
    for (const parameterType of parameterTypes) {
      addDependency(parameterType, "java-setter-param", parameterType, "medium");
    }
  }

  const instantiationPattern = /new\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
  for (const match of content.matchAll(instantiationPattern)) {
    const simpleTypeName = match[1] ?? "";
    addDependency(simpleTypeName, "java-instantiation", simpleTypeName, "medium");
  }

  return Array.from(dependencies.values());
}

function extractMappingValues(annotationText: string): string[] {
  const values = new Set<string>();
  const namedMatches = Array.from(annotationText.matchAll(/\b(?:value|path)\s*=\s*"([^"]+)"/g));
  for (const match of namedMatches) {
    if (match[1]) {
      values.add(match[1]);
    }
  }

  if (values.size === 0) {
    const directMatch = annotationText.match(/^\s*"([^"]+)"/);
    if (directMatch?.[1]) {
      values.add(directMatch[1]);
    }
  }

  return Array.from(values);
}

function normalizeViewName(raw: string): string {
  return raw
    .trim()
    .replace(/^redirect:/, "")
    .replace(/^forward:/, "")
    .replace(/^\/+/, "")
    .replace(/\.jsp$/, "");
}

function normalizeMappingPath(path: string): string {
  if (!path) {
    return path;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function combineMappingPaths(basePath: string | undefined, childPath: string | undefined): string {
  if (!basePath && !childPath) {
    return "/";
  }
  if (!basePath) {
    return normalizeMappingPath(childPath ?? "/");
  }
  if (!childPath) {
    return normalizeMappingPath(basePath);
  }
  return `${normalizeMappingPath(basePath).replace(/\/$/, "")}/${normalizeMappingPath(childPath).replace(/^\//, "")}`;
}

function extractRequestMappings(content: string): string[] {
  const classMatch = content.match(/((?:@\w+(?:\([^)]*\))?\s*)*)\bpublic\s+class\b/);
  const classAnnotationBlock = classMatch?.[1] ?? "";
  const classMappings = Array.from(classAnnotationBlock.matchAll(/@(?:RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(([^)]*)\)/g))
    .flatMap((match) => extractMappingValues(match[1] ?? ""));

  const methodMappings = Array.from(
    content.matchAll(/@(?:RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(([^)]*)\)\s*(?:@[^\n]+\s*)*(?:public|protected|private)\s+(?!class\b)/g),
  ).flatMap((match) => extractMappingValues(match[1] ?? ""));

  const mappings = new Set<string>();
  if (methodMappings.length > 0) {
    for (const methodMapping of methodMappings) {
      if (classMappings.length > 0) {
        for (const classMapping of classMappings) {
          mappings.add(combineMappingPaths(classMapping, methodMapping));
        }
      } else {
        mappings.add(normalizeMappingPath(methodMapping));
      }
    }
  }

  if (mappings.size === 0) {
    for (const classMapping of classMappings) {
      mappings.add(normalizeMappingPath(classMapping));
    }
  }

  return Array.from(mappings);
}

function collectViewNamesFromMethodBody(content: string): string[] {
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

function collectRedirectTargetsFromMethodBody(content: string): string[] {
  const targets = new Set<string>();
  const patterns = [
    /return\s+"redirect:([^"]+)"/g,
    /new\s+ModelAndView\s*\(\s*"redirect:([^"]+)"/g,
    /\.setViewName\s*\(\s*"redirect:([^"]+)"/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = (match[1] ?? "").trim().replace(/^\/+/, "");
      if (value) {
        targets.add(value);
      }
    }
  }

  return Array.from(targets);
}

function collectProducesFromAnnotation(annotationText: string): string[] {
  const values = new Set<string>();
  const patterns = [
    /\bproduces\s*=\s*"([^"]+)"/g,
    /\bproduces\s*=\s*\{([^}]+)\}/g,
  ];

  for (const pattern of patterns) {
    for (const match of annotationText.matchAll(pattern)) {
      const raw = match[1] ?? "";
      for (const quoted of raw.matchAll(/"([^"]+)"/g)) {
        if (quoted[1]) {
          values.add(quoted[1]);
        }
      }
      if (/^[^"]+\/[^"]+$/.test(raw.trim())) {
        values.add(raw.trim());
      }
    }
  }

  return Array.from(values);
}

function collectResponseContentTypes(methodBody: string, annotationBlock: string): string[] {
  const values = new Set<string>();
  const patterns = [
    /\.setContentType\s*\(\s*"([^"]+)"/g,
    /\.addHeader\s*\(\s*"Content-Type"\s*,\s*"([^"]+)"/g,
    /\.setHeader\s*\(\s*"Content-Type"\s*,\s*"([^"]+)"/g,
    /\.contentType\s*\(\s*MediaType\.([A-Z_]+)(?:_VALUE)?\s*\)/g,
  ];

  for (const value of collectProducesFromAnnotation(annotationBlock)) {
    values.add(value);
  }

  for (const pattern of patterns) {
    for (const match of methodBody.matchAll(pattern)) {
      const raw = match[1] ?? "";
      if (!raw) {
        continue;
      }
      values.add(raw.startsWith("APPLICATION_") ? raw.toLowerCase().replaceAll("_", "/") : raw);
    }
  }

  return Array.from(values);
}

function inferFileResponseHints(methodBody: string, contentTypes: string[]): string[] {
  const hints = new Set<string>();
  if (/Content-Disposition/i.test(methodBody) && /attachment/i.test(methodBody)) {
    hints.add("content-disposition-attachment");
  }
  if (/\b(HSSFWorkbook|XSSFWorkbook|SXSSFWorkbook|Workbook)\b/.test(methodBody)) {
    hints.add("excel-workbook");
  }
  if (/\b(getOutputStream|getWriter)\s*\(/.test(methodBody) && /\b(write|flush)\s*\(/.test(methodBody)) {
    hints.add("stream-write");
  }
  if (contentTypes.some((value) => /(excel|octet-stream|csv|pdf|zip|ms-excel|spreadsheetml)/i.test(value))) {
    hints.add("binary-content-type");
  }
  if (/\b(download|export|excel|attachment)\b/i.test(methodBody)) {
    hints.add("download-keyword");
  }
  return Array.from(hints);
}

function collectSqlStatementIds(methodBody: string): Array<{ statementId: string; operation: string }> {
  const calls = new Map<string, { statementId: string; operation: string }>();
  const patterns = [
    /\b(?:getSqlMapClientTemplate\s*\(\s*\)|sqlMapClient|sqlMapClientTemplate)\s*\.\s*(queryForList|queryForObject|queryForMap|insert|update|delete)\s*\(\s*"([^"]+)"/g,
    /\b(?:queryForList|queryForObject|queryForMap|insert|update|delete)\s*\(\s*"([^"]+)"/g,
  ];

  for (const pattern of patterns) {
    for (const match of methodBody.matchAll(pattern)) {
      const operation = pattern === patterns[0] ? (match[1] ?? "").trim() : "sql-call";
      const statementId = pattern === patterns[0] ? (match[2] ?? "").trim() : (match[1] ?? "").trim();
      if (!statementId) {
        continue;
      }
      const key = `${operation}:${statementId}`;
      if (!calls.has(key)) {
        calls.set(key, { statementId, operation });
      }
    }
  }

  return Array.from(calls.values());
}

function collectExternalCalls(methodBody: string): Array<{ kind: string; target: string }> {
  const calls = new Map<string, { kind: string; target: string }>();
  const addCall = (kind: string, target: string): void => {
    const normalized = target.trim();
    if (!normalized) {
      return;
    }
    const key = `${kind}:${normalized}`;
    if (!calls.has(key)) {
      calls.set(key, { kind, target: normalized });
    }
  };

  if (/\bHttpURLConnection\b/.test(methodBody) || /\.openConnection\s*\(/.test(methodBody)) {
    addCall("http", "HttpURLConnection");
  }
  if (/AStoreConfig\.getAccountingSystemURL\s*\(/.test(methodBody)) {
    addCall("external-api", "AStoreConfig.getAccountingSystemURL()");
  }
  for (const match of methodBody.matchAll(/new\s+URL\s*\(\s*([^;]+)\)/g)) {
    addCall("url", (match[1] ?? "").replace(/\s+/g, " ").slice(0, 200));
  }

  return Array.from(calls.values());
}

function extractMethodSummaries(
  content: string,
  packageName: string | undefined,
  imports: string[],
): Array<{
  methodName: string;
  dependencyCalls: Array<{ targetType: string; targetName: string; methodName: string }>;
  sqlCalls: Array<{ statementId: string; operation: string }>;
  externalCalls: Array<{ kind: string; target: string }>;
}> {
  const summaries: Array<{
    methodName: string;
    dependencyCalls: Array<{ targetType: string; targetName: string; methodName: string }>;
    sqlCalls: Array<{ statementId: string; operation: string }>;
    externalCalls: Array<{ kind: string; target: string }>;
  }> = [];
  const typedMembers = extractTypedMembers(content, packageName, imports);
  const memberIndex = new Map(typedMembers.map((member) => [member.memberName, member]));
  const signaturePattern = /((?:@\w+(?:\([^)]*\))?\s*)*)(?:public|protected|private)?\s*[\w<>\[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:throws\s+[^{]+)?\{/g;
  let match: RegExpExecArray | null;
  while ((match = signaturePattern.exec(content)) !== null) {
    const methodName = match[2] ?? "";
    const openBraceIndex = content.indexOf("{", match.index + match[0].length - 1);
    const closeBraceIndex = findMatchingBrace(content, openBraceIndex);
    const methodBody = content.slice(openBraceIndex + 1, closeBraceIndex);
    const dependencyCalls = Array.from(methodBody.matchAll(/\b(?:this\.)?([a-zA-Z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
      .map((callMatch) => {
        const memberName = callMatch[1] ?? "";
        const callMethodName = callMatch[2] ?? "";
        const member = memberIndex.get(memberName);
        if (!member || (member.targetType !== "service" && member.targetType !== "biz" && member.targetType !== "dao")) {
          return undefined;
        }
        return {
          targetType: member.targetType,
          targetName: member.targetFqn,
          methodName: callMethodName,
        };
      })
      .filter((value): value is { targetType: string; targetName: string; methodName: string } => Boolean(value));
    const sqlCalls = collectSqlStatementIds(methodBody);
    const externalCalls = collectExternalCalls(methodBody);
    if (sqlCalls.length > 0 || dependencyCalls.length > 0 || externalCalls.length > 0) {
      summaries.push({
        methodName,
        dependencyCalls: dependencyCalls.filter((call, index, array) =>
          array.findIndex((candidate) =>
            candidate.targetType === call.targetType &&
            candidate.targetName === call.targetName &&
            candidate.methodName === call.methodName,
          ) === index,
        ),
        sqlCalls,
        externalCalls,
      });
    }
    signaturePattern.lastIndex = closeBraceIndex + 1;
  }
  return summaries;
}

function findMatchingBrace(content: string, openBraceIndex: number): number {
  let depth = 0;
  for (let index = openBraceIndex; index < content.length; index += 1) {
    const char = content[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return content.length - 1;
}

function extractRequestHandlers(content: string): Array<{
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
  const classMatch = content.match(/((?:@\w+(?:\([^)]*\))?\s*)*)\bpublic\s+class\b/);
  const classAnnotationBlock = classMatch?.[1] ?? "";
  const classMappings = Array.from(classAnnotationBlock.matchAll(/@(?:RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(([^)]*)\)/g))
    .flatMap((match) => extractMappingValues(match[1] ?? ""));
  const handlers: Array<{
    methodName: string;
    requestMappings: string[];
    viewNames: string[];
    responseBody: boolean;
    produces: string[];
    contentTypes: string[];
    redirectTargets: string[];
    fileResponseHints: string[];
    serviceCalls: Array<{ targetType: string; targetName: string; methodName: string }>;
  }> = [];
  const typedMembers = extractTypedMembers(content, extractPackageName(content), extractImports(content));
  const memberIndex = new Map(typedMembers.map((member) => [member.memberName, member]));
  const signaturePattern = /((?:@\w+(?:\([^)]*\))?\s*)*)(?:public|protected|private)?\s*[\w<>\[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:throws\s+[^{]+)?\{/g;
  let match: RegExpExecArray | null;
  while ((match = signaturePattern.exec(content)) !== null) {
    const annotationBlock = match[1] ?? "";
    const methodName = match[2] ?? "";
    const mappingMatches = Array.from(annotationBlock.matchAll(/@(?:RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(([^)]*)\)/g));
    const openBraceIndex = content.indexOf("{", match.index + match[0].length - 1);
    const closeBraceIndex = findMatchingBrace(content, openBraceIndex);
    const methodBody = content.slice(openBraceIndex + 1, closeBraceIndex);
    const viewNames = collectViewNamesFromMethodBody(methodBody);
    const responseBody = /@ResponseBody\b/.test(annotationBlock);
    const produces = collectProducesFromAnnotation(annotationBlock);
    const contentTypes = collectResponseContentTypes(methodBody, annotationBlock);
    const redirectTargets = collectRedirectTargetsFromMethodBody(methodBody);
    const fileResponseHints = inferFileResponseHints(methodBody, contentTypes);
    const serviceCalls = Array.from(methodBody.matchAll(/\b(?:this\.)?([a-zA-Z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
      .map((callMatch) => {
        const memberName = callMatch[1] ?? "";
        const callMethodName = callMatch[2] ?? "";
        const member = memberIndex.get(memberName);
        if (!member || (member.targetType !== "service" && member.targetType !== "dao")) {
          return undefined;
        }
        return {
          targetType: member.targetType,
          targetName: member.targetFqn,
          methodName: callMethodName,
        };
      })
      .filter((value): value is { targetType: string; targetName: string; methodName: string } => Boolean(value));
    if (
      mappingMatches.length === 0 &&
      viewNames.length === 0 &&
      !responseBody &&
      serviceCalls.length === 0 &&
      produces.length === 0 &&
      contentTypes.length === 0 &&
      redirectTargets.length === 0 &&
      fileResponseHints.length === 0
    ) {
      signaturePattern.lastIndex = closeBraceIndex + 1;
      continue;
    }
    const methodMappings = mappingMatches.flatMap((mappingMatch) => extractMappingValues(mappingMatch[1] ?? ""));
    const requestMappings = methodMappings.length > 0
      ? (classMappings.length > 0
          ? methodMappings.flatMap((methodMapping) => classMappings.map((classMapping) => combineMappingPaths(classMapping, methodMapping)))
          : methodMappings.map((methodMapping) => normalizeMappingPath(methodMapping)))
      : [];
    handlers.push({
      methodName,
      requestMappings: Array.from(new Set(requestMappings)),
      viewNames,
      responseBody,
      produces,
      contentTypes,
      redirectTargets,
      fileResponseHints,
      serviceCalls: serviceCalls.filter((call, index, array) =>
        array.findIndex((candidate) =>
          candidate.targetType === call.targetType &&
          candidate.targetName === call.targetName &&
          candidate.methodName === call.methodName,
        ) === index,
      ),
    });
    signaturePattern.lastIndex = closeBraceIndex + 1;
  }
  return handlers;
}

function extractActionMethodHandlers(
  content: string,
  packageName: string | undefined,
  imports: string[],
  classRequestMappings: string[],
): Array<{
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
  const cleanContent = stripComments(content);
  const summaries = extractMethodSummaries(cleanContent, packageName, imports);
  const summaryByMethod = new Map(summaries.map((summary) => [summary.methodName, summary]));
  const handlers: Array<{
    methodName: string;
    requestMappings: string[];
    viewNames: string[];
    responseBody: boolean;
    produces: string[];
    contentTypes: string[];
    redirectTargets: string[];
    fileResponseHints: string[];
    serviceCalls: Array<{ targetType: string; targetName: string; methodName: string }>;
  }> = [];
  const signaturePattern = /(?:public|protected|private)?\s*[\w<>\[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\{/g;
  let match: RegExpExecArray | null;
  while ((match = signaturePattern.exec(cleanContent)) !== null) {
    const methodName = match[1] ?? "";
    const parameters = match[2] ?? "";
    if (!/(HttpServletRequest|HttpServletResponse|ModelMap|Model\b|Map\b)/.test(parameters)) {
      continue;
    }
    const openBraceIndex = cleanContent.indexOf("{", match.index + match[0].length - 1);
    const closeBraceIndex = findMatchingBrace(cleanContent, openBraceIndex);
    const methodBody = cleanContent.slice(openBraceIndex + 1, closeBraceIndex);
    const viewNames = collectViewNamesFromMethodBody(methodBody);
    const redirectTargets = collectRedirectTargetsFromMethodBody(methodBody);
    const contentTypes = collectResponseContentTypes(methodBody, "");
    const fileResponseHints = inferFileResponseHints(methodBody, contentTypes);
    const summary = summaryByMethod.get(methodName);
    const serviceCalls = (summary?.dependencyCalls ?? [])
      .filter((call) => call.targetType === "service" || call.targetType === "biz" || call.targetType === "dao");
    if (
      viewNames.length === 0 &&
      redirectTargets.length === 0 &&
      fileResponseHints.length === 0 &&
      contentTypes.length === 0 &&
      serviceCalls.length === 0
    ) {
      signaturePattern.lastIndex = closeBraceIndex + 1;
      continue;
    }
    handlers.push({
      methodName,
      requestMappings: classRequestMappings,
      viewNames,
      responseBody: false,
      produces: [],
      contentTypes,
      redirectTargets,
      fileResponseHints,
      serviceCalls: serviceCalls.map((call) => ({
        targetType: call.targetType,
        targetName: call.targetName,
        methodName: call.methodName,
      })),
    });
    signaturePattern.lastIndex = closeBraceIndex + 1;
  }
  return handlers;
}

export class JavaSourceBasicAdapter implements AnalyzerAdapter {
  readonly id = "java-source-basic";
  readonly name = "Java source basic Adapter";
  readonly version = "0.1.0";
  readonly capabilities = {
    supportedFilePatterns: ["**/*.java"],
    technologyTags: ["java"],
    produces: ["class", "controller", "service", "biz", "dao"],
  };

  canRun(context: AdapterContext): boolean {
    return context.fileIndex.files.some((file) => file.endsWith(".java"));
  }

  async collectInputs(context: AdapterContext): Promise<AdapterInputSet> {
    return {
      files: context.fileIndex.files.filter((file) => file.endsWith(".java")),
    };
  }

  async run(context: AdapterContext, inputs: AdapterInputSet): Promise<AdapterResult> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const artifacts: ArtifactRecord[] = [];
    const warnings: AdapterWarning[] = [];

    for (const file of inputs.files) {
      const content = await readFile(join(context.projectRoot, file), "utf8");
      try {
        parse(content);
      } catch (error) {
        warnings.push({
          code: "JAVA_PARSE_FAILED",
          message: "Java source could not be parsed; falling back to lightweight extraction",
          severity: "warning" as const,
          filePath: file,
          recoverable: true,
          details: { error: error instanceof Error ? error.message : String(error) },
        });
      }

      const className = extractClassName(content);
      if (!className) {
        continue;
      }
      const packageName = extractPackageName(content);
      const role = inferJavaRole(content, className);
      const fqn = packageName ? `${packageName}.${className}` : className;
      const imports = extractImports(content);
      const requestMappings = role === "controller" ? extractRequestMappings(content) : [];
      const requestHandlers = role === "controller"
        ? (() => {
            const annotatedHandlers = extractRequestHandlers(content);
            if (annotatedHandlers.length > 0) {
              return annotatedHandlers;
            }
            return extractActionMethodHandlers(content, packageName, imports, requestMappings);
          })()
        : [];
      const methodSummaries = role === "service" || role === "biz" || role === "dao"
        ? extractMethodSummaries(content, packageName, imports)
        : [];
      const classNode = {
        id: nodeId(context.projectId, role, fqn),
        type: role,
        name: fqn,
        displayName: className,
        projectId: context.projectId,
        path: file,
        language: "java",
        profileHints: [context.profileId],
        sourceAdapterIds: [this.id],
        confidence: "medium" as const,
        evidence: [{ kind: "java-class", value: fqn }],
        metadata: { packageName, requestMappings, requestHandlers, methodSummaries },
      };
      nodes.push(classNode);

      for (const imported of imports) {
        const targetType =
          (imported.endsWith("Controller") || imported.endsWith("Action")) ? "controller" :
          imported.endsWith("Service") ? "service" :
          (imported.endsWith("Dao") || imported.endsWith("DAO")) ? "dao" :
          "class";
        const targetNodeId = nodeId(context.projectId, targetType, imported);
        edges.push({
          id: edgeId(context.projectId, "depends_on", classNode.id, targetNodeId),
          type: "depends_on",
          from: classNode.id,
          to: targetNodeId,
          projectId: context.projectId,
          sourceAdapterIds: [this.id],
          confidence: "low" as const,
          directional: true,
          evidence: [{ kind: "java-import", value: imported }],
        });
      }

      for (const dependency of extractTypedDependencies(content, className, packageName, imports)) {
        const targetNodeId = nodeId(context.projectId, dependency.targetType, dependency.targetFqn);
        edges.push({
          id: edgeId(context.projectId, "depends_on", classNode.id, targetNodeId),
          type: "depends_on",
          from: classNode.id,
          to: targetNodeId,
          projectId: context.projectId,
          sourceAdapterIds: [this.id],
          confidence: dependency.confidence,
          directional: true,
          evidence: [{ kind: dependency.evidenceKind, value: dependency.evidenceValue }],
        });
      }

      artifacts.push({
        id: nodeId(context.projectId, "artifact", `java:${file}`),
        type: "java-source-summary",
        projectId: context.projectId,
        producerAdapterId: this.id,
        payload: { file, className, packageName, role },
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
