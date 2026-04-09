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
    expect(html).toContain('titleWithCount(t("relatedData"), filteredData.length)');
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
    expect(html).toContain('t("showAllRequests") + " (" + card.routeValues.length + ")"');
    expect(html).toContain('t("evidenceBasis") + ": " + (card.evidenceLabel || t("notConfirmed"))');
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

    expect(businessSection?.lines).toContain("business path: SampleController -> SampleService -> SampleDao");
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
    expect(businessSection?.lines).toContain("business path: contentCategoryAction -> CategoryService -> -");
    expect(detail?.summary).not.toContain("ShopCategoryService");
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
        card.sql === "findUsers",
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
    expect(html).toContain("Framework Flow");
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
