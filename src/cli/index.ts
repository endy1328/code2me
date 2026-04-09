import { basename, resolve } from "node:path";
import { buildFileIndex } from "../scanner/file-index.js";
import { LegacyJavaEeProfile } from "../profiles/legacy-java-ee.js";
import { analyzeProject, detectBestProfileMatch, type AnalyzeProgressEvent } from "../core/analysis.js";

function renderProgress(event: AnalyzeProgressEvent): void {
  const percent = `${String(event.percent).padStart(3, " ")}%`;
  if (event.phase === "adapter") {
    const progress = event.totalAdapters ? ` (${event.completedAdapters}/${event.totalAdapters})` : "";
    process.stderr.write(`[${percent}] ${event.message}${progress}\n`);
    return;
  }
  process.stderr.write(`[${percent}] ${event.message}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const targetPath = resolve(process.argv[3] ?? process.cwd());

  if (command !== "analyze") {
    process.stderr.write("Usage: npm run analyze -- <project-root>\n");
    process.exitCode = 1;
    return;
  }

  process.stderr.write("[  0%] Starting analysis\n");
  process.stderr.write("[  5%] Building file index\n");
  const fileIndex = await buildFileIndex(targetPath);
  process.stderr.write("[ 15%] Detecting profile\n");
  const profiles = [new LegacyJavaEeProfile()];
  const detectionMatch = detectBestProfileMatch(fileIndex.files, profiles);
  const profile = detectionMatch?.profile ?? null;

  if (!profile) {
    process.stderr.write("No matching profile detected.\n");
    process.exitCode = 1;
    return;
  }

  const result = await analyzeProject({
    projectRoot: targetPath,
    projectId: basename(targetPath),
    profile,
    fileIndex,
    onProgress: renderProgress,
  });

  const { snapshot, outputPaths } = result;
  const effectiveOutputDir = outputPaths.targetWriteError ? outputPaths.internalProjectDir : outputPaths.projectDir;
  const effectiveReportPath = outputPaths.targetWriteError ? outputPaths.internalReportPath : outputPaths.reportPath;
  const effectiveExplorePath = outputPaths.targetWriteError ? outputPaths.internalExplorePath : outputPaths.explorePath;
  const effectiveEvidencePath = outputPaths.targetWriteError ? outputPaths.internalEvidencePath : outputPaths.evidencePath;
  const effectiveRawPath = outputPaths.targetWriteError ? outputPaths.internalRawPath : outputPaths.rawPath;
  const effectiveSummaryPath = outputPaths.targetWriteError ? outputPaths.internalSummaryPath : outputPaths.summaryPath;
  if (outputPaths.targetWriteError) {
    process.stderr.write(`[warn] Target output write failed: ${outputPaths.targetWriteError}\n`);
    process.stderr.write(`[warn] Internal mirror was written to ${outputPaths.internalProjectDir}\n`);
  }
  process.stdout.write(JSON.stringify({
    profileId: snapshot.profileId,
    profileDetection: detectionMatch?.detection ?? null,
    nodeCount: snapshot.nodes.length,
    edgeCount: snapshot.edges.length,
    entryPointCount: snapshot.entryPoints.length,
    warningCount: snapshot.warnings.length,
    sourceRoot: targetPath,
    outputDir: effectiveOutputDir,
    reportPath: effectiveReportPath,
    explorePath: effectiveExplorePath,
    evidencePath: effectiveEvidencePath,
    rawPath: effectiveRawPath,
    summaryPath: effectiveSummaryPath,
    targetOutputDir: outputPaths.projectDir,
    targetReportPath: outputPaths.reportPath,
    targetExplorePath: outputPaths.explorePath,
    targetEvidencePath: outputPaths.evidencePath,
    targetRawPath: outputPaths.rawPath,
    targetSummaryPath: outputPaths.summaryPath,
    internalOutputDir: outputPaths.internalProjectDir,
    internalReportPath: outputPaths.internalReportPath,
    internalExplorePath: outputPaths.internalExplorePath,
    internalEvidencePath: outputPaths.internalEvidencePath,
    internalRawPath: outputPaths.internalRawPath,
    internalSummaryPath: outputPaths.internalSummaryPath,
    targetWriteError: outputPaths.targetWriteError ?? null,
  }, null, 2) + "\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
