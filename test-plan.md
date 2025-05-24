# Application Test Plan

This document outlines a plan for thoroughly testing the Fake API Generator application. It includes checklists for various typesof testing.

## II. Unit Testing (`npm test <path_to_test_file>`)

**Goal:** Verify individual functions, modules, and classes work correctly in isolation.

- **`src/utils/*` Utilities:**

  - [x] **`file.ts` (`tests/utils/file.test.ts`):**
    - [x] `ensureDirs()`: Creates directory if not exists, creates nested dirs.
    - [x] `writeJsonFile()`: Writes valid JSON, overwrites existing file.
    - [x] `readFile()`: Reads file content correctly, handles non-existent file (throws error).
    - [x] `writeFile()`: Writes content correctly, overwrites existing.
    - [x] `readDir()`: Lists directory contents, handles empty/non-existent dir.
    - [x] `pathExists()`: Correctly reports existence and non-existence.
  - [x] **`openapi.ts` (`tests/utils/openapi.test.ts`):**
    - [x] `extractSchemaRef()`: Correctly extracts $ref from various response structures, returns null if not found.
    - [x] `extractSchemaKey()`: Correctly extracts schema key from $ref string, returns null for invalid refs.
    - [x] `findOpenApiPath()`: Matches Express paths to OpenAPI paths (exact, with params, complex), handles trailing slashes, returns original if no match.
    - [x] `castQueryToString()`: Casts string queries, handles arrays, ignores non-strings.
    - [x] `castHeadersToString()`: Casts string headers, handles arrays, casts non-strings.
  - [x] **`db.ts` (`tests/utils/db.test.ts`):**
    - [x] `getNestedValue()`: Retrieves values from various depths, handles array indexing by ID (if applicable in its usage context), returns null for non-existent paths.
    - [x] `setNestedValue()`: Sets values at various depths, creates paths if not exist, appends to arrays correctly.
    - [x] `findItemById()`: Finds item in a collection, returns [collection, index], handles item not found, handles path to non-collection.
  - [x] **`logger.ts` (`tests/utils/logger.test.ts`):**
    - [x] Verify each static method (`info`, `success`, `warn`, `error`, `debug`, `table`, `divider`, `title`) calls `console.log` (or `console.table`) with correctly formatted `chalk` output. (Mock `console` and `chalk`).
  - [x] **`swagger.ts` (`tests/utils/swagger.test.ts`):**
    - [x] `getSwaggerFiles()`: Returns correct list of `.yaml`, `.yml`, `.json` files, handles empty directory, handles non-existent directory.
  - [x] **`idField.ts` (`tests/utils/idField.test.ts`):**
    - [x] `detectIdField()`: Correctly detects 'id', '{resourceName}Id', snake_case_id, 'blid', any field ending in 'Id', falls back to first prop or 'id'. Test with various schema structures.
  - [x] **`swaggerResolver.ts` (`tests/utils/swaggerResolver.test.ts`):**
    - [x] `resolveSchema()`: Resolves direct schema objects, resolves `$ref` to schemas within the provided `schemas` map, handles nested `$ref`, throws error for missing `$ref` or unsupported format.
  - [x] **`defaultMockStrategy.ts` (`tests/utils/defaultMockStrategy.test.ts`):**
    - [x] `setSchemas()`, `getGeneratedIds()`, `clearGeneratedIds()`: Basic state management.
    - [x] `generateMockItem()`: Generates object based on schema, handles properties, uses `detectIdField` for ID, generates related entity IDs if present in `generatedIds`, respects depth limits.
    - [x] `generateMockValue()`: Generates correct mock values for all supported schema types (string, number, integer, boolean, array, object) and formats (date-time, email, uri, enum), respects depth limits for nested objects/arrays.
  - [x] **`middleware.ts` (`tests/utils/middleware.test.ts`):**
    - [x] `extractPathParams()`: Correctly extracts path parameters from request path and OpenAPI path template.
    - [x] `openApiValidatorMiddleware()`:
      - [x] Calls `next()` for valid requests.
      - [x] Returns 400 with error details for invalid requests (mock `OpenApiValidator` and its `createValidator` method).
      - [x] Correctly finds `openapiPath`.
      - [x] Handles various request parts (query, headers, path, body).
    - [x] `stripBasePathMiddleware()`:
      - [x] Correctly strips base path from `req.originalUrl` and `req.url`.
      - [x] Calls `next()`.
      - [x] Does nothing if base path doesn't match.

- **`src/controllers/BaseController.ts` (`tests/controllers/BaseController.test.ts`):**
  - [x] For each CRUD method (`list`, `get`, `create`, `update`, `patch`, `delete`):
    - [x] Verify successful operation (correct `db` method called with right args, correct response status and JSON).
    - [x] Verify 404 handling for item-specific operations if resource not found.
    - [x] Verify 500 handling if `db` method throws an error.
    - [x] Verify `before<Action>` hook is called with correct arguments.
    - [x] Verify `after<Action>` hook is called with correct arguments and its return value is used in the response.
    - [x] Test with and without hooks defined in the concrete test controller.

