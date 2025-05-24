import * as fs from "fs";
import * as path from "path"; // Added for potential use in new functions

/**
 * Ensures that the specified directory exists. If it does not exist, it creates it.
 * The 'recursive: true' option means that parent directories will also be created if they do not exist.
 * @param dir - The path to the directory.
 */
export function ensureDirs(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Writes data to a JSON file.
 * The data is stringified with an indent of 2 spaces for readability.
 * @param filepath - The path to the JSON file.
 * @param data - The data to write to the file.
 */
export function writeJsonFile(filepath: string, data: any) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

/**
 * Reads the content of a file.
 * @param filepath - The path to the file.
 * @returns The content of the file as a string.
 */
export function readFile(filepath: string): string {
  return fs.readFileSync(filepath, "utf-8");
}

/**
 * Writes content to a file.
 * @param filepath - The path to the file.
 * @param content - The content to write.
 */
export async function writeFile(
  filepath: string,
  content: string
): Promise<void> {
  await fs.promises.writeFile(filepath, content);
}

/**
 * Reads the names of files in a directory.
 * @param dirPath - The path to the directory.
 * @returns An array of file names.
 */
export function readDir(dirPath: string): string[] {
  return fs.readdirSync(dirPath);
}

/**
 * Checks if a file or directory exists at the given path.
 * @param filepath - The path to check.
 * @returns True if the file or directory exists, false otherwise.
 */
export function pathExists(filepath: string): boolean {
  return fs.existsSync(filepath);
}
