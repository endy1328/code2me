import { describe, expect, it } from "vitest";
import { renderInteractiveHtmlReport } from "../src/core/report.js";
import type { AnalysisSnapshot, EntryPoint, GraphEdge, GraphNode } from "../src/core/model.js";

interface ReportAction {
  target?: string;
}

interface ReportSection {
  key?: string;
  lines?: string[];
  actions?: ReportAction[];
}

interface ReportFlowDetail {
  type?: string;
  title?: string;
  summary?: string;
  responseKind?: string;
  responseTags?: string[];
  sections?: ReportSection[];
}

function extractReportData(html: string): {
  frameworkFlowCards: Array<Record<string, unknown>>;
  screenFlowCards: Array<Record<string, unknown>>;
  apiFlowCards: Array<Record<string, unknown>>;
  flowDetails: ReportFlowDetail[];
  screenCards: Array<Record<string, unknown>>;
  primaryFlowCards: Array<Record<string, unknown>>;
  dataFlowCards: Array<Record<string, unknown>>;
  moduleProfileCards: Array<Record<string, unknown>>;
} {
  const match = html.match(/const report = (\{[\s\S]*\});\n    const translations = /);
  if (!match) {
    throw new Error("report payload not found");
  }
  return JSON.parse(match[1]!) as {
    frameworkFlowCards: Array<Record<string, unknown>>;
    screenFlowCards: Array<Record<string, unknown>>;
    apiFlowCards: Array<Record<string, unknown>>;
    flowDetails: ReportFlowDetail[];
    screenCards: Array<Record<string, unknown>>;
    primaryFlowCards: Array<Record<string, unknown>>;
    dataFlowCards: Array<Record<string, unknown>>;
    moduleProfileCards: Array<Record<string, unknown>>;
  };
}

function createNode(overrides: Partial<GraphNode> & Pick<GraphNode, "id" | "type" | "name" | "projectId" | "sourceAdapterIds" | "confidence" | "evidence">): GraphNode {
  return {
    displayName: overrides.name,
    metadata: {},
    ...overrides,
  };
}

function createEdge(overrides: Partial<GraphEdge> & Pick<GraphEdge, "id" | "type" | "from" | "to" | "projectId" | "sourceAdapterIds" | "confidence" | "directional" | "evidence">): GraphEdge {
  return {
    ...overrides,
  };
}

function createEntryPoint(overrides: Partial<EntryPoint> & Pick<EntryPoint, "id" | "type" | "targetEntityId" | "projectId" | "title" | "reason" | "priority" | "sourceAdapterIds" | "confidence">): EntryPoint {
  return {
    metadata: {},
    ...overrides,
  };
}

