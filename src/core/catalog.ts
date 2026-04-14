import type { AnalyzerAdapter } from "./adapter.js";
import type { AnalysisProfile } from "./profile.js";
import { ActionFamilyLegacyWebProfile } from "../profiles/action-family-legacy-web.js";
import { LegacyJavaEeProfile } from "../profiles/legacy-java-ee.js";

export function createBuiltInProfiles(): AnalysisProfile[] {
  return [new ActionFamilyLegacyWebProfile(), new LegacyJavaEeProfile()];
}

export function collectAvailableAdapters(profiles: AnalysisProfile[]): AnalyzerAdapter[] {
  const adapters = new Map<string, AnalyzerAdapter>();
  for (const profile of profiles) {
    for (const adapter of profile.getRequiredAdapters()) {
      if (!adapters.has(adapter.id)) {
        adapters.set(adapter.id, adapter);
      }
    }
  }
  return Array.from(adapters.values()).sort((left, right) => left.id.localeCompare(right.id));
}

export function findProfileById(profiles: AnalysisProfile[], profileId: string): AnalysisProfile | undefined {
  return profiles.find((profile) => profile.id === profileId);
}
