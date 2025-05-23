# Fake API Generator

A powerful tool that automatically generates mock API endpoints, fake data, and starts a server based on your Swagger/OpenAPI specification.

## Features

- Generate Express routes and controllers from Swagger/OpenAPI specs
- Generate realistic mock data based on schema definitions
- Validate requests and responses against your API spec
- Support for multiple API specs in one server
- Easy to extend and customize generated controllers
- Built-in database for persistent data storage
- **Supports custom controller logic:**
  - Pagination (e.g., `GET /users?page=1&limit=10`)
  - Field censoring (e.g., hide or mask sensitive fields)
  - Forced errors for testing
- **Comprehensive integration test script** for all endpoints and edge cases

## Installation

```bash
npm install
```

## Usage

1. Place your Swagger/OpenAPI specification files (YAML or JSON) in the `swagger` directory.

2. Generate routes and controllers:
```bash
npm run generate
```

This will create a directory structure under `generated` for each API spec:
```
generated/
  ├── api-name/
  │   ├── routes/
  │   │   └── index.ts
  │   └── controllers/
  │       └── index.ts
```

3. Generate mock data:
```bash
npm run mock
```

This will create a `db.json` file with mock data based on your API schemas.

4. Start the server:
```bash
npm start
```

The server will start on port 3000 by default. You can change the port using the `--port` option:
```bash
npm start -- --port 8080
```

## Directory Structure

```
.
├── swagger/           # Place your Swagger/OpenAPI specs here
├── generated/         # Generated routes, controllers, and data
├── src/
│   ├── generator.ts   # Route and controller generator
│   ├── mock.ts       # Mock data generator
│   ├── server.ts     # Express server setup
│   └── index.ts      # CLI entry point
└── package.json
```

## Customizing Controllers

The generated controllers provide basic CRUD operations by default. You can customize them by editing the files in the `generated/<api-name>/controllers` directory.

**Examples of custom logic you can add:**
- Pagination: Use `req.query.page` and `req.query.limit` to paginate results.
- Field censoring: Remove or mask fields (e.g., `user.email = '***'`).
- Forced errors: Throw or return errors for testing error handling.

Example controller with custom logic:
```typescript
export const getUsers = async (req: Request, res: Response) => {
  let data = await db.get(req.path);
  // Censor email
  data = data.map((user: any) => ({ ...user, email: '***' }));
  // Pagination
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || data.length;
  const start = (page - 1) * limit;
  const paginated = data.slice(start, start + limit);
  res.json(paginated);
};

export const errorUsers = async (req: Request, res: Response) => {
  res.status(500).json({ error: 'Forced error for testing' });
};
```

## Integration Testing

A comprehensive integration test script (`test-app.cjs`) is included. It:
- Generates routes/controllers and mock data
- Starts the server
- Tests all endpoints and edge cases (CRUD, invalid, duplicate, not found)
- Tests custom logic (pagination, censoring, forced errors)
- Logs results for each test

To run the integration test:
```bash
node test-app.cjs
```

## Testing

Run the test suite:
```

## Limitations & Developer Responsibilities

- **Strictly Generic:** The generator is designed to work with any valid Swagger/OpenAPI spec and does not contain custom logic for unique or non-standard specs.
- **Basic CRUD Only:** Only basic CRUD endpoints are auto-generated. The generator maps collection endpoints (e.g., `/posts`) to the main resource (e.g., `Post`) using only the top-level array or object schema. Nested properties are never used for main resource mapping.
- **Advanced Logic Not Included:** Features like pagination, filtering, sorting, field censoring, authentication, and nested resource handling are **not** auto-generated. You must implement these in the generated controller files as needed.
- **Inline Schemas:** If your spec uses inline schemas, the generator will synthesize a schema key based on the resource name. Ensure your schemas are consistent and include required fields (e.g., `id`).
- **ID Handling:** The generator expects resources to have an `id` field for item endpoints. If your schema does not include an `id`, you may need to adjust the generated code or your spec.
- **Mock Data:** Mock data is generated based on the top-level schema for each resource. Relationships (e.g., comments inside posts) are not automatically linked unless defined in the schema.

## Troubleshooting

- **404 on GET by ID:** Ensure your schema includes an `id` property and that mock data is generated with unique ids.
- **Empty List Responses:** If the generated mock data is empty, check your schema definitions for required fields and types.
- **Unexpected Resource Mapping:** The generator only uses the top-level array or object schema for mapping. If a collection endpoint is mapped to the wrong resource, check your spec for nested or ambiguous schemas.