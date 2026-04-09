import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterContext, AdapterInputSet, AdapterResult, AnalyzerAdapter } from "../core/adapter.js";
import type { AdapterWarning, ArtifactRecord, GraphEdge, GraphNode } from "../core/model.js";
import { edgeId, nodeId } from "../utils/id.js";

export class AntBuildXmlAdapter implements AnalyzerAdapter {
  readonly id = "ant-build-xml";
  readonly name = "Ant build.xml Adapter";
  readonly version = "0.1.0";
  readonly capabilities = {
    supportedFilePatterns: ["**/build.xml"],
    technologyTags: ["java", "ant"],
    produces: ["project", "module", "build_target", "deployment_unit"],
  };

  canRun(context: AdapterContext): boolean {
    return context.fileIndex.files.some((file) => file.endsWith("build.xml"));
  }

  async collectInputs(context: AdapterContext): Promise<AdapterInputSet> {
    return {
      files: context.fileIndex.files.filter((file) => file.endsWith("build.xml")),
    };
  }

  async run(context: AdapterContext, inputs: AdapterInputSet): Promise<AdapterResult> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const artifacts: ArtifactRecord[] = [];
    const warnings: AdapterWarning[] = [];

    const projectNode = {
      id: nodeId(context.projectId, "project", context.projectId),
      type: "project",
      name: context.projectId,
      displayName: context.projectId,
      projectId: context.projectId,
      sourceAdapterIds: [this.id],
      confidence: "high" as const,
      evidence: [{ kind: "project-root", value: context.projectRoot }],
      metadata: {},
    };
    nodes.push(projectNode);

    for (const file of inputs.files) {
      const xml = await readFile(join(context.projectRoot, file), "utf8");
      const moduleName = /<project[^>]*name="([^"]+)"/.exec(xml)?.[1] ?? file.split("/").slice(-2, -1)[0] ?? "root";
      const moduleNode = {
        id: nodeId(context.projectId, "module", `${moduleName}:${file}`),
        type: "module",
        name: moduleName,
        displayName: moduleName,
        projectId: context.projectId,
        path: file,
        language: "xml",
        profileHints: [context.profileId],
        sourceAdapterIds: [this.id],
        confidence: "high" as const,
        evidence: [{ kind: "build-file", value: file }],
        metadata: {},
      };
      nodes.push(moduleNode);
      edges.push({
        id: edgeId(context.projectId, "contains", projectNode.id, moduleNode.id),
        type: "contains",
        from: projectNode.id,
        to: moduleNode.id,
        projectId: context.projectId,
        sourceAdapterIds: [this.id],
        confidence: "high" as const,
        directional: true,
        evidence: [{ kind: "build-file", value: file }],
      });

      const deploymentMatches = Array.from(xml.matchAll(/<(war|ear|jar)\b[^>]*destfile="([^"]+)"/g));
      for (const match of deploymentMatches) {
        const type = match[1];
        const destfile = match[2];
        if (!type || !destfile) {
          continue;
        }
        const deploymentNode = {
          id: nodeId(context.projectId, "deployment_unit", `${type}:${destfile}`),
          type: "deployment_unit",
          name: destfile,
          displayName: destfile,
          projectId: context.projectId,
          path: file,
          language: "xml",
          profileHints: [context.profileId],
          sourceAdapterIds: [this.id],
          confidence: "medium" as const,
          evidence: [{ kind: "deployment-target", value: destfile }],
          metadata: { packaging: type },
        };
        nodes.push(deploymentNode);
        edges.push({
          id: edgeId(context.projectId, "deploys", moduleNode.id, deploymentNode.id),
          type: "deploys",
          from: moduleNode.id,
          to: deploymentNode.id,
          projectId: context.projectId,
          sourceAdapterIds: [this.id],
          confidence: "medium" as const,
          directional: true,
          evidence: [{ kind: "deployment-target", value: destfile }],
        });
      }

      artifacts.push({
        id: nodeId(context.projectId, "artifact", `ant:${file}`),
        type: "ant-build-summary",
        projectId: context.projectId,
        producerAdapterId: this.id,
        payload: { file, moduleName },
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