## III. Generation Testing (`npm run generate`)

**Goal:** Ensure API code (routes, controllers) is correctly generated from OpenAPI specs.

- [x] **Basic Spec:** Use `examples/minimal-spec.yaml`. (`tests/integration/generation.test.ts`)
  - [x] Verify `generated/minimal/controllers/ItemController.ts` is created and extends `BaseController`.
  - [x] Verify `generated/minimal/controllers/index.ts` exports `ItemController`.
  - [x] Verify `generated/minimal/routes/index.ts` imports `ItemController`, instantiates it, and sets up CRUD routes.
- [x] **Complex Spec:** Use `swagger/blog-api.yaml` (or another spec with multiple resources, relationships, and varied path structures). (`tests/integration/generation.test.ts`)
  - [x] Verify controllers are generated for each primary resource (e.g., `PostController`, `AuthorController`, `CommentController`).
  - [x] Verify routes are generated for all paths, including nested paths (e.g., `/posts/{postId}/comments`).
  - [x] Check `resourceKey` in generated controllers matches pluralized resource name.
  - [x] Verify generated route paths use Express-style parameters (e.g., `:postId`).
- [x] **Path Naming and Normalization:** (`tests/integration/generation.test.ts`)
  - [x] Test specs with paths starting/not starting with `/`.
  - [x] Test specs with complex path parameter names (e.g., `item_id`, `itemID`).
- [x] **Operation ID Handling:** (`tests/integration/generation.test.ts`)
  - [x] Test with operations having explicit `operationId`.
  - [x] Test with operations missing `operationId` (generator should create one).
  - [x] Ensure generated method names in controllers correspond to these operation IDs or standard CRUD actions.
- [x] **Schema Key Determination (`_determineSchemaKeyAndMappings` in `generator.ts`):** (`tests/integration/generation.test.ts`)
  - [x] Test with schemas referenced via `$ref` in responses and requestBodies.
  - [x] Test with inline schemas in responses and requestBodies (generator should synthesize a name).
  - [x] Test with array schemas (items being `$ref` or inline).
- [x] **Middleware in Routes:** (`tests/integration/generation.test.ts`)
  - [x] If `RouteConfig` includes `middleware` array, ensure it's added to the route definition string in `generateRouteFile`. (Note: Test written, requires generator.ts modification to pass)
- [x] **Output Directory:** (`tests/integration/generation.test.ts`)
  - [x] Test with default `--out-dir` (`generated`).
  - [x] Test with custom `--out-dir` (e.g., `npm run generate -- --out-dir my_generated_code`).
- [x] **Idempotency:** (`tests/integration/generation.test.ts`)
  - [x] Run generation twice with the same spec. Files should be overwritten without error.

## IV. Mock Data Generation Testing (`npm run mock`)

**Goal:** Ensure mock data is correctly generated based on OpenAPI schemas.

- [x] **Schema Types:** Using a test spec, ensure mock data is generated for:
  - [x] `string` (and formats: `date-time`, `email`, `uuid`, `uri`, `byte`)
  - [x] `number`, `integer` (and formats: `float`, `double`, `int32`, `int64`)
  - [x] `boolean`
  - [x] `array` (with various item types, including `$ref` to other schemas)
  - [x] `object` (with various properties, including nested objects and `$ref`)
  - [x] `enum` values are respected.
  - [ ] `example` values in schema are prioritized if `pluggable mock strategy` is configured for it (current default does not, but good to note for future).
- [x] **`db.json` Output:**
  - [x] Verify `generated/db.json` (or `<out-dir>/db.json`) is created/updated.
  - [x] Data should be structured per-spec, then per-resource (e.g., `db.petstore.pets`, `db.blog.posts`).
  - [x] Each resource should have an array of mock items (default 5, check `MockGenerator`).
  - [x] IDs should be generated and unique within their resource list (if ID field is present).
  - [x] Related IDs (e.g., `authorId` in a `Post`) should attempt to use IDs from already generated `Author` resources.
- [x] **`DefaultMockStrategy` Behavior:**
  - [x] Test `maxDepth` to prevent infinite recursion in schemas with circular dependencies.
  - [ ] Verify handling of `allOf`, `oneOf`, `anyOf` (current strategy might have basic or no support, note limitations).
- [x] **Multiple Specs:** Ensure data for all specs in `specDir` is included in `db.json` under their respective spec names.
- [x] **No Schema Specs:** If a spec has no `components.schemas`, mock generation should still run without error (producing empty data for that spec or data based on requestBody/response schemas if applicable).

## V. Server & API Integration Testing (`npm start` or `npm run serve` + HTTP client/Supertest)

**Goal:** Verify the server runs, serves generated APIs, and integrates all components correctly (routing, controllers, DB, validation).
Use `tests/integration/petstore.test.ts` as a template for other specs.

