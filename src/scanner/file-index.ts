import fg from "fast-glob";
import { relative } from "node:path";

export interface FileIndex {
  root: string;
  files: string[];
}

export async function buildFileIndex(projectRoot: string): Promise<FileIndex> {
  const files = await fg("**/*", {
    cwd: projectRoot,
    onlyFiles: true,
    dot: false,
    ignore: ["**/node_modules/**", "**/.git/**", "**/.code2me/**", "**/dist/**"],
  });

  return {
    root: projectRoot,
    files: files.map((file) => relative(projectRoot, `${projectRoot}/${file}`) || file).sort(),
  };
}
