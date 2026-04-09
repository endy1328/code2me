import { basename, resolve } from "node:path";
import { buildFileIndex } from "../scanner/file-index.js";
import { analyzeProject, detectBestProfileMatch, type AnalyzeProgressEvent } from "../core/analysis.js";
import { collectAvailableAdapters, createBuiltInProfiles, findProfileById } from "../core/catalog.js";
import { parseAnalyzeArgs } from "./options.js";

function renderProgress(event: AnalyzeProgressEvent): void {
  const percent = `${String(event.percent).padStart(3, " ")}%`;
  if (event.phase === "adapter") {
    const progress = event.totalAdapters ? ` (${event.completedAdapters}/${event.totalAdapters})` : "";
    process.stderr.write(`[${percent}] ${event.message}${progress}\n`);
    return;
  }
  process.stderr.write(`[${percent}] ${event.message}\n`);
}

function renderUsage(): string {
  return [
    "Usage: npm run analyze -- <project-root> [--profile <id>] [--adapter <id[,id...]>]",
    "       npm run analyze -- --list-profiles",
    "       npm run analyze -- --list-adapters",
    "",
    "Options:",
    "  --profile <id>        Use a specific analysis profile",
    "  --adapter <ids>       Override adapters within the selected profile",
    "  --list-profiles       Show built-in analysis profiles",
    "  --list-adapters       Show available adapters",
    "  --help, -h            Show this help",
  ].join("\n");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== "analyze") {
    process.stderr.write(`${renderUsage()}\n`);
    process.exitCode = 1;
    return;
  }

  let cliOptions;
  try {
    cliOptions = parseAnalyzeArgs(process.argv.slice(3));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write(`${renderUsage()}\n`);
    process.exitCode = 1;
    return;
  }

  const profiles = createBuiltInProfiles();
  const availableAdapters = collectAvailableAdapters(profiles);

  if (cliOptions.help) {
    process.stdout.write(`${renderUsage()}\n`);
    return;
  }

  if (cliOptions.listProfiles) {
    process.stdout.write(JSON.stringify({
      profiles: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        version: profile.version,
        description: profile.description,
        projectType: profile.projectType,
        technologyTags: profile.technologyTags,
        adapters: profile.getRequiredAdapters().map((adapter) => adapter.id),
      })),
    }, null, 2) + "\n");
    return;
  }

  if (cliOptions.listAdapters) {
    process.stdout.write(JSON.stringify({
      adapters: availableAdapters.map((adapter) => ({
        id: adapter.id,
        name: adapter.name,
        version: adapter.version,
        capabilities: adapter.capabilities,
      })),
    }, null, 2) + "\n");
    return;
  }

  if (!cliOptions.targetPath) {
    process.stderr.write(`${renderUsage()}\n`);
    process.exitCode = 1;
    return;
  }

  const targetPath = resolve(cliOptions.targetPath);
  process.stderr.write("[  0%] Starting analysis\n");
  process.stderr.write("[  5%] Building file index\n");
  const fileIndex = await buildFileIndex(targetPath);

  let detectionMatch = null;
  let profile = null;
  if (cliOptions.profileId) {
    profile = findProfileById(profiles, cliOptions.profileId) ?? null;
    if (!profile) {
      process.stderr.write(`Unknown profile: ${cliOptions.profileId}\n`);
      process.stderr.write("Use --list-profiles to see supported profile ids.\n");
      process.exitCode = 1;
      return;
    }
    detectionMatch = { profile, detection: profile.detect(fileIndex.files) };
  } else {
    process.stderr.write("[ 15%] Detecting profile\n");
    detectionMatch = detectBestProfileMatch(fileIndex.files, profiles);
    profile = detectionMatch?.profile ?? null;
  }

  if (!profile) {
    process.stderr.write("No matching profile detected.\n");
    process.stderr.write("Use --list-profiles to inspect supported profiles or pass --profile explicitly.\n");
    process.exitCode = 1;
    return;
  }

  const profileAdapters = profile.getRequiredAdapters();
  const selectedAdapters = cliOptions.adapterIds.length > 0
    ? profileAdapters.filter((adapter) => cliOptions.adapterIds.includes(adapter.id))
    : profileAdapters;

  if (cliOptions.adapterIds.length > 0) {
    const missingAdapters = cliOptions.adapterIds.filter((adapterId) =>
      !profileAdapters.some((adapter) => adapter.id === adapterId),
    );
    if (missingAdapters.length > 0) {
      process.stderr.write(`Unsupported adapter for profile ${profile.id}: ${missingAdapters.join(", ")}\n`);
      process.stderr.write(`Profile adapters: ${profileAdapters.map((adapter) => adapter.id).join(", ")}\n`);
      process.exitCode = 1;
      return;
    }
  }

  if (selectedAdapters.length === 0) {
    process.stderr.write(`No runnable adapters selected for profile ${profile.id}.\n`);
    process.exitCode = 1;
    return;
  }

  process.stderr.write(`[info] Using profile: ${profile.id}\n`);
  process.stderr.write(`[info] Adapters: ${selectedAdapters.map((adapter) => adapter.id).join(", ")}\n`);

  const result = await analyzeProject({
    projectRoot: targetPath,
    projectId: basename(targetPath),
    profile,
    adaptersOverride: selectedAdapters,
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
    selectedAdapterIds: selectedAdapters.map((adapter) => adapter.id),
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
