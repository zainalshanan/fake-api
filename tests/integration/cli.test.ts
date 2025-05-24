import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execSync, exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { rimrafSync } from "rimraf";
import { getPortPromise } from "portfinder";

const TEMP_DIR_BASE = path.join(__dirname, "temp-cli-tests");
let tempDirCount = 0;

interface TestDirs {
  specDir: string;
  outDir: string;
  baseDir: string;
}

function setupTestDirs(): TestDirs {
  tempDirCount++;
  const baseDir = path.join(TEMP_DIR_BASE, `test-${tempDirCount}`);
  const specDir = path.join(baseDir, "specs");
  const outDir = path.join(baseDir, "output");

  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  // Create a dummy spec file for commands that need it
  const dummySpecContent =
    "openapi: 3.0.0\ninfo: {title: Dummy, version: 1.0.0}\npaths:";
  fs.writeFileSync(path.join(specDir, "dummy.yaml"), dummySpecContent);

  return { specDir, outDir, baseDir };
}

function cleanupDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    rimrafSync(dirPath);
  }
}

const CLI_ENTRY = "node dist/src/index.js";

describe("CLI Testing", () => {
  let currentTestDirs: TestDirs;

  beforeAll(() => {
    cleanupDir(TEMP_DIR_BASE);
    fs.mkdirSync(TEMP_DIR_BASE, { recursive: true });
    // execSync("npm run build"); // Assumed to be done globally
  });

  beforeEach(() => {
    currentTestDirs = setupTestDirs();
  });

  afterAll(() => {
    cleanupDir(TEMP_DIR_BASE);
  });

  describe("Global Options", () => {
    it(`${CLI_ENTRY} --version - should display version from package.json`, () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8")
      );
      const output = execSync(`${CLI_ENTRY} --version`).toString();
      expect(output.trim()).toBe(packageJson.version);
    });

    it(`${CLI_ENTRY} --help - should display main help`, () => {
      const output = execSync(`${CLI_ENTRY} --help`).toString();
      expect(output).toContain("Usage: fake-api [options] [command]");
      expect(output).toContain("generate");
      expect(output).toContain("mock");
      expect(output).toContain("serve");
    });
  });

  describe("generate command", () => {
    it(`${CLI_ENTRY} generate --help - should display help for generate`, () => {
      const output = execSync(`${CLI_ENTRY} generate --help`).toString();
      expect(output).toContain("Usage: fake-api generate [options]");
      expect(output).toContain("--spec-dir <dir>");
      expect(output).toContain("--out-dir <dir>");
    });

    it(`${CLI_ENTRY} generate - runs with default spec-dir and out-dir`, () => {
      // Need to ensure default dirs exist or command handles it gracefully
      // For this test, let's place a spec in the default 'swagger' dir
      const defaultSpecDir = path.join(__dirname, "../../swagger");
      const defaultOutDir = path.join(__dirname, "../../generated");
      fs.mkdirSync(defaultSpecDir, { recursive: true });
      fs.copyFileSync(
        path.join(__dirname, "../../examples/minimal-spec.yaml"),
        path.join(defaultSpecDir, "temp-minimal.yaml")
      );
      cleanupDir(defaultOutDir); // Clean up default out dir before test

      execSync(`${CLI_ENTRY} generate`, { cwd: path.join(__dirname, "../..") }); // Run from project root
      expect(
        fs.existsSync(
          path.join(
            defaultOutDir,
            "temp-minimal",
            "controllers",
            "ItemController.js"
          )
        )
      ).toBe(true);

      // Cleanup
      rimrafSync(path.join(defaultSpecDir, "temp-minimal.yaml"));
      // rimrafSync(defaultOutDir); // Don't clean generated as other tests might rely on it, or clean carefully
    });

    it(`${CLI_ENTRY} generate -s custom_swagger -o custom_generated - uses custom dirs`, () => {
      execSync(
        `${CLI_ENTRY} generate -s "${currentTestDirs.specDir}" -o "${currentTestDirs.outDir}"`
      );
      // Check if some expected file is created in custom_generated based on dummy.yaml
      // Since dummy.yaml has no actual paths/components, it might not produce controllers.
      // A better dummy spec might be needed for a more robust check here.
      // For now, check if the directory for the spec was created.
      expect(fs.existsSync(path.join(currentTestDirs.outDir, "dummy"))).toBe(
        true
      );
    });

    it("should handle invalid/empty spec-dir gracefully (log warning)", () => {
      const emptySpecDir = path.join(currentTestDirs.baseDir, "empty_specs");
      fs.mkdirSync(emptySpecDir);
      const output = execSync(
        `${CLI_ENTRY} generate -s "${emptySpecDir}" -o "${currentTestDirs.outDir}"`,
        { encoding: "utf-8" }
      );
      // Check for a warning or lack of error. Actual log checking is harder.
      // For now, ensure it doesn't throw an unhandled error and completes.
      expect(output).toBeDefined(); // Command should complete
      // Ideally, check for specific log output if Logger is instrumented or stdout is parsed
    });
  });

  describe("mock command", () => {
    it(`${CLI_ENTRY} mock --help - should display help for mock`, () => {
      const output = execSync(`${CLI_ENTRY} mock --help`).toString();
      expect(output).toContain("Usage: fake-api mock [options]");
    });

    it(`${CLI_ENTRY} mock - runs with default dirs`, () => {
      const defaultOutDir = path.join(__dirname, "../../generated");
      cleanupDir(path.join(defaultOutDir, "db.json")); // Clean up db.json
      // Ensure a spec exists in default swagger dir
      const defaultSpecDir = path.join(__dirname, "../../swagger");
      fs.mkdirSync(defaultSpecDir, { recursive: true });
      if (!fs.existsSync(path.join(defaultSpecDir, "dummy-for-mock.yaml"))) {
        fs.writeFileSync(
          path.join(defaultSpecDir, "dummy-for-mock.yaml"),
          "openapi: 3.0.0\ninfo: {title: DummyForMock, version: 1.0.0}\ncomponents:\n  schemas:\n    TestMockItem:\n      type: object\n      properties:\n        id: {type: string}"
        );
      }

      execSync(`${CLI_ENTRY} mock`, { cwd: path.join(__dirname, "../..") });
      expect(fs.existsSync(path.join(defaultOutDir, "db.json"))).toBe(true);
    });

    it(`${CLI_ENTRY} mock -s custom_swagger -o custom_generated - uses custom dirs`, () => {
      execSync(
        `${CLI_ENTRY} mock -s "${currentTestDirs.specDir}" -o "${currentTestDirs.outDir}"`
      );
      expect(fs.existsSync(path.join(currentTestDirs.outDir, "db.json"))).toBe(
        true
      );
    });

    it("should handle invalid/empty spec-dir for mock (no error, empty db.json content for that spec)", () => {
      const emptySpecDir = path.join(
        currentTestDirs.baseDir,
        "empty_specs_for_mock"
      );
      fs.mkdirSync(emptySpecDir);
      execSync(
        `${CLI_ENTRY} mock -s "${emptySpecDir}" -o "${currentTestDirs.outDir}"`
      );
      const dbJson = JSON.parse(
        fs.readFileSync(path.join(currentTestDirs.outDir, "db.json"), "utf-8")
      );
      // It should create db.json but it might be empty {} or have an empty entry for the non-existent spec dir content.
      // The current behavior is to produce an empty db.json if no valid specs are found.
      expect(dbJson).toEqual({});
    });
  });

  describe("serve command", () => {
    let serverProcess: import("child_process").ChildProcess | null = null;
    let servePort: number;

    beforeEach(async () => {
      servePort = await getPortPromise({ port: 3005 });
    });

    afterAll(() => {
      if (serverProcess && serverProcess.pid) {
        try {
          process.kill(-serverProcess.pid, "SIGTERM");
        } catch {}
        serverProcess = null;
      }
    });

    it(`${CLI_ENTRY} serve --help - should display help for serve`, () => {
      const output = execSync(`${CLI_ENTRY} serve --help`).toString();
      expect(output).toContain("Usage: fake-api serve [options]");
    });

    it(`${CLI_ENTRY} serve - runs with default dirs and port`, async () => {
      await new Promise<void>((resolve, reject) => {
        serverProcess = exec(`${CLI_ENTRY} serve`, {
          cwd: path.join(__dirname, "../.."),
        });
        serverProcess?.stdout?.on("data", (data) => {
          if (
            data
              .toString()
              .includes("Server is running on http://localhost:3000")
          ) {
            resolve();
          }
        });
        serverProcess?.on("error", reject);
        setTimeout(
          () => reject(new Error("Server default start timed out")),
          10000
        );
      });
    }, 15000); // Vitest timeout for the test itself

    it(`${CLI_ENTRY} serve -s custom_swagger -o custom_generated -p <port> - uses custom options`, async () => {
      await new Promise<void>((resolve, reject) => {
        serverProcess = exec(
          `${CLI_ENTRY} serve -s "${currentTestDirs.specDir}" -o "${currentTestDirs.outDir}" -p ${servePort}`
        );
        serverProcess?.stdout?.on("data", (data) => {
          if (
            data
              .toString()
              .includes(`Server is running on http://localhost:${servePort}`)
          ) {
            resolve();
          }
        });
        serverProcess?.on("error", reject);
        setTimeout(
          () => reject(new Error("Server custom start timed out")),
          10000
        );
      });
    }, 15000);

    it("serve with invalid out-dir (no generated code) should start and log warnings", async () => {
      const emptyOutDir = path.join(currentTestDirs.baseDir, "empty_out");
      fs.mkdirSync(emptyOutDir);

      await new Promise<void>((resolve, reject) => {
        serverProcess = exec(
          `${CLI_ENTRY} serve -s "${currentTestDirs.specDir}" -o "${emptyOutDir}" -p ${servePort}`
        );
        let warningLogged = false;
        let serverStarted = false;

        serverProcess?.stdout?.on("data", (data) => {
          const output = data.toString();
          if (
            output.includes("Route path does not exist") ||
            output.includes("Error loading routes")
          ) {
            warningLogged = true;
          }
          if (
            output.includes(
              `Server is running on http://localhost:${servePort}`
            )
          ) {
            serverStarted = true;
          }
          if (serverStarted && warningLogged) {
            resolve();
          }
        });
        serverProcess?.stderr?.on("data", (data) => {
          const output = data.toString();
          if (
            output.includes("Route path does not exist") ||
            output.includes("Error loading routes")
          ) {
            warningLogged = true;
          }
          if (serverStarted && warningLogged) {
            // Check again in case stderr came after stdout server message
            resolve();
          }
        });
        serverProcess?.on("error", reject);
        setTimeout(() => {
          if (serverStarted && warningLogged) {
            resolve();
          } else {
            reject(
              new Error(
                "Server did not start or log expected warnings with invalid out-dir"
              )
            );
          }
        }, 15000);
      });
    }, 20000);
  });
});
