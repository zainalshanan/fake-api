# Refactor Plan for Mock API Generator

This document provides detailed, actionable steps for each refactoring task, enabling a developer to complete and tick off each item with confidence.

## 🎯 Goals

- Centralise shared logic into utilities for reusability and clarity.
- Eliminate redundancy by consolidating duplicate code patterns.
- Implement a BaseController to handle generic CRUD operations with overridable hooks for custom behaviour.
- Streamline generator.ts outputs so that generated routes/controllers adhere to the new architecture.
- Improve developer experience (DX) through consistent patterns, strong typing, and documentation.

## ✅ Refactoring Tasks

### Codebase Audit & Initial Cleanup

- [x] **Review all source files (`src/`)**

  ```bash
  grep -R "console.log" src/
  grep -R "detectIdField" src/
  ```

  - Create `docs/audit.md` listing for each file:
    - Paths where logic is duplicated
    - Inline helper functions to extract
    - Any direct `console.` usages

- [x] **Remove dead/commented-out code**

  - Remove blocks older than 3 months or labeled `// TODO`.
  - Use your IDE's "Remove Comments" action.
  - Verify with `git diff` to avoid deleting active code.

- [x] **Write a module diagram**
  - Create `docs/architecture.md` with an ASCII or draw.io diagram showing:
    - `src/utils/*` → utilities
    - `src/generator.ts`, `src/mock.ts` → codegen logic
    - `src/controllers/*`, `src/routes/*` → outputs
    - `src/server.ts` → API server

### Extract Shared Utilities

- [x] **File-system helpers**

  - Move `ensureDirs()` and `writeJsonFile()` to `src/utils/file.ts`.
  - Move all other `fs.*` usage into this module.
  - Add JSDoc above each function.

- [x] **OpenAPI helpers**

  - Keep `extractSchemaRef()`, `findOpenApiPath()`, `castQueryToString()` only in `src/utils/openapi.ts`.
  - Replace duplicate logic in `server.ts`/`generator.ts` by importing from utils.
  - Add unit tests in `tests/utils/openapi.test.ts`.

- [x] **DB/nested-data helpers**

  - Keep `getNestedValue()`, `setNestedValue()`, `findItemById()` only in `src/utils/db.ts`.
  - Remove inline copies elsewhere.
  - Add explicit TypeScript signatures.

- [x] **Logger consistency**
  - Replace all `console.*` with `Logger.*` calls.
  - Enforce via ESLint rule `no-console: "error"`.

### Introduce BaseController Architecture

- [x] **Create `src/controllers/BaseController.ts`**

```ts
import { Request, Response } from "express";
import db from "../db";

export abstract class BaseController<T> {
  abstract resourceKey: string;

  async list(req: Request, res: Response): Promise<void> {
    try {
      if (this.beforeList) await this.beforeList(req);
      const data = await db.get(`${this.resourceKey}`);
      res.json(data || []);
    } catch (err) {
      Logger.error(err);
      res.status(500).json({ error: "Internal error" });
    }
  }

  async get(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const item = await db.get(`${this.resourceKey}/${id}`);
      if (!item) return res.status(404).json({ error: "Not found" });
      if (this.afterGet) item = await this.afterGet(item);
      res.json(item);
    } catch (err) {
      /* ... */
    }
  }

  protected beforeList?(req: Request): Promise<void>;
  protected afterGet?(item: T): Promise<T>;
}
```

- [x] Document usage at the top of the file.

### Refactor Generated Controllers

- [x] Modify `generator.ts` to emit one file per resource:  
       `src/generated/<spec>/controllers/<Resource>Controller.ts`

```ts
import { BaseController } from "../../../controllers/BaseController";

export class UsersController extends BaseController<User> {
  resourceKey = "users";
}
```

- [x] Generate an index exporting each controller class.

### Update Route Generation

- Refactor `generateRouteFile`:

```ts
import { UsersController } from "../controllers/UsersController";
const users = new UsersController();

router.get("/users", users.list.bind(users));
router.get("/users/:id", users.get.bind(users));
```

- Remove duplicate logic and allow insertion of middleware arrays per route.

### Clean Up generator.ts

- Extract helpers:

  - `normalizePath(pathUrl: string): string`
  - `extractSchemaKey(operation: OperationObject): string | null`

- Split `generateApiFiles`:

  - `collectRoutes(api)`
  - `collectControllers(api, schemaMap)`
  - `writeFiles(routes, controllers, specName)`

- Tighten TypeScript types for `RouteConfig` and `ControllerConfig`.

### Refactor Mock Data Generator (mock.ts)

- Move `resolveSchema` → `src/utils/swaggerResolver.ts`
- Extract `detectIdField` → `src/utils/idField.ts`
- Add pluggable mock strategy interface

### Revise Server Initialization

- Simplify `setupRoutes()` to:

  - Import controllers from `outDir/<spec>/controllers`
  - Instantiate and mount

- Move OpenAPI validator to `src/utils/middleware.ts`

- Remove hardcoded paths, respect `--out-dir`

### Testing & Validation

- **Unit tests for BaseController**

  - Use Vitest to mock db

- **Integration tests**

  - Add `petstore.yaml`, test with Supertest

- **Code coverage**
  - Enforce >80% via Vitest config

### Documentation & Examples

- Update `README.md`:

  - Architecture overview
  - CLI usage
  - Controller extension
  - Testing

- Add `examples/`:

  - Minimal spec
  - Pagination demo

- Verify `--help` output

### Cleanup & Release

- Bump version to `2.0.0` in `package.json`
- Create tag `v2.0.0`, publish
- Write `docs/migration.md`

---

Once every box is checked, the new architecture will be clean, DRY, fully typed, and much easier to extend. 🚀
