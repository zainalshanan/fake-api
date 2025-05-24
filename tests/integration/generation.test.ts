import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const GENERATED_DIR = path.join(process.cwd(), "generated");
const EXAMPLES_DIR = path.join(process.cwd(), "examples");

function cleanupGeneratedDir(specName?: string) {
  const dirToDelete = specName
    ? path.join(GENERATED_DIR, specName)
    : GENERATED_DIR;
  if (fs.existsSync(dirToDelete)) {
    fs.rmSync(dirToDelete, { recursive: true, force: true });
  }
}

function runGenerateCommand(specDir?: string, outDir?: string) {
  let command = "npm run generate";
  if (specDir) {
    command += ` -- --spec-dir ${specDir}`;
  }
  if (outDir) {
    command += ` -- --out-dir ${outDir}`;
  }
  execSync(command, { stdio: "inherit" });
}

describe("Generation Testing", () => {
  beforeEach(() => {
    // Ensure examples directory exists if needed, or copy specs
    if (!fs.existsSync(EXAMPLES_DIR)) {
      fs.mkdirSync(EXAMPLES_DIR, { recursive: true });
    }
    // A minimal spec file for basic tests
    const minimalSpecContent = `
openapi: 3.0.0
info:
  title: Minimal API
  version: 1.0.0
servers:
  - url: http://localhost:3000/api/minimal
components:
  schemas:
    Item:
      type: object
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
paths:
  /items:
    get:
      operationId: listItems
      responses:
        '200':
          description: An array of items
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Item"
    post:
      operationId: createItem
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/Item"
      responses:
        '201':
          description: Item created
  /items/{itemId}:
    parameters:
      - name: itemId
        in: path
        required: true
        schema: { type: string }
    get:
      operationId: getItem
      responses:
        '200':
          description: An item
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Item"
    `;
    if (!fs.existsSync(path.join(EXAMPLES_DIR, "minimal-spec.yaml"))) {
      fs.writeFileSync(
        path.join(EXAMPLES_DIR, "minimal-spec.yaml"),
        minimalSpecContent
      );
    }

    cleanupGeneratedDir(); // Clean up entire generated dir before each test run in this suite
  });

  afterEach(() => {
    cleanupGeneratedDir();
  });

  describe("Basic Spec (minimal-spec.yaml)", () => {
    const specName = "minimal-spec"; // Matches the filename without extension
    const specRelativePath = path.relative(process.cwd(), EXAMPLES_DIR);

    it("should generate ItemController.ts extending BaseController", () => {
      runGenerateCommand(specRelativePath, GENERATED_DIR);
      const controllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "ItemController.ts"
      );
      expect(fs.existsSync(controllerPath)).toBe(true);
      const controllerContent = fs.readFileSync(controllerPath, "utf-8");
      expect(controllerContent).toMatch(
        /class ItemController extends BaseController/
      );
      expect(controllerContent).toMatch(/public resourceKey = "items"/);
    });

    it("should generate controllers/index.ts exporting ItemController", () => {
      runGenerateCommand(specRelativePath, GENERATED_DIR);
      const indexPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "index.ts"
      );
      expect(fs.existsSync(indexPath)).toBe(true);
      const indexContent = fs.readFileSync(indexPath, "utf-8");
      expect(indexContent).toMatch(/export \* from '.\/ItemController.js';/);
    });

    it("should generate routes/index.ts importing and using ItemController for CRUD", () => {
      runGenerateCommand(specRelativePath, GENERATED_DIR);
      const routerPath = path.join(
        GENERATED_DIR,
        specName,
        "routes",
        "index.ts"
      );
      expect(fs.existsSync(routerPath)).toBe(true);
      const routerContent = fs.readFileSync(routerPath, "utf-8");

      expect(routerContent).toMatch(
        /import { ItemController } from '..\/controllers\/ItemController.js';/
      );
      expect(routerContent).toMatch(
        /const itemController = new ItemController\(\);/
      );
      // Check for CRUD route definitions
      expect(routerContent).toMatch(
        /router.get\('\/items', itemController.list.bind\(itemController\)\);/
      );
      expect(routerContent).toMatch(
        /router.post\('\/items', itemController.create.bind\(itemController\)\);/
      );
      expect(routerContent).toMatch(
        /router.get\('\/items\/:itemId', itemController.get.bind\(itemController\)\);/
      );
      // Minimal spec might not generate PUT, PATCH, DELETE if not in spec, that's fine.
      // The generator logic seems to create them based on path structure and methods present.
    });
  });

  describe("Complex Spec (swagger/blog-api.yaml)", () => {
    const specFilename = "blog-api.yaml";
    const specDirRelativePath = path.relative(
      process.cwd(),
      path.join(process.cwd(), "swagger")
    ); // Use actual swagger dir
    const specName = "blog-api"; // Expected spec name derived from filename

    beforeEach(() => {
      // No need to create blog-api.yaml, it should exist in swagger/
      cleanupGeneratedDir(specName); // Clean up only the specific generated dir for this spec
    });

    afterEach(() => {
      cleanupGeneratedDir(specName);
    });

    it("should generate controllers for each primary resource", () => {
      runGenerateCommand(specDirRelativePath, GENERATED_DIR);
      const controllersDir = path.join(GENERATED_DIR, specName, "controllers");

      const expectedControllers = [
        "PostController.ts",
        "AuthorController.ts",
        "CommentController.ts",
      ];
      for (const controllerFile of expectedControllers) {
        const controllerPath = path.join(controllersDir, controllerFile);
        expect(
          fs.existsSync(controllerPath),
          `${controllerFile} should exist`
        ).toBe(true);
        const controllerContent = fs.readFileSync(controllerPath, "utf-8");
        expect(controllerContent).toMatch(/extends BaseController/);
      }
    });

    it("should generate controllers/index.ts exporting all resource controllers", () => {
      runGenerateCommand(specDirRelativePath, GENERATED_DIR);
      const indexPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "index.ts"
      );
      expect(fs.existsSync(indexPath)).toBe(true);
      const indexContent = fs.readFileSync(indexPath, "utf-8");
      expect(indexContent).toMatch(/export \* from '.\/PostController.js';/);
      expect(indexContent).toMatch(/export \* from '.\/AuthorController.js';/);
      expect(indexContent).toMatch(/export \* from '.\/CommentController.js';/);
    });

    it("should generate correct resourceKey in controllers", () => {
      runGenerateCommand(specDirRelativePath, GENERATED_DIR);
      const controllers = {
        "PostController.ts": "posts",
        "AuthorController.ts": "authors",
        "CommentController.ts": "comments",
      };
      for (const [controllerFile, resourceKey] of Object.entries(controllers)) {
        const controllerPath = path.join(
          GENERATED_DIR,
          specName,
          "controllers",
          controllerFile
        );
        const controllerContent = fs.readFileSync(controllerPath, "utf-8");
        expect(controllerContent).toMatch(
          new RegExp(`public resourceKey = "${resourceKey}"`)
        );
      }
    });

    it("should generate routes for all paths, including nested and parameterized paths", () => {
      runGenerateCommand(specDirRelativePath, GENERATED_DIR);
      const routerPath = path.join(
        GENERATED_DIR,
        specName,
        "routes",
        "index.ts"
      );
      expect(fs.existsSync(routerPath)).toBe(true);
      const routerContent = fs.readFileSync(routerPath, "utf-8");

      // Check for controller imports and instantiations
      expect(routerContent).toMatch(
        /import { PostController } from '..\/controllers\/PostController.js';/
      );
      expect(routerContent).toMatch(
        /const postController = new PostController\(\);/
      );
      expect(routerContent).toMatch(
        /import { AuthorController } from '..\/controllers\/AuthorController.js';/
      );
      expect(routerContent).toMatch(
        /const authorController = new AuthorController\(\);/
      );
      expect(routerContent).toMatch(
        /import { CommentController } from '..\/controllers\/CommentController.js';/
      );
      expect(routerContent).toMatch(
        /const commentController = new CommentController\(\);/
      );

      // Check for specific routes
      expect(routerContent).toMatch(
        /router.get\('\/posts', postController.list.bind\(postController\)\);/
      );
      expect(routerContent).toMatch(
        /router.post\('\/posts', postController.create.bind\(postController\)\);/
      );
      expect(routerContent).toMatch(
        /router.get\('\/posts\/:postId', postController.get.bind\(postController\)\);/
      );
      expect(routerContent).toMatch(
        /router.put\('\/posts\/:postId', postController.update.bind\(postController\)\);/
      );
      expect(routerContent).toMatch(
        /router.delete\('\/posts\/:postId', postController.delete.bind\(postController\)\);/
      );

      expect(routerContent).toMatch(
        /router.get\('\/authors', authorController.list.bind\(authorController\)\);/
      );
      expect(routerContent).toMatch(
        /router.get\('\/authors\/:authorId', authorController.get.bind\(authorController\)\);/
      );

      expect(routerContent).toMatch(
        /router.get\('\/comments', commentController.list.bind\(commentController\)\);/
      );
      expect(routerContent).toMatch(
        /router.get\('\/comments\/:commentId', commentController.get.bind\(commentController\)\);/
      );

      // Nested routes - check for controller method and express path params
      // The generator currently maps /posts/{postId}/comments to CommentController methods, this might be an area for refinement
      // if it should be PostController methods like getCommentsForPost etc.
      // Based on current generator output where it derives controller from first segment of path for binding, then specific method by operationId or CRUD convention.
      // For /posts/{postId}/comments, the get operationId is getPostComments.
      // The route generator binds this to postController.getPostComments if PostController exists
      // Or commentController.getPostComments if CommentController exists and the path/operationId leads there.
      // Current logic: path /posts/{postId}/comments -> resource 'posts' -> postController
      // Then operationId 'getPostComments' -> postController.getPostComments()
      // This requires PostController to have a 'getPostComments' method. Let's assume it should.
      expect(routerContent).toMatch(
        /router.get\('\/posts\/:postId\/comments', postController.getPostComments.bind\(postController\)\);/
      );
      expect(routerContent).toMatch(
        /router.post\('\/posts\/:postId\/comments', postController.createPostComment.bind\(postController\)\);/
      );
    });
  });

  describe("Path Naming and Normalization", () => {
    const specDirRelativePath = path.relative(process.cwd(), EXAMPLES_DIR);

    beforeEach(() => {
      // path-normalization-spec.yaml: Paths with and without leading slash, complex param names
      const pathNormSpecContent = `
openapi: 3.0.0
info:
  title: Path Normalization Test
  version: 1.0.0
components:
  schemas:
    TestItem:
      type: object
      properties:
        id: { type: string }
        item_id: {type: string }
        itemID: {type: string }
paths:
  /leading-slash:
    get:
      operationId: getLeadingSlash
      responses: { '200': { description: OK } }
  no-leading-slash:
    get:
      operationId: getNoLeadingSlash
      responses: { '200': { description: OK } }
  /complex-params/{item_id}/details/{itemID}:
    get:
      operationId: getComplexParams
      responses: { '200': { description: OK } }
      `;
      fs.writeFileSync(
        path.join(EXAMPLES_DIR, "path-normalization-spec.yaml"),
        pathNormSpecContent
      );
      cleanupGeneratedDir("path-normalization-spec");
    });

    afterEach(() => {
      cleanupGeneratedDir("path-normalization-spec");
      fs.unlinkSync(path.join(EXAMPLES_DIR, "path-normalization-spec.yaml"));
    });

    it("should handle paths with or without leading slashes and complex param names", () => {
      runGenerateCommand(specDirRelativePath, GENERATED_DIR);
      const specName = "path-normalization-spec";
      const routerPath = path.join(
        GENERATED_DIR,
        specName,
        "routes",
        "index.ts"
      );
      expect(fs.existsSync(routerPath)).toBe(true);
      const routerContent = fs.readFileSync(routerPath, "utf-8");

      // Check controller generation (simple name based on path)
      const controllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "LeadingSlashController.ts"
      );
      expect(
        fs.existsSync(controllerPath),
        "LeadingSlashController.ts should exist"
      ).toBe(true);

      const noLeadingControllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "NoLeadingSlashController.ts"
      );
      expect(
        fs.existsSync(noLeadingControllerPath),
        "NoLeadingSlashController.ts should exist"
      ).toBe(true);

      const complexParamsControllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "ComplexParamController.ts"
      ); // Generator might simplify 'complex-params' to 'ComplexParam'
      expect(
        fs.existsSync(complexParamsControllerPath),
        "ComplexParamController.ts should exist"
      ).toBe(true);

      // Route paths should be normalized in Express
      expect(routerContent).toMatch(
        /router.get\('\/leading-slash', leadingSlashController.getLeadingSlash.bind\(leadingSlashController\)\);/
      );
      expect(routerContent).toMatch(
        /router.get\('\/no-leading-slash', noLeadingSlashController.getNoLeadingSlash.bind\(noLeadingSlashController\)\);/
      );
      expect(routerContent).toMatch(
        /router.get\('\/complex-params\/:item_id\/details\/:itemID', complexParamController.getComplexParams.bind\(complexParamController\)\);/
      );
    });
  });

  describe("Operation ID Handling", () => {
    const specDirRelativePath = path.relative(process.cwd(), EXAMPLES_DIR);

    beforeEach(() => {
      const opIdSpecContent = `
openapi: 3.0.0
info:
  title: Operation ID Test
  version: 1.0.0
components:
  schemas:
    OpItem:
      type: object
      properties: { id: { type: string } }
paths:
  /items-explicit-opid:
    get:
      operationId: getOpItems # Explicit operationId
      responses: { '200': { description: OK, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/OpItem'}}}} } }
  /items-no-opid:
    get: # No operationId, generator should create one (e.g., getItemsNoOpid)
      responses: { '200': { description: OK, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/OpItem'}}}} } }
    post:
      # No operationId, should be createItemsNoOpid or similar
      responses: { '201': { description: Created } }
  /items-no-opid/{id}:
    get:
      # No operationId, should be getItemsNoOpidById or similar
      responses: { '200': { description: OK } }
      `;
      fs.writeFileSync(
        path.join(EXAMPLES_DIR, "opid-spec.yaml"),
        opIdSpecContent
      );
      cleanupGeneratedDir("opid-spec");
    });

    afterEach(() => {
      cleanupGeneratedDir("opid-spec");
      fs.unlinkSync(path.join(EXAMPLES_DIR, "opid-spec.yaml"));
    });

    it("should use explicit operationId or generate one if missing", () => {
      runGenerateCommand(specDirRelativePath, GENERATED_DIR);
      const specName = "opid-spec";
      const routerPath = path.join(
        GENERATED_DIR,
        specName,
        "routes",
        "index.ts"
      );
      expect(fs.existsSync(routerPath)).toBe(true);
      const routerContent = fs.readFileSync(routerPath, "utf-8");

      const explicitControllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "ItemsExplicitOpidController.ts"
      );
      expect(
        fs.existsSync(explicitControllerPath),
        "ItemsExplicitOpidController.ts should exist"
      ).toBe(true);
      const noOpidControllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "ItemsNoOpidController.ts"
      );
      expect(
        fs.existsSync(noOpidControllerPath),
        "ItemsNoOpidController.ts should exist"
      ).toBe(true);

      // Explicit operationId
      expect(routerContent).toMatch(
        /router.get\('\/items-explicit-opid', itemsExplicitOpidController.getOpItems.bind\(itemsExplicitOpidController\)\);/
      );

      // Generated operationId for list (getItemsNoOpid)
      expect(routerContent).toMatch(
        /router.get\('\/items-no-opid', itemsNoOpidController.list.bind\(itemsNoOpidController\)\);/
      );
      // Generated operationId for create (createItemsNoOpid) - generator maps POST on collection to .create()
      expect(routerContent).toMatch(
        /router.post\('\/items-no-opid', itemsNoOpidController.create.bind\(itemsNoOpidController\)\);/
      );
      // Generated operationId for get by id (getItemsNoOpidById) - generator maps GET on item path to .get()
      expect(routerContent).toMatch(
        /router.get\('\/items-no-opid\/:id', itemsNoOpidController.get.bind\(itemsNoOpidController\)\);/
      );
    });
  });

  describe("Schema Key Determination", () => {
    const specDirRelativePath = path.relative(process.cwd(), EXAMPLES_DIR);
    const specFilename = "schema-key-spec.yaml";
    const specName = "schema-key-spec";

    beforeEach(() => {
      const schemaKeySpecContent = `
openapi: 3.0.0
info:
  title: Schema Key Test
  version: 1.0.0
components:
  schemas:
    ExplicitSchema: # Referenced by GET /ref-response
      type: object
      properties: { id: { type: string }, name: { type: string } }
    ArrayItemSchema: # Referenced by GET /array-ref-response
      type: object
      properties: { itemId: { type: string }, value: { type: string } }
paths:
  /ref-response:
    get:
      summary: Response with $ref schema
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ExplicitSchema"
  /inline-response: # Inline object schema in response
    get:
      summary: Response with inline object schema
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  inline_id: { type: string }
                  data: { type: string }
  /ref-requestbody:
    post:
      summary: Request body with $ref schema
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ExplicitSchema"
      responses: { '201': { description: Created } }
  /inline-requestbody: # Inline object schema in request body
    post:
      summary: Request body with inline object schema
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                req_field: { type: string }
      responses: { '201': { description: Created } }
  /array-ref-response: # Array of $ref items in response
    get:
      summary: Response with array of $ref items
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/ArrayItemSchema"
  /array-inline-response: # Array of inline items in response
    get:
      summary: Response with array of inline items
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    array_inline_prop: { type: string }
      `;
      fs.writeFileSync(
        path.join(EXAMPLES_DIR, specFilename),
        schemaKeySpecContent
      );
      cleanupGeneratedDir(specName);
    });

    afterEach(() => {
      cleanupGeneratedDir(specName);
      fs.unlinkSync(path.join(EXAMPLES_DIR, specFilename));
    });

    it("should correctly determine schemaKey and generate appropriate controllers and resourceKeys", () => {
      runGenerateCommand(specDirRelativePath, GENERATED_DIR);

      // Check for ExplicitSchema -> RefResponseController (or similar based on path)
      // The generator uses the *path segment* to name the controller primarily.
      // Then uses schemaKey for the resourceKey within that controller.

      // 1. /ref-response (GET uses $ref: '#/components/schemas/ExplicitSchema')
      const refResponseControllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "RefResponseController.ts"
      );
      expect(
        fs.existsSync(refResponseControllerPath),
        "RefResponseController.ts should exist"
      ).toBe(true);
      const refResponseControllerContent = fs.readFileSync(
        refResponseControllerPath,
        "utf-8"
      );
      expect(refResponseControllerContent).toMatch(
        /public resourceKey = "refresponses"/
      ); // Pluralized path segment

      // 2. /inline-response (GET uses inline schema)
      // Generator should synthesize a name like 'InlineResponse' for the schema and controller.
      const inlineResponseControllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "InlineResponseController.ts"
      );
      expect(
        fs.existsSync(inlineResponseControllerPath),
        "InlineResponseController.ts should exist"
      ).toBe(true);
      const inlineResponseControllerContent = fs.readFileSync(
        inlineResponseControllerPath,
        "utf-8"
      );
      expect(inlineResponseControllerContent).toMatch(
        /public resourceKey = "inlineresponses"/
      ); // Pluralized path segment

      // 3. /ref-requestbody (POST uses $ref: '#/components/schemas/ExplicitSchema')
      const refReqBodyControllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "RefRequestbodyController.ts"
      );
      expect(
        fs.existsSync(refReqBodyControllerPath),
        "RefRequestbodyController.ts should exist"
      ).toBe(true);
      const refReqBodyControllerContent = fs.readFileSync(
        refReqBodyControllerPath,
        "utf-8"
      );
      expect(refReqBodyControllerContent).toMatch(
        /public resourceKey = "refrequestbodies"/
      );

      // 4. /inline-requestbody (POST uses inline schema)
      const inlineReqBodyControllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "InlineRequestbodyController.ts"
      );
      expect(
        fs.existsSync(inlineReqBodyControllerPath),
        "InlineRequestbodyController.ts should exist"
      ).toBe(true);
      const inlineReqBodyControllerContent = fs.readFileSync(
        inlineReqBodyControllerPath,
        "utf-8"
      );
      expect(inlineReqBodyControllerContent).toMatch(
        /public resourceKey = "inlinerequestbodies"/
      );

      // 5. /array-ref-response (GET uses array of $ref: '#/components/schemas/ArrayItemSchema')
      const arrayRefControllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "ArrayRefResponseController.ts"
      );
      expect(
        fs.existsSync(arrayRefControllerPath),
        "ArrayRefResponseController.ts should exist"
      ).toBe(true);
      const arrayRefControllerContent = fs.readFileSync(
        arrayRefControllerPath,
        "utf-8"
      );
      expect(arrayRefControllerContent).toMatch(
        /public resourceKey = "arrayrefresponses"/
      );

      // 6. /array-inline-response (GET uses array of inline schema)
      const arrayInlineControllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        "ArrayInlineResponseController.ts"
      );
      expect(
        fs.existsSync(arrayInlineControllerPath),
        "ArrayInlineResponseController.ts should exist"
      ).toBe(true);
      const arrayInlineControllerContent = fs.readFileSync(
        arrayInlineControllerPath,
        "utf-8"
      );
      expect(arrayInlineControllerContent).toMatch(
        /public resourceKey = "arrayinlineresponses"/
      );

      // Check routes file for instantiation and usage
      const routerPath = path.join(
        GENERATED_DIR,
        specName,
        "routes",
        "index.ts"
      );
      const routerContent = fs.readFileSync(routerPath, "utf-8");
      expect(routerContent).toMatch(/new RefResponseController()/);
      expect(routerContent).toMatch(/new InlineResponseController()/);
      expect(routerContent).toMatch(/new RefRequestbodyController()/);
      expect(routerContent).toMatch(/new InlineRequestbodyController()/);
      expect(routerContent).toMatch(/new ArrayRefResponseController()/);
      expect(routerContent).toMatch(/new ArrayInlineResponseController()/);
    });
  });

  describe("Middleware in Routes", () => {
    const specDirRelativePath = path.relative(process.cwd(), EXAMPLES_DIR);
    const specFilename = "middleware-route-spec.yaml";
    const specName = "middleware-route-spec";

    beforeEach(() => {
      const middlewareSpecContent = `
openapi: 3.0.0
info:
  title: Middleware Route Test
  version: 1.0.0
paths:
  /custom-middleware:
    get:
      summary: Endpoint with custom middleware
      operationId: getWithMiddleware
      x-route-config: # Custom extension for generator to pick up middleware
        middleware: ["myCustomAuthMiddleware", "myCustomLoggingMiddleware"]
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties: { message: { type: string } }
      `;
      fs.writeFileSync(
        path.join(EXAMPLES_DIR, specFilename),
        middlewareSpecContent
      );
      cleanupGeneratedDir(specName);
    });

    afterEach(() => {
      cleanupGeneratedDir(specName);
      fs.unlinkSync(path.join(EXAMPLES_DIR, specFilename));
    });

    it("should include specified middleware in the generated route definition", () => {
      // This test assumes the generator (`src/generator.ts`) has been updated
      // to look for `x-route-config: { middleware: ["name1", "name2"] }` in the OpenAPI spec
      // and inject these middleware names into the route string.
      // Currently, the generator.ts does NOT have this logic.
      // This test will FAIL until src/generator.ts is modified.
      // For now, we are writing the test as per the test plan.

      runGenerateCommand(specDirRelativePath, GENERATED_DIR);

      const routerPath = path.join(
        GENERATED_DIR,
        specName,
        "routes",
        "index.ts"
      );
      expect(fs.existsSync(routerPath)).toBe(true);
      const routerContent = fs.readFileSync(routerPath, "utf-8");

      const controllerName = "CustomMiddlewareController"; // Based on path /custom-middleware
      const controllerInstance = "customMiddlewareController";
      const operationIdMethod = "getWithMiddleware"; // from operationId

      // Expected route definition with middleware injected
      const expectedRouteRegex = new RegExp(
        `router\\.get\\(\\'\/custom-middleware\\'\, myCustomAuthMiddleware, myCustomLoggingMiddleware, ${controllerInstance}\\.${operationIdMethod}\\.bind\\(${controllerInstance}\\)\\);`
      );
      expect(routerContent).toMatch(expectedRouteRegex);

      // Also check controller and its instantiation are generated
      const controllerPath = path.join(
        GENERATED_DIR,
        specName,
        "controllers",
        `${controllerName}.ts`
      );
      expect(
        fs.existsSync(controllerPath),
        `${controllerName}.ts should exist`
      ).toBe(true);
      expect(routerContent).toMatch(
        new RegExp(
          `import { ${controllerName} } from '..\\/controllers\\/${controllerName}.js';`
        )
      );
      expect(routerContent).toMatch(
        new RegExp(`const ${controllerInstance} = new ${controllerName}\\(\\);`)
      );
    });
  });

  describe("Output Directory and Idempotency", () => {
    const specDirRelativePath = path.relative(process.cwd(), EXAMPLES_DIR);
    const minimalSpecFilename = "minimal-spec.yaml"; // Use existing minimal spec
    const customOutDir = path.join(process.cwd(), "my_generated_code");
    const specNameMinimal = "minimal-spec";

    beforeEach(() => {
      // Ensure minimal-spec.yaml exists from previous describe block setup or re-create if necessary
      if (!fs.existsSync(path.join(EXAMPLES_DIR, minimalSpecFilename))) {
        const minimalSpecContent = `
openapi: 3.0.0
info: {title: Minimal API, version: 1.0.0}
components: {schemas: {Item: {type: object, properties: {id: {type: string}, name: {type: string}}}}}
paths:
  /items:
    get:
      operationId: listItems
      responses: { '200': {description: OK, content: {application/json: {schema: {type: array, items: {$ref: '#/components/schemas/Item'}}}}}}
    post:
      operationId: createItem
      requestBody: {content: {application/json: {schema: {$ref: '#/components/schemas/Item'}}}}
      responses: { '201': {description: Created}}
  /items/{itemId}:
    get:
      operationId: getItem
      responses: { '200': {description: OK, content: {application/json: {schema: {$ref: '#/components/schemas/Item'}}}}}
        `;
        fs.writeFileSync(
          path.join(EXAMPLES_DIR, minimalSpecFilename),
          minimalSpecContent
        );
      }
      cleanupGeneratedDir(); // Clean default generated dir
      if (fs.existsSync(customOutDir)) {
        fs.rmSync(customOutDir, { recursive: true, force: true });
      }
    });

    afterEach(() => {
      cleanupGeneratedDir();
      if (fs.existsSync(customOutDir)) {
        fs.rmSync(customOutDir, { recursive: true, force: true });
      }
    });

    it("should generate files in the default 'generated' directory", () => {
      runGenerateCommand(specDirRelativePath); // No outDir specified, should use default
      const controllerPath = path.join(
        GENERATED_DIR,
        specNameMinimal,
        "controllers",
        "ItemController.ts"
      );
      expect(
        fs.existsSync(controllerPath),
        `Controller should be in default ${GENERATED_DIR}`
      ).toBe(true);
    });

    it("should generate files in a custom output directory specified by --out-dir", () => {
      runGenerateCommand(specDirRelativePath, customOutDir);
      const controllerPath = path.join(
        customOutDir,
        specNameMinimal,
        "controllers",
        "ItemController.ts"
      );
      expect(
        fs.existsSync(controllerPath),
        `Controller should be in custom ${customOutDir}`
      ).toBe(true);
      // Verify default 'generated' dir is not created for this spec in this case
      const defaultControllerPath = path.join(
        GENERATED_DIR,
        specNameMinimal,
        "controllers",
        "ItemController.ts"
      );
      expect(
        fs.existsSync(defaultControllerPath),
        `Controller should NOT be in default ${GENERATED_DIR} if custom outDir is used`
      ).toBe(false);
    });

    it("should be idempotent - running generation twice overwrites without error", () => {
      // Generate to default directory first time
      runGenerateCommand(specDirRelativePath, GENERATED_DIR);
      const controllerPath = path.join(
        GENERATED_DIR,
        specNameMinimal,
        "controllers",
        "ItemController.ts"
      );
      expect(fs.existsSync(controllerPath)).toBe(true);
      const firstGenTimestamp = fs.statSync(controllerPath).mtimeMs;

      // It might be too fast to reliably check timestamp difference, ensure no error is primary
      // Let's try to ensure a slight delay or check content remains the same.
      // For now, just running it again and checking existence + no error is the main goal.

      let secondRunError = null;
      try {
        runGenerateCommand(specDirRelativePath, GENERATED_DIR); // Generate again to same directory
      } catch (e) {
        secondRunError = e;
      }
      expect(
        secondRunError,
        "Second generation run should not throw an error"
      ).toBeNull();
      expect(
        fs.existsSync(controllerPath),
        "Controller file should still exist after second run"
      ).toBe(true);
      // Optionally, check if content is identical or timestamp has changed (if modification is expected)
    });
  });

  // More generation tests will follow
});
