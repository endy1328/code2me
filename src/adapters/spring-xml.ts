import type { AdapterContext, AdapterInputSet, AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AdapterWarning, ArtifactRecord, GraphEdge, GraphNode } from "../core/model.js";
import { parseXmlFile } from "../utils/xml.js";
import { edgeId, nodeId } from "../utils/id.js";

type SpringBeans = {
  beans?: {
    bean?: Record<string, unknown> | Array<Record<string, unknown>>;
  };
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function inferBeanType(className: string | undefined): string {
  if (!className) {
    return "config";
  }
  if (className.endsWith("Controller") || className.endsWith("Action")) {
    return "controller";
  }
  if (className.endsWith("Service")) {
    return "service";
  }
  if (className.endsWith("Dao") || className.endsWith("DAO")) {
    return "dao";
  }
  return "config";
}

function readTextValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const text = (value as Record<string, unknown>)["#text"];
    return typeof text === "string" ? text : undefined;
  }
  return undefined;
}

function normalizeMappingPath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function extractPropertyRecords(bean: Record<string, unknown>): Array<Record<string, unknown>> {
  return asArray(bean.property).filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
}

function extractConstructorArgRecords(bean: Record<string, unknown>): Array<Record<string, unknown>> {
  return asArray(bean["constructor-arg"]).filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
}

function extractPropsMap(property: Record<string, unknown>): Record<string, string> {
  if (!property.props || typeof property.props !== "object") {
    return {};
  }
  const propEntries = asArray((property.props as Record<string, unknown>).prop)
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
  return Object.fromEntries(
    propEntries
      .map((entry) => {
        const key = typeof entry.key === "string" ? entry.key : undefined;
        const value = readTextValue(entry);
        return key && value ? [key, value] : undefined;
      })
      .filter((entry): entry is [string, string] => Array.isArray(entry)),
  );
}

function extractBeanReferences(
  bean: Record<string, unknown>,
  properties: Array<Record<string, unknown>>,
  constructorArgs: Array<Record<string, unknown>>,
): Array<{ refName: string; source: string }> {
  const references: Array<{ refName: string; source: string }> = [];

  for (const property of properties) {
    const refName = typeof property.ref === "string" ? property.ref : undefined;
    const propertyName = typeof property.name === "string" ? property.name : "property";
    if (refName) {
      references.push({ refName, source: `property:${propertyName}` });
    }
  }

  for (const arg of constructorArgs) {
    const refName = typeof arg.ref === "string" ? arg.ref : undefined;
    const argumentName = typeof arg.name === "string" ? arg.name : typeof arg.index === "string" ? arg.index : "constructor-arg";
    if (refName) {
      references.push({ refName, source: `constructor-arg:${argumentName}` });
    }
  }

  for (const [key, value] of Object.entries(bean)) {
    if (!key.startsWith("p:") || !key.endsWith("-ref") || typeof value !== "string") {
      continue;
    }
    references.push({ refName: value, source: key });
  }

  return references;
}

export class SpringXmlAdapter implements AnalyzerAdapter {
  readonly id = "spring-xml";
  readonly name = "Spring XML Adapter";
  readonly version = "0.1.0";
  readonly capabilities = {
    supportedFilePatterns: ["**/*dispatcher*.xml", "**/applicationContext*.xml"],
    technologyTags: ["java", "spring", "xml"],
    produces: ["config", "controller", "service", "dao"],
  };

  canRun(context: AdapterContext): boolean {
    return context.fileIndex.files.some((file) => /applicationContext.*\.xml$/.test(file) || /dispatcher.*\.xml$/.test(file));
  }

  async collectInputs(context: AdapterContext): Promise<AdapterInputSet> {
    return {
      files: context.fileIndex.files.filter((file) => /applicationContext.*\.xml$/.test(file) || /dispatcher.*\.xml$/.test(file)),
    };
  }

  async run(context: AdapterContext, inputs: AdapterInputSet): Promise<AdapterResult> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const artifacts: ArtifactRecord[] = [];
    const warnings: AdapterWarning[] = [];

