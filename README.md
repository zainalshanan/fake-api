# Fake API Generator

A powerful tool that automatically generates mock API endpoints, fake data, and starts a server based on your Swagger/OpenAPI specification.

## Features

- Generate Express routes and controllers from Swagger/OpenAPI specs
- Generate realistic mock data based on schema definitions
- Validate requests and responses against your API spec
- Support for multiple API specs in one server
- Easy to extend and customize generated controllers
- Built-in database for persistent data storage

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

Example controller:
```typescript
export const getUsers = async (req: Request, res: Response) => {
  const data = await db.get(req.path);
  res.json(data);
};

export const createUser = async (req: Request, res: Response) => {
  const data = await db.create(req.path, req.body);
  res.status(201).json(data);
};
```

## Testing

Run the test suite:
```bash
npm test
```

Watch mode:
```bash
npm run watch:test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License. 