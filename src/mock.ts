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
      
      mockData[specName] = await this.generateMockData(api);
    }

    fs.writeFileSync(
      path.join(this.outDir, 'db.json'),
      JSON.stringify(mockData, null, 2)
    );
  }

  private async generateMockData(api: OpenAPIV3.Document): Promise<Record<string, any[]>> {
    const mockData: Record<string, any[]> = {};

    for (const [path, pathItem] of Object.entries(api.paths || {})) {
      if (!pathItem) continue;

      const resourcePath = this.getResourcePath(path);
      if (!mockData[resourcePath]) {
        mockData[resourcePath] = [];
      }

      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === 'parameters' || !operation) continue;

        const op = operation as OpenAPIV3.OperationObject;
        if (method.toLowerCase() === 'post' && op.requestBody) {
          const schema = this.getRequestBodySchema(op.requestBody as OpenAPIV3.RequestBodyObject);
          if (schema) {
            // Generate 5 mock items for each resource
            for (let i = 0; i < 5; i++) {
              const mockItem = this.generateMockItem(schema);
              if (!mockData[resourcePath].find(item => item.id === mockItem.id)) {
                mockData[resourcePath].push(mockItem);
              }
            }
          }
        }
      }

      // If no mock data was generated from POST schema, create some basic data
      if (mockData[resourcePath].length === 0) {
        for (let i = 0; i < 5; i++) {
          mockData[resourcePath].push({
            id: faker.datatype.uuid(),
            name: faker.commerce.productName(),
            description: faker.commerce.productDescription(),
            createdAt: faker.date.past().toISOString()
          });
        }
      }
    }

    return mockData;
  }

  private getResourcePath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[0];
  }

  private getRequestBodySchema(requestBody: OpenAPIV3.RequestBodyObject): OpenAPIV3.SchemaObject | null {
    const content = requestBody.content;
    if (!content) return null;

    const jsonContent = content['application/json'];
    if (!jsonContent || !jsonContent.schema) return null;

    return jsonContent.schema as OpenAPIV3.SchemaObject;
  }

  private generateMockItem(schema: OpenAPIV3.SchemaObject): any {
    if (schema.type === 'object' && schema.properties) {
      const result: Record<string, any> = {};
      
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        result[prop] = this.generateMockValue(propSchema as OpenAPIV3.SchemaObject);
      }

      // Ensure ID exists
      if (!result.id) {
        result.id = faker.datatype.uuid();
      }

      return result;
    }

    return {};
  }

  private generateMockValue(schema: OpenAPIV3.SchemaObject): any {
    switch (schema.type) {
      case 'string':
        if (schema.format === 'date-time') {
          return faker.date.recent().toISOString();
        } else if (schema.format === 'email') {
          return faker.internet.email();
        } else if (schema.format === 'uri') {
          return faker.internet.url();
        } else if (schema.enum) {
          return faker.helpers.arrayElement(schema.enum);
        }
        return faker.lorem.word();

      case 'number':
      case 'integer':
        return faker.datatype.number({ min: schema.minimum || 0, max: schema.maximum || 1000 });

      case 'boolean':
        return faker.datatype.boolean();

      case 'array':
        if (schema.items) {
          const length = faker.datatype.number({ min: 1, max: 5 });
          return Array.from({ length }, () => 
            this.generateMockValue(schema.items as OpenAPIV3.SchemaObject)
          );
        }
        return [];

      case 'object':
        if (schema.properties) {
          return this.generateMockItem(schema);
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
