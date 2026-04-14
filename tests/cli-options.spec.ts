import { describe, expect, it } from "vitest";
import { parseAnalyzeArgs } from "../src/cli/options.js";
import { collectAvailableAdapters, createBuiltInProfiles, findProfileById } from "../src/core/catalog.js";

describe("CLI analyze options", () => {
  it("parses explicit profile and adapter overrides", () => {
    const options = parseAnalyzeArgs([
      "samples/legacy-java-ee-minimal",
      "--profile",
      "legacy-java-ee",
      "--adapter",
      "web-xml,spring-xml",
      "--adapter=java-source-basic",
    ]);

    expect(options.targetPath).toBe("samples/legacy-java-ee-minimal");
    expect(options.profileId).toBe("legacy-java-ee");
    expect(options.adapterIds).toEqual(["web-xml", "spring-xml", "java-source-basic"]);
  });

  it("parses list commands without a target path", () => {
    const profileOptions = parseAnalyzeArgs(["--list-profiles"]);
    const adapterOptions = parseAnalyzeArgs(["--list-adapters"]);

    expect(profileOptions.listProfiles).toBe(true);
    expect(profileOptions.targetPath).toBeUndefined();
    expect(adapterOptions.listAdapters).toBe(true);
    expect(adapterOptions.targetPath).toBeUndefined();
  });

  it("rejects unknown options", () => {
    expect(() => parseAnalyzeArgs(["--unknown"])).toThrow("Unknown option: --unknown");
  });
});

describe("built-in profile catalog", () => {
  it("exposes the legacy and action-family profiles with their adapters", () => {
    const profiles = createBuiltInProfiles();
    const actionProfile = findProfileById(profiles, "action-family-legacy-web");
    const legacyProfile = findProfileById(profiles, "legacy-java-ee");

    expect(actionProfile?.name).toBe("Action-family Legacy Web");
    expect(actionProfile?.getRequiredAdapters().map((adapter) => adapter.id)).toContain("action-config");
    expect(legacyProfile?.name).toBe("Legacy Java EE");
    expect(legacyProfile?.getRequiredAdapters().map((adapter) => adapter.id)).toContain("web-xml");
    expect(legacyProfile?.getRequiredAdapters().map((adapter) => adapter.id)).toContain("java-source-basic");
  });

  it("collects unique built-in adapters across profiles", () => {
    const adapters = collectAvailableAdapters(createBuiltInProfiles());
    const adapterIds = adapters.map((adapter) => adapter.id);

    expect(adapterIds).toContain("web-xml");
    expect(adapterIds).toContain("spring-xml");
    expect(adapterIds).toContain("jsp-view");
    expect(adapterIds).toContain("action-config");
    expect(new Set(adapterIds).size).toBe(adapterIds.length);
  });
});