    for (const file of inputs.files) {
      const parsed = await parseXmlFile<SpringBeans>(context.projectRoot, file);
      const beans = asArray(parsed.beans?.bean).filter((bean): bean is Record<string, unknown> => typeof bean === "object" && bean !== null);
      const handlerMappings = new Map<string, string[]>();
      const resolverMappings = new Map<string, Record<string, string>>();
      const beanDescriptors: Array<{
        beanName: string;
        beanId: string | undefined;
        className: string | undefined;
        beanType: string;
        properties: Array<Record<string, unknown>>;
        propertyValues: Record<string, string>;
        methodNameResolverRef: string | undefined;
        requestMappings: string[];
        handlerMappingPatterns: string[];
        requestHandlers: Array<{ methodName: string; requestMappings: string[]; viewNames: string[]; responseBody: boolean }>;
        references: Array<{ refName: string; source: string }>;
      }> = [];

      for (const bean of beans) {
        const className = typeof bean.class === "string" ? bean.class : undefined;
        const beanName =
          (typeof bean.id === "string" ? bean.id : undefined)
          ?? (typeof bean.name === "string" ? bean.name : undefined)
          ?? className
          ?? "unnamed-bean";
        const properties = extractPropertyRecords(bean);
        const mappingsProperty = properties.find((property) => property.name === "mappings");
        const mappings = mappingsProperty ? extractPropsMap(mappingsProperty) : {};

        if (className?.includes("SimpleUrlHandlerMapping")) {
          for (const [routePattern, targetBean] of Object.entries(mappings)) {
            const current = handlerMappings.get(targetBean) ?? [];
            current.push(normalizeMappingPath(routePattern));
            handlerMappings.set(targetBean, current);
          }
        }

        if (className?.includes("PropertiesMethodNameResolver")) {
          resolverMappings.set(
            beanName,
            Object.fromEntries(Object.entries(mappings).map(([route, methodName]) => [normalizeMappingPath(route), methodName])),
          );
        }
      }

      const configNode = {
        id: nodeId(context.projectId, "config", file),
        type: "config",
        name: file.split("/").pop() ?? file,
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

      for (const bean of beans) {
        const className = typeof bean.class === "string" ? bean.class : undefined;
        const beanId = typeof bean.id === "string" ? bean.id : undefined;
        const beanName = beanId ?? (typeof bean.name === "string" ? bean.name : undefined) ?? className ?? "unnamed-bean";
        const beanType = inferBeanType(className);
        const properties = extractPropertyRecords(bean);
        const constructorArgs = extractConstructorArgRecords(bean);
        const propertyValues = Object.fromEntries(
          properties
            .filter((property) => typeof property.name === "string" && typeof property.value === "string")
            .map((property) => [property.name as string, property.value as string]),
        );
        const methodNameResolverRef = typeof bean["p:methodNameResolver-ref"] === "string"
          ? bean["p:methodNameResolver-ref"]
          : undefined;
        const requestMappings = uniqueStrings([
          ...(handlerMappings.get(beanName) ?? []),
          ...Object.keys(resolverMappings.get(methodNameResolverRef ?? "") ?? {}),
        ]);
        const handlerMappingPatterns = uniqueStrings(handlerMappings.get(beanName) ?? []);
        const requestHandlers = Object.entries(resolverMappings.get(methodNameResolverRef ?? "") ?? {}).map(([route, methodName]) => ({
          methodName,
          requestMappings: [route],
          viewNames: [] as string[],
          responseBody: false,
        }));
        const references = extractBeanReferences(bean, properties, constructorArgs);
        beanDescriptors.push({
          beanName,
          beanId,
          className,
          beanType,
          properties,
          propertyValues,
          methodNameResolverRef,
          requestMappings,
          handlerMappingPatterns,
          requestHandlers,
          references,
        });
        const beanNode = {
          id: nodeId(context.projectId, beanType, className ?? `${file}:${beanName}`),
          type: beanType,
          name: className ?? beanName,
          displayName: beanName,
          projectId: context.projectId,
          path: file,
          language: "java",
          profileHints: [context.profileId],
          sourceAdapterIds: [this.id],
          confidence: className ? "high" as const : "medium" as const,
          evidence: [{ kind: "spring-bean", value: beanName }],
          metadata: {
            beanId,
            className,
            springConfigPath: file,
            declaringConfigPath: file,
            properties: propertyValues,
            methodNameResolverRef,
            handlerMappingPatterns,
            requestMappings,
            requestHandlers,
          },
        };
        nodes.push(beanNode);
        edges.push({
          id: edgeId(context.projectId, "declares", configNode.id, beanNode.id),
          type: "declares",
          from: configNode.id,
          to: beanNode.id,
          projectId: context.projectId,
          sourceAdapterIds: [this.id],
          confidence: "high" as const,
          directional: true,
          evidence: [{ kind: "spring-bean", value: beanName }],
        });

        if (className?.includes("ViewResolver")) {
          artifacts.push({
            id: nodeId(context.projectId, "artifact", `view-resolver:${file}:${beanName}`),
            type: "spring-view-resolver",
            projectId: context.projectId,
            producerAdapterId: this.id,
            payload: {
              file,
              beanName,
              className,
              prefix: propertyValues.prefix,
              suffix: propertyValues.suffix,
            },
          });
        }

        if (requestMappings.length > 0) {
          artifacts.push({
            id: nodeId(context.projectId, "artifact", `spring-mappings:${file}:${beanName}`),
            type: "spring-url-mappings",
            projectId: context.projectId,
            producerAdapterId: this.id,
            payload: {
              file,
              beanName,
              className,
              handlerMappingPatterns,
              requestMappings,
              requestHandlers,
            },
          });
        }
      }

      const beanNodeIndex = new Map(beanDescriptors.map((descriptor) => [
        descriptor.beanName,
        nodeId(context.projectId, descriptor.beanType, descriptor.className ?? `${file}:${descriptor.beanName}`),
      ]));
      for (const descriptor of beanDescriptors) {
        const sourceNodeId = beanNodeIndex.get(descriptor.beanName);
        if (!sourceNodeId) {
          continue;
        }
        for (const reference of descriptor.references) {
          const targetNodeId = beanNodeIndex.get(reference.refName);
          if (!targetNodeId) {
            continue;
          }
          edges.push({
            id: edgeId(context.projectId, "depends_on", sourceNodeId, targetNodeId),
            type: "depends_on",
            from: sourceNodeId,
            to: targetNodeId,
            projectId: context.projectId,
            sourceAdapterIds: [this.id],
            confidence: "high" as const,
            directional: true,
            evidence: [{ kind: "spring-bean-ref", value: `${descriptor.beanName} -> ${reference.refName} (${reference.source})` }],
          });
        }
      }

      artifacts.push({
        id: nodeId(context.projectId, "artifact", `spring:${file}`),
        type: "spring-bean-summary",
        projectId: context.projectId,
        producerAdapterId: this.id,
        payload: { file, beanCount: beans.length },
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
