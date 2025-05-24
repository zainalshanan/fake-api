# Fake API Generator

A powerful tool that automatically generates mock API endpoints, fake data, and starts a server based on your Swagger/OpenAPI specification.

## Features

- Generate Express routes and controllers from Swagger/OpenAPI specs using a `BaseController` architecture.
- Generated controllers for each resource extend a common `BaseController` for CRUD operations.
- Hooks available in `BaseController` for `before` and `after` logic on all CRUD operations.
- Generate realistic mock data based on schema definitions using a pluggable mock strategy.
- Validate requests against your API spec using `openapi-data-validator`.
- Support for multiple API specs in one server.
- Easy to extend and customize generated controllers.
- Built-in database (`LowDB` with a `db.json` file) for persistent data storage.
- **Supports custom controller logic:**
  - Pagination, filtering, field censoring, custom actions etc. can be added by overriding `BaseController` methods or adding new ones.
- **Testing:**
  - Unit tests for core utilities and `BaseController` using Vitest.
  - Integration tests for generated APIs (e.g., `petstore.yaml`) using Vitest and Supertest.

## Installation

```bash
npm install
```

## Usage

1. Place your Swagger/OpenAPI specification files (YAML or JSON) in the `swagger` directory.

2. **Generate API code (routes and controllers):**

```bash
npm run generate
# or
node dist/src/index.js generate --spec-dir <your_swagger_folder> --out-dir <your_output_folder>
```

This will create a directory structure under your output directory (default: `generated`) for each API spec:

```
<out-dir>/
  ├── <spec-name>/
  │   ├── routes/
  │   │   └── index.ts      # Express router for the spec
  │   └── controllers/
  │       ├── <Resource>Controller.ts  # Controller for each resource (e.g., PetController.ts)
  │       └── index.ts      # Exports all resource controllers
  └── db.json               # Mock database (if mock data is generated)
```

3. **Generate mock data:**

```bash
npm run mock
# or
node dist/src/index.js mock --spec-dir <your_swagger_folder> --out-dir <your_output_folder>
```

This will populate/update the `<out-dir>/db.json` file with mock data based on your API schemas.

4. **Start the server:**

```bash
npm start
# or
npm run serve
# or
node dist/src/index.js serve --spec-dir <your_swagger_folder> --out-dir <your_output_folder> --port <port_number>
```

The server will start (default port: 3000). API endpoints will be available under `/api/<spec-name>/...`.

## Architecture Overview

The application is structured as follows:

- **`src/index.ts`**: CLI entry point, parsing commands and options.
- **`src/server.ts`**: Initializes the Express server, loads OpenAPI specs, sets up middleware (including OpenAPI validation and base path stripping), and dynamically mounts generated routes. It also contains the `Database` class for `db.json` interaction.
- **`src/generator.ts`**: Responsible for parsing OpenAPI specs and generating:
  - Route files (`<out-dir>/<spec-name>/routes/index.ts`) that instantiate and use generated controllers.
  - Controller files (`<out-dir>/<spec-name>/controllers/<Resource>Controller.ts`) for each resource, extending `BaseController`.
- **`src/mock.ts`**: Generates mock data for schemas found in OpenAPI specs and stores it in `<out-dir>/db.json`. It uses a `DefaultMockStrategy` which can be replaced.
- **`src/controllers/BaseController.ts`**: An abstract class providing default CRUD operations (`list`, `get`, `create`, `update`, `patch`, `delete`) and hooks (e.g., `beforeCreate`, `afterGet`) for customization. Generated controllers extend this class.
- **`src/utils/`**: Contains various utility modules for file operations, OpenAPI spec manipulation, logging, database helpers, and middleware.
- **`swagger/`**: Directory for your input OpenAPI/Swagger specification files.
- **`generated/` (or your specified `--out-dir`)**: Output directory for all generated code (routes, controllers) and the `db.json` mock database.
- **`tests/`**: Contains unit and integration tests.
  - `tests/controllers/BaseController.test.ts`: Unit tests for the base controller.
  - `tests/integration/petstore.test.ts`: Example integration test for a generated API.

(For a visual diagram, see `docs/architecture.md`)

## Customizing Generated Controllers

Generated controllers (e.g., `generated/<spec-name>/controllers/UserController.ts`) extend `BaseController`. You can customize their behavior in several ways:

1. **Override Hooks**: Implement any of the `protected` hook methods from `BaseController` to add logic before or after the main operation.

