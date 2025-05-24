import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import supertest from "supertest";
import { Server } from "../../src/server.js";
import { Generator } from "../../src/generator.js";
import { MockGenerator } from "../../src/mock.js";
import * as path from "path";
import * as fs from "fs";
import type { Server as HttpServer } from "http";
import { rimrafSync } from "rimraf";
import { getPortPromise } from "portfinder";
import { execSync, spawn, ChildProcess } from "child_process";

const TEMP_DIR_BASE = path.join(__dirname, "temp-petstore-tests");
const SPEC_FILENAME = "petstore.yaml";
const SPEC_NAME = "petstore";
let tempDirCount = 0;

interface TestContext {
  specDir: string;
  outDir: string;
  baseDir: string;
  serverPort: number;
  serverProcess: ChildProcess | null;
  apiBaseUrl: string;
  apiClient: supertest.SuperTest<supertest.Test> | null;
}

async function setupTestContext(): Promise<TestContext> {
  tempDirCount++;
  const baseDir = path.join(TEMP_DIR_BASE, `test-${tempDirCount}`);
  const specDir = path.join(baseDir, "specs");
  const outDir = path.join(baseDir, "output");

  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const projectSwaggerDir = path.join(__dirname, "../../swagger");
  fs.copyFileSync(
    path.join(projectSwaggerDir, SPEC_FILENAME),
    path.join(specDir, SPEC_FILENAME)
  );

  execSync(`node dist/src/index.js generate -s "${specDir}" -o "${outDir}"`, {
    stdio: "pipe",
  });
  execSync(`node dist/src/index.js mock -s "${specDir}" -o "${outDir}"`, {
    stdio: "pipe",
  });

  const serverPort = await getPortPromise({ port: 3002 });
  const apiBaseUrl = `http://localhost:${serverPort}/api/${SPEC_NAME}`;

  return {
    specDir,
    outDir,
    baseDir,
    serverPort,
    serverProcess: null,
    apiBaseUrl,
    apiClient: null,
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
      { detached: true }
    );

    const serverStartTimeout = setTimeout(() => {
      reject(new Error("Petstore server start timed out"));
    }, 15000);

    context.serverProcess?.stdout?.on("data", (data) => {
      console.log(`Petstore Server stdout: ${data}`);
      if (
        data
          .toString()
          .includes(
            `Server is running on http://localhost:${context.serverPort}`
          )
      ) {
        clearTimeout(serverStartTimeout);
        context.apiClient = supertest(
          `http://localhost:${context.serverPort}`
        ) as unknown as supertest.SuperTest<supertest.Test>;
        resolve();
      }
    });
    context.serverProcess?.stderr?.on("data", (data) => {
      console.error(`Petstore Server stderr: ${data}`);
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
          context.apiClient = null;
          resolve();
        });
        setTimeout(() => {
          if (context.serverProcess) {
            context.serverProcess = null;
            context.apiClient = null;
          }
          resolve();
        }, 2000);
      });
    } else {
      if (typeof serverProc.kill === "function") {
        serverProc.kill("SIGTERM");
      }
      context.serverProcess = null;
      context.apiClient = null;
    }
  }
  return Promise.resolve();
}

describe("Petstore API Integration Tests", () => {
  let context: TestContext;

  beforeAll(async () => {
    cleanupDir(TEMP_DIR_BASE);
    fs.mkdirSync(TEMP_DIR_BASE, { recursive: true });
  });

  beforeEach(async () => {
    context = await setupTestContext();
    await startServer(context);
  }, 30000);

  afterEach(async () => {
    await stopServer(context);
    if (context && context.baseDir) {
    }
  });

  afterAll(() => {
    cleanupDir(TEMP_DIR_BASE);
  });

  it("should list pets (GET /pets)", async () => {
    expect(context.apiClient).toBeDefined();
    const response = await context.apiClient!.get(`/api/${SPEC_NAME}/pets`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    if (response.body.length > 0) {
      expect(response.body[0]).toHaveProperty("id");
      expect(response.body[0]).toHaveProperty("name");
    }
  });

  it("should create a pet (POST /pets)", async () => {
    expect(context.apiClient).toBeDefined();
    const listResponse = await context.apiClient!.get(`/api/${SPEC_NAME}/pets`);
    let newPetId = 1;
    if (listResponse.body && listResponse.body.length > 0) {
      const existingIds = listResponse.body.map((p: any) => p.id);
      newPetId = Math.max(...existingIds) + 1;
      if (!Number.isFinite(newPetId)) newPetId = 1;
    }

    const newPet = { id: newPetId, name: "Integration Test Pet" };
    const response = await context
      .apiClient!.post(`/api/${SPEC_NAME}/pets`)
      .send(newPet);
    expect(response.status).toBe(201);
  });

  it("should get a specific pet by ID (GET /pets/{petId})", async () => {
    expect(context.apiClient).toBeDefined();
    const petsResponse = await context.apiClient!.get(`/api/${SPEC_NAME}/pets`);

    let petToFetchId = 1;
    if (petsResponse.body.length > 0 && petsResponse.body[0].id !== undefined) {
      petToFetchId = petsResponse.body[0].id;
    } else {
      const uniqueIdForGet = Date.now();
      await context
        .apiClient!.post(`/api/${SPEC_NAME}/pets`)
        .send({ id: uniqueIdForGet, name: "Testable Pet for GET" });
      petToFetchId = uniqueIdForGet;
    }

    const response = await context.apiClient!.get(
      `/api/${SPEC_NAME}/pets/${petToFetchId}`
    );
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("id", petToFetchId);
    expect(response.body).toHaveProperty("name");
  });

  it("should return 404 for a non-existent pet ID (GET /pets/{petId})", async () => {
    expect(context.apiClient).toBeDefined();
    const response = await context.apiClient!.get(
      `/api/${SPEC_NAME}/pets/99999999`
    );
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty("error", "Not found");
  });
});
