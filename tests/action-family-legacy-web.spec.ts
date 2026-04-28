import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeProject, detectBestProfileMatch } from "../src/core/analysis.js";
import { createBuiltInProfiles } from "../src/core/catalog.js";
import { renderInteractiveReportAssets } from "../src/core/report.js";
import { buildFileIndex } from "../src/scanner/file-index.js";
import { ActionFamilyLegacyWebProfile } from "../src/profiles/action-family-legacy-web.js";

function extractReportData(dataScript: string): {
  frameworkFlowCards: Array<Record<string, unknown>>;
  screenFlowCards: Array<Record<string, unknown>>;
  apiFlowCards: Array<Record<string, unknown>>;
  flowDetails: Array<Record<string, unknown>>;
} {
  const prefix = "window.__CODE2ME_REPORT__ = ";
  const suffix = ";\nwindow.__CODE2ME_TRANSLATIONS__ = ";
  const start = dataScript.indexOf(prefix);
  const end = dataScript.indexOf(suffix);
  if (start < 0 || end < 0) {
    throw new Error("report payload not found");
  }
  return JSON.parse(dataScript.slice(start + prefix.length, end)) as {
    frameworkFlowCards: Array<Record<string, unknown>>;
    screenFlowCards: Array<Record<string, unknown>>;
    apiFlowCards: Array<Record<string, unknown>>;
    flowDetails: Array<Record<string, unknown>>;
  };
}

