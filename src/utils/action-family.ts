function normalizePathSegment(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function actionExtensionFromPattern(pattern: unknown): string {
  if (typeof pattern !== "string" || pattern.length === 0) {
    return ".action";
  }
  const match = pattern.match(/\*([./][^/*?#]+)$/);
  return match?.[1] ?? ".action";
}

export function inferActionClassBaseName(className: string): string {
  return className
    .replace(/ActionBean$/, "")
    .replace(/Action$/, "")
    .replace(/Controller$/, "");
}

export function inferActionRouteFromClassName(
  classFqn: string,
  resolverPackages: string[],
  urlPattern: string | undefined,
): string | undefined {
  const extension = actionExtensionFromPattern(urlPattern);
  const parts = classFqn.split(".");
  const className = parts.pop();
  const packageName = parts.join(".");
  if (!className) {
    return undefined;
  }

  const bestResolver = resolverPackages
    .filter((resolverPackage) => packageName === resolverPackage || packageName.startsWith(`${resolverPackage}.`))
    .sort((left, right) => right.length - left.length)[0];

  let relativePackage = bestResolver
    ? packageName.slice(bestResolver.length).replace(/^\./, "")
    : packageName;

  if (!bestResolver) {
    const webAnchor = packageName.match(/^(.*?)(?:\.|^)web(?:\.|$)(.*)$/);
    if (webAnchor) {
      relativePackage = webAnchor[2] ?? "";
    }
  }

  const relativeSegments = normalizePathSegment(relativePackage.replaceAll(".", "/"))
    .split("/")
    .filter(Boolean)
    .filter((segment) => segment !== "actions" && segment !== "action" && segment !== "web");
  const baseName = inferActionClassBaseName(className);
  if (!baseName) {
    return undefined;
  }
  const prefix = relativeSegments.length > 0 ? `/${relativeSegments.join("/")}` : "";
  return `${prefix}/${baseName}${extension}`.replace(/\/{2,}/g, "/");
}

export function appendActionEvent(baseRoute: string, eventName: string | undefined): string {
  if (!eventName) {
    return baseRoute;
  }
  return `${baseRoute}?${eventName}`;
}
