// server.ts
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAPIV3 } from 'openapi-types';
import SwaggerParser from '@apidevtools/swagger-parser';
import * as OpenApiValidator from 'express-openapi-validator';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

export class Server {
  private app: express.Application;
  private specDir: string;
  private outDir: string;
  private port: number;
  private db: Low<any>;

  constructor(specDir: string, outDir: string, port: number) {
    this.app = express();
    this.specDir = specDir;
    this.outDir = outDir;
    this.port = port;
    const dbFile = new JSONFile(path.join(outDir, 'db.json'));
    this.db = new Low(dbFile, {});
  }

  async start(): Promise<void> {
    await this.db.read();
    
    this.setupMiddleware();
    await this.setupRoutes();
    
    this.app.listen(this.port, () => {
      console.log(`Server is running on http://localhost:${this.port}`);
    });
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private async setupRoutes(): Promise<void> {
    const specs = fs.readdirSync(this.specDir)
      .filter(file => file.endsWith('.yaml') || file.endsWith('.json'));

    for (const spec of specs) {
      const api = await SwaggerParser.parse(path.join(this.specDir, spec)) as OpenAPIV3.Document;
      const specName = path.basename(spec, path.extname(spec));

      // Setup OpenAPI validation
      this.app.use(
        OpenApiValidator.middleware({
          apiSpec: JSON.stringify(api),
          validateRequests: true,
          validateResponses: true
        })
      );

      // Load routes
      const routePath = path.join(this.outDir, specName, 'routes');
      if (fs.existsSync(routePath)) {
        const router = require(routePath).default;
        this.app.use(`/api/${specName}`, router);
      }
    }

    // Error handling
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Format error
      res.status(err.status || 500).json({
        message: err.message,
        errors: err.errors
      });
    });
  }
}

export class Database {
  private data: any;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  }

  async get(path: string): Promise<any> {
    const segments = path.split('/').filter(Boolean);
    let current = this.data;
    
    for (const segment of segments) {
      if (current === undefined || current === null) {
        return null;
      }
      if (!isNaN(parseInt(segment))) {
        // If segment is a number, treat it as an array index
        current = current[parseInt(segment)];
      } else {
        current = current[segment];
      }
    }
    
    return current;
  }

  async create(path: string, data: any): Promise<any> {
    const segments = path.split('/').filter(Boolean);
    let current = this.data;
    
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (current[segment] === undefined) {
        current[segment] = {};
      }
      current = current[segment];
    }
    
    const lastSegment = segments[segments.length - 1];
    if (!Array.isArray(current[lastSegment])) {
      current[lastSegment] = [];
    }
    
    current[lastSegment].push(data);
    await this.save();
    return data;
  }

  async update(path: string, data: any): Promise<any> {
    const segments = path.split('/').filter(Boolean);
    let current = this.data;
    
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (current[segment] === undefined) {
        return null;
      }
      current = current[segment];
    }
    
    const lastSegment = segments[segments.length - 1];
    const collection = current[lastSegment];
    if (!Array.isArray(collection)) {
      return null;
    }
    
    const index = collection.findIndex((item: any) => item.id === data.id);
    if (index === -1) {
      return null;
    }
    
    collection[index] = data;
    await this.save();
    return collection[index];
  }

  async patch(path: string, data: any): Promise<any> {
    const segments = path.split('/').filter(Boolean);
    let current = this.data;
    
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (current[segment] === undefined) {
        return null;
      }
      current = current[segment];
    }
    
    const lastSegment = segments[segments.length - 1];
    const collection = current[lastSegment];
    if (!Array.isArray(collection)) {
      return null;
    }
    
    const index = collection.findIndex((item: any) => item.id === data.id);
    if (index === -1) {
      return null;
    }
    
    collection[index] = { ...collection[index], ...data };
    await this.save();
    return collection[index];
  }

  async delete(path: string): Promise<void> {
    const segments = path.split('/').filter(Boolean);
    let current = this.data;
    
    // Get the collection path and ID
    const collectionPath = segments.slice(0, -1);
    const id = parseInt(segments[segments.length - 1]);
    
    // Navigate to the collection
    for (const segment of collectionPath) {
      if (current[segment] === undefined) {
        return;
      }
      current = current[segment];
    }
    
    // Find and remove the item
    if (Array.isArray(current)) {
      const index = current.findIndex((item: any) => item.id === id);
      if (index !== -1) {
        current.splice(index, 1);
        await this.save();
      }
    }
  }

  private async save(): Promise<void> {
    await fs.promises.writeFile(this.dbPath, JSON.stringify(this.data, null, 2));
  }
}
