import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { exec, execSync, spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { rimrafSync } from "rimraf";
import axios from "axios";
import { getPortPromise } from "portfinder"; // To find a free port

const TEMP_DIR_BASE = path.join(__dirname, "temp-minimal-server-tests");
const SPEC_FILENAME = "minimal-spec.yaml";
const SPEC_NAME = "minimal"; // Derived from filename without extension
let tempDirCount = 0;

interface TestContext {
  specDir: string;
  outDir: string;
  baseDir: string;
  serverPort: number;
  serverProcess: ChildProcess | null;
  apiBaseUrl: string;
}

async function setupTestContext(): Promise<TestContext> {
  tempDirCount++;
  const baseDir = path.join(TEMP_DIR_BASE, `test-${tempDirCount}`);
  const specDir = path.join(baseDir, "specs");
  const outDir = path.join(baseDir, "output");

  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  // Copy minimal-spec.yaml to the temp specDir
  const exampleSpecPath = path.join(__dirname, "../../examples", SPEC_FILENAME);
  fs.copyFileSync(exampleSpecPath, path.join(specDir, SPEC_FILENAME));

  // Run generate and mock commands
  execSync(`node dist/src/index.js generate -s "${specDir}" -o "${outDir}"`, {
    stdio: "pipe",
  });
  execSync(`node dist/src/index.js mock -s "${specDir}" -o "${outDir}"`, {
    stdio: "pipe",
  });

  const serverPort = await getPortPromise({ port: 3000 }); // Find a free port starting from 3000
  const apiBaseUrl = `http://localhost:${serverPort}/api/${SPEC_NAME}`;

  return {
    specDir,
    outDir,
    baseDir,
    serverPort,
    serverProcess: null,
    apiBaseUrl,
  };
}

function cleanupDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    rimrafSync(dirPath);
  }
}

async function startServer(context: TestContext): Promise<void> {
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
        context.serverPort.toString(),
      ],
      { detached: true } // Detach to allow killing the process tree
    );

    context.serverProcess?.stdout?.on("data", (data) => {
      console.log(`Server stdout: ${data}`);
      if (
        data
          .toString()
          .includes(
            `Server is running on http://localhost:${context.serverPort}`
          )
      ) {
        resolve();
      }
    });

    context.serverProcess?.stderr?.on("data", (data) => {
      console.error(`Server stderr: ${data}`);
      // Consider rejecting if a critical error occurs during startup
      if (data.toString().toLowerCase().includes("error")) {
        // but not all stderr output is a fatal startup error
      }
    });

    // Timeout for server start
    const serverStartTimeout = setTimeout(() => {
      reject(new Error("Server start timed out"));
    }, 15000); // 15 seconds timeout

    context.serverProcess?.stdout?.on("data", (data) => {
      console.log(`Server stdout: ${data}`);
      if (
        data
          .toString()
          .includes(
            `Server is running on http://localhost:${context.serverPort}`
          )
      ) {
        clearTimeout(serverStartTimeout); // Clear timeout on successful start
        resolve();
      }
    });
  });
}

async function stopServer(context: TestContext): Promise<void> {
  if (context.serverProcess) {
    // Check if serverProcess exists first
    const serverProc = context.serverProcess;
    // Ensure pid exists on serverProc before trying to use it
    if (serverProc.pid) {
      return new Promise((resolve) => {
        try {
          process.kill(-serverProc.pid!, "SIGTERM");
        } catch (e) {
          // If group kill fails, try to kill the process directly
          // Also check if serverProc.kill is a function before calling
          if (typeof serverProc.kill === "function") {
            serverProc.kill("SIGTERM");
          }
        }
        serverProc.on("close", () => {
          context.serverProcess = null;
          resolve();
        });
        // Fallback timeout in case close event doesn't fire
        setTimeout(() => {
          if (context.serverProcess) {
            // Check again before nulling
            context.serverProcess = null;
          }
          resolve();
        }, 2000);
      });
    } else {
      // If pid is not available, but process object exists, try to kill if possible
      // and then resolve.
      if (typeof serverProc.kill === "function") {
        serverProc.kill("SIGTERM");
      }
      context.serverProcess = null; // Nullify the process
    }
  }
  return Promise.resolve();
}

