import { pathExists, readDir } from "./file.js";

export function getSwaggerFiles(specDir: string): string[] {
  if (!pathExists(specDir)) return [];
  return readDir(specDir).filter(
    (file) =>
      file.endsWith(".yaml") || file.endsWith(".yml") || file.endsWith(".json")
  );
}
