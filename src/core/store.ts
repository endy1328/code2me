import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalysisSnapshot } from "./model.js";
import {
  renderEvidenceHtmlReport,
  renderExploreHtmlReport,
  renderInteractiveHtmlReport,
  renderMarkdownSummary,
  renderRawHtmlReport,
  renderSplitFlowHtmlReports,
} from "./report.js";

export interface OutputPaths {
  projectDir: string;
  snapshotPath: string;
  historyPath: string;
  summaryPath: string;
  reportPath: string;
  explorePath: string;
  evidencePath: string;
  rawPath: string;
  screenFlowsPath: string;
  apiFlowsPath: string;
  flowDetailsPath: string;
  architecturePath: string;
  internalProjectDir: string;
  internalSnapshotPath: string;
  internalHistoryPath: string;
  internalSummaryPath: string;
  internalReportPath: string;
  internalExplorePath: string;
  internalEvidencePath: string;
  internalRawPath: string;
  internalScreenFlowsPath: string;
  internalApiFlowsPath: string;
  internalFlowDetailsPath: string;
  internalArchitecturePath: string;
  targetWriteError?: string;
}

function sanitizeProjectKey(projectId: string): string {
  const normalized = projectId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "project";
}

function getRepoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function getOutputPaths(projectRoot: string, projectId: string): OutputPaths {
  const projectDir = join(projectRoot, ".code2me");
  const internalProjectDir = join(
    getRepoRoot(),
    ".code2me-result",
    "projects",
    sanitizeProjectKey(projectId || basename(projectRoot)),
  );

  return {
    projectDir,
    snapshotPath: join(projectDir, "snapshot.json"),
    historyPath: join(projectDir, "history.jsonl"),
    summaryPath: join(projectDir, "summary.md"),
    reportPath: join(projectDir, "report.html"),
    explorePath: join(projectDir, "explore.html"),
    evidencePath: join(projectDir, "evidence.html"),
    rawPath: join(projectDir, "raw.html"),
    screenFlowsPath: join(projectDir, "screen-flows.html"),
    apiFlowsPath: join(projectDir, "api-flows.html"),
    flowDetailsPath: join(projectDir, "flow-details.html"),
    architecturePath: join(projectDir, "architecture-context.html"),
    internalProjectDir,
    internalSnapshotPath: join(internalProjectDir, "snapshot.json"),
    internalHistoryPath: join(internalProjectDir, "history.jsonl"),
    internalSummaryPath: join(internalProjectDir, "summary.md"),
    internalReportPath: join(internalProjectDir, "report.html"),
    internalExplorePath: join(internalProjectDir, "explore.html"),
    internalEvidencePath: join(internalProjectDir, "evidence.html"),
    internalRawPath: join(internalProjectDir, "raw.html"),
    internalScreenFlowsPath: join(internalProjectDir, "screen-flows.html"),
    internalApiFlowsPath: join(internalProjectDir, "api-flows.html"),
    internalFlowDetailsPath: join(internalProjectDir, "flow-details.html"),
    internalArchitecturePath: join(internalProjectDir, "architecture-context.html"),
  };
}

async function writeOutputSet(
  projectDir: string,
  snapshotPath: string,
  historyPath: string,
  summaryPath: string,
  reportPath: string,
  explorePath: string,
  evidencePath: string,
  rawPath: string,
  screenFlowsPath: string,
  apiFlowsPath: string,
  flowDetailsPath: string,
  architecturePath: string,
  payload: string,
  summary: string,
  report: string,
  explore: string,
  evidence: string,
  raw: string,
  screenFlows: string,
  apiFlows: string,
  flowDetails: string,
  architecture: string,
  historyRecord: string,
): Promise<void> {
  await mkdir(projectDir, { recursive: true });
  await writeFile(snapshotPath, payload + "\n", "utf8");
  await writeFile(summaryPath, summary, "utf8");
  await writeFile(reportPath, report, "utf8");
  await writeFile(explorePath, explore, "utf8");
  await writeFile(evidencePath, evidence, "utf8");
  await writeFile(rawPath, raw, "utf8");
  await writeFile(screenFlowsPath, screenFlows, "utf8");
  await writeFile(apiFlowsPath, apiFlows, "utf8");
  await writeFile(flowDetailsPath, flowDetails, "utf8");
  await writeFile(architecturePath, architecture, "utf8");
  await appendFile(historyPath, historyRecord + "\n", "utf8");
}

export async function writeSnapshot(projectRoot: string, projectId: string, snapshot: AnalysisSnapshot): Promise<OutputPaths> {
  const outputPaths = getOutputPaths(projectRoot, projectId);
  const payload = JSON.stringify(snapshot, null, 2);
  const summary = renderMarkdownSummary(snapshot);
  const report = renderInteractiveHtmlReport(snapshot);
  const explore = renderExploreHtmlReport(snapshot);
  const evidence = renderEvidenceHtmlReport(snapshot);
  const raw = renderRawHtmlReport(snapshot);
  const splitPages = renderSplitFlowHtmlReports(snapshot);
  const historyRecord = JSON.stringify({
    createdAt: snapshot.createdAt,
    profileId: snapshot.profileId,
    nodeCount: snapshot.nodes.length,
    edgeCount: snapshot.edges.length,
    entryPointCount: snapshot.entryPoints.length,
    warningCount: snapshot.warnings.length,
  });

  await writeOutputSet(
    outputPaths.internalProjectDir,
    outputPaths.internalSnapshotPath,
    outputPaths.internalHistoryPath,
    outputPaths.internalSummaryPath,
    outputPaths.internalReportPath,
    outputPaths.internalExplorePath,
    outputPaths.internalEvidencePath,
    outputPaths.internalRawPath,
    outputPaths.internalScreenFlowsPath,
    outputPaths.internalApiFlowsPath,
    outputPaths.internalFlowDetailsPath,
    outputPaths.internalArchitecturePath,
    payload,
    summary,
    report,
    explore,
    evidence,
    raw,
    splitPages.screenFlows,
    splitPages.apiFlows,
    splitPages.flowDetails,
    splitPages.architecture,
    historyRecord,
  );

  try {
    await writeOutputSet(
      outputPaths.projectDir,
      outputPaths.snapshotPath,
      outputPaths.historyPath,
      outputPaths.summaryPath,
      outputPaths.reportPath,
      outputPaths.explorePath,
      outputPaths.evidencePath,
      outputPaths.rawPath,
      outputPaths.screenFlowsPath,
      outputPaths.apiFlowsPath,
      outputPaths.flowDetailsPath,
      outputPaths.architecturePath,
      payload,
      summary,
      report,
      explore,
      evidence,
      raw,
      splitPages.screenFlows,
      splitPages.apiFlows,
      splitPages.flowDetails,
      splitPages.architecture,
      historyRecord,
    );
  } catch (error) {
    outputPaths.targetWriteError = error instanceof Error ? error.message : String(error);
  }

  return outputPaths;
}
