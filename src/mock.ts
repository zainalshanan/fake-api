//mock.ts
import * as fs from 'fs';
import * as path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPIV3 } from 'openapi-types';
import { faker } from '@faker-js/faker';
import type { CLIOptions } from './types.js';
import { Logger } from './utils/logger.js';
import { ensureDirs, writeJsonFile } from './utils/file.js';
import { getSwaggerFiles } from './utils/swagger.js';  

/**
 * MockGenerator class for generating mock data from OpenAPI specs and schemas.
 */
export class MockGenerator {
  private specDir: string;
  private outDir: string;

  constructor(specDir: string, outDir: string) {
    this.specDir = specDir;
    this.outDir = outDir;
  }

  /**
   * Generate mock data for all specs in the specDir and write to db.json.
   */
  async generate(): Promise<void> {
    const specs = getSwaggerFiles(this.specDir);
    const mockData: Record<string, any> = {};

    for (const spec of specs) {
      const api = await SwaggerParser.parse(path.join(this.specDir, spec)) as OpenAPIV3.Document;
      const specName = path.basename(spec, path.extname(spec));
      const schemas = (api.components && api.components.schemas) ? api.components.schemas : {};
      Logger.info(`Generating mock data for spec: ${spec}`);
      mockData[specName] = await this.generateMockData(api, schemas);
    }

    ensureDirs(this.outDir);
    writeJsonFile(path.join(this.outDir, 'db.json'), mockData);
    Logger.success(`Wrote mock DB to ${path.join(this.outDir, 'db.json')}`);
  }