- **For each generated API (e.g., petstore, blog-api):**
  - [x] **Server Startup:**
    - [x] Server starts without errors on the specified port (default 3000 or via `--port`).
    - [x] Logs indicate which specs are loaded and their base paths (e.g., `/api/petstore`).
  - [x] **Basic CRUD Operations (using an HTTP client like Postman, curl, or Supertest):**
    - [x] `POST /api/<spec-name>/<resource>`: Create an item. Verify 201 status, response body (if any). Item should be in `db.json`.
    - [x] `GET /api/<spec-name>/<resource>`: List items. Verify 200 status, response is an array. Check if newly created item is present.
    - [x] `GET /api/<spec-name>/<resource>/{id}`: Get a specific item. Verify 200 status, correct item returned. Test with non-existent ID (expect 404).
    - [x] `PUT /api/<spec-name>/<resource>/{id}`: Update an item. Verify 200 status, updated item in response. Item should be updated in `db.json`. Test with non-existent ID (expect 404).
    - [x] `PATCH /api/<spec-name>/<resource>/{id}`: Partially update an item. Verify 200 status, updated item in response. Item should be updated in `db.json`. Test with non-existent ID (expect 404).
    - [x] `DELETE /api/<spec-name>/<resource>/{id}`: Delete an item. Verify 204 status. Item should be removed from `db.json`. Test with non-existent ID (expect 404 or 204 depending on BaseController current impl).
  - [x] **OpenAPI Validation Middleware:**
    - [x] Send requests with invalid data types (e.g., string where number expected in body or query param). Expect 400 error with validation details.
    - [x] Send requests missing required fields. Expect 400 error.
    - [x] Send requests with invalid enum values. Expect 400 error.
    - [x] Send requests with valid data. Expect successful response (2xx).
  - [x] **Path Handling & Base Path Stripping:**
    - [x] Ensure requests to `/api/<spec-name>/<path>` are correctly routed.
    - [x] Test paths with and without trailing slashes.
  - [ ] **Controller Hooks:**
    - [ ] If example customizations are added to generated controllers (e.g., modifying response in `afterGet`), verify this custom logic is executed.
  - [x] **Database Interaction:**
    - [x] Verify that changes made via API (POST, PUT, PATCH, DELETE) are reflected in the `generated/db.json` file and persist across server restarts (if `db.json` is not cleared).

## VI. CLI Testing

**Goal:** Verify the Command Line Interface works as expected.

- [x] **`generate` command:**
  - [x] `node dist/src/index.js generate --help`: Displays help.
  - [x] `node dist/src/index.js generate`: Runs with default `spec-dir` and `out-dir`.
  - [x] `node dist/src/index.js generate -s custom_swagger -o custom_generated`: Uses custom dirs.
  - [x] Test with invalid/empty `spec-dir` (should handle gracefully, e.g., log warning).
- [x] **`mock` command:**
  - [x] `node dist/src/index.js mock --help`: Displays help.
  - [x] `node dist/src/index.js mock`: Runs with default dirs.
  - [x] `node dist/src/index.js mock -s custom_swagger -o custom_generated`: Uses custom dirs.
  - [x] Test with invalid/empty `spec-dir`.
- [x] **`serve` command:**
  - [x] `node dist/src/index.js serve --help`: Displays help.
  - [x] `node dist/src/index.js serve`: Runs with default dirs and port.
  - [x] `node dist/src/index.js serve -s custom_swagger -o custom_generated -p 3005`: Uses custom options.
  - [x] Test with invalid `out-dir` (e.g., no generated code). Server should still start, maybe log warnings.
- [x] **Global options:**
  - [x] `node dist/src/index.js --version`: Displays version from `package.json`.
  - [x] `node dist/src/index.js --help`: Displays main help.

## VII. Edge Case & Negative Testing

**Goal:** Identify how the system behaves under unexpected or invalid conditions.

- [x] **Malformed OpenAPI Specs:**
  - [x] Test `generate`, `mock`, and `serve` with a spec that has syntax errors. Expect graceful failure with informative error messages (e.g., from `SwaggerParser`).
  - [x] Test with a spec that is valid YAML/JSON but semantically incorrect OpenAPI (e.g., missing required fields like `paths` or `info`).
- [x] **Empty `spec-dir`:**
  - [x] `generate`: Should produce no output or a message, no errors.
  - [x] `mock`: Should produce an empty `db.json` or a message, no errors.
  - [x] `serve`: Server should start, serve no APIs, or provide a message.
- [ ] **File System Permissions:** (More advanced, might require specific setup)
- [ ] **Large Number of Specs/Large Specs:**
  - [ ] Performance check for generation and server startup time with many (e.g., 10+) or very large spec files.
- [ ] **Concurrent API Calls:** (Requires load testing tools)
  - [ ] Basic check if the server handles multiple simultaneous requests to different generated APIs without crashing.