```typescript
// In generated/your-spec/controllers/YourResourceController.ts
import { BaseController } from "../../../src/controllers/BaseController.js";
import type { Request, Response } from "express";
// import type { YourResourceType } from '../../interfaces'; // If you have defined types

export class YourResourceController extends BaseController<any> {
  // Replace 'any' with YourResourceType
  resourceKey = "yourresources"; // Should match the key in db.json

  protected async afterGet(item: any, req: Request): Promise<any> {
    // Example: Censor a field before sending response
    if (item && item.sensitiveField) {
      delete item.sensitiveField;
    }
    return item;
  }

  protected async beforeCreate(
    req: Request,
    data: Partial<any>
  ): Promise<Partial<any>> {
    // Example: Add a timestamp or a default value
    (data as any).createdAt = new Date().toISOString();
    return data;
  }
}
```

2. **Override CRUD Methods**: For more complex customization, you can override the entire CRUD method (e.g., `list`, `create`). Remember to call `super.methodName()` if you want to retain base functionality.

```typescript
// In generated/your-spec/controllers/YourResourceController.ts
// ...
export class YourResourceController extends BaseController<any> {
  resourceKey = "yourresources";

  async list(req: Request, res: Response): Promise<void> {
    // Example: Custom pagination logic
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // You'd typically fetch all data then slice, or modify db.get to support pagination
    const allItems = (await db.get(this.resourceKey)) || [];
    const paginatedItems = allItems.slice((page - 1) * limit, page * limit);

    if (this.afterList) {
      // Still possible to use afterList hook
      const modifiedData = await this.afterList(paginatedItems);
      res.json(modifiedData);
      return;
    }
    res.json(paginatedItems);
  }
}
```

3. **Add Custom Methods**: Add new methods to your controller for operations not covered by CRUD.

```typescript
// In generated/your-spec/controllers/YourResourceController.ts
// ...
export class YourResourceController extends BaseController<any> {
  resourceKey = "yourresources";

  async customAction(req: Request, res: Response): Promise<void> {
    // Your custom logic here
    const itemId = req.params.id;
    res.json({
      message: `Custom action performed on item ${itemId} of ${this.resourceKey}`,
    });
  }
}
```

Then, you would manually add a route in `generated/<spec-name>/routes/index.ts` to map to this custom action.

## Testing

The project uses **Vitest** for testing.

- **Unit Tests**: Located in files like `tests/utils/openapi.test.ts` and `tests/controllers/BaseController.test.ts`.

```bash
npm test src/utils/openapi.test.ts
npm test tests/controllers/BaseController.test.ts
```

- **Integration Tests**: An example integration test for the `petstore.yaml` API is provided in `tests/integration/petstore.test.ts`. It uses **Supertest** to make HTTP requests to a running server instance. These tests typically involve:
  1. Generating API code and mock data.
  2. Starting the server.
  3. Making requests to endpoints and asserting responses.
  4. Stopping the server and cleaning up.

To run all tests:

```bash
npm test
```

To run a specific integration test file:

```bash
npm test tests/integration/petstore.test.ts
```

To run tests in watch mode:

```bash
npm run test:watch
```

To view test coverage:

```bash
npm run coverage
# Open coverage/index.html in your browser
```

## Limitations & Developer Responsibilities

- **Generic CRUD Focus:** The generator creates controllers extending `BaseController` which provides standard CRUD. Complex, resource-specific business logic, advanced filtering, sorting, or non-standard operations need to be implemented by customizing the generated controllers.
- **Path to Resource Mapping:** The generator attempts to determine the primary resource for a path (e.g., `/users` -> `User`, `/users/{id}` -> `User`). For complex nested paths (e.g., `/users/{userId}/orders/{orderId}`), the primary resource for route generation is typically based on the first segment. Controller methods will receive path parameters, allowing you to implement the specific logic.
- **ID Handling:** `BaseController` assumes an `id` field (or a field detectable by `detectIdField` utility, e.g., `resourceNameId`) for item-specific operations. Ensure your schemas and mock data align with this.
- **Mock Data Relationships:** The default mock data generator populates resources independently. While it attempts to link related resources using generated IDs (e.g., if `Post` has `authorId`, it will try to use an ID from generated `Author`s), complex relationships or specific data scenarios might require custom mock data generation or adjustments to the `db.json` file.

## Troubleshooting

- **404 on GET by ID:** Ensure your schema includes an `id` property (or a recognizable ID field) and that mock data is generated for that resource with corresponding IDs. Check the `generated/db.json` file.
- **Empty List Responses `[]`:** Verify your schema definitions. If `db.json` has data for the resource key, check if any `afterList` hooks are unintentionally clearing the data.
- **Type Errors in Generated Code:** Ensure your OpenAPI specification is valid and follows common conventions. If using inline schemas, ensure they are well-defined.
- **Server Startup Issues:** Check console logs for errors. Ensure the `--out-dir` and `--spec-dir` point to the correct locations.
- **Middleware Conflicts:** If adding custom middleware, be mindful of the order and potential conflicts with the built-in OpenAPI validation or base path stripping middleware.

(See `plan.md` for the original refactoring plan and completed tasks.)
