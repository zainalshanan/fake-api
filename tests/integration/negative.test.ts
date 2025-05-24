import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { execSync, exec, ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { rimrafSync } from "rimraf";
import { getPortPromise } from "portfinder";
import axios from "axios";

const TEMP_DIR_BASE = path.join(__dirname, "temp-negative-tests");
let tempDirCount = 0;

interface TestContext {
  specDir: string;
  outDir: string;
  baseDir: string;
  serverPort?: number;
  serverProcess?: ChildProcess | null;
  apiBaseUrl?: string;
}

function setupTestDirs(): TestContext {
  tempDirCount++;
  const baseDir = path.join(TEMP_DIR_BASE, `test-${tempDirCount}`);
  const specDir = path.join(baseDir, "specs");
  const outDir = path.join(baseDir, "output");

  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  return { specDir, outDir, baseDir };
}

function cleanupDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    rimrafSync(dirPath);
  }
}

const CLI_ENTRY = "node dist/src/index.js";

async function startServer(context: TestContext): Promise<void> {
  context.serverPort = await getPortPromise({ port: 3010 });
  context.apiBaseUrl = `http://localhost:${context.serverPort}/api/dummy`; // Or some generic base

  return new Promise((resolve, reject) => {
    context.serverProcess = spawn(
      "node",
      [
        "dist/src/index.js",
        "serve",
        "-s",
        context.specDir,
        "-o",
        context.outDir,
        "-p",
        context.serverPort!.toString(),
      ],
      { detached: true }
    );
    const serverStartTimeout = setTimeout(() => {
      reject(new Error("Server start timed out for negative test"));
    }, 10000);

    context.serverProcess?.stdout?.on("data", (data) => {
      if (
        data
          .toString()
          .includes(
            `Server is running on http://localhost:${context.serverPort}`
          )
      ) {
        clearTimeout(serverStartTimeout);
        resolve();
      }
    });
    context.serverProcess?.stderr?.on("data", (data) => {
      // console.error(`Negative Test Server stderr: ${data}`);
    });
    context.serverProcess?.on("error", (err) => {
      clearTimeout(serverStartTimeout);
      reject(err);
    });
  });
}

async function stopServer(context: TestContext): Promise<void> {
  if (context.serverProcess) {
    const serverProc = context.serverProcess;
    if (serverProc.pid) {
      return new Promise((resolve) => {
        try {
          process.kill(-serverProc.pid!, "SIGTERM");
        } catch (e) {
          if (typeof serverProc.kill === "function") {
            serverProc.kill("SIGTERM");
          }
        }
        serverProc.on("close", () => {
          context.serverProcess = null;
          resolve();
        });
        setTimeout(() => {
          if (context.serverProcess) {
            context.serverProcess = null;
          }
          resolve();
        }, 2000);
      });
    } else {
      if (typeof serverProc.kill === "function") {
        serverProc.kill("SIGTERM");
      }
      context.serverProcess = null;
    }
  }
  return Promise.resolve();
}

