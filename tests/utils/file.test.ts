import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  ensureDirs,
  writeJsonFile,
  readFile,
  writeFile,
  readDir,
  pathExists,
} from "../../src/utils/file.js"; // Adjust path as necessary

// Mock the fs module
vi.mock("fs", async () => {
  const actualFs = await vi.importActual<typeof fs>("fs");
  return {
    ...actualFs,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    promises: {
      ...actualFs.promises,
      writeFile: vi.fn(),
    },
    readdirSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

describe("File Utilities", () => {
  const testDir = "/test-dir";
  const testFile = "/test-dir/test-file.json";
  const testContent = { foo: "bar" };
  const testContentString = JSON.stringify(testContent, null, 2);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ensureDirs", () => {
    it("should call fs.mkdirSync with recursive true", () => {
      ensureDirs(testDir);
      expect(fs.mkdirSync).toHaveBeenCalledWith(testDir, { recursive: true });
    });
  });

  describe("writeJsonFile", () => {
    it("should call fs.writeFileSync with stringified data", () => {
      writeJsonFile(testFile, testContent);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testFile,
        testContentString
      );
    });
  });

  describe("readFile", () => {
    it("should call fs.readFileSync and return its content", () => {
      vi.mocked(fs.readFileSync).mockReturnValue(testContentString);
      const content = readFile(testFile);
      expect(fs.readFileSync).toHaveBeenCalledWith(testFile, "utf-8");
      expect(content).toBe(testContentString);
    });
  });

  describe("writeFile", async () => {
    it("should call fs.promises.writeFile", async () => {
      await writeFile(testFile, testContentString);
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        testFile,
        testContentString
      );
    });
  });

  describe("readDir", () => {
    it("should call fs.readdirSync and return its result", () => {
      const mockFiles = ["file1.txt", "file2.js"];
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles);
      const files = readDir(testDir);
      expect(fs.readdirSync).toHaveBeenCalledWith(testDir);
      expect(files).toEqual(mockFiles);
    });
  });

  describe("pathExists", () => {
    it("should call fs.existsSync and return true if path exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const exists = pathExists(testFile);
      expect(fs.existsSync).toHaveBeenCalledWith(testFile);
      expect(exists).toBe(true);
    });

    it("should call fs.existsSync and return false if path does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const exists = pathExists(testFile);
      expect(fs.existsSync).toHaveBeenCalledWith(testFile);
      expect(exists).toBe(false);
    });
  });
});