describe("Minimal API Server Integration Tests", () => {
  let context: TestContext;

  beforeAll(async () => {
    cleanupDir(TEMP_DIR_BASE);
    fs.mkdirSync(TEMP_DIR_BASE, { recursive: true });
    // build is assumed to be done globally before tests
  });

  beforeEach(async () => {
    context = await setupTestContext();
    try {
      await startServer(context);
    } catch (error) {
      console.error("Server failed to start in beforeEach:", error);
      // If server fails to start, subsequent tests will likely fail.
      // Consider how to handle this, perhaps by throwing to stop the suite for this context.
      throw error;
    }
  }, 20000); // Increased timeout for beforeEach including server start

  afterEach(async () => {
    await stopServer(context);
    // cleanupDir(context.baseDir); // Clean up specific test dir
  });

  afterAll(() => {
    cleanupDir(TEMP_DIR_BASE); // Final cleanup
  });

  // Basic Server Startup
  it("Server should start without errors and respond to a basic root ping (if any)", async () => {
    // The server starts and serves based on specs. A root ping isn't standard for this app.
    // We verify startup by the log message in startServer.
    // A true test would be to hit a known endpoint from the minimal-spec.
    try {
      const response = await axios.get(`${context.apiBaseUrl}/items`);
      expect(response.status).toBe(200);
    } catch (e: any) {
      console.error("Initial /items call failed:", e.message);
      throw e;
    }
  });

  // CRUD Operations for Items
  describe("CRUD Operations for /items", () => {
    let createdItemId: string | null = null;

    it("POST /items - should create an item", async () => {
      const newItem = { name: "Test Item", description: "A test item" };
      const response = await axios.post(`${context.apiBaseUrl}/items`, newItem);
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty("id");
      expect(response.data.name).toBe(newItem.name);
      createdItemId = response.data.id;
    });

    it("GET /items - should list items, including the created one", async () => {
      // First, ensure an item is created if not already by a previous test in sequence (if tests run sequentially)
      if (!createdItemId) {
        const newItem = {
          name: "Another Test Item for GET",
          description: "Item for GET test",
        };
        const postResponse = await axios.post(
          `${context.apiBaseUrl}/items`,
          newItem
        );
        createdItemId = postResponse.data.id; // Ensure it's set for subsequent tests in this describe block if needed
      }

      const response = await axios.get(`${context.apiBaseUrl}/items`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      const createdItem = response.data.find(
        (item: any) => item.id === createdItemId
      );
      expect(createdItem).toBeDefined();
    });

    it("GET /items/{itemId} - should get a specific item", async () => {
      expect(createdItemId).toBeDefined(); // Depends on POST test
      const response = await axios.get(
        `${context.apiBaseUrl}/items/${createdItemId}`
      );
      expect(response.status).toBe(200);
      expect(response.data.id).toBe(createdItemId);
    });

    it("GET /items/{itemId} - should return 404 for non-existent item", async () => {
      try {
        await axios.get(`${context.apiBaseUrl}/items/non-existent-id`);
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    // PUT is not in minimal-spec.yaml - skipping
    // PATCH is not in minimal-spec.yaml - skipping
    // DELETE is not in minimal-spec.yaml - skipping
  });

  // OpenAPI Validation Middleware (basic check)
  describe("OpenAPI Validation", () => {
    it("should return 400 for invalid request body on POST /items", async () => {
      const invalidItem = { nameOnly: "Test" }; // Missing 'id' and 'name' is not per schema for creation as id is usually server-assigned
      // The minimal-spec for POST /items requires id and name in requestBody.
      // Let's make it invalid by sending wrong type for name
      const veryInvalidItem = { id: "some-id", name: 12345 };
      try {
        await axios.post(`${context.apiBaseUrl}/items`, veryInvalidItem);
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data).toHaveProperty(
          "error",
          "Request validation failed"
        );
        expect(error.response.data.details).toBeDefined();
      }
    });
  });
});
