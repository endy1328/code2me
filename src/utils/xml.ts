import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { join } from "node:path";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseTagValue: false,
});

export async function parseXmlFile<T>(projectRoot: string, relativePath: string): Promise<T> {
  const content = await readFile(join(projectRoot, relativePath), "utf8");
  return parser.parse(content) as T;
}
