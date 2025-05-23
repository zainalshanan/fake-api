// server.ts
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import type { OpenAPIV3_1 } from 'openapi-types';
import { OpenAPIV3 } from 'openapi-types';
import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenApiValidator } from 'openapi-data-validator';
import * as jsYaml from 'js-yaml';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import type { Server as HttpServer } from 'http';
import { Logger } from './utils/logger.js';
import { findOpenApiPath, castQueryToString, castHeadersToString } from './utils/openapi.js';
import { getNestedValue, setNestedValue, findItemById } from './utils/db.js';

/**
 * Extract path parameters from URL based on OpenAPI path template.
 * @param requestPath - Express request path
 * @param openapiPath - OpenAPI path template
 * @returns Record of path parameters
 */
function extractPathParams(requestPath: string, openapiPath: string): Record<string, string> {
  const params: Record<string, string> = {};
  const requestParts = requestPath.split('/');
  const templateParts = openapiPath.split('/');

  templateParts.forEach((part, i) => {
    if (part.startsWith('{') && part.endsWith('}')) {
      const paramName = part.slice(1, -1);
      params[paramName] = requestParts[i];
    }
  });

  return params;
}

/**
 * Server class to initialize and run the Express API server with OpenAPI validation and dynamic route loading.
 */
export class Server {
  public app: express.Application;
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

  /**
   * Start the server and listen on the configured port.
   * @returns {Promise<HttpServer>} The running HTTP server instance.
   */
  async start(): Promise<HttpServer> {
    await this.db.read();
    
    this.setupMiddleware();
    await this.setupRoutes();
    
    return this.app.listen(this.port, () => {
      Logger.success(`Server is running on http://localhost:${this.port}`);
    });
  }

  /**
   * Setup Express middleware for JSON and URL-encoded parsing.
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  /**
   * Dynamically load OpenAPI specs, set up validation, and mount generated routes.
   */
  private async setupRoutes(): Promise<void> {
    const specs = fs.readdirSync(this.specDir)
      .filter(file => file.endsWith('.yaml') || file.endsWith('.json'));

    for (const spec of specs) {
      Logger.info(`Loading spec: ${spec}`);
      const api = await SwaggerParser.parse(path.join(this.specDir, spec)) as OpenAPIV3.Document;
      const specName = path.basename(spec, path.extname(spec));
      Logger.info(`Mounting routes for: /api/${specName}`);

      // Patch for OpenAPI 3.1 compatibility: ensure webhooks exists only for 3.1.x
      if (api.openapi && api.openapi.startsWith('3.1') && !('webhooks' in api)) {
        (api as any).webhooks = {};
      }

      // Setup OpenAPI validation using openapi-data-validator
      Logger.info(`Enabling OpenAPI data validator for: ${spec}`);
      const specPath = path.join(this.specDir, spec);
      const rawSpec = jsYaml.load(fs.readFileSync(specPath, 'utf8')) as any;
      Object.keys(rawSpec.paths).forEach(
        (k) => rawSpec.paths[k] === undefined && delete rawSpec.paths[k]
      );
      const apiSpec = rawSpec as any;
      const openApiValidator = new OpenApiValidator({ apiSpec });
      const validator = openApiValidator.createValidator();
      Logger.debug('OpenAPI paths: ' + JSON.stringify(Object.keys(apiSpec.paths || {})));

      // Load routes
      const routePath = path.join(process.cwd(), 'dist', 'generated', specName, 'routes');
      if (fs.existsSync(routePath)) {
        try {
          Logger.info(`Importing route module: ${routePath}/index.js`);
          const routeModule = await import(`file://${path.resolve(routePath, 'index.js')}`);
          const router = routeModule.default;
          // BEGIN PATCH: strip base path before the validator so that
          // the OpenAPI validator sees the exact paths declared in the spec
          const basePath = `/api/${specName}`;
          const stripBasePath: express.RequestHandler = (req, _res, next) => {
            if (req.originalUrl.startsWith(basePath)) {
              const stripped = req.originalUrl.slice(basePath.length) || '/';
              Logger.debug(`[StripBasePath] originalUrl: ${req.originalUrl} -> ${stripped}`);
              // mutate both properties the validator uses
              (req as any).originalUrl = stripped;
              req.url = stripped;
            }
            next();
          };
          // END PATCH
          // Mount validator and router at the same prefix
          this.app.use(`/api/${specName}`,
            (req: express.Request, res: express.Response, next: express.NextFunction) => {
              Logger.info(`[Validator] Incoming request: ${req.method} ${req.originalUrl}`);
              next();
            },
            stripBasePath,
            async (req: express.Request, res: express.Response, next: express.NextFunction) => {
              try {
                const openapiPath = findOpenApiPath(req.path, apiSpec.paths);
                Logger.debug(`[OpenAPI Validator] Validating: method=${req.method}, path=${openapiPath}`);
                
                // Extract path parameters
                const pathParams = extractPathParams(req.path, openapiPath);
                Logger.debug(`[OpenAPI Validator] Path params:`, pathParams);

                await validator({
                  method: req.method,
                  route: openapiPath,
                  query: castQueryToString(req.query),
                  headers: castHeadersToString(req.headers),
                  path: pathParams,
                  body: req.body,
                });
                next();
              } catch (err: any) {
                Logger.error('OpenAPI Data Validator Error: ' + err);
                res.status(400).json({ error: err.message, details: err.errors });
              }
            },
            (req: express.Request, res: express.Response, next: express.NextFunction) => {
              Logger.debug(`[Router] req.url: ${req.url}, req.originalUrl: ${req.originalUrl}`);
              next();
            },
            router
          );
        } catch (error) {
          Logger.error(`Error loading routes from ${routePath}: ${error}`);
        }
      } else {
        Logger.warn(`Route path does not exist: ${routePath}`);
      }
    }

    // Error handling middleware for OpenAPI validation errors
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      Logger.error(`[ERROR HANDLER] path: ${req.path}, method: ${req.method}, error: ${err}`);
      res.status(err.status || 500).json({
        message: err.message,
        errors: err.errors
      });
    });
  }
}

