export interface AnalyzeCliOptions {
  targetPath?: string;
  profileId?: string;
  adapterIds: string[];
  listProfiles: boolean;
  listAdapters: boolean;
  help: boolean;
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeCliOptions {
  const options: AnalyzeCliOptions = {
    adapterIds: [],
    listProfiles: false,
    listAdapters: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--list-profiles") {
      options.listProfiles = true;
      continue;
    }
    if (token === "--list-adapters") {
      options.listAdapters = true;
      continue;
    }
    if (token === "--profile") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --profile");
      }
      options.profileId = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--profile=")) {
      options.profileId = token.slice("--profile=".length);
      continue;
    }
    if (token === "--adapter") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --adapter");
      }
      options.adapterIds.push(...splitAdapterIds(value));
      index += 1;
      continue;
    }
    if (token.startsWith("--adapter=")) {
      options.adapterIds.push(...splitAdapterIds(token.slice("--adapter=".length)));
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }
    if (!options.targetPath) {
      options.targetPath = token;
      continue;
    }
    throw new Error(`Unexpected argument: ${token}`);
  }

  options.adapterIds = uniqueStrings(options.adapterIds);
  return options;
}

function splitAdapterIds(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
