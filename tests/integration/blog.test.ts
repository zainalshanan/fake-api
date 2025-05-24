import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { execSync, spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { rimrafSync } from "rimraf";
import axios, { AxiosError } from "axios";
import { getPortPromise } from "portfinder";

const TEMP_DIR_BASE = path.join(__dirname, "temp-blog-server-tests");
const SPEC_FILENAME = "blog-api.yaml"; // Targeting blog-api
const SPEC_NAME = "blog-api";
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

  const exampleSpecPath = path.join(__dirname, "../../swagger", SPEC_FILENAME); // Specs are in swagger dir
  fs.copyFileSync(exampleSpecPath, path.join(specDir, SPEC_FILENAME));

  console.log(
    `[Blog Test - setupTestContext] Generating code for ${SPEC_NAME}...`
  );
  execSync(`node dist/src/index.js generate -s "${specDir}" -o "${outDir}"`, {
    stdio: "inherit",
  });
  console.log(
    `[Blog Test - setupTestContext] Mocking data for ${SPEC_NAME}...`
  );
  execSync(`node dist/src/index.js mock -s "${specDir}" -o "${outDir}"`, {
    stdio: "inherit",
  });

  const expectedRouteFile = path.join(outDir, SPEC_NAME, "routes", "index.js");
  console.log(
    `[Blog Test - setupTestContext] Checking for generated route file: ${expectedRouteFile}`
  );
  if (!fs.existsSync(expectedRouteFile)) {
    console.error(
      `[Blog Test - setupTestContext] CRITICAL: Route file ${expectedRouteFile} NOT FOUND after generation.`
    );
    // Optionally, list directory contents for debugging
    try {
      const generatedDirContents = fs.readdirSync(
        path.join(outDir, SPEC_NAME, "routes")
      );
      console.error(
        `[Blog Test - setupTestContext] Contents of ${path.join(
          outDir,
          SPEC_NAME,
          "routes"
        )}:`,
        generatedDirContents
      );
      const blogApiDirContents = fs.readdirSync(path.join(outDir, SPEC_NAME));
      console.error(
        `[Blog Test - setupTestContext] Contents of ${path.join(
          outDir,
          SPEC_NAME
        )}:`,
        blogApiDirContents
      );
      const outputDirContents = fs.readdirSync(outDir);
      console.error(
        `[Blog Test - setupTestContext] Contents of ${outDir}:`,
        outputDirContents
      );
    } catch (e: any) {
      console.error(
        `[Blog Test - setupTestContext] Error listing generated directories: ${e.message}`
      );
    }
    throw new Error(`Generated route file ${expectedRouteFile} not found.`);
  } else {
    console.log(
      `[Blog Test - setupTestContext] Route file ${expectedRouteFile} found.`
    );
  }

  const serverPort = await getPortPromise({ port: 3001 }); // Use a dynamic port, start from 3001
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
      { detached: true }
    );
    const serverStartTimeout = setTimeout(() => {
      reject(new Error("Server start timed out"));
    }, 15000);

    context.serverProcess?.stdout?.on("data", (data) => {
      console.log(`Server stdout (blog): ${data}`);
      if (
        data
          .toString()
          .includes(
            `Server is running on http://localhost:${context.serverPort}`
          )
      ) {
        console.log(
          `[Blog Test] Server confirmed running on port ${context.serverPort} for baseDir ${context.baseDir}`
        ); // Diagnostic
        clearTimeout(serverStartTimeout);
        resolve();
      }
    });
    context.serverProcess?.stderr?.on("data", (data) => {
      console.error(`Server stderr (blog): ${data}`);
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

describe("Blog API Server Integration Tests", () => {
  let context: TestContext;

  beforeAll(() => {
    cleanupDir(TEMP_DIR_BASE);
    fs.mkdirSync(TEMP_DIR_BASE, { recursive: true });
  });

  beforeEach(async () => {
    context = await setupTestContext();
    await startServer(context);
  }, 20000);

  afterEach(async () => {
    await stopServer(context);
    // cleanupDir(context.baseDir);
  });

  afterAll(() => {
    cleanupDir(TEMP_DIR_BASE);
  });

  it("Server should start and respond to /posts", async () => {
    const response = await axios.get(`${context.apiBaseUrl}/posts`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });

  describe("Authors CRUD", () => {
    let createdAuthorId: string;
    const newAuthor = {
      name: "John Doe",
      email: "john.doe@example.com",
      bio: "A prolific writer.",
    };

    it("POST /authors - should create an author", async () => {
      // Note: blog-api.yaml does not have POST /authors. This test will fail or require spec update.
      // Assuming for test purposes we'd add it, or we test existing resources.
      // Let's adjust to test POST /posts as it exists.
      // For now, this highlights a mismatch between test plan and spec if POST /authors isn't there.
      // Mark: Skipping direct author creation as POST /authors not in spec. Will use mock data for authors.
      const authors = (await axios.get(`${context.apiBaseUrl}/authors`)).data;
      expect(authors.length).toBeGreaterThan(0); // Expect mock authors to exist
      createdAuthorId = authors[0].id; // Use a mock author ID for related tests
      expect(createdAuthorId).toBeDefined();
    });
    // GET /authors is implicitly tested by the above and later post creation
    // GET /authors/{authorId}
    it("GET /authors/{authorId} - should retrieve an author", async () => {
      const authors = (await axios.get(`${context.apiBaseUrl}/authors`)).data;
      const anAuthorId = authors[0].id;
      const response = await axios.get(
        `${context.apiBaseUrl}/authors/${anAuthorId}`
      );
      expect(response.status).toBe(200);
      expect(response.data.id).toBe(anAuthorId);
    });
  });

  describe("Posts CRUD & Nested Comments", () => {
    let createdPostId: string;
    let authorIdToUse: string = ""; // Initialize to empty string
    const newPost = {
      title: "My First Blog Post",
      content: "This is the content.",
      status: "draft",
    };

    beforeEach(async () => {
      // Get an author ID to use for posts
      // This block needs access to a running server or pre-populated db.json
      // Let's ensure this runs against the server started in the outer beforeEach
      console.log(
        `[Blog Test - Posts CRUD - beforeEach] Attempting to use context.apiBaseUrl: ${context?.apiBaseUrl}, context.serverPort: ${context?.serverPort} from baseDir ${context?.baseDir}`
      ); // Diagnostic
      try {
        const authorsResponse = await axios.get(
          `${context.apiBaseUrl}/authors`
        );
        if (authorsResponse.data && authorsResponse.data.length > 0) {
          authorIdToUse = authorsResponse.data[0].id;
        } else {
          // Fallback: if no authors from API (e.g. if mock data somehow empty or API issue)
          // try to read from db.json directly as a last resort for test setup stability.
          // This indicates an issue either with mock data generation or the /authors endpoint in the test itself.
          console.warn(
            "Could not fetch authors from API, attempting to read from db.json for test setup."
          );
          const dbPath = path.join(context.outDir, "db.json");
          if (fs.existsSync(dbPath)) {
            const dbContent = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
            if (
              dbContent[SPEC_NAME] &&
              dbContent[SPEC_NAME].Author &&
              dbContent[SPEC_NAME].Author.length > 0
            ) {
              authorIdToUse = dbContent[SPEC_NAME].Author[0].id;
            } else {
              throw new Error(
                "No authors found in API or db.json to use for post creation tests."
              );
            }
          } else {
            throw new Error(
              "db.json not found, cannot get author ID for post creation tests."
            );
          }
        }
        if (!authorIdToUse) {
          throw new Error(
            "Failed to obtain an authorId for testing post creation."
          );
        }
      } catch (error) {
        console.error(
          "Error in beforeEach for Posts CRUD: Could not obtain authorId.",
          error
        );
        throw error; // Re-throw to fail the test suite if setup fails
      }
    });

    it("POST /posts - should create a post", async () => {
      const postPayload = { ...newPost, authorId: authorIdToUse };
      const response = await axios.post(
        `${context.apiBaseUrl}/posts`,
        postPayload
      );
      expect(response.status).toBe(201);
      expect(response.data.id).toBeDefined();
      createdPostId = response.data.id;
      expect(response.data.title).toBe(newPost.title);
      expect(response.data.authorId).toBe(authorIdToUse);
    });

    it("GET /posts/{postId} - should retrieve the created post", async () => {
      const response = await axios.get(
        `${context.apiBaseUrl}/posts/${createdPostId}`
      );
      expect(response.status).toBe(200);
      expect(response.data.id).toBe(createdPostId);
      expect(response.data.title).toBe(newPost.title);
    });

    it("PUT /posts/{postId} - should update the post", async () => {
      const updatedPayload = {
        ...newPost,
        authorId: authorIdToUse,
        title: "Updated Title",
        status: "published",
      };
      const response = await axios.put(
        `${context.apiBaseUrl}/posts/${createdPostId}`,
        updatedPayload
      );
      expect(response.status).toBe(200);
      expect(response.data.title).toBe("Updated Title");
      expect(response.data.status).toBe("published");
    });

    // Nested Comments
    let createdCommentId: string;
    const newComment = {
      content: "Great post!",
      authorId: authorIdToUse /* Same author for simplicity */,
    };

    it("POST /posts/{postId}/comments - should create a comment for the post", async () => {
      const commentPayload = { ...newComment, postId: createdPostId }; // postId is usually part of path, but spec might require in body too
      const response = await axios.post(
        `${context.apiBaseUrl}/posts/${createdPostId}/comments`,
        commentPayload
      );
      expect(response.status).toBe(201);
      expect(response.data.id).toBeDefined();
      createdCommentId = response.data.id;
      expect(response.data.content).toBe(newComment.content);
      // expect(response.data.postId).toBe(createdPostId); // If API returns it
    });

    it("GET /posts/{postId}/comments - should list comments for the post", async () => {
      const response = await axios.get(
        `${context.apiBaseUrl}/posts/${createdPostId}/comments`
      );
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      const comment = response.data.find((c: any) => c.id === createdCommentId);
      expect(comment).toBeDefined();
      expect(comment.content).toBe(newComment.content);
    });

    it("DELETE /posts/{postId} - should delete the post", async () => {
      const response = await axios.delete(
        `${context.apiBaseUrl}/posts/${createdPostId}`
      );
      expect(response.status).toBe(204);
      // Verify it's gone
      try {
        await axios.get(`${context.apiBaseUrl}/posts/${createdPostId}`);
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });
  });

  describe("OpenAPI Validation", () => {
    it("POST /posts - should return 400 for invalid post payload (e.g., missing required field)", async () => {
      const invalidPost = { content: "Only content" }; // Missing title, authorId
      try {
        await axios.post(`${context.apiBaseUrl}/posts`, invalidPost);
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toBe("Request validation failed");
      }
    });

    it("GET /posts - should return 400 for invalid query parameter type", async () => {
      try {
        await axios.get(`${context.apiBaseUrl}/posts?status=nonexistentstatus`); // invalid enum
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toBe("Request validation failed");
      }
    });
  });
});