/**
 * Database class for simple JSON file-based data access, supporting CRUD operations.
 */
export class Database {
  private data: any;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  }

  /**
   * Get data from the database by path (e.g., 'users/123').
   * @param {string} path - The path to the resource.
   * @returns {Promise<any>} The found data or null if not found.
   */
  async get(path: string): Promise<any> {
    return getNestedValue(this.data, path);
  }

  /**
   * Create a new resource in the database at the given path.
   * @param {string} path - The path to the collection.
   * @param {any} data - The data to insert.
   * @returns {Promise<any>} The created data.
   */
  async create(path: string, data: any): Promise<any> {
    const result = setNestedValue(this.data, path, data);
    await this.save();
    return result;
  }

  /**
   * Update a resource in the database at the given path.
   * @param {string} path - The path to the resource (e.g., 'users/123').
   * @param {any} data - The new data to replace the resource.
   * @returns {Promise<any>} The updated data or null if not found.
   */
  async update(path: string, data: any): Promise<any> {
    const id = path.split('/').pop() || '';
    const [collection, index] = findItemById(this.data, path, id);
    if (!collection || index === -1) return null;
    
    collection[index] = data;
    await this.save();
    return collection[index];
  }

  /**
   * Patch (partially update) a resource in the database at the given path.
   * @param {string} path - The path to the resource (e.g., 'users/123').
   * @param {any} data - The partial data to update.
   * @returns {Promise<any>} The patched data or null if not found.
   */
  async patch(path: string, data: any): Promise<any> {
    const id = path.split('/').pop() || '';
    const [collection, index] = findItemById(this.data, path, id);
    if (!collection || index === -1) return null;
    
    collection[index] = { ...collection[index], ...data };
    await this.save();
    return collection[index];
  }

  /**
   * Delete a resource from the database at the given path.
   * @param {string} path - The path to the resource (e.g., 'users/123').
   */
  async delete(path: string): Promise<void> {
    const id = path.split('/').pop() || '';
    const [collection, index] = findItemById(this.data, path, id);
    if (collection && index !== -1) {
      collection.splice(index, 1);
      await this.save();
    }
  }

  /**
   * Save the current state of the database to disk.
   * @private
   */
  private async save(): Promise<void> {
    await fs.promises.writeFile(this.dbPath, JSON.stringify(this.data, null, 2));
  }
}