describe("Action-family legacy web profile", () => {
  it("prefers the action-family profile for a Struts-style project and restores action routes", async () => {
    const projectRoot = resolve("samples/action-family-legacy-web-struts-minimal");
    const fileIndex = await buildFileIndex(projectRoot);
    const detection = detectBestProfileMatch(fileIndex.files, createBuiltInProfiles());

    expect(detection?.profile.id).toBe("action-family-legacy-web");
    expect(detection?.detection.score).toBe(12);
    expect(detection?.detection.reasons).toEqual(["build.xml", "web.xml", "struts.xml", "jsp"]);

    const result = await analyzeProject({
      projectRoot,
      projectId: "action-family-legacy-web-struts-minimal",
      profile: new ActionFamilyLegacyWebProfile(),
      fileIndex,
    });

    const controller = result.snapshot.nodes.find((node) => node.type === "controller" && node.name === "com.example.action.AccountAction");
    const requestMappings = Array.isArray(controller?.metadata?.requestMappings)
      ? controller.metadata.requestMappings as string[]
      : [];
    const requestHandlers = Array.isArray(controller?.metadata?.requestHandlers)
      ? controller.metadata.requestHandlers as Array<Record<string, unknown>>
      : [];

    expect(requestMappings).toContain("/account/list.action");
    expect(requestMappings).toContain("/account/download.action");
    expect(requestMappings).toContain("/account/save.action");
    expect(requestMappings).toContain("/person/*Person.action");
    expect(requestHandlers.some((handler) => handler.methodName === "list" && Array.isArray(handler.viewNames) && handler.viewNames.includes("account/list"))).toBe(true);
    expect(requestHandlers.some((handler) => handler.methodName === "download" && Array.isArray(handler.fileResponseHints) && handler.fileResponseHints.includes("stream-result"))).toBe(true);
    expect(requestHandlers.some((handler) => handler.methodName === "save" && Array.isArray(handler.redirectTargets) && handler.redirectTargets.includes("/account/list.action"))).toBe(true);
    expect(requestHandlers.some((handler) =>
      handler.methodName === "{1}Person" &&
      Array.isArray(handler.requestMappings) &&
      handler.requestMappings.includes("/person/*Person.action") &&
      Array.isArray(handler.redirectTargets) &&
      handler.redirectTargets.includes("/person/*Person.action") &&
      handler.redirectTargets.includes("/account/list.action"),
    )).toBe(true);

    const report = extractReportData(renderInteractiveReportAssets(result.snapshot).dataScript);
    expect(report.frameworkFlowCards.some((card) => card.entryPattern === "*.action")).toBe(true);
    expect(report.frameworkFlowCards.some((card) => card.entryPattern === "*.dyn")).toBe(true);
    expect(report.screenFlowCards.some((card) => card.route === "/account/list.action")).toBe(true);
    expect(report.screenFlowCards.some((card) => card.route === "/person/*Person.action")).toBe(true);
    expect(report.apiFlowCards.some((card) => card.route === "/account/download.action")).toBe(true);
  });

  it("prefers the action-family profile for a Stripes-style project and restores event handlers", async () => {
    const projectRoot = resolve("samples/action-family-legacy-web-stripes-minimal");
    const fileIndex = await buildFileIndex(projectRoot);
    const detection = detectBestProfileMatch(fileIndex.files, createBuiltInProfiles());

    expect(detection?.profile.id).toBe("action-family-legacy-web");
    expect(detection?.detection.score).toBe(11);
    expect(detection?.detection.reasons).toEqual(["build.xml", "web.xml", "action-bean", "jsp"]);

    const result = await analyzeProject({
      projectRoot,
      projectId: "action-family-legacy-web-stripes-minimal",
      profile: new ActionFamilyLegacyWebProfile(),
      fileIndex,
    });

    const controller = result.snapshot.nodes.find((node) => node.type === "controller" && node.name === "com.example.web.AccountActionBean");
    const requestMappings = Array.isArray(controller?.metadata?.requestMappings)
      ? controller.metadata.requestMappings as string[]
      : [];
    const requestHandlers = Array.isArray(controller?.metadata?.requestHandlers)
      ? controller.metadata.requestHandlers as Array<Record<string, unknown>>
      : [];

    expect(controller?.metadata?.actionFramework).toBe("stripes");
    expect(requestMappings).toContain("/account/list.action");
    expect(requestHandlers.some((handler) => handler.methodName === "list" && Array.isArray(handler.viewNames) && handler.viewNames.includes("account/list"))).toBe(true);
    expect(requestHandlers.some((handler) =>
      handler.methodName === "download" &&
      Array.isArray(handler.requestMappings) &&
      handler.requestMappings.includes("/account/list.action?download") &&
      Array.isArray(handler.fileResponseHints) &&
      handler.fileResponseHints.includes("streaming-resolution"),
    )).toBe(true);
    expect(requestHandlers.some((handler) =>
      handler.methodName === "refresh" &&
      Array.isArray(handler.requestMappings) &&
      handler.requestMappings.includes("/account/list.action?refresh") &&
      Array.isArray(handler.redirectTargets) &&
      handler.redirectTargets.includes("/account/list.action"),
    )).toBe(true);
    expect(requestHandlers.some((handler) =>
      handler.methodName === "checkout" &&
      Array.isArray(handler.requestMappings) &&
      handler.requestMappings.includes("/account/list.action?checkout") &&
      Array.isArray(handler.sessionRouteHints) &&
      handler.sessionRouteHints.includes("/Account.action"),
    )).toBe(true);
    expect(requestHandlers.some((handler) =>
      handler.methodName === "profile" &&
      Array.isArray(handler.requestMappings) &&
      handler.requestMappings.includes("/account/list.action?profile") &&
      Array.isArray(handler.sessionRouteHints) &&
      handler.sessionRouteHints.includes("/Account.action"),
    )).toBe(true);

    const report = extractReportData(renderInteractiveReportAssets(result.snapshot).dataScript);
    expect(report.frameworkFlowCards.some((card) => card.entryPattern === "*.action")).toBe(true);
    expect(report.screenFlowCards.some((card) => card.route === "/account/list.action")).toBe(true);
    expect(report.flowDetails.some((detail) =>
      String(detail.title).includes("/account/list.action?checkout") &&
      JSON.stringify(detail).includes("session route hints: /Account.action"),
    )).toBe(true);
    expect(report.flowDetails.some((detail) =>
      String(detail.title).includes("/account/list.action?profile") &&
      JSON.stringify(detail).includes("session route hints: /Account.action"),
    )).toBe(true);
  });
});
