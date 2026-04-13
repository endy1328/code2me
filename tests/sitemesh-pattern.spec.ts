import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { analyzeProject } from "../src/core/analysis.js";
import { LegacyJavaEeProfile } from "../src/profiles/legacy-java-ee.js";

describe("SiteMesh wildcard decorator matching", () => {
  it("connects pattern-based decorator rules to rendered JSP views", async () => {
    const projectRoot = resolve("samples/legacy-java-ee-sitemesh-pattern");
    const result = await analyzeProject({
      projectRoot,
      projectId: "legacy-java-ee-sitemesh-pattern",
      profile: new LegacyJavaEeProfile(),
    });

    const { snapshot } = result;
    const binaryView = snapshot.nodes.find((node) => node.type === "view" && node.path?.endsWith("application/detail/binary.jsp"));
    const layoutView = snapshot.nodes.find((node) => node.type === "view" && node.path?.endsWith("decorators/commonLayout.jsp"));

    expect(binaryView).toBeDefined();
    expect(layoutView).toBeDefined();
    expect(
      snapshot.edges.some((edge) =>
        edge.type === "renders" &&
        edge.from === binaryView?.id &&
        edge.to === layoutView?.id,
      ),
    ).toBe(true);
  });

  it("treats decorator page as the layout file when name is only an alias", async () => {
    const projectRoot = resolve("samples/legacy-java-ee-sitemesh-alias");
    const result = await analyzeProject({
      projectRoot,
      projectId: "legacy-java-ee-sitemesh-alias",
      profile: new LegacyJavaEeProfile(),
    });

    const { snapshot } = result;
    const configNode = snapshot.nodes.find((node) => node.type === "config" && node.path?.endsWith("decorators.xml"));
    const layoutView = snapshot.nodes.find((node) => node.type === "view" && node.path?.endsWith("decorators/defaultLayout.jsp"));

    expect(configNode).toBeDefined();
    expect(layoutView).toBeDefined();
    expect(
      snapshot.edges.some((edge) =>
        edge.type === "configures" &&
        edge.from === configNode?.id &&
        edge.to === layoutView?.id,
      ),
    ).toBe(true);
  });

  it("applies defaultdir-based decorators only to included routes and skips excluded patterns", async () => {
    const projectRoot = resolve("samples/legacy-java-ee-sitemesh-excludes");
    const result = await analyzeProject({
      projectRoot,
      projectId: "legacy-java-ee-sitemesh-excludes",
      profile: new LegacyJavaEeProfile(),
    });

    const { snapshot } = result;
    const publicView = snapshot.nodes.find((node) => node.type === "view" && node.path?.endsWith("WEB-INF/views/public/list.jsp"));
    const adminView = snapshot.nodes.find((node) => node.type === "view" && node.path?.endsWith("WEB-INF/views/admin/list.jsp"));
    const layoutView = snapshot.nodes.find((node) => node.type === "view" && node.path?.endsWith("WEB-INF/layouts/main.jsp"));

    expect(publicView).toBeDefined();
    expect(adminView).toBeDefined();
    expect(layoutView).toBeDefined();
    expect(layoutView?.metadata?.role).toBe("layout");
    expect(
      snapshot.edges.some((edge) =>
        edge.type === "renders" &&
        edge.from === publicView?.id &&
        edge.to === layoutView?.id,
      ),
    ).toBe(true);
    expect(
      snapshot.edges.some((edge) =>
        edge.type === "renders" &&
        edge.from === adminView?.id &&
        edge.to === layoutView?.id,
      ),
    ).toBe(false);
  });
});
