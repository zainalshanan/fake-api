//mock.ts
import * as fs from 'fs';
import * as path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPIV3 } from 'openapi-types';
import { faker } from '@faker-js/faker';
import type { CLIOptions } from './types.js';
import { Logger } from './utils/logger.js';
import { ensureDirs } from './utils/file.js';
import { getSwaggerFiles } from './utils/swagger.js';  

export class MockGenerator {
  private specDir: string;
  private outDir: string;

  constructor(specDir: string, outDir: string) {
    this.specDir = specDir;
    this.outDir = outDir;
  }

  async generate(): Promise<void> {
    const specs = fs.readdirSync(this.specDir)
      .filter(file => file.endsWith('.yaml') || file.endsWith('.json'));

    const mockData: Record<string, any> = {};

    for (const spec of specs) {
      const api = await SwaggerParser.parse(path.join(this.specDir, spec)) as OpenAPIV3.Document;
      const specName = path.basename(spec, path.extname(spec));
      const schemas = (api.components && api.components.schemas) ? api.components.schemas : {};
      mockData[specName] = await this.generateMockData(api, schemas);
    }

    fs.writeFileSync(
      path.join(this.outDir, 'db.json'),
      JSON.stringify(mockData, null, 2)
    );
  }

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
          const mockItem = this.generateMockItem(resolvedSchema, schemas);
          if (!mockData[resourceName].find(item => item.id === mockItem.id)) {
            mockData[resourceName].push(mockItem);
          }
        }
        usedResources.add(resourceName);
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
              const mockItem = this.generateMockItem(resolvedSchema, schemas);
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

  private getResourcePath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[0];
  }

  private getRequestBodySchema(requestBody: OpenAPIV3.RequestBodyObject): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | null {
    const content = requestBody.content;
    if (!content) return null;
    const jsonContent = content['application/json'];
    if (!jsonContent || !jsonContent.schema) return null;
    return jsonContent.schema as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
  }

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

  private generateMockItem(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>): any {
    const resolvedSchema = this.resolveSchema(schema, schemas);
    if (resolvedSchema.type === 'object' && resolvedSchema.properties) {
      const result: Record<string, any> = {};
      for (const [prop, propSchema] of Object.entries(resolvedSchema.properties)) {
        result[prop] = this.generateMockValue(propSchema as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, schemas);
      }
      // Ensure ID exists
      if (!result.id) {
        result.id = faker.string.uuid();
      }
      return result;
    }
    return {};
  }

  private generateMockValue(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>): any {
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
          const length = faker.number.int({ min: 1, max: 5 });
          return Array.from({ length }, () =>
            this.generateMockValue(resolvedSchema.items as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, schemas)
          );
        }
        return [];
      case 'object':
        if (resolvedSchema.properties) {
          return this.generateMockItem(resolvedSchema, schemas);
        }
        return {};
      default:
        return null;
    }
  }
}

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