describe("interactive report entry flow synthesis", () => {
  it("renders list section titles with filtered result counts", () => {
    const projectId = "count-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-08T00:00:00.000Z",
      nodes: [],
      edges: [],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    };

    const html = renderInteractiveHtmlReport(snapshot);
    expect(html).toContain('function titleWithCount(title, count)');
    expect(html).toContain('titleWithCount(t("frameworkFlow"), filtered.length)');
    expect(html).toContain('titleWithCount(t("screenFlow"), filtered.length)');
    expect(html).toContain('titleWithCount(t("apiFlow"), filtered.length)');
    expect(html).toContain('titleWithCount(t("relatedData"), selectedData.length)');
    expect(html).toContain('titleWithCount(t("sharedModules"), filteredLibraries.length)');
    expect(html).toContain('sectionHtml(t("runtimeContext"), structureSummary, false)');
  });

  it("renders architecture context data cards with expandable request lists and evidence labels", () => {
    const html = renderInteractiveHtmlReport({
      projectId: "context-project",
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.CarrierAction",
          displayName: "carrierAction",
          projectId: "context-project",
          path: "app/src/CarrierAction.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            requestMappings: [
              "/carrier/export.as",
              "/account/getAccountWithdrawal.as",
              "/account/list.as",
            ],
          },
        }),
        createNode({
          id: "service-1",
          type: "service",
          name: "com.example.GdprService",
          displayName: "GdprService",
          projectId: "context-project",
          path: "app/src/GdprService.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "depends-1",
          type: "depends_on",
          from: "controller-1",
          to: "service-1",
          projectId: "context-project",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    });

    expect(html).toContain('pill(t("possibleBackendPath"))');
    expect(html).toContain('t("dataFlowMeaning")');
    expect(html).toContain('data-toggle-hidden-data-paths="true"');
    expect(html).toContain('t("inferenceLevelLabel")');
    expect(html).toContain('t("showAllRequests") + " (" + card.routeValues.length + ")"');
    expect(html).toContain('t("evidenceBasis") + ": " + (card.evidenceLabel || t("notConfirmed"))');
  });

  it("compresses entry summary cards instead of dumping all routes and configs", () => {
    const html = renderInteractiveHtmlReport({
      projectId: "framework-summary-project",
      profileId: "legacy-java-ee",
      createdAt: "2026-04-13T00:00:00.000Z",
      nodes: [],
      edges: [],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    });

    expect(html).toContain('t("representativeRequest")');
    expect(html).toContain('t("additionalConfigs")');
    expect(html).not.toContain('((flow.sampleRoutes || []).slice(0, 3).join(", ") || "-")');
    expect(html).not.toContain('(flow.contextConfigs || []).join(", ")');
    expect(html).not.toContain('[pill(flow.type), pill(confidenceLabel(flow.confidence), "conf-" + flow.confidence)]');
  });

  it("marks weak inferred paths hidden by default and keeps direct sql-backed paths visible", () => {
    const reportWeak = extractReportData(renderInteractiveHtmlReport({
      projectId: "weak-data-path-project",
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.SampleController",
          displayName: "sampleController",
          projectId: "weak-data-path-project",
          path: "app/src/SampleController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            requestMappings: ["/sample/list.as"],
          },
        }),
        createNode({
          id: "service-1",
          type: "service",
          name: "com.example.SampleService",
          displayName: "SampleService",
          projectId: "weak-data-path-project",
          path: "app/src/SampleService.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "depends-1",
          type: "depends_on",
          from: "controller-1",
          to: "service-1",
          projectId: "weak-data-path-project",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    }));

    const weakCard = reportWeak.dataFlowCards[0] as {
      inferenceLevel?: string;
      hiddenByDefault?: boolean;
      evidenceKinds?: string[];
    };
    expect(weakCard.inferenceLevel).toBe("inferred");
    expect(weakCard.hiddenByDefault).toBe(true);
    expect(weakCard.evidenceKinds).toContain("controller-service-edge");

    const reportStrong = extractReportData(renderInteractiveHtmlReport({
      projectId: "strong-data-path-project",
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.CategoryController",
          displayName: "categoryController",
          projectId: "strong-data-path-project",
          path: "app/src/CategoryController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            requestMappings: ["/category/list.as"],
          },
        }),
        createNode({
          id: "service-1",
          type: "service",
          name: "com.example.CategoryService",
          displayName: "CategoryService",
          projectId: "strong-data-path-project",
          path: "app/src/CategoryService.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
        }),
        createNode({
          id: "dao-1",
          type: "dao",
          name: "com.example.CategoryDao",
          displayName: "CategoryDao",
          projectId: "strong-data-path-project",
          path: "app/src/CategoryDao.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            methodSummaries: [
              {
                methodName: "getCategoryList",
                dependencyCalls: [],
                sqlCalls: [{ statementId: "category.getCategoryList", operation: "queryForList" }],
                externalCalls: [],
              },
            ],
          },
        }),
        createNode({
          id: "mapper-1",
          type: "mapper",
          name: "category",
          displayName: "category",
          projectId: "strong-data-path-project",
          path: "app/src/categoryDao.xml",
          sourceAdapterIds: ["ibatis-sql-map"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "sql-1",
          type: "sql_statement",
          name: "category.getCategoryList",
          displayName: "getCategoryList",
          projectId: "strong-data-path-project",
          path: "app/src/categoryDao.xml",
          sourceAdapterIds: ["ibatis-sql-map"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "depends-service-dao",
          type: "depends_on",
          from: "service-1",
          to: "dao-1",
          projectId: "strong-data-path-project",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "queries-1",
          type: "queries",
          from: "dao-1",
          to: "mapper-1",
          projectId: "strong-data-path-project",
          sourceAdapterIds: ["ibatis-sql-map"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "contains-1",
          type: "contains",
          from: "mapper-1",
          to: "sql-1",
          projectId: "strong-data-path-project",
          sourceAdapterIds: ["ibatis-sql-map"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    }));

    const strongCard = reportStrong.dataFlowCards[0] as {
      inferenceLevel?: string;
      hiddenByDefault?: boolean;
      evidenceKinds?: string[];
    };
    expect(strongCard.inferenceLevel).toBe("confirmed");
    expect(strongCard.hiddenByDefault).toBe(false);
    expect(strongCard.evidenceKinds).toContain("dao-mapper-edge");
    expect(strongCard.evidenceKinds).toContain("sql-call");
  });

  it("renders a selected flow context bar and highlights the chosen flow card", () => {
    const html = renderInteractiveHtmlReport({
      projectId: "selected-flow-project",
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "dispatcher",
          projectId: "selected-flow-project",
          path: "app/WebContent/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.AccountAction",
          displayName: "accountAction",
          projectId: "selected-flow-project",
          path: "app/src/AccountAction.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            requestMappings: ["/account/getAccountWithdrawal.as"],
            requestHandlerMethods: [
              {
                methodName: "getAccountWithdrawal",
                requestMappings: ["/account/getAccountWithdrawal.as"],
                logicalViews: ["/jsp/response"],
              },
            ],
          },
        }),
        createNode({
          id: "view-1",
          type: "view",
          name: "response",
          displayName: "response",
          projectId: "selected-flow-project",
          path: "app/WebContent/WEB-INF/jsp/response.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "render-1",
          type: "renders",
          from: "controller-1",
          to: "view-1",
          projectId: "selected-flow-project",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId: "selected-flow-project",
          title: "dispatcher",
          reason: "Mapped by web.xml",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.as",
            contextConfigLocation: "WEB-INF/spring/dispatcher-servlet.xml",
          },
        }),
      ],
      warnings: [],
      artifacts: [],
    });

    expect(html).toContain('t("currentSelection")');
    expect(html).toContain('t("selectedRoute")');
    expect(html).toContain('t("backToList")');
    expect(html).toContain('state.selectedFlowId === flow.detailId ? " selected" : ""');
    expect(html).toContain('data-tab-target="\' + esc(inferSourceTab(detail)) + \'">');
  });

  it("matches entry points that expose multiple url patterns", () => {
    const projectId = "test-project";
    const nodes: GraphNode[] = [
      createNode({
        id: "route-1",
        type: "route",
        name: "dispatcher",
        displayName: "dispatcher",
        projectId,
        path: "app/WebContent/WEB-INF/web.xml",
        sourceAdapterIds: ["web-xml"],
        confidence: "high",
        evidence: [],
      }),
      createNode({
        id: "controller-1",
        type: "controller",
        name: "com.example.MultiPatternController",
        displayName: "MultiPatternController",
        projectId,
        path: "app/src/com/example/MultiPatternController.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
        metadata: {
          requestMappings: ["/app/search"],
        },
      }),
      createNode({
        id: "view-1",
        type: "view",
        name: "search",
        displayName: "search",
        projectId,
        path: "app/WebContent/WEB-INF/jsp/search.jsp",
        sourceAdapterIds: ["jsp-view"],
        confidence: "high",
        evidence: [],
      }),
    ];
    const edges: GraphEdge[] = [
      createEdge({
        id: "render-1",
        type: "renders",
        from: "controller-1",
        to: "view-1",
        projectId,
        sourceAdapterIds: ["jsp-view"],
        confidence: "high",
        directional: true,
        evidence: [],
      }),
    ];
    const entryPoints: EntryPoint[] = [
      createEntryPoint({
        id: "entry-1",
        type: "web_entry",
        targetEntityId: "route-1",
        projectId,
        title: "dispatcher",
        reason: "Mapped by web.xml",
        priority: 100,
        sourceAdapterIds: ["web-xml"],
        confidence: "high",
        metadata: {
          urlPattern: ["*.as", "/app/search"],
          contextConfigLocation: "WEB-INF/spring/dispatcher-servlet.xml",
        },
      }),
    ];
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-07T00:00:00.000Z",
      nodes,
      edges,
      entryPoints,
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    expect(report.screenCards[0]?.dispatcher).toBe("dispatcher");
    expect(report.screenCards[0]?.entryPattern).toContain("/app/search");
  });

  it("prefers specific routes ahead of wildcard-like routes in primary and request flow ordering", () => {
    const projectId = "route-order-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-10T00:00:00.000Z",
      nodes: [
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.AdminAction",
          displayName: "adminAction",
          projectId,
          path: "app/src/com/example/AdminAction.java",
          sourceAdapterIds: ["spring-xml", "java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            requestMappings: ["/admin/*.as", "/admin/list.as", "/admin/detail.as"],
            requestHandlers: [
              { methodName: "list", requestMappings: ["/admin/list.as"], viewNames: ["admin/list"], responseBody: false },
              { methodName: "detail", requestMappings: ["/admin/detail.as"], viewNames: ["admin/detail"], responseBody: false },
            ],
          },
        }),
        createNode({
          id: "view-1",
          type: "view",
          name: "admin/list",
          displayName: "admin/list",
          projectId,
          path: "app/WEB-INF/views/admin/list.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "view-2",
          type: "view",
          name: "admin/detail",
          displayName: "admin/detail",
          projectId,
          path: "app/WEB-INF/views/admin/detail.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "render-1",
          type: "renders",
          from: "controller-1",
          to: "view-1",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
          metadata: { handlerMethods: ["list"] },
        }),
        createEdge({
          id: "render-2",
          type: "renders",
          from: "controller-1",
          to: "view-2",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
          metadata: { handlerMethods: ["detail"] },
        }),
      ],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    expect(report.primaryFlowCards[0]?.route).toBe("/admin/detail.as");
    expect(report.screenFlowCards[0]?.route).toBe("/admin/detail.as");
    expect(report.screenFlowCards[1]?.route).toBe("/admin/list.as");
  });

  it("keeps primary entry flows diverse when one controller renders many views", () => {
    const projectId = "test-project";
    const nodes: GraphNode[] = [
      createNode({
        id: "route-1",
        type: "route",
        name: "dispatcher",
        displayName: "dispatcher",
        projectId,
        path: "app/WebContent/WEB-INF/web.xml",
        sourceAdapterIds: ["web-xml"],
        confidence: "high",
        evidence: [],
      }),
      createNode({
        id: "controller-a",
        type: "controller",
        name: "com.example.FirstController",
        displayName: "FirstController",
        projectId,
        path: "app/src/com/example/FirstController.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
        metadata: {
          requestMappings: Array.from({ length: 12 }, (_, index) => `/first/${index}.as`),
        },
      }),
      createNode({
        id: "controller-b",
        type: "controller",
        name: "com.example.SecondController",
        displayName: "SecondController",
        projectId,
        path: "app/src/com/example/SecondController.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
        metadata: {
          requestMappings: ["/zzz/second.as"],
        },
      }),
      ...Array.from({ length: 12 }, (_, index) =>
        createNode({
          id: `view-a-${index}`,
          type: "view",
          name: `first-${index}`,
          displayName: `first-${index}`,
          projectId,
          path: `app/WebContent/WEB-INF/jsp/first-${index}.jsp`,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ),
      createNode({
        id: "view-b-1",
        type: "view",
        name: "second",
        displayName: "second",
        projectId,
        path: "app/WebContent/WEB-INF/jsp/second.jsp",
        sourceAdapterIds: ["jsp-view"],
        confidence: "high",
        evidence: [],
      }),
    ];
    const edges: GraphEdge[] = [
      ...Array.from({ length: 12 }, (_, index) =>
        createEdge({
          id: `render-a-${index}`,
          type: "renders",
          from: "controller-a",
          to: `view-a-${index}`,
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ),
      createEdge({
        id: "render-b-1",
        type: "renders",
        from: "controller-b",
        to: "view-b-1",
        projectId,
        sourceAdapterIds: ["jsp-view"],
        confidence: "high",
        directional: true,
        evidence: [],
      }),
    ];
    const entryPoints: EntryPoint[] = [
      createEntryPoint({
        id: "entry-1",
        type: "web_entry",
        targetEntityId: "route-1",
        projectId,
        title: "dispatcher",
        reason: "Mapped by web.xml",
        priority: 100,
        sourceAdapterIds: ["web-xml"],
        confidence: "high",
        metadata: {
          urlPattern: "*.as",
        },
      }),
    ];
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-07T00:00:00.000Z",
      nodes,
      edges,
      entryPoints,
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    const primaryControllers = report.primaryFlowCards.map((card) => card.controller);
    expect(report.primaryFlowCards).toHaveLength(2);
    expect(primaryControllers).toContain("FirstController");
    expect(primaryControllers).toContain("SecondController");
    expect(report.primaryFlowCards[0]?.relatedDataSearchTerm).toBeUndefined();
  });

  it("shows logical view resolution and business path in flow details", () => {
    const projectId = "view-resolution-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "DispatcherServlet",
          projectId,
          path: "app/src/main/webapp/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.SampleController",
          displayName: "SampleController",
          projectId,
          path: "app/src/main/java/com/example/SampleController.java",
          sourceAdapterIds: ["java-source-basic", "spring-xml"],
          confidence: "high",
          evidence: [],
          metadata: {
            beanId: "sampleController",
            className: "com.example.SampleController",
            springConfigPath: "app/src/main/webapp/WEB-INF/dispatcher-servlet.xml",
            requestMappings: ["/sample/list.as"],
            requestHandlers: [
              {
                methodName: "list",
                requestMappings: ["/sample/list.as"],
                viewNames: ["sample/list"],
                responseBody: false,
                serviceCalls: [
                  {
                    targetType: "service",
                    targetName: "com.example.SampleService",
                    methodName: "getSampleList",
                  },
                ],
              },
            ],
          },
        }),
        createNode({
          id: "service-1",
          type: "service",
          name: "com.example.SampleService",
          displayName: "SampleService",
          projectId,
          path: "app/src/main/java/com/example/SampleService.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "dao-1",
          type: "dao",
          name: "com.example.SampleDao",
          displayName: "SampleDao",
          projectId,
          path: "app/src/main/java/com/example/SampleDao.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "view-1",
          type: "view",
          name: "sample/list",
          displayName: "list",
          projectId,
          path: "app/src/main/webapp/WEB-INF/views/sample/list.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "render-1",
          type: "renders",
          from: "controller-1",
          to: "view-1",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
          metadata: {
            handlerMethods: ["list"],
          },
        }),
        createEdge({
          id: "depends-controller-service",
          type: "depends_on",
          from: "controller-1",
          to: "service-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "depends-service-dao",
          type: "depends_on",
          from: "service-1",
          to: "dao-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId,
          title: "DispatcherServlet",
          reason: "Mapped by web.xml: *.as",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.as",
            contextConfigLocation: "WEB-INF/dispatcher-servlet.xml",
          },
        }),
      ],
      warnings: [],
      artifacts: [
        {
          id: "artifact-view-resolver",
          type: "spring-view-resolver",
          projectId,
          producerAdapterId: "spring-xml",
          payload: {
            file: "app/src/main/webapp/WEB-INF/dispatcher-servlet.xml",
            beanName: "jspViewResolver",
            className: "org.springframework.web.servlet.view.InternalResourceViewResolver",
            prefix: "/WEB-INF/views/",
            suffix: ".jsp",
          },
        },
      ],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    const detail = report.flowDetails.find((item) => item.type === "screen_flow_detail");
    const businessSection = detail?.sections?.find((section) => section.key === "detailBusinessSteps");
    const outputSection = detail?.sections?.find((section) => section.key === "detailOutput");

    expect(businessSection?.lines).toContain("business path: SampleController -> SampleService -> - -> SampleDao");
    expect(outputSection?.lines).toContain("logical view: sample/list");
    expect(outputSection?.lines).toContain("view resolver: jspViewResolver: /WEB-INF/views/*.jsp");
    expect(outputSection?.lines).toContain("resolved jsp candidates: /WEB-INF/views/sample/list.jsp");
    expect(businessSection?.lines).toContain("controller -> service evidence: SampleService.getSampleList()");
  });

  it("annotates browser entry when a prior screen action links to the current flow", () => {
    const projectId = "browser-entry-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "dispatcher",
          projectId,
          path: "app/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-list",
          type: "controller",
          name: "com.example.AdminListController",
          displayName: "AdminListController",
          projectId,
          path: "app/src/com/example/AdminListController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            requestMappings: ["/admin/list.as"],
          },
        }),
        createNode({
          id: "controller-detail",
          type: "controller",
          name: "com.example.AdminDetailController",
          displayName: "AdminDetailController",
          projectId,
          path: "app/src/com/example/AdminDetailController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            requestMappings: ["/admin/detail.as"],
          },
        }),
        createNode({
          id: "view-list",
          type: "view",
          name: "admin/list",
          displayName: "admin/list",
          projectId,
          path: "app/WEB-INF/views/admin/list.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
          metadata: {
            uiActions: [{ kind: "link", label: "detail", target: "/admin/detail.as" }],
          },
        }),
        createNode({
          id: "view-detail",
          type: "view",
          name: "admin/detail",
          displayName: "admin/detail",
          projectId,
          path: "app/WEB-INF/views/admin/detail.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "render-list",
          type: "renders",
          from: "controller-list",
          to: "view-list",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "render-detail",
          type: "renders",
          from: "controller-detail",
          to: "view-detail",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId,
          title: "dispatcher",
          reason: "Mapped by web.xml",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.as",
          },
        }),
      ],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    const detail = report.flowDetails.find((item) =>
      item.type === "screen_flow_detail" &&
      item.title?.includes("/admin/detail.as") === true,
    );
    const entrySection = detail?.sections?.find((section) => section.key === "detailEntrySetup");

    expect(entrySection?.lines).toContain("browser entry: linked from 1 prior screen action(s)");
    expect(entrySection?.actions?.some((action) => action.target === "/admin/detail.as")).toBe(true);
  });

  it("uses handler-level service calls in flow summary when controller-level data flow points elsewhere", () => {
    const projectId = "summary-service-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "dispatcher",
          projectId,
          path: "app/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.ContentCategoryAdminAction",
          displayName: "contentCategoryAction",
          projectId,
          path: "app/src/com/example/ContentCategoryAdminAction.java",
          sourceAdapterIds: ["spring-xml", "java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            beanId: "contentCategoryAction",
            className: "com.example.ContentCategoryAdminAction",
            handlerMappingPatterns: ["/contentcategory/*.as"],
            requestMappings: ["/contentcategory/list.as"],
            requestHandlers: [
              {
                methodName: "getContentCategoryList",
                requestMappings: ["/contentcategory/list.as"],
                viewNames: ["contentCategory/contentCategoryList"],
                serviceCalls: [
                  {
                    targetType: "service",
                    targetName: "com.example.CategoryService",
                    methodName: "getCategoryContentList",
                  },
                ],
              },
            ],
          },
        }),
        createNode({
          id: "category-service",
          type: "service",
          name: "com.example.CategoryService",
          displayName: "CategoryService",
          projectId,
          path: "app/src/com/example/CategoryService.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
        }),
        createNode({
          id: "shop-service",
          type: "service",
          name: "com.example.ShopCategoryService",
          displayName: "ShopCategoryService",
          projectId,
          path: "app/src/com/example/ShopCategoryService.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
        }),
        createNode({
          id: "view-1",
          type: "view",
          name: "contentCategory/contentCategoryList",
          displayName: "contentCategory/contentCategoryList",
          projectId,
          path: "app/WEB-INF/jsp/contentCategory/contentCategoryList.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "render-1",
          type: "renders",
          from: "controller-1",
          to: "view-1",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
          metadata: {
            handlerMethods: ["getContentCategoryList"],
          },
        }),
        createEdge({
          id: "depends-category",
          type: "depends_on",
          from: "controller-1",
          to: "category-service",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "depends-shop",
          type: "depends_on",
          from: "controller-1",
          to: "shop-service",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId,
          title: "dispatcher",
          reason: "Mapped by web.xml",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.as",
            contextConfigLocation: "WEB-INF/dispatcher-servlet.xml",
          },
        }),
      ],
      warnings: [],
      artifacts: [
        {
          id: "artifact-view-resolver",
          type: "spring-view-resolver",
          projectId,
          producerAdapterId: "spring-xml",
          payload: {
            file: "app/WEB-INF/dispatcher-servlet.xml",
            beanName: "viewResolver",
            className: "org.springframework.web.servlet.view.InternalResourceViewResolver",
            prefix: "/WEB-INF/jsp/",
            suffix: ".jsp",
          },
        },
      ],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    const detail = report.flowDetails.find((item) => item.title?.includes("/contentcategory/list.as") === true);
    const businessSection = detail?.sections?.find((section) => section.key === "detailBusinessSteps");

    expect(detail?.summary).toBe("/contentcategory/list.as -> contentCategoryAction -> CategoryService -> - -> contentCategory/contentCategoryList.jsp");
    expect(businessSection?.lines).toContain("business path: contentCategoryAction -> CategoryService -> - -> -");
    expect(detail?.summary).not.toContain("ShopCategoryService");
  });

  it("traces dao through a service to biz to dao chain", () => {
    const projectId = "biz-chain-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "dispatcher",
          projectId,
          path: "app/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.CategoryAction",
          displayName: "categoryAction",
          projectId,
          path: "app/src/com/example/CategoryAction.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            requestMappings: ["/contentcategory/list.as"],
            requestHandlers: [
              {
                methodName: "getContentCategoryList",
                requestMappings: ["/contentcategory/list.as"],
                viewNames: ["contentCategory/contentCategoryList"],
                responseBody: false,
                produces: [],
                contentTypes: [],
                redirectTargets: [],
                fileResponseHints: [],
                serviceCalls: [
                  { targetType: "service", targetName: "com.example.CategoryService", methodName: "getCategoryContentList" },
                ],
              },
            ],
          },
        }),
        createNode({
          id: "service-1",
          type: "service",
          name: "com.example.CategoryService",
          displayName: "CategoryService",
          projectId,
          path: "lib/src/com/example/CategoryService.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            methodSummaries: [
              {
                methodName: "getCategoryContentList",
                dependencyCalls: [
                  { targetType: "biz", targetName: "com.example.CategoryBiz", methodName: "getCategoryContentList" },
                ],
                sqlCalls: [],
              },
            ],
          },
        }),
        createNode({
          id: "biz-1",
          type: "biz",
          name: "com.example.CategoryBiz",
          displayName: "CategoryBiz",
          projectId,
          path: "lib/src/com/example/CategoryBiz.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            methodSummaries: [
              {
                methodName: "getCategoryContentList",
                dependencyCalls: [
                  { targetType: "dao", targetName: "com.example.CategoryDAO", methodName: "getCategoryContentList" },
                ],
                sqlCalls: [],
              },
            ],
          },
        }),
        createNode({
          id: "dao-1",
          type: "dao",
          name: "com.example.CategoryDAO",
          displayName: "CategoryDAO",
          projectId,
          path: "lib/src/com/example/CategoryDAO.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "view-1",
          type: "view",
          name: "contentCategory/contentCategoryList",
          displayName: "contentCategory/contentCategoryList",
          projectId,
          path: "app/WEB-INF/jsp/contentCategory/contentCategoryList.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "render-1",
          type: "renders",
          from: "controller-1",
          to: "view-1",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
          metadata: { handlerMethods: ["getContentCategoryList"] },
        }),
        createEdge({
          id: "depends-1",
          type: "depends_on",
          from: "controller-1",
          to: "service-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "depends-2",
          type: "depends_on",
          from: "service-1",
          to: "biz-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          directional: true,
          evidence: [{ kind: "java-field-type", value: "categoryBiz:CategoryBiz" }],
        }),
        createEdge({
          id: "depends-3",
          type: "depends_on",
          from: "biz-1",
          to: "dao-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          directional: true,
          evidence: [{ kind: "java-field-type", value: "categoryDAO:CategoryDAO" }],
        }),
      ],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId,
          title: "dispatcher",
          reason: "Mapped by web.xml",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.as",
            contextConfigLocation: "WEB-INF/dispatcher-servlet.xml",
          },
        }),
      ],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    const flow = report.screenFlowCards.find((item) => item.route === "/contentcategory/list.as") as Record<string, unknown> | undefined;
    const detail = report.flowDetails.find((item) => item.title?.includes("/contentcategory/list.as"));
    const businessSection = detail?.sections?.find((section) => section.key === "detailBusinessSteps");

    expect(flow?.biz).toBe("CategoryBiz");
    expect(flow?.dao).toBe("CategoryDAO");
    expect(businessSection?.lines).toContain("biz: CategoryBiz");
    expect(businessSection?.lines).toContain("dao: CategoryDAO");
    expect(businessSection?.lines).toContain("service -> biz evidence: CategoryService.getCategoryContentList() -> CategoryBiz.getCategoryContentList()");
    expect(businessSection?.lines).toContain("biz -> dao evidence: CategoryBiz.getCategoryContentList() -> CategoryDAO.getCategoryContentList()");
  });

  it("adds non-screen response tags for download, ajax, and external-facing candidates", () => {
    const projectId = "non-screen-tags-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "dispatcher",
          projectId,
          path: "app/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.ApiController",
          displayName: "apiController",
          projectId,
          path: "app/src/com/example/ApiController.java",
          sourceAdapterIds: ["spring-xml", "java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            beanId: "apiController",
            className: "com.example.ApiController",
            handlerMappingPatterns: ["/galaxyapi/v2/report/*.json"],
            methodNameResolverRef: "apiResolver",
            requestMappings: ["/galaxyapi/v2/report/exportExcel.json"],
            requestHandlers: [
              {
                methodName: "exportExcelAjax",
                requestMappings: ["/galaxyapi/v2/report/exportExcel.json"],
                viewNames: [],
                responseBody: true,
                serviceCalls: [
                  {
                    targetType: "service",
                    targetName: "com.example.ReportService",
                    methodName: "export",
                  },
                ],
              },
            ],
          },
        }),
        createNode({
          id: "service-1",
          type: "service",
          name: "com.example.ReportService",
          displayName: "ReportService",
          projectId,
          path: "app/src/com/example/ReportService.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "depends-1",
          type: "depends_on",
          from: "controller-1",
          to: "service-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId,
          title: "dispatcher",
          reason: "Mapped by web.xml",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.json",
            contextConfigLocation: "WEB-INF/dispatcher-servlet.xml",
          },
        }),
      ],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    const apiFlow = report.apiFlowCards.find((item) => item.route === "/galaxyapi/v2/report/exportExcel.json");
    const detail = report.flowDetails.find((item) => item.title?.includes("/galaxyapi/v2/report/exportExcel.json"));

    expect(apiFlow?.responseKind).toBe("file");
    expect(apiFlow?.responseTags).toEqual(["download", "ajax", "external-facing candidate"]);
    expect(detail?.responseKind).toBe("file");
    expect(detail?.responseTags).toEqual(["download", "ajax", "external-facing candidate"]);
  });

  it("shows external integration when a dao method calls an HTTP endpoint instead of SQL", () => {
    const projectId = "external-dao-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "dispatcher",
          projectId,
          path: "app/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.AccountingAction",
          displayName: "accountingAction",
          projectId,
          path: "app/src/com/example/AccountingAction.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            requestMappings: ["/accounting/accountingList.as"],
            requestHandlers: [
              {
                methodName: "accountingList",
                requestMappings: ["/accounting/accountingList.as"],
                viewNames: ["accounting/accountingList"],
                responseBody: false,
                produces: [],
                contentTypes: [],
                redirectTargets: [],
                fileResponseHints: [],
                serviceCalls: [
                  { targetType: "service", targetName: "com.example.AccountingService", methodName: "getSalesSummaryNewList" },
                ],
              },
            ],
          },
        }),
        createNode({
          id: "service-1",
          type: "service",
          name: "com.example.AccountingService",
          displayName: "AccountingService",
          projectId,
          path: "lib/src/com/example/AccountingService.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            methodSummaries: [
              {
                methodName: "getSalesSummaryNewList",
                dependencyCalls: [
                  { targetType: "biz", targetName: "com.example.AccountingBiz", methodName: "getSalesSummaryNewList" },
                ],
                sqlCalls: [],
                externalCalls: [],
              },
            ],
          },
        }),
        createNode({
          id: "biz-1",
          type: "biz",
          name: "com.example.AccountingBiz",
          displayName: "accountingBiz",
          projectId,
          path: "lib/src/com/example/AccountingBiz.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            methodSummaries: [
              {
                methodName: "getSalesSummaryNewList",
                dependencyCalls: [
                  { targetType: "dao", targetName: "com.example.AccountingADQDAO", methodName: "getSalesSummaryNewList" },
                ],
                sqlCalls: [],
                externalCalls: [],
              },
            ],
          },
        }),
        createNode({
          id: "dao-1",
          type: "dao",
          name: "com.example.AccountingADQDAO",
          displayName: "accountingADQDAO",
          projectId,
          path: "lib/src/com/example/AccountingADQDAO.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            methodSummaries: [
              {
                methodName: "getSalesSummaryNewList",
                dependencyCalls: [],
                sqlCalls: [],
                externalCalls: [
                  { kind: "http", target: "HttpURLConnection" },
                  { kind: "external-api", target: "AStoreConfig.getAccountingSystemURL()" },
                ],
              },
            ],
          },
        }),
        createNode({
          id: "view-1",
          type: "view",
          name: "accounting/accountingList",
          displayName: "accounting/accountingList",
          projectId,
          path: "app/WEB-INF/jsp/accounting/accountingList.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "render-1",
          type: "renders",
          from: "controller-1",
          to: "view-1",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
          metadata: { handlerMethods: ["accountingList"] },
        }),
        createEdge({
          id: "depends-1",
          type: "depends_on",
          from: "controller-1",
          to: "service-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "depends-2",
          type: "depends_on",
          from: "service-1",
          to: "biz-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "depends-3",
          type: "depends_on",
          from: "biz-1",
          to: "dao-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId,
          title: "dispatcher",
          reason: "Mapped by web.xml",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.as",
            contextConfigLocation: "WEB-INF/dispatcher-servlet.xml",
          },
        }),
      ],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    const flow = report.screenFlowCards.find((item) => item.route === "/accounting/accountingList.as") as Record<string, unknown> | undefined;
    const detail = report.flowDetails.find((item) => item.title?.includes("/accounting/accountingList.as"));
    const businessSection = detail?.sections?.find((section) => section.key === "detailBusinessSteps");
    const dataSection = detail?.sections?.find((section) => section.key === "detailDataAccess");

    expect(Array.isArray(flow?.integration)).toBe(true);
    expect((flow?.integration as string[])).toContain("external-api: AStoreConfig.getAccountingSystemURL()");
    expect(businessSection?.lines).toContain("integration: http: HttpURLConnection | external-api: AStoreConfig.getAccountingSystemURL()");
    expect(dataSection?.lines?.[0]).toContain("integration=http: HttpURLConnection ; external-api: AStoreConfig.getAccountingSystemURL()");
  });

  it("classifies non-screen response kinds for json, redirect, and action handlers", () => {
    const projectId = "non-screen-kind-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "dispatcher",
          projectId,
          path: "app/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.MixedController",
          displayName: "mixedController",
          projectId,
          path: "app/src/com/example/MixedController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            beanId: "mixedController",
            className: "com.example.MixedController",
            handlerMappingPatterns: ["/app/*.as", "/api/v1/*.json"],
            requestMappings: ["/api/v1/status.json", "/app/redirect.as", "/app/doSomething.as"],
            requestHandlers: [
              {
                methodName: "status",
                requestMappings: ["/api/v1/status.json"],
                viewNames: [],
                responseBody: true,
                produces: ["application/json"],
                contentTypes: ["application/json"],
                redirectTargets: [],
                fileResponseHints: [],
                serviceCalls: [],
              },
              {
                methodName: "redirectToList",
                requestMappings: ["/app/redirect.as"],
                viewNames: ["list"],
                responseBody: false,
                produces: [],
                contentTypes: [],
                redirectTargets: ["list"],
                fileResponseHints: [],
                serviceCalls: [],
              },
              {
                methodName: "doSomething",
                requestMappings: ["/app/doSomething.as"],
                viewNames: [],
                responseBody: false,
                produces: [],
                contentTypes: [],
                redirectTargets: [],
                fileResponseHints: [],
                serviceCalls: [],
              },
            ],
          },
        }),
      ],
      edges: [],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId,
          title: "dispatcher",
          reason: "Mapped by web.xml",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.as",
            contextConfigLocation: "WEB-INF/dispatcher-servlet.xml",
          },
        }),
      ],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    const jsonFlow = report.apiFlowCards.find((item) => item.route === "/api/v1/status.json");
    const redirectFlow = report.apiFlowCards.find((item) => item.route === "/app/redirect.as");
    const actionFlow = report.apiFlowCards.find((item) => item.route === "/app/doSomething.as");

    expect(jsonFlow?.responseKind).toBe("json");
    expect(redirectFlow?.responseKind).toBe("redirect");
    expect(actionFlow?.responseKind).toBe("action");
  });

  it("marks non-screen flows that are linked from JSP actions as internal-ui-linked", () => {
    const projectId = "internal-ui-linked-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "dispatcher",
          projectId,
          path: "app/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "view-1",
          type: "view",
          name: "sample/list",
          displayName: "sample/list",
          projectId,
          path: "app/WEB-INF/jsp/sample/list.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
          metadata: {
            uiActions: [
              { kind: "form", target: "/sample/exportExcel.as", label: "download" },
            ],
          },
        }),
        createNode({
          id: "controller-screen",
          type: "controller",
          name: "com.example.SampleController",
          displayName: "sampleController",
          projectId,
          path: "app/src/com/example/SampleController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            requestMappings: ["/sample/list.as"],
            requestHandlers: [
              { methodName: "list", requestMappings: ["/sample/list.as"], viewNames: ["sample/list"], responseBody: false, produces: [], contentTypes: [], redirectTargets: [], fileResponseHints: [] },
            ],
          },
        }),
        createNode({
          id: "controller-api",
          type: "controller",
          name: "com.example.ExportController",
          displayName: "exportController",
          projectId,
          path: "app/src/com/example/ExportController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            requestMappings: ["/sample/exportExcel.as"],
            requestHandlers: [
              { methodName: "export", requestMappings: ["/sample/exportExcel.as"], viewNames: [], responseBody: false, produces: [], contentTypes: [], redirectTargets: [], fileResponseHints: ["excel-workbook"] },
            ],
          },
        }),
      ],
      edges: [
        createEdge({
          id: "render-1",
          type: "renders",
          from: "controller-screen",
          to: "view-1",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId,
          title: "dispatcher",
          reason: "Mapped by web.xml",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.as",
            contextConfigLocation: "WEB-INF/dispatcher-servlet.xml",
          },
        }),
      ],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    const apiFlow = report.apiFlowCards.find((item) => item.route === "/sample/exportExcel.as");

    expect(apiFlow?.responseTags).toContain("internal-ui-linked");
  });

  it("builds module profiles for mvc-heavy, api-centric, and api-centric mixed modules", () => {
    const projectId = "module-profile-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "controller-admin",
          type: "controller",
          name: "com.example.admin.AdminController",
          displayName: "adminController",
          projectId,
          path: "apps/Admin/src/main/java/com/example/admin/AdminController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            requestMappings: ["/admin/list.as"],
            requestHandlers: [
              { methodName: "list", requestMappings: ["/admin/list.as"], viewNames: ["admin/list"], responseBody: false },
            ],
          },
        }),
        createNode({
          id: "view-admin",
          type: "view",
          name: "admin/list",
          displayName: "admin/list",
          projectId,
          path: "apps/Admin/WebContent/WEB-INF/jsp/admin/list.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-car",
          type: "controller",
          name: "com.example.carrier.ApiController",
          displayName: "carrierApi",
          projectId,
          path: "apps/Carrier/src/main/java/com/example/carrier/ApiController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            requestMappings: ["/galaxyapi/v2/report/export.json"],
            requestHandlers: [
              { methodName: "export", requestMappings: ["/galaxyapi/v2/report/export.json"], viewNames: [], responseBody: true },
            ],
          },
        }),
        createNode({
          id: "controller-car-web",
          type: "controller",
          name: "com.example.carrier.WebController",
          displayName: "carrierWeb",
          projectId,
          path: "apps/Carrier/src/main/java/com/example/carrier/WebController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            requestMappings: ["/carrier/home.as", "/galaxyapi/v2/status.json", "/galaxyapi/v2/comment/list.json"],
            requestHandlers: [
              { methodName: "home", requestMappings: ["/carrier/home.as"], viewNames: ["carrier/home"], responseBody: false },
              { methodName: "status", requestMappings: ["/galaxyapi/v2/status.json"], viewNames: [], responseBody: true },
              { methodName: "commentList", requestMappings: ["/galaxyapi/v2/comment/list.json"], viewNames: [], responseBody: true },
            ],
          },
        }),
        createNode({
          id: "view-car",
          type: "view",
          name: "carrier/home",
          displayName: "carrier/home",
          projectId,
          path: "apps/Carrier/WebContent/WEB-INF/jsp/carrier/home.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "config-car-api",
          type: "config",
          name: "applicationContextApi.xml",
          displayName: "applicationContextApi.xml",
          projectId,
          path: "apps/Carrier/WebContent/WEB-INF/spring/applicationContextApi.xml",
          sourceAdapterIds: ["spring-context"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "config-car-auth",
          type: "config",
          name: "applicationContextAuth.xml",
          displayName: "applicationContextAuth.xml",
          projectId,
          path: "apps/Carrier/WebContent/WEB-INF/spring/applicationContextAuth.xml",
          sourceAdapterIds: ["spring-context"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "render-admin",
          type: "renders",
          from: "controller-admin",
          to: "view-admin",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "render-car",
          type: "renders",
          from: "controller-car-web",
          to: "view-car",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));

    expect(report.moduleProfileCards.some((card) => card.title === "Admin" && card.profileLabel === "MVC-heavy web app")).toBe(true);
    expect(report.moduleProfileCards.some((card) => card.title === "Carrier" && card.profileLabel === "API-centric mixed app")).toBe(true);
  });

  it("shows dispatcher routing and view resolver context in framework details", () => {
    const projectId = "framework-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "DispatcherServlet",
          projectId,
          path: "app/src/main/webapp/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.AdminController",
          displayName: "AdminController",
          projectId,
          path: "app/src/main/java/com/example/AdminController.java",
          sourceAdapterIds: ["spring-xml", "java-source-basic"],
          confidence: "high",
          evidence: [],
          metadata: {
            beanId: "adminController",
            className: "com.example.AdminController",
            springConfigPath: "app/src/main/webapp/WEB-INF/dispatcher-servlet.xml",
            handlerMappingPatterns: ["/admin/*.as"],
            methodNameResolverRef: "adminResolver",
            requestMappings: ["/admin/list.as"],
            requestHandlers: [
              {
                methodName: "list",
                requestMappings: ["/admin/list.as"],
                viewNames: ["admin/list"],
                responseBody: false,
              },
            ],
          },
        }),
        createNode({
          id: "view-1",
          type: "view",
          name: "admin/list",
          displayName: "admin/list",
          projectId,
          path: "app/src/main/webapp/WEB-INF/views/admin/list.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "render-1",
          type: "renders",
          from: "controller-1",
          to: "view-1",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId,
          title: "dispatcher",
          reason: "Mapped by web.xml: *.as",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.as",
            contextConfigLocation: "WEB-INF/dispatcher-servlet.xml",
          },
        }),
      ],
      warnings: [],
      artifacts: [
        {
          id: "artifact-view-resolver",
          type: "spring-view-resolver",
          projectId,
          producerAdapterId: "spring-xml",
          payload: {
            file: "app/src/main/webapp/WEB-INF/dispatcher-servlet.xml",
            beanName: "jspViewResolver",
            className: "org.springframework.web.servlet.view.InternalResourceViewResolver",
            prefix: "/WEB-INF/views/",
            suffix: ".jsp",
          },
        },
      ],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    const detail = report.flowDetails.find((item) => item.type === "framework_flow_detail");
    const bootstrapSection = detail?.sections?.find((section) => section.key === "detailFrameworkBootstrap");
    const routingSection = detail?.sections?.find((section) => section.key === "detailFrameworkRouting");

    expect(bootstrapSection?.lines).toContain("spring contexts: WEB-INF/dispatcher-servlet.xml");
    expect(routingSection?.lines).toContain("handler mappings observed: /admin/*.as");
    expect(routingSection?.lines).toContain("method resolvers observed: adminResolver");
    expect(routingSection?.lines).toContain("view resolvers observed: jspViewResolver: /WEB-INF/views/*.jsp");
    expect(routingSection?.lines).toContain("resolved jsp examples: /WEB-INF/views/admin/list.jsp");
  });

  it("creates service-only data flow cards when a controller depends on a service without a dao", () => {
    const projectId = "test-project";
    const nodes: GraphNode[] = [
      createNode({
        id: "route-1",
        type: "route",
        name: "dispatcher",
        displayName: "dispatcher",
        projectId,
        path: "app/WebContent/WEB-INF/web.xml",
        sourceAdapterIds: ["web-xml"],
        confidence: "high",
        evidence: [],
      }),
      createNode({
        id: "controller-1",
        type: "controller",
        name: "com.example.AdminController",
        displayName: "AdminController",
        projectId,
        path: "app/src/com/example/AdminController.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
        metadata: {
          requestMappings: ["/admin/list.as"],
        },
      }),
      createNode({
        id: "service-1",
        type: "service",
        name: "com.example.AdminService",
        displayName: "AdminService",
        projectId,
        path: "app/src/com/example/AdminService.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
      }),
      createNode({
        id: "view-1",
        type: "view",
        name: "admin-list",
        displayName: "admin-list",
        projectId,
        path: "app/WebContent/WEB-INF/jsp/admin/list.jsp",
        sourceAdapterIds: ["jsp-view"],
        confidence: "high",
        evidence: [],
      }),
    ];
    const edges: GraphEdge[] = [
      createEdge({
        id: "depends-1",
        type: "depends_on",
        from: "controller-1",
        to: "service-1",
        projectId,
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        directional: true,
        evidence: [],
      }),
      createEdge({
        id: "render-1",
        type: "renders",
        from: "controller-1",
        to: "view-1",
        projectId,
        sourceAdapterIds: ["jsp-view"],
        confidence: "high",
        directional: true,
        evidence: [],
      }),
    ];
    const entryPoints: EntryPoint[] = [
      createEntryPoint({
        id: "entry-1",
        type: "web_entry",
        targetEntityId: "route-1",
        projectId,
        title: "dispatcher",
        reason: "Mapped by web.xml",
        priority: 100,
        sourceAdapterIds: ["web-xml"],
        confidence: "high",
        metadata: {
          urlPattern: "*.as",
        },
      }),
    ];
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-07T00:00:00.000Z",
      nodes,
      edges,
      entryPoints,
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    expect(report.screenCards[0]?.relatedDataSearchTerm).toBe("controller-1");
    expect(
      report.dataFlowCards.some((card) => card.service === "AdminService" && card.dao === undefined),
    ).toBe(true);
  });

  it("fills mapper and sql via namespace-suffix fallback even without queries edges", () => {
    const projectId = "test-project";
    const nodes: GraphNode[] = [
      createNode({
        id: "controller-1",
        type: "controller",
        name: "com.example.UserController",
        displayName: "UserController",
        projectId,
        path: "app/src/com/example/UserController.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
        metadata: {
          requestMappings: ["/user/list.as"],
        },
      }),
      createNode({
        id: "service-1",
        type: "service",
        name: "com.example.UserService",
        displayName: "UserService",
        projectId,
        path: "app/src/com/example/UserService.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
      }),
      createNode({
        id: "dao-1",
        type: "dao",
        name: "com.example.persistence.UserDaoImpl",
        displayName: "UserDaoImpl",
        projectId,
        path: "app/src/com/example/persistence/UserDaoImpl.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
      }),
      createNode({
        id: "mapper-1",
        type: "mapper",
        name: "legacy.repo.UserMapper",
        displayName: "UserMapper",
        projectId,
        path: "app/src/main/resources/mappers/user-mapper.xml",
        sourceAdapterIds: ["mybatis-mapper"],
        confidence: "high",
        evidence: [],
        metadata: {
          namespace: "legacy.repo.UserMapper",
        },
      }),
      createNode({
        id: "sql-1",
        type: "sql_statement",
        name: "legacy.repo.UserMapper.findUsers",
        displayName: "findUsers",
        projectId,
        path: "app/src/main/resources/mappers/user-mapper.xml",
        sourceAdapterIds: ["mybatis-mapper"],
        confidence: "high",
        evidence: [],
      }),
      createNode({
        id: "view-1",
        type: "view",
        name: "contentCategory/contentCategoryList",
        displayName: "contentCategory/contentCategoryList",
        projectId,
        path: "app/WebContent/WEB-INF/jsp/contentCategory/contentCategoryList.jsp",
        sourceAdapterIds: ["jsp-view"],
        confidence: "high",
        evidence: [],
      }),
    ];
    const edges: GraphEdge[] = [
      createEdge({
        id: "depends-controller-service",
        type: "depends_on",
        from: "controller-1",
        to: "service-1",
        projectId,
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        directional: true,
        evidence: [],
      }),
      createEdge({
        id: "depends-service-dao",
        type: "depends_on",
        from: "service-1",
        to: "dao-1",
        projectId,
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        directional: true,
        evidence: [],
      }),
      createEdge({
        id: "contains-1",
        type: "contains",
        from: "mapper-1",
        to: "sql-1",
        projectId,
        sourceAdapterIds: ["mybatis-mapper"],
        confidence: "high",
        directional: true,
        evidence: [],
      }),
    ];
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-07T00:00:00.000Z",
      nodes,
      edges,
      entryPoints: [],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    expect(
      report.dataFlowCards.some((card) =>
        card.dao === "UserDaoImpl" &&
        card.mapper === "UserMapper" &&
        Array.isArray(card.sqlCandidates) &&
        card.sqlCandidates.some((candidate) => String(candidate).includes("findUsers")),
      ),
    ).toBe(true);
  });

  it("collects multiple sql candidates for one mapper-backed dao path", () => {
    const projectId = "test-project";
    const nodes: GraphNode[] = [
      createNode({
        id: "controller-1",
        type: "controller",
        name: "com.example.ContentCategoryAction",
        displayName: "contentCategoryAction",
        projectId,
        path: "app/src/com/example/ContentCategoryAction.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
        metadata: {
          requestMappings: ["/contentcategory/list.as"],
          requestHandlers: [
            {
              methodName: "getContentCategoryList",
              requestMappings: ["/contentcategory/list.as"],
              viewNames: ["contentCategory/contentCategoryList"],
              responseBody: false,
              produces: [],
              contentTypes: [],
              redirectTargets: [],
              fileResponseHints: [],
              serviceCalls: [
                {
                  targetType: "service",
                  targetName: "com.example.CategoryService",
                  methodName: "getCategoryContentList",
                },
              ],
            },
          ],
        },
      }),
      createNode({
        id: "service-1",
        type: "service",
        name: "com.example.CategoryService",
        displayName: "CategoryService",
        projectId,
        path: "app/src/com/example/CategoryService.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
      }),
      createNode({
        id: "dao-1",
        type: "dao",
        name: "com.example.CategoryDAOImpl",
        displayName: "CategoryDAOImpl",
        projectId,
        path: "app/src/com/example/CategoryDAOImpl.java",
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
      }),
      createNode({
        id: "mapper-1",
        type: "mapper",
        name: "category",
        displayName: "category",
        projectId,
        path: "app/src/main/resources/categoryDao.xml",
        sourceAdapterIds: ["ibatis-sql-map"],
        confidence: "high",
        evidence: [],
        metadata: {
          namespace: "category",
        },
      }),
      createNode({
        id: "sql-1",
        type: "sql_statement",
        name: "category.getCategoryList",
        displayName: "getCategoryList",
        projectId,
        path: "app/src/main/resources/categoryDao.xml",
        sourceAdapterIds: ["ibatis-sql-map"],
        confidence: "high",
        evidence: [],
      }),
      createNode({
        id: "sql-2",
        type: "sql_statement",
        name: "category.getCategoryContentList",
        displayName: "getCategoryContentList",
        projectId,
        path: "app/src/main/resources/categoryDao.xml",
        sourceAdapterIds: ["ibatis-sql-map"],
        confidence: "high",
        evidence: [],
      }),
    ];
    const edges: GraphEdge[] = [
      createEdge({
        id: "depends-controller-service",
        type: "depends_on",
        from: "controller-1",
        to: "service-1",
        projectId,
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        directional: true,
        evidence: [],
      }),
      createEdge({
        id: "depends-service-dao",
        type: "depends_on",
        from: "service-1",
        to: "dao-1",
        projectId,
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        directional: true,
        evidence: [],
      }),
      createEdge({
        id: "queries-1",
        type: "queries",
        from: "dao-1",
        to: "mapper-1",
        projectId,
        sourceAdapterIds: ["ibatis-sql-map"],
        confidence: "medium",
        directional: true,
        evidence: [],
      }),
      createEdge({
        id: "contains-1",
        type: "contains",
        from: "mapper-1",
        to: "sql-1",
        projectId,
        sourceAdapterIds: ["ibatis-sql-map"],
        confidence: "high",
        directional: true,
        evidence: [],
      }),
      createEdge({
        id: "contains-2",
        type: "contains",
        from: "mapper-1",
        to: "sql-2",
        projectId,
        sourceAdapterIds: ["ibatis-sql-map"],
        confidence: "high",
        directional: true,
        evidence: [],
      }),
      createEdge({
        id: "renders-1",
        type: "renders",
        from: "controller-1",
        to: "view-1",
        projectId,
        sourceAdapterIds: ["java-source-basic"],
        confidence: "high",
        directional: true,
        evidence: [],
      }),
    ];
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes,
      edges,
      entryPoints: [],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    expect(
      report.dataFlowCards.some((card) =>
        String(card.dao) === "CategoryDAOImpl" &&
        Array.isArray(card.sqlCandidates) &&
        card.sqlCandidates.includes("getCategoryContentList") &&
        card.sqlCandidates.includes("getCategoryList"),
      ),
    ).toBe(true);
  });

  it("links heavy tabs to split html files for stable large-project viewing", () => {
    const snapshot: AnalysisSnapshot = {
      projectId: "test-project",
      profileId: "legacy-java-ee",
      createdAt: "2026-04-08T00:00:00.000Z",
      nodes: [],
      edges: [],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    };

    const html = renderInteractiveHtmlReport(snapshot);
    expect(html).toContain("explore.html");
    expect(html).toContain("evidence.html");
    expect(html).toContain("raw.html");
  });

  it("shows summarized route count with expandable full url list", () => {
    const projectId = "test-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-08T00:00:00.000Z",
      nodes: [
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.AdminController",
          displayName: "AdminController",
          projectId,
          path: "app/src/com/example/AdminController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            requestMappings: [
              "/admin/registerClient.as",
              "/admin/getClientList.as",
              "/admin/updateClientSecret.as",
              "/admin/deleteClient.as",
            ],
          },
        }),
      ],
      edges: [],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    expect(report.screenCards[0]?.route).toBe("/admin/registerClient.as, /admin/getClientList.as 외 2개");
    expect(report.screenCards[0]?.routeValues).toEqual([
      "/admin/registerClient.as",
      "/admin/getClientList.as",
      "/admin/updateClientSecret.as",
      "/admin/deleteClient.as",
    ]);
  });

  it("builds framework, screen, api, and detail flow views", () => {
    const projectId = "test-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-08T00:00:00.000Z",
      nodes: [
        createNode({
          id: "route-1",
          type: "route",
          name: "dispatcher",
          displayName: "dispatcher",
          projectId,
          path: "app/WebContent/WEB-INF/web.xml",
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "controller-screen",
          type: "controller",
          name: "com.example.AdminPageController",
          displayName: "AdminPageController",
          projectId,
          path: "app/src/com/example/AdminPageController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            requestMappings: ["/admin/list.as"],
          },
        }),
        createNode({
          id: "controller-api",
          type: "controller",
          name: "com.example.AdminApiController",
          displayName: "AdminApiController",
          projectId,
          path: "app/src/com/example/AdminApiController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            requestMappings: ["/admin/list.json.as"],
          },
        }),
        createNode({
          id: "service-1",
          type: "service",
          name: "com.example.AdminService",
          displayName: "AdminService",
          projectId,
          path: "app/src/com/example/AdminService.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
        }),
        createNode({
          id: "dao-1",
          type: "dao",
          name: "com.example.AdminDao",
          displayName: "AdminDao",
          projectId,
          path: "app/src/com/example/AdminDao.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
        }),
        createNode({
          id: "view-1",
          type: "view",
          name: "admin-list",
          displayName: "admin-list",
          projectId,
          path: "app/WebContent/WEB-INF/jsp/admin/list.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "depends-screen-service",
          type: "depends_on",
          from: "controller-screen",
          to: "service-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "depends-api-service",
          type: "depends_on",
          from: "controller-api",
          to: "service-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "depends-service-dao",
          type: "depends_on",
          from: "service-1",
          to: "dao-1",
          projectId,
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "render-1",
          type: "renders",
          from: "controller-screen",
          to: "view-1",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [
        createEntryPoint({
          id: "entry-1",
          type: "web_entry",
          targetEntityId: "route-1",
          projectId,
          title: "dispatcher",
          reason: "Mapped by web.xml",
          priority: 100,
          sourceAdapterIds: ["web-xml"],
          confidence: "high",
          metadata: {
            urlPattern: "*.as",
            contextConfigLocation: "WEB-INF/spring/dispatcher-servlet.xml",
          },
        }),
      ],
      warnings: [],
      artifacts: [],
    };

    const html = renderInteractiveHtmlReport(snapshot);
    const report = extractReportData(html);

    expect(report.frameworkFlowCards).toHaveLength(1);
    expect(report.screenFlowCards).toHaveLength(1);
    expect(report.apiFlowCards).toHaveLength(1);
    expect(report.flowDetails.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("Entry Flows");
    expect(html).toContain("Flow Details");
    expect(html).toContain("data-open-flow-detail");
  });

  it("groups one controller route into one screen flow with view variants", () => {
    const projectId = "test-project";
    const snapshot: AnalysisSnapshot = {
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-08T00:00:00.000Z",
      nodes: [
        createNode({
          id: "controller-1",
          type: "controller",
          name: "com.example.AdminController",
          displayName: "AdminController",
          projectId,
          path: "app/src/com/example/AdminController.java",
          sourceAdapterIds: ["java-source-basic"],
          confidence: "medium",
          evidence: [],
          metadata: {
            requestMappings: ["/admin/list.as", "/admin/detail.as"],
          },
        }),
        createNode({
          id: "view-1",
          type: "view",
          name: "list",
          displayName: "list",
          projectId,
          path: "app/WebContent/WEB-INF/jsp/admin/list.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
        createNode({
          id: "view-2",
          type: "view",
          name: "detail",
          displayName: "detail",
          projectId,
          path: "app/WebContent/WEB-INF/jsp/admin/detail.jsp",
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          evidence: [],
        }),
      ],
      edges: [
        createEdge({
          id: "render-1",
          type: "renders",
          from: "controller-1",
          to: "view-1",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
        createEdge({
          id: "render-2",
          type: "renders",
          from: "controller-1",
          to: "view-2",
          projectId,
          sourceAdapterIds: ["jsp-view"],
          confidence: "high",
          directional: true,
          evidence: [],
        }),
      ],
      entryPoints: [],
      warnings: [],
      artifacts: [],
    };

    const report = extractReportData(renderInteractiveHtmlReport(snapshot));
    expect(report.screenFlowCards).toHaveLength(1);
    expect(report.screenFlowCards[0]?.variantCount).toBe(2);
  });

  it("keeps full flow records searchable in large snapshot mode", () => {
    const projectId = "large-search-project";
    const fillerNodes = Array.from({ length: 6001 }, (_, index) =>
      createNode({
        id: `filler-${index}`,
        type: "config",
        name: `config-${index}`,
        displayName: `config-${index}`,
        projectId,
        path: `app/config/${index}.xml`,
        sourceAdapterIds: ["spring-xml"],
        confidence: "low",
        evidence: [],
      }),
    );
    const flowNodes = Array.from({ length: 45 }, (_, index) => [
      createNode({
        id: `controller-${index}`,
        type: "controller",
        name: `com.example.ContentCategoryController${index}`,
        displayName: `ContentCategoryController${index}`,
        projectId,
        path: `app/src/com/example/ContentCategoryController${index}.java`,
        sourceAdapterIds: ["java-source-basic"],
        confidence: "medium",
        evidence: [],
        metadata: {
          requestMappings: [`/contentcategory/${index}/list.as`],
        },
      }),
      createNode({
        id: `view-${index}`,
        type: "view",
        name: `contentcategory-${index}-list`,
        displayName: `contentcategory-${index}-list`,
        projectId,
        path: `app/WebContent/WEB-INF/jsp/contentcategory/${index}/list.jsp`,
        sourceAdapterIds: ["jsp-view"],
        confidence: "high",
        evidence: [],
      }),
    ]).flat();
    const flowEdges = Array.from({ length: 45 }, (_, index) =>
      createEdge({
        id: `render-${index}`,
        type: "renders",
        from: `controller-${index}`,
        to: `view-${index}`,
        projectId,
        sourceAdapterIds: ["jsp-view"],
        confidence: "high",
        directional: true,
        evidence: [],
      }),
    );

    const html = renderInteractiveHtmlReport({
      projectId,
      profileId: "legacy-java-ee",
      createdAt: "2026-04-09T00:00:00.000Z",
      nodes: [...fillerNodes, ...flowNodes],
      edges: flowEdges,
      entryPoints: [],
      warnings: [],
      artifacts: [],
    });
    const report = extractReportData(html);

    expect(report.screenFlowCards).toHaveLength(45);
    expect(report.flowDetails.some((detail) => detail.title?.includes("/contentcategory/44/list.as"))).toBe(true);
    expect(html).toContain('const previewItems = hasActiveFilter() ? filtered : filtered.slice(0, 40);');
  });
});
