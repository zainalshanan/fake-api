import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { rimrafSync } from "rimraf"; // Used in other tests, good for cleanup

const TEMP_DIR_BASE = path.join(__dirname, "temp-mocking-tests");
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

  return { specDir, outDir, baseDir };
}

function cleanupDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    rimrafSync(dirPath);
  }
}

function runMockCommand(specDir: string, outDir: string) {
  const command = `node dist/src/index.js mock -s "${specDir}" -o "${outDir}"`;
  execSync(command, { stdio: "pipe" }); // stdio: 'pipe' to avoid polluting test output unless debugging
}

function readDbJson(outDir: string): any {
  const dbPath = path.join(outDir, "db.json");
  if (!fs.existsSync(dbPath)) {
    return null;
  }
  const content = fs.readFileSync(dbPath, "utf-8");
  return JSON.parse(content);
}

// Main describe block for Mocking tests
describe("Mock Data Generation (Integration)", () => {
  let currentTestDirs: TestDirs;

  beforeEach(() => {
    currentTestDirs = setupTestDirs();
  });

  afterEach(() => {
    if (currentTestDirs && currentTestDirs.baseDir) {
      // cleanupDir(currentTestDirs.baseDir); // Cleanup after each test
    }
  });

  beforeAll(() => {
    // Initial cleanup of the base temp directory in case of previous failed runs
    cleanupDir(TEMP_DIR_BASE);
    fs.mkdirSync(TEMP_DIR_BASE, { recursive: true });
    // Ensure dist is built before running these tests
    // This should ideally be a global setup or a pre-test script
    // For now, assume 'npm run build' has been executed.
  });

  afterAll(() => {
    // Final cleanup of the base temp directory
    cleanupDir(TEMP_DIR_BASE);
  });

  // Test cases will be added here

  describe("db.json Output", () => {
    it("should create db.json in the specified outDir", () => {
      const minimalSpecContent = `
openapi: 3.0.0
info:
  title: Minimal API
  version: 1.0.0
components:
  schemas:
    Item:
      type: object
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
      required: [id, name]
paths:
  /items:
    get:
      summary: List items
      responses:
        '200':
          description: An array of items
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Item'
      `;
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "minimal.yaml"),
        minimalSpecContent
      );
      runMockCommand(currentTestDirs.specDir, currentTestDirs.outDir);
      const dbJsonPath = path.join(currentTestDirs.outDir, "db.json");
      expect(fs.existsSync(dbJsonPath)).toBe(true);
    });

    it("data should be structured per-spec, then per-resource", () => {
      const spec1Content = `
openapi: 3.0.0
info:
  title: Spec1 API
  version: 1.0.0
components:
  schemas:
    ResourceA:
      type: object
      properties:
        id: { type: string }
paths:
  /resourceA:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/ResourceA'
      `;
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "spec1.yaml"),
        spec1Content
      );
      runMockCommand(currentTestDirs.specDir, currentTestDirs.outDir);
      const db = readDbJson(currentTestDirs.outDir);
      expect(db).toHaveProperty("spec1");
      expect(db.spec1).toHaveProperty("ResourceA");
      expect(Array.isArray(db.spec1.ResourceA)).toBe(true);
    });

    it("each resource should have an array of mock items (default 5)", () => {
      const specContent = `
openapi: 3.0.0
info:
  title: Sized API
  version: 1.0.0
components:
  schemas:
    Product:
      type: object
      properties:
        id: { type: string }
paths:
  /products:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Product'
      `;
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "sized.yaml"),
        specContent
      );
      runMockCommand(currentTestDirs.specDir, currentTestDirs.outDir);
      const db = readDbJson(currentTestDirs.outDir);
      expect(db.sized.Product.length).toBe(5);
    });

    it("IDs should be generated and unique within their resource list", () => {
      // Using the minimal spec from the first test, assuming it generates items
      const minimalSpecContent = `
openapi: 3.0.0
info:
  title: MinimalUnique API
  version: 1.0.0
components:
  schemas:
    Item:
      type: object
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
      required: [id, name]
paths:
  /items:
    get:
      responses:
        '200':
          description: An array of items
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Item'
      `;
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "minimalUnique.yaml"),
        minimalSpecContent
      );
      runMockCommand(currentTestDirs.specDir, currentTestDirs.outDir);
      const db = readDbJson(currentTestDirs.outDir);
      const items = db.minimalUnique.Item;
      expect(items.length).toBeGreaterThan(0);
      const ids = items.map((item: any) => item.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
      ids.forEach((id: string) => expect(typeof id).toBe("string")); // Basic check for UUID like string format
    });

    it("should attempt to use IDs from already generated related resources", () => {
      const authorSpec = `
openapi: 3.0.0
info:
  title: AuthorSpec
  version: 1.0.0
components:
  schemas:
    Author:
      type: object
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
      required: [id, name]
paths:
  /authors:
    get:
      responses:
        '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Author'}}}}} 
        `;
      const postSpec = `
openapi: 3.0.0
info:
  title: PostSpec
  version: 1.0.0
components:
  schemas:
    Post:
      type: object
      properties:
        id: { type: string, format: uuid }
        title: { type: string }
        authorId: { type: string, format: uuid } # Relates to Author
      required: [id, title, authorId]
paths:
  /posts:
    get:
      responses:
        '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Post'}}}}} 
        `;
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "author.yaml"),
        authorSpec
      );
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "post.yaml"),
        postSpec
      );

      runMockCommand(currentTestDirs.specDir, currentTestDirs.outDir);
      const db = readDbJson(currentTestDirs.outDir);

      expect(db.author).toBeDefined();
      expect(db.author.Author).toBeDefined();
      expect(db.author.Author.length).toBeGreaterThan(0);
      const authorIds = db.author.Author.map((a: any) => a.id);

      expect(db.post).toBeDefined();
      expect(db.post.Post).toBeDefined();
      expect(db.post.Post.length).toBeGreaterThan(0);

      db.post.Post.forEach((p: any) => {
        expect(p.authorId).toBeDefined();
        expect(authorIds).toContain(p.authorId);
      });
    });
  });

  describe("Multiple Specs and No Schema Specs", () => {
    it("should include data for all specs in specDir in db.json under their respective spec names", () => {
      const specAContent = `
openapi: 3.0.0
info: { title: SpecA, version: 1.0.0 }
components: { schemas: { ResA: { type: object, properties: { id: { type: string }}}}} 
paths: { /resA: { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/ResA'}}}}}}}}
      `;
      const specBContent = `
openapi: 3.0.0
info: { title: SpecB, version: 1.0.0 }
components: { schemas: { ResB: { type: object, properties: { name: { type: string }}}}} 
paths: { /resB: { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/ResB'}}}}}}}}
      `;
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "specA.yaml"),
        specAContent
      );
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "specB.yml"),
        specBContent
      );
      runMockCommand(currentTestDirs.specDir, currentTestDirs.outDir);
      const db = readDbJson(currentTestDirs.outDir);
      expect(db).toHaveProperty("specA");
      expect(db.specA).toHaveProperty("ResA");
      expect(db).toHaveProperty("specB");
      expect(db.specB).toHaveProperty("ResB");
    });

    it("mock generation should run without error for specs with no components.schemas (empty data or from req/resp)", () => {
      const noSchemaSpec = `
openapi: 3.0.0
info:
  title: NoSchema API
  version: 1.0.0
paths:
  /ping:
    get:
      summary: Ping endpoint
      responses:
        '200':
          description: Successful ping
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: pong
      `;
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "noSchema.yaml"),
        noSchemaSpec
      );

      let errorOccurred = false;
      try {
        runMockCommand(currentTestDirs.specDir, currentTestDirs.outDir);
      } catch (e) {
        errorOccurred = true;
        console.error("Error during mock command for noSchema spec:", e);
      }
      expect(errorOccurred).toBe(false);
      const db = readDbJson(currentTestDirs.outDir);
      expect(db).toHaveProperty("noSchema");
      // Depending on implementation, it might be an empty object or might have generated based on response schemas
      // For now, just check it ran and created the spec entry
      expect(db.noSchema).toBeDefined();
    });
  });

  describe("Schema Types and DefaultMockStrategy Behavior", () => {
    it("should generate correct mock values for various schema types and formats", () => {
      const schemaTypesSpec = `
openapi: 3.0.0
info:
  title: SchemaTypes API
  version: 1.0.0
components:
  schemas:
    TypeCollection:
      type: object
      properties:
        id: { type: string, format: uuid }
        aString: { type: string }
        aDateTime: { type: string, format: date-time }
        anEmail: { type: string, format: email }
        aUri: { type: string, format: uri }
        aByteString: { type: string, format: byte } # Typically base64
        aNumber: { type: number }
        aFloat: { type: number, format: float }
        aDouble: { type: number, format: double }
        anInteger: { type: integer }
        anInt32: { type: integer, format: int32 }
        anInt64: { type: integer, format: int64 }
        aBoolean: { type: boolean }
        anArrayOfString: { type: array, items: { type: string } }
        anArrayOfRef: { type: array, items: { $ref: '#/components/schemas/NestedItem' } }
        anObject: {
          type: object,
          properties: {
            nestedProp: { type: string }
          }
        }
        aRefObject: { $ref: '#/components/schemas/NestedItem' }
        anEnumString: { type: string, enum: ["val1", "val2", "val3"] }
        # Example keyword is not used by default strategy, so not explicitly tested here for value
        aStringWithExample: { type: string, example: "ExampleValue" }
    NestedItem:
      type: object
      properties:
        nestedId: { type: string, format: uuid }
        nestedName: { type: string }
paths:
  /types:
    get:
      responses:
        '200':
          description: A collection of types
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TypeCollection'
      `;
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "schemaTypes.yaml"),
        schemaTypesSpec
      );
      runMockCommand(currentTestDirs.specDir, currentTestDirs.outDir);
      const db = readDbJson(currentTestDirs.outDir);
      expect(db).toHaveProperty("schemaTypes");
      expect(db.schemaTypes).toHaveProperty("TypeCollection");
      const items = db.schemaTypes.TypeCollection;
      expect(items.length).toBeGreaterThan(0);
      const item = items[0]; // Check the first generated item

      // String types
      expect(typeof item.id).toBe("string");
      expect(typeof item.aString).toBe("string");
      expect(typeof item.aDateTime).toBe("string");
      expect(Date.parse(item.aDateTime)).not.toBeNaN();
      expect(typeof item.anEmail).toBe("string");
      expect(item.anEmail).toContain("@");
      expect(typeof item.aUri).toBe("string");
      expect(item.aUri).toMatch(/^https?:\/\//);
      expect(typeof item.aByteString).toBe("string"); // Faker might just return a word

      // Number types
      expect(typeof item.aNumber).toBe("number");
      expect(typeof item.aFloat).toBe("number"); // Default strategy uses faker.number.int
      expect(typeof item.aDouble).toBe("number"); // Default strategy uses faker.number.int
      expect(typeof item.anInteger).toBe("number");
      expect(Number.isInteger(item.anInteger)).toBe(true);
      expect(typeof item.anInt32).toBe("number");
      expect(Number.isInteger(item.anInt32)).toBe(true);
      expect(typeof item.anInt64).toBe("number");
      expect(Number.isInteger(item.anInt64)).toBe(true);

      // Boolean
      expect(typeof item.aBoolean).toBe("boolean");

      // Array types
      expect(Array.isArray(item.anArrayOfString)).toBe(true);
      item.anArrayOfString.forEach((s: any) => expect(typeof s).toBe("string"));
      expect(Array.isArray(item.anArrayOfRef)).toBe(true);
      item.anArrayOfRef.forEach((refItem: any) => {
        expect(typeof refItem.nestedId).toBe("string");
        expect(typeof refItem.nestedName).toBe("string");
      });

      // Object types
      expect(typeof item.anObject).toBe("object");
      expect(typeof item.anObject.nestedProp).toBe("string");
      expect(typeof item.aRefObject).toBe("object");
      expect(typeof item.aRefObject.nestedId).toBe("string");
      expect(typeof item.aRefObject.nestedName).toBe("string");

      // Enum
      expect(["val1", "val2", "val3"]).toContain(item.anEnumString);

      // Example (default strategy doesn't use it, generates random string)
      expect(typeof item.aStringWithExample).toBe("string");
      // expect(item.aStringWithExample).not.toBe("ExampleValue"); // It should be a faker word
    });

    it("DefaultMockStrategy should respect maxDepth for circular dependencies", () => {
      const circularSpec = `
openapi: 3.0.0
info:
  title: Circular API
  version: 1.0.0
components:
  schemas:
    Node:
      type: object
      properties:
        id: { type: string, format: uuid }
        child: { $ref: '#/components/schemas/Node' } # Circular dependency
        children: 
          type: array
          items: { $ref: '#/components/schemas/Node' }
paths:
  /nodes:
    get:
      responses:
        '200':
          description: A list of nodes
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Node' }
      `;
      fs.writeFileSync(
        path.join(currentTestDirs.specDir, "circular.yaml"),
        circularSpec
      );
      runMockCommand(currentTestDirs.specDir, currentTestDirs.outDir);
      const db = readDbJson(currentTestDirs.outDir);
      expect(db.circular).toHaveProperty("Node");
      const nodes = db.circular.Node;
      expect(nodes.length).toBeGreaterThan(0);

      // Check depth. DefaultMockStrategy has maxDepth = 6 (0-indexed, so 7 levels total: root + 6 children)
      // We need to traverse and check. This can be complex. Let's check a few levels.
      const checkDepth = (
        node: any,
        currentDepth: number,
        maxTestDepth: number
      ) => {
        if (!node) return;
        expect(typeof node.id).toBe("string");
        if (currentDepth >= maxTestDepth) {
          // At max depth, referenced objects (like child) should be empty or not fully expanded.
          // DefaultMockStrategy returns {} for objects at max depth.
          if (node.child) {
            expect(node.child).toEqual({});
          }
          if (node.children && node.children.length > 0) {
            node.children.forEach((ch: any) => expect(ch).toEqual({}));
          }
          return;
        }
        if (node.child) {
          checkDepth(node.child, currentDepth + 1, maxTestDepth);
        }
        if (node.children && node.children.length > 0) {
          node.children.forEach((ch: any) =>
            checkDepth(ch, currentDepth + 1, maxTestDepth)
          );
        }
      };

      nodes.forEach((node: any) => checkDepth(node, 0, 6)); // Test up to default maxDepth of strategy
    });

    // TODO: Add tests for allOf, oneOf, anyOf if strategy is updated to support them more explicitly.
    // For now, their behavior is indirectly covered by how resolveSchema handles them, which unit tests cover.
  });
});
