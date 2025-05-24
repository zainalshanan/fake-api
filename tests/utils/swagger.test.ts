import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSwaggerFiles } from "../../src/utils/swagger.js"; // Adjust path as necessary
import * as fileUtils from "../../src/utils/file.js"; // To mock its functions

// Mock functions from file.js
vi.mock("../../src/utils/file.js", async () => {
  const actual = await vi.importActual<typeof fileUtils>(
    "../../src/utils/file.js"
  );
  return {
    ...actual, // Keep actual implementations for other functions if any
    pathExists: vi.fn(),
    readDir: vi.fn(),
  };
});

describe("Swagger Utilities", () => {
  const testSpecDir = "./test-swagger-dir";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSwaggerFiles", () => {
    it("should return a list of .yaml, .yml, and .json files", () => {
      vi.mocked(fileUtils.pathExists).mockReturnValue(true);
      vi.mocked(fileUtils.readDir).mockReturnValue([
        "spec1.yaml",
        "spec2.yml",
        "spec3.json",
        "otherfile.txt",
        "data.json.backup",
      ]);

      const files = getSwaggerFiles(testSpecDir);
      expect(fileUtils.pathExists).toHaveBeenCalledWith(testSpecDir);
      expect(fileUtils.readDir).toHaveBeenCalledWith(testSpecDir);
      expect(files).toEqual(["spec1.yaml", "spec2.yml", "spec3.json"]);
    });

    it("should return an empty array if the directory is empty", () => {
      vi.mocked(fileUtils.pathExists).mockReturnValue(true);
      vi.mocked(fileUtils.readDir).mockReturnValue([]);

      const files = getSwaggerFiles(testSpecDir);
      expect(files).toEqual([]);
    });

    it("should return an empty array if the directory does not exist", () => {
      vi.mocked(fileUtils.pathExists).mockReturnValue(false);

      const files = getSwaggerFiles(testSpecDir);
      expect(fileUtils.readDir).not.toHaveBeenCalled(); // readDir shouldn't be called
      expect(files).toEqual([]);
    });

    it("should return an empty array if readDir returns non-spec files only", () => {
      vi.mocked(fileUtils.pathExists).mockReturnValue(true);
      vi.mocked(fileUtils.readDir).mockReturnValue([
        "notes.txt",
        "script.sh",
        "README.md",
      ]);
      const files = getSwaggerFiles(testSpecDir);
      expect(files).toEqual([]);
    });
  });
});