  /**
   * Generate mock data for all schemas and paths in a given OpenAPI document.
   * @param {OpenAPIV3.Document} api - The OpenAPI document.
   * @param {Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>} schemas - The schemas from the spec.
   * @returns {Promise<Record<string, any[]>>} The generated mock data.
   */
  private async generateMockData(api: OpenAPIV3.Document, schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>): Promise<Record<string, any[]>> {
    const mockData: Record<string, any[]> = {};
    const usedResources = new Set<string>();

    // First, generate mock data for each schema in components.schemas
    for (const [resourceName, schema] of Object.entries(schemas)) {
      // Only generate for object schemas
      const resolvedSchema = this.resolveSchema(schema, schemas);
      if (resolvedSchema && resolvedSchema.type === 'object') {
        mockData[resourceName] = [];
        for (let i = 0; i < 5; i++) {
          const mockItem = this.generateMockItem(resolvedSchema, schemas, resourceName);
          if (!mockData[resourceName].find(item => item.id === mockItem.id)) {
            mockData[resourceName].push(mockItem);
          }
        }
        usedResources.add(resourceName);
        Logger.debug(`Generated mock data for schema: ${resourceName}`);
      }
    }

    // Then, for each path, if it has a POST with a requestBody schema, generate mock data for that resource path if not already done
    for (const [pathStr, pathItem] of Object.entries(api.paths || {})) {
      if (!pathItem) continue;
      const resourcePath = this.getResourcePath(pathStr);
      if (!resourcePath) continue;
      if (!mockData[resourcePath]) {
        mockData[resourcePath] = [];
      }
      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === 'parameters' || !operation) continue;
        const op = operation as OpenAPIV3.OperationObject;
        if (method.toLowerCase() === 'post' && op.requestBody) {
          const schema = this.getRequestBodySchema(op.requestBody as OpenAPIV3.RequestBodyObject);
          if (schema) {
            const resolvedSchema = this.resolveSchema(schema, schemas);
            for (let i = 0; i < 5; i++) {
              const mockItem = this.generateMockItem(resolvedSchema, schemas, resourcePath);
              if (!mockData[resourcePath].find(item => item.id === mockItem.id)) {
                mockData[resourcePath].push(mockItem);
              }
            }
            usedResources.add(resourcePath);
          }
        }
      }
    }

    // Remove any empty collections
    for (const key of Object.keys(mockData)) {
      if (!mockData[key] || mockData[key].length === 0) {
        delete mockData[key];
      }
    }

    return mockData;
  }

  /**
   * Get the top-level resource name from a path string (e.g., '/users/{id}' -> 'users').
   * @param {string} path - The OpenAPI path string.
   * @returns {string} The resource name.
   */
  private getResourcePath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[0];
  }

  /**
   * Extract the schema object from a requestBody object, if present.
   * @param {OpenAPIV3.RequestBodyObject} requestBody - The request body object.
   * @returns {OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | null} The schema or null.
   */
  private getRequestBodySchema(requestBody: OpenAPIV3.RequestBodyObject): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | null {
    const content = requestBody.content;
    if (!content) return null;
    const jsonContent = content['application/json'];
    if (!jsonContent || !jsonContent.schema) return null;
    return jsonContent.schema as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
  }

  /**
   * Recursively resolve a schema, following $ref pointers if necessary.
   * @param {OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject} schema - The schema or reference.
   * @param {Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>} schemas - All schemas in the spec.
   * @returns {OpenAPIV3.SchemaObject} The resolved schema object.
   */
  private resolveSchema(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>): OpenAPIV3.SchemaObject {
    if ('$ref' in schema) {
      // $ref is of the form '#/components/schemas/ResourceName'
      const ref = schema.$ref;
      const match = ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match) {
        const refName = match[1];
        const resolved = schemas[refName];
        if (!resolved) throw new Error(`Schema $ref not found: ${ref}`);
        return this.resolveSchema(resolved, schemas);
      }
      throw new Error(`Unsupported $ref format: ${ref}`);
    }
    return schema;
  }

  /**
   * Helper: Detect the primary ID field for a schema (id, {resourceName}Id, etc.)
   */
  private detectIdField(resourceName: string, schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, schemas?: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>): string {
    // Always resolve schema first
    let resolvedSchema: OpenAPIV3.SchemaObject = schema as OpenAPIV3.SchemaObject;
    if ('$ref' in schema && schemas) {
      resolvedSchema = this.resolveSchema(schema, schemas);
    }
    if (!resolvedSchema || !resolvedSchema.properties) return 'id';
    if (resolvedSchema.properties.id) return 'id';
    const camel = resourceName.charAt(0).toLowerCase() + resourceName.slice(1) + 'Id';
    if (resolvedSchema.properties[camel]) return camel;
    const snake = resourceName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() + '_id';
    if (resolvedSchema.properties[snake]) return snake;
    const blid = Object.keys(resolvedSchema.properties).find(k => k.toLowerCase() === 'blid');
    if (blid) return blid;
    const anyId = Object.keys(resolvedSchema.properties).find(k => k.match(/id$/i));
    if (anyId) return anyId;
    return Object.keys(resolvedSchema.properties)[0] || 'id';
  }

  /**
   * Track generated IDs for each resource to allow linking
   */
  private generatedIds: Record<string, string[]> = {};

  /**
   * Generate a mock item for a given schema, ensuring an 'id' property exists.
   * @param {OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject} schema - The schema or reference.
   * @param {Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>} schemas - All schemas in the spec.
   * @param {string} resourceName - The name of the resource.
   * @param {number} depth - Current nesting depth.
   * @param {number} maxDepth - Maximum nesting depth.
   * @returns {any} The generated mock item.
   */
  private generateMockItem(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>, resourceName: string, depth = 0, maxDepth = 6): any {
    const resolvedSchema = this.resolveSchema(schema, schemas);
    if (resolvedSchema.type === 'object' && resolvedSchema.properties) {
      const result: Record<string, any> = {};
      for (const [prop, propSchema] of Object.entries(resolvedSchema.properties)) {
        // If this is a reference ID (ends with Id, is a foreign key), link to an existing resource
        if (prop !== this.detectIdField(resourceName, resolvedSchema, schemas) && prop.match(/id$/i) && prop.length > 2) {
          const refType = prop.replace(/Id$/i, '');
          const refList = this.generatedIds[refType.charAt(0).toUpperCase() + refType.slice(1)];
          if (refList && refList.length > 0) {
            result[prop] = faker.helpers.arrayElement(refList);
            continue;
          }
        }
        // If this is a nested object or array, recurse (limit depth)
        if (depth < maxDepth && (this.resolveSchema(propSchema, schemas).type === 'object' || this.resolveSchema(propSchema, schemas).type === 'array')) {
          result[prop] = this.generateMockValue(propSchema, schemas, resourceName, depth + 1, maxDepth);
        } else {
          result[prop] = this.generateMockValue(propSchema, schemas, resourceName, depth, maxDepth);
        }
      }
      // Ensure the primary ID field exists and is unique
      const idField = this.detectIdField(resourceName, resolvedSchema, schemas);
      if (!result[idField]) {
        result[idField] = faker.string.uuid();
      }
      if (!this.generatedIds[resourceName]) this.generatedIds[resourceName] = [];
      this.generatedIds[resourceName].push(result[idField]);
      return result;
    }
    return {};
  }

  /**
   * Generate a mock value for a given schema property, handling types and formats.
   * @param {OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject} schema - The schema or reference.
   * @param {Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>} schemas - All schemas in the spec.
   * @param {string} resourceName - The name of the resource (for nested objects).
   * @param {number} depth - Current nesting depth.
   * @param {number} maxDepth - Maximum nesting depth.
   * @returns {any} The generated mock value.
   */
  private generateMockValue(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>, resourceName: string, depth = 0, maxDepth = 6): any {
    const resolvedSchema = this.resolveSchema(schema, schemas);
    switch (resolvedSchema.type) {
      case 'string':
        if (resolvedSchema.format === 'date-time') {
          return faker.date.recent().toISOString();
        } else if (resolvedSchema.format === 'email') {
          return faker.internet.email();
        } else if (resolvedSchema.format === 'uri') {
          return faker.internet.url();
        } else if (resolvedSchema.enum) {
          return faker.helpers.arrayElement(resolvedSchema.enum);
        }
        return faker.lorem.word();
      case 'number':
      case 'integer':
        return faker.number.int({ min: resolvedSchema.minimum || 0, max: resolvedSchema.maximum || 1000 });
      case 'boolean':
        return faker.datatype.boolean();
      case 'array':
        if (resolvedSchema.items) {
          const length = faker.number.int({ min: 3, max: 5 });
          return Array.from({ length }, () =>
            this.generateMockValue(resolvedSchema.items as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, schemas, resourceName, depth + 1, maxDepth)
          );
        }
        return [];
      case 'object':
        if (resolvedSchema.properties) {
          // For nested objects, pass the property name as resourceName
          return this.generateMockItem(resolvedSchema, schemas, resourceName, depth, maxDepth);
        }
        return {};
      default:
        return null;
    }
  }
}

/**
 * Populate the mock database by generating mock data from Swagger specs.
 * @param {CLIOptions} opts - CLI options including specDir and outDir.
 */
export async function populate(opts: CLIOptions): Promise<void> {
  const files = getSwaggerFiles(opts.specDir);
  if (!files.length) {
    Logger.warn(`No swagger files found in ${opts.specDir}`);
    return;
  }

  const mockGenerator = new MockGenerator(opts.specDir, opts.outDir);
  await mockGenerator.generate();
  Logger.success(`Generated mock data at ${path.join(opts.outDir, 'db.json')}`);
}
