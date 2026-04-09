import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { analyzeProject } from "../src/core/analysis.js";
import { LegacyJavaEeProfile } from "../src/profiles/legacy-java-ee.js";

describe("SiteMesh direct decorator resolution", () => {
  it("treats page as a layout file when name is only a decorator id", async () => {
    const projectRoot = resolve("samples/legacy-java-ee-sitemesh-direct");
    const result = await analyzeProject({
      projectRoot,
      projectId: "legacy-java-ee-sitemesh-direct",
      profile: new LegacyJavaEeProfile(),
    });

    const layoutView = result.snapshot.nodes.find((node) =>
      node.type === "view" && node.path?.endsWith("WEB-INF/jsp/decorators/defaultLayout.jsp"),
    );
    const directView = result.snapshot.nodes.find((node) =>
      node.type === "view" && node.path?.endsWith("WEB-INF/jsp/alias/page.jsp"),
    );

    expect(layoutView).toBeDefined();
    expect(directView).toBeDefined();
    expect(layoutView?.metadata?.role).toBe("layout");
    expect(layoutView?.name).toBe("decorators/defaultLayout");
    expect(
      result.snapshot.edges.some((edge) =>
        edge.type === "renders" &&
        edge.from === directView?.id &&
        edge.to === layoutView?.id,
      ),
    ).toBe(true);
  });
});
