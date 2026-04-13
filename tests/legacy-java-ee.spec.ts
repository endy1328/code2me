import { describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeProject } from "../src/core/analysis.js";
import { writeSnapshot } from "../src/core/store.js";
import type { AnalysisSnapshot } from "../src/core/model.js";
import { LegacyJavaEeProfile } from "../src/profiles/legacy-java-ee.js";

function extractReportPayload(html: string): Record<string, unknown> {
  const match = html.match(/const report = (\{[\s\S]*\});\n    const translations = /);
  if (!match) {
    throw new Error("report payload not found");
  }
  return JSON.parse(match[1]!);
}

describe("Legacy Java EE vertical slice", () => {
  it("creates a snapshot from the sample project", async () => {
    const projectRoot = resolve("samples/legacy-java-ee-minimal");
    const result = await analyzeProject({
      projectRoot,
      projectId: "legacy-java-ee-minimal",
      profile: new LegacyJavaEeProfile(),
    });
    const { snapshot } = result;

    expect(snapshot.profileId).toBe("legacy-java-ee");
    expect(snapshot.nodes.some((node) => node.type === "module")).toBe(true);
    expect(snapshot.nodes.some((node) => node.type === "controller")).toBe(true);
    expect(snapshot.nodes.some((node) => node.type === "service")).toBe(true);
    expect(snapshot.nodes.some((node) => node.type === "dao")).toBe(true);
    expect(snapshot.nodes.some((node) => node.type === "mapper")).toBe(true);
    expect(snapshot.nodes.some((node) => node.type === "sql_statement")).toBe(true);
    expect(snapshot.nodes.some((node) => node.type === "view")).toBe(true);
    expect(snapshot.entryPoints.some((entry) => entry.type === "web_entry")).toBe(true);
    expect(snapshot.edges.some((edge) => edge.type === "queries")).toBe(true);
    expect(snapshot.edges.some((edge) => edge.type === "renders")).toBe(true);
    expect(snapshot.edges.some((edge) => edge.type === "depends_on" && edge.from.includes("SampleController") && edge.to.includes("SampleService"))).toBe(true);
    expect(snapshot.edges.some((edge) => edge.type === "depends_on" && edge.from.includes("SampleService") && edge.to.includes("SampleDao"))).toBe(true);
    expect(
      snapshot.nodes.some((node) =>
        node.type === "controller" &&
        Array.isArray(node.metadata?.requestMappings) &&
        node.metadata?.requestMappings.includes("/sample/list.as"),
      ),
    ).toBe(true);

    const reportHtml = await readFile(resolve(projectRoot, ".code2me/report.html"), "utf8");
    const internalReportHtml = await readFile(result.outputPaths.internalReportPath, "utf8");
    expect(reportHtml).toContain("Interactive analysis report");
    expect(internalReportHtml).toContain("Interactive analysis report");
    expect(reportHtml).toContain("code2me Analysis Summary");
    expect(reportHtml).toContain("/sample/list.as");
    expect(reportHtml).toContain("Framework Flow");
    expect(reportHtml).toContain("Screen Flows");
    expect(reportHtml).toContain("Flow Details");
    expect(reportHtml).toContain("*.do");
    expect(reportHtml).toContain("dispatcher-servlet.xml");
    expect(reportHtml).toContain("Open Flow Details");
    expect(reportHtml).toContain("Open Data Flow");
    expect(reportHtml).toContain("UI Actions");
    expect(reportHtml).toContain("sampleService");
    expect(reportHtml).toContain("sampleDao");
    expect(result.outputPaths.internalProjectDir).toContain(".code2me-result/projects/legacy-java-ee-minimal");
    expect(result.outputPaths.targetWriteError).toBeUndefined();

    const payload = extractReportPayload(reportHtml) as {
      screenFlowCards: Array<{
        controllerPath?: string;
      }>;
      flowDetails: Array<{
        type: string;
        sections: Array<{
          key: string;
          actions?: Array<{
            target: string;
            nextTitle?: string;
          }>;
        }>;
      }>;
    };
    expect(payload.screenFlowCards.some((card) => card.controllerPath?.includes("SampleController.java"))).toBe(true);
    const screenDetail = payload.flowDetails.find((detail) =>
      detail.type === "screen_flow_detail" &&
      detail.sections.some((section) =>
        section.key === "detailUiActions" &&
        section.actions?.some((action) => action.target === "/sample/detail.as"),
      ),
    );
    const uiSection = screenDetail?.sections.find((section) => section.key === "detailUiActions");
    expect(uiSection?.actions?.some((action) => action.target === "/sample/detail.as")).toBe(true);
    expect(uiSection?.actions?.some((action) => action.target === "/sample/data.as")).toBe(true);

    const sampleController = snapshot.nodes.find((node) => node.type === "controller" && node.name.includes("SampleController"));
    const sampleHandlers = Array.isArray(sampleController?.metadata?.requestHandlers)
      ? sampleController.metadata.requestHandlers as Array<Record<string, unknown>>
      : [];
    const dataHandler = sampleHandlers.find((handler) => handler.methodName === "data");
    const serviceCalls = Array.isArray(dataHandler?.serviceCalls)
      ? dataHandler.serviceCalls as Array<Record<string, unknown>>
      : [];
    expect(serviceCalls.some((call) => call.targetName === "com.example.legacy.lib.SampleService" && call.methodName === "load")).toBe(true);
  });

  it("keeps an internal mirror when the target project output directory is not writable", async () => {
    const snapshot: AnalysisSnapshot = {
      projectId: "readonly-project",
      profileId: "legacy-java-ee",
      createdAt: "2026-04-08T00:00:00.000Z",
      nodes: [],
      edges: [],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    };

    await rm(resolve(".code2me-result/projects/readonly-project"), { recursive: true, force: true });

    const outputPaths = await writeSnapshot("/sys/code2me-readonly-target", "readonly-project", snapshot);
    const internalReportHtml = await readFile(outputPaths.internalReportPath, "utf8");

    expect(outputPaths.targetWriteError).toBeDefined();
    expect(outputPaths.internalProjectDir).toContain(".code2me-result/projects/readonly-project");
    expect(internalReportHtml).toContain("Interactive analysis report");
  });

  it("promotes XML multi-action *.as mappings into searchable flows", async () => {
    const projectRoot = resolve("samples/legacy-java-ee-action-mapping");
    const result = await analyzeProject({
      projectRoot,
      projectId: "legacy-java-ee-action-mapping",
      profile: new LegacyJavaEeProfile(),
    });

    const controllerNode = result.snapshot.nodes.find((node) => node.type === "controller" && node.name === "com.example.legacy.web.SampleAction");
    expect(controllerNode).toBeDefined();
    expect(controllerNode?.metadata?.requestMappings).toContain("/sample/list.as");
    expect(controllerNode?.metadata?.requestMappings).toContain("/sample/view.as");

    const requestHandlers = Array.isArray(controllerNode?.metadata?.requestHandlers)
      ? controllerNode?.metadata?.requestHandlers as Array<Record<string, unknown>>
      : [];
    const listHandler = requestHandlers.find((handler) => handler.methodName === "getSampleList");
    expect(listHandler?.requestMappings).toContain("/sample/list.as");
    expect(listHandler?.viewNames).toContain("sample/list");

    const reportHtml = await readFile(result.outputPaths.internalReportPath, "utf8");
    expect(reportHtml).toContain("/sample/list.as");
    expect(reportHtml).toContain("/sample/view.as");
    expect(reportHtml).toContain("getSampleList");
    expect(reportHtml).toContain("getSampleView");

    const payload = extractReportPayload(reportHtml) as {
      flowDetails: Array<{
        title: string;
        sections: Array<{
          key: string;
          lines: string[];
        }>;
      }>;
    };
    const detail = payload.flowDetails.find((item) => item.title.includes("/sample/list.as"));
    const requestSection = detail?.sections.find((section) => section.key === "detailRequestPath");
    expect(requestSection?.lines.some((line) => line.includes("handler mapping: /sample/*.as"))).toBe(true);
    expect(requestSection?.lines.some((line) => line.includes("method resolver: sampleActionResolver"))).toBe(true);
    expect(requestSection?.lines.some((line) => line.includes("bean: sampleAction"))).toBe(true);
    expect(requestSection?.lines.some((line) => line.includes("handler method: getSampleList"))).toBe(true);
  });

  it("recovers bean-name URL mappings and action service calls from XML-heavy controllers", async () => {
    const projectRoot = resolve("samples/legacy-java-ee-bean-name-mapping");
    const result = await analyzeProject({
      projectRoot,
      projectId: "legacy-java-ee-bean-name-mapping",
      profile: new LegacyJavaEeProfile(),
    });

    const controllerNode = result.snapshot.nodes.find((node) => node.type === "controller" && node.name === "com.example.legacy.web.ReportAction");
    expect(controllerNode).toBeDefined();
    expect(controllerNode?.metadata?.requestMappings).toContain("/report/list.as");
    expect(controllerNode?.metadata?.requestMappings).toContain("/report/exportExcel.as");
    expect(controllerNode?.metadata?.handlerMappingPatterns).toContain("/report/*.as");
    expect(controllerNode?.metadata?.methodNameResolverRef).toBe("reportMethodNameResolver");

    const requestHandlers = Array.isArray(controllerNode?.metadata?.requestHandlers)
      ? controllerNode?.metadata?.requestHandlers as Array<Record<string, unknown>>
      : [];
    const listHandler = requestHandlers.find((handler) => handler.methodName === "list");
    const exportHandler = requestHandlers.find((handler) => handler.methodName === "exportExcel");
    expect(listHandler?.requestMappings).toContain("/report/list.as");
    expect(listHandler?.viewNames).toContain("report/list");
    expect(exportHandler?.requestMappings).toContain("/report/exportExcel.as");
    expect(exportHandler?.redirectTargets).toContain("report/list.as");
    expect(Array.isArray(listHandler?.serviceCalls)).toBe(true);
    expect((listHandler?.serviceCalls as Array<Record<string, unknown>>).some((call) =>
      call.targetName === "com.example.legacy.lib.ReportService" && call.methodName === "loadReportList",
    )).toBe(true);

    const reportHtml = await readFile(result.outputPaths.internalReportPath, "utf8");
    const payload = extractReportPayload(reportHtml) as {
      screenFlowCards: Array<{
        route?: string;
        service?: string;
      }>;
      apiFlowCards: Array<{
        route?: string;
        responseKind?: string;
      }>;
      flowDetails: Array<{
        title: string;
        sections: Array<{
          key: string;
          lines: string[];
        }>;
      }>;
    };
    expect(payload.screenFlowCards.some((card) => card.route === "/report/list.as" && card.service === "ReportService")).toBe(true);
    expect(payload.apiFlowCards.some((card) => card.route === "/report/exportExcel.as" && card.responseKind === "redirect")).toBe(true);
    const detail = payload.flowDetails.find((item) => item.title.includes("/report/list.as"));
    const requestSection = detail?.sections.find((section) => section.key === "detailRequestPath");
    expect(requestSection?.lines.some((line) => line.includes("handler mapping: /report/*.as"))).toBe(true);
    expect(requestSection?.lines.some((line) => line.includes("method resolver: reportMethodNameResolver"))).toBe(true);
    expect(requestSection?.lines.some((line) => line.includes("handler method: list"))).toBe(true);
  });

  it("keeps multi-dispatcher entry context attached to the matching screen and api flows", async () => {
    const projectRoot = resolve("samples/legacy-java-ee-entry-multi-dispatcher");
    const result = await analyzeProject({
      projectRoot,
      projectId: "legacy-java-ee-entry-multi-dispatcher",
      profile: new LegacyJavaEeProfile(),
    });

    expect(result.snapshot.entryPoints).toHaveLength(2);
    expect(result.snapshot.entryPoints.some((entry) => entry.metadata?.urlPattern === "*.do")).toBe(true);
    expect(result.snapshot.entryPoints.some((entry) => entry.metadata?.urlPattern === "/api/*")).toBe(true);

    const reportHtml = await readFile(result.outputPaths.internalReportPath, "utf8");
    const payload = extractReportPayload(reportHtml) as {
      frameworkFlowCards: Array<{
        entryPattern?: string;
        dispatcherConfig?: string;
      }>;
      screenFlowCards: Array<{
        route?: string;
        entryPattern?: string;
        dispatcherConfig?: string;
      }>;
      apiFlowCards: Array<{
        route?: string;
        entryPattern?: string;
        dispatcherConfig?: string;
        responseKind?: string;
      }>;
    };

    expect(payload.frameworkFlowCards).toHaveLength(2);
    expect(payload.frameworkFlowCards.some((card) => card.entryPattern?.includes("*.do") && card.dispatcherConfig?.includes("web-dispatcher-servlet.xml"))).toBe(true);
    expect(payload.frameworkFlowCards.some((card) => card.entryPattern?.includes("/api/*") && card.dispatcherConfig?.includes("api-dispatcher-servlet.xml"))).toBe(true);

    const screenFlow = payload.screenFlowCards.find((card) => card.route === "/screen/list.do");
    expect(screenFlow?.entryPattern).toContain("*.do");
    expect(screenFlow?.dispatcherConfig).toContain("web-dispatcher-servlet.xml");

    const apiFlow = payload.apiFlowCards.find((card) => card.route === "/api/status");
    expect(apiFlow?.entryPattern).toContain("/api/*");
    expect(apiFlow?.dispatcherConfig).toContain("api-dispatcher-servlet.xml");
    expect(apiFlow?.responseKind).toBe("json");
  });

  it("prefers direct dao mapper/sql evidence over name-based fallback candidates", async () => {
    const projectRoot = resolve("samples/legacy-java-ee-persistence-priority");
    const result = await analyzeProject({
      projectRoot,
      projectId: "legacy-java-ee-persistence-priority",
      profile: new LegacyJavaEeProfile(),
    });

    expect(result.snapshot.nodes.some((node) => node.type === "mapper" && node.name === "com.example.legacy.lib.AccountDao")).toBe(true);
    expect(result.snapshot.nodes.some((node) => node.type === "mapper" && node.name === "legacy.repo.AccountMapper")).toBe(true);
    expect(result.snapshot.edges.some((edge) =>
      edge.type === "queries" &&
      edge.from.includes("com.example.legacy.lib.AccountDao") &&
      edge.to.includes("com.example.legacy.lib.AccountDao"),
    )).toBe(true);

    const reportHtml = await readFile(result.outputPaths.internalReportPath, "utf8");
    const payload = extractReportPayload(reportHtml) as {
      screenFlowCards: Array<{
        route?: string;
        mapper?: string;
        sql?: string;
      }>;
      flowDetails: Array<{
        title: string;
        sections: Array<{
          key: string;
          lines: string[];
        }>;
      }>;
    };

    const screenFlow = payload.screenFlowCards.find((card) => card.route === "/account/list.as");
    expect(screenFlow?.mapper).toBe("AccountDao");
    expect(screenFlow?.sql).toBe("com.example.legacy.lib.AccountDao.selectAccounts");

    const detail = payload.flowDetails.find((item) => item.title.includes("/account/list.as"));
    const businessSection = detail?.sections.find((section) => section.key === "detailBusinessSteps");
    const dataSection = detail?.sections.find((section) => section.key === "detailDataAccess");
    expect(businessSection?.lines).toContain("sql evidence: dao method sql call: selectAccounts -> com.example.legacy.lib.AccountDao.selectAccounts");
    expect(dataSection?.lines.some((line) =>
      line.includes("mapper=AccountDao") &&
      line.includes("sql=com.example.legacy.lib.AccountDao.selectAccounts") &&
      line.includes("level=confirmed"),
    )).toBe(true);
    expect(dataSection?.lines.some((line) => line.includes("mapper=AccountMapper"))).toBe(false);
  });

  it("covers mixed screen/api mappings with profile detection, flow details, and visible confirmed data paths", async () => {
    const projectRoot = resolve("samples/legacy-java-ee-mixed-web-api");
    const result = await analyzeProject({
      projectRoot,
      projectId: "legacy-java-ee-mixed-web-api",
      profile: new LegacyJavaEeProfile(),
    });

    expect(result.profileDetection?.matched).toBe(true);
    expect(result.profileDetection?.score).toBe(12);
    expect(result.profileDetection?.reasons).toEqual(["build.xml", "web.xml", "spring-xml", "jsp"]);

    const reportHtml = await readFile(result.outputPaths.internalReportPath, "utf8");
    const payload = extractReportPayload(reportHtml) as {
      screenFlowCards: Array<{
        route?: string;
        service?: string;
      }>;
      apiFlowCards: Array<{
        route?: string;
        responseKind?: string;
      }>;
      flowDetails: Array<{
        title: string;
        sections: Array<{
          key: string;
          lines?: string[];
          actions?: Array<{
            target: string;
          }>;
        }>;
      }>;
      dataFlowCards: Array<{
        routeValues?: string[];
        inferenceLevel?: string;
        hiddenByDefault?: boolean;
        sql?: string;
      }>;
    };

    expect(payload.screenFlowCards.some((card) => card.route === "/ops/dashboard/list.do" && card.service === "OpsDashboardService")).toBe(true);
    expect(payload.apiFlowCards.some((card) => card.route === "/ops/dashboard/status.do" && card.responseKind === "json")).toBe(true);
    expect(payload.apiFlowCards.some((card) => card.route === "/ops/dashboard/export.do" && card.responseKind === "file")).toBe(true);

    const listDetail = payload.flowDetails.find((detail) => detail.title.includes("/ops/dashboard/list.do"));
    expect(listDetail?.sections.map((section) => section.key)).toEqual([
      "detailEntrySetup",
      "detailRequestPath",
      "detailBusinessSteps",
      "detailDataAccess",
      "detailOutput",
      "detailUiActions",
      "detailConfigs",
    ]);
    const uiSection = listDetail?.sections.find((section) => section.key === "detailUiActions");
    expect(uiSection?.actions?.some((action) => action.target === "/ops/dashboard/status.do")).toBe(true);
    expect(uiSection?.actions?.some((action) => action.target === "/ops/dashboard/export.do")).toBe(true);

    const exportDetail = payload.flowDetails.find((detail) => detail.title.includes("/ops/dashboard/export.do"));
    const outputSection = exportDetail?.sections.find((section) => section.key === "detailOutput");
    expect(outputSection?.lines?.some((line) => line.includes("response kind: file"))).toBe(true);
    expect(outputSection?.lines?.some((line) => line.includes("application/vnd.ms-excel"))).toBe(true);

    const confirmedDataCard = payload.dataFlowCards.find((card) =>
      card.routeValues?.includes("/ops/dashboard/list.do") &&
      card.sql === "com.example.legacy.lib.OpsDashboardDao.selectOverview",
    );
    expect(confirmedDataCard?.inferenceLevel).toBe("confirmed");
    expect(confirmedDataCard?.hiddenByDefault).toBe(false);
  });
});