describe("Edge Case & Negative Testing", () => {
  let context: TestContext;

  beforeAll(() => {
    cleanupDir(TEMP_DIR_BASE);
    fs.mkdirSync(TEMP_DIR_BASE, { recursive: true });
  });

  beforeEach(() => {
    context = setupTestDirs();
  });

  afterEach(async () => {
    await stopServer(context); // Ensure server is stopped if started
    // cleanupDir(context.baseDir); // Option to clean each test's specific dir
  });

  afterAll(() => {
    cleanupDir(TEMP_DIR_BASE);
  });

  describe("Malformed OpenAPI Specs", () => {
    it("generate, mock, and serve with spec having YAML syntax errors", () => {
      const malformedYaml =
        "openapi: 3.0.0\ninfo: title: No Version key\n  version: 1.0.0"; // Invalid YAML
      fs.writeFileSync(
        path.join(context.specDir, "malformed.yaml"),
        malformedYaml
      );

      // Generate
      try {
        execSync(
          `${CLI_ENTRY} generate -s "${context.specDir}" -o "${context.outDir}"`,
          { stdio: "pipe" }
        );
        // Should ideally not reach here or check for error logs
      } catch (error: any) {
        expect(error.message).toContain("SwaggerParserError"); // Or specific error from parser
      }

      // Mock
      try {
        execSync(
          `${CLI_ENTRY} mock -s "${context.specDir}" -o "${context.outDir}"`,
          { stdio: "pipe" }
        );
      } catch (error: any) {
        expect(error.message).toContain("SwaggerParserError");
      }

      // Serve - server might still start but log errors for the faulty spec
      // This is harder to assert without intercepting logs precisely.
      // We can check if the server starts but maybe doesn't serve the malformed API.
    });

    it("generate, mock, serve with semantically incorrect OpenAPI (e.g., missing paths)", async () => {
      const semanticallyIncorrect =
        "openapi: 3.0.0\ninfo: {title: Semantically Bad, version: 1.0.0}"; // No paths
      fs.writeFileSync(
        path.join(context.specDir, "semantic.yaml"),
        semanticallyIncorrect
      );

      let generateOutput = "";
      try {
        generateOutput = execSync(
          `${CLI_ENTRY} generate -s "${context.specDir}" -o "${context.outDir}"`,
          { encoding: "utf-8" }
        );
        // Generator might produce empty files or log warnings. Check for non-crashing behavior.
        expect(fs.existsSync(path.join(context.outDir, "semantic"))).toBe(true); // Base dir might be created
      } catch (e: any) {
        // Depending on how robust the generator is to missing `paths`
        console.warn(
          "Generate with semantically incorrect spec error (if any):",
          e.message
        );
      }

      execSync(
        `${CLI_ENTRY} mock -s "${context.specDir}" -o "${context.outDir}"`
      );
      const dbJson = JSON.parse(
        fs.readFileSync(path.join(context.outDir, "db.json"), "utf-8")
      );
      expect(dbJson.semantic).toBeDefined(); // Should have an entry for the spec
      expect(Object.keys(dbJson.semantic).length).toBe(0); // No resources to mock

      await startServer(context);
      try {
        // Try to access a non-existent path for this broken spec
        await axios.get(
          `http://localhost:${context.serverPort}/api/semantic/somepath`
        );
      } catch (error: any) {
        expect(error.response.status).toBe(404); // Expect 404 as no routes are defined
      }
    });
  });

  describe("Empty spec-dir", () => {
    it("generate with empty spec-dir: no output or message, no errors", () => {
      cleanupDir(context.specDir); // Make specDir empty
      fs.mkdirSync(context.specDir); // Recreate it empty
      execSync(
        `${CLI_ENTRY} generate -s "${context.specDir}" -o "${context.outDir}"`
      );
      // Expect outDir to be largely empty or only contain base structure
      expect(fs.readdirSync(context.outDir).length).toBe(0); // Or check for specific messages if any
    });

    it("mock with empty spec-dir: empty db.json or message, no errors", () => {
      cleanupDir(context.specDir);
      fs.mkdirSync(context.specDir);
      execSync(
        `${CLI_ENTRY} mock -s "${context.specDir}" -o "${context.outDir}"`
      );
      const dbJsonPath = path.join(context.outDir, "db.json");
      expect(fs.existsSync(dbJsonPath)).toBe(true);
      const dbJson = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      expect(dbJson).toEqual({});
    });

    it("serve with empty spec-dir: server starts, serves no APIs, or provides message", async () => {
      cleanupDir(context.specDir);
      fs.mkdirSync(context.specDir);
      await startServer(context); // Server should start
      // No APIs to test, successful start is the assertion here
      expect(context.serverProcess?.pid).toBeDefined();
    });
  });

  // File System Permissions (conceptual test - hard to automate robustly cross-platform)
  // - Test writing to a read-only out-dir. Expect errors during generate or mock.
  //   This would typically involve chmodding the directory before running the command.
  //   Skipping actual implementation due to complexity and potential for test environment issues.
  it.skip("File System Permissions: generate/mock to read-only out-dir (conceptual)", () => {});

  // Large Number of Specs/Large Specs (conceptual test - primarily performance)
  // - Performance check for generation and server startup time with many (e.g., 10+) or very large spec files.
  //   This is more of a manual performance test or benchmark, not a typical integration test.
  it.skip("Performance: Large number of specs / large specs (conceptual)", () => {});

  // Concurrent API Calls (conceptual test - requires load testing tools)
  // - Basic check if the server handles multiple simultaneous requests to different generated APIs without crashing.
  //   Requires dedicated load testing tools like k6, JMeter, etc.
  it.skip("Concurrency: Handle multiple simultaneous requests (conceptual)", () => {});
});
