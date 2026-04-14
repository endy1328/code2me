import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalysisSnapshot } from "./model.js";
import {
  prepareFlowReportData,
  renderEvidenceHtmlReport,
  renderExploreHtmlReport,
  renderInteractiveHtmlReport,
  renderInteractiveReportAssets,
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
  reportDataPath: string;
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
  internalReportDataPath: string;
  internalExplorePath: string;
  internalEvidencePath: string;
  internalRawPath: string;
  internalScreenFlowsPath: string;
  internalApiFlowsPath: string;
  internalFlowDetailsPath: string;
  internalArchitecturePath: string;
  targetWriteError?: string;
}

export interface WriteSnapshotProgressEvent {
  percent: number;
  message: string;
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
    reportDataPath: join(projectDir, "report-data.js"),
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
    internalReportDataPath: join(internalProjectDir, "report-data.js"),
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
  reportDataPath: string,
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
  reportData: string,
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
  await writeFile(reportDataPath, reportData, "utf8");
  await writeFile(explorePath, explore, "utf8");
  await writeFile(evidencePath, evidence, "utf8");
  await writeFile(rawPath, raw, "utf8");
  await writeFile(screenFlowsPath, screenFlows, "utf8");
  await writeFile(apiFlowsPath, apiFlows, "utf8");
  await writeFile(flowDetailsPath, flowDetails, "utf8");
  await writeFile(architecturePath, architecture, "utf8");
  await appendFile(historyPath, historyRecord + "\n", "utf8");
}

export async function writeSnapshot(
  projectRoot: string,
  projectId: string,
  snapshot: AnalysisSnapshot,
  onProgress?: (event: WriteSnapshotProgressEvent) => void,
): Promise<OutputPaths> {
  const outputPaths = getOutputPaths(projectRoot, projectId);
  onProgress?.({
    percent: 95,
    message: "Serializing snapshot payload",
  });
  const payload = JSON.stringify(snapshot, null, 2);

  onProgress?.({
    percent: 96,
    message: "Preparing report data",
  });
  const summary = renderMarkdownSummary(snapshot);
  const flowData = prepareFlowReportData(snapshot);

  onProgress?.({
    percent: 97,
    message: "Rendering HTML reports",
  });
  const reportAssets = renderInteractiveReportAssets(snapshot, flowData);
  const report = reportAssets.html;
  const reportData = reportAssets.dataScript;
  const explore = renderExploreHtmlReport(snapshot);
  const evidence = renderEvidenceHtmlReport(snapshot);
  const raw = renderRawHtmlReport(snapshot);
  const splitPages = renderSplitFlowHtmlReports(snapshot, flowData);
  const historyRecord = JSON.stringify({
    createdAt: snapshot.createdAt,
    profileId: snapshot.profileId,
    nodeCount: snapshot.nodes.length,
    edgeCount: snapshot.edges.length,
    entryPointCount: snapshot.entryPoints.length,
    warningCount: snapshot.warnings.length,
  });

  onProgress?.({
    percent: 98,
    message: "Writing internal output files",
  });
  await writeOutputSet(
    outputPaths.internalProjectDir,
    outputPaths.internalSnapshotPath,
    outputPaths.internalHistoryPath,
    outputPaths.internalSummaryPath,
    outputPaths.internalReportPath,
    outputPaths.internalReportDataPath,
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
    reportData,
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
    onProgress?.({
      percent: 99,
      message: "Writing project output files",
    });
    await writeOutputSet(
      outputPaths.projectDir,
      outputPaths.snapshotPath,
      outputPaths.historyPath,
      outputPaths.summaryPath,
      outputPaths.reportPath,
      outputPaths.reportDataPath,
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
      reportData,
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
