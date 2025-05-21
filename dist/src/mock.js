//mock.ts
import * as fs from 'fs';
import * as path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPIV3 } from 'openapi-types';
import { faker } from '@faker-js/faker';
import { Logger } from './utils/logger.js';
import { ensureDirs } from './utils/file.js';
import { getSwaggerFiles } from './utils/swagger.js';
export class MockGenerator {
    specDir;
    outDir;
    constructor(specDir, outDir) {
        this.specDir = specDir;
        this.outDir = outDir;
    }
    async generate() {
        const specs = fs.readdirSync(this.specDir)
            .filter(file => file.endsWith('.yaml') || file.endsWith('.json'));
        const mockData = {};
        for (const spec of specs) {
            const api = await SwaggerParser.parse(path.join(this.specDir, spec));
            const specName = path.basename(spec, path.extname(spec));
            mockData[specName] = await this.generateMockData(api);
        }
        fs.writeFileSync(path.join(this.outDir, 'db.json'), JSON.stringify(mockData, null, 2));
    }
    async generateMockData(api) {
        const mockData = {};
        for (const [path, pathItem] of Object.entries(api.paths || {})) {
            if (!pathItem)
                continue;
            const resourcePath = this.getResourcePath(path);
            if (!mockData[resourcePath]) {
                mockData[resourcePath] = [];
            }
            for (const [method, operation] of Object.entries(pathItem)) {
                if (method === 'parameters' || !operation)
                    continue;
                const op = operation;
                if (method.toLowerCase() === 'post' && op.requestBody) {
                    const schema = this.getRequestBodySchema(op.requestBody);
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
    getResourcePath(path) {
        const segments = path.split('/').filter(Boolean);
        return segments[0];
    }
    getRequestBodySchema(requestBody) {
        const content = requestBody.content;
        if (!content)
            return null;
        const jsonContent = content['application/json'];
        if (!jsonContent || !jsonContent.schema)
            return null;
        return jsonContent.schema;
    }
    generateMockItem(schema) {
        if (schema.type === 'object' && schema.properties) {
            const result = {};
            for (const [prop, propSchema] of Object.entries(schema.properties)) {
                result[prop] = this.generateMockValue(propSchema);
            }
            // Ensure ID exists
            if (!result.id) {
                result.id = faker.datatype.uuid();
            }
            return result;
        }
        return {};
    }
    generateMockValue(schema) {
        switch (schema.type) {
            case 'string':
                if (schema.format === 'date-time') {
                    return faker.date.recent().toISOString();
                }
                else if (schema.format === 'email') {
                    return faker.internet.email();
                }
                else if (schema.format === 'uri') {
                    return faker.internet.url();
                }
                else if (schema.enum) {
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
                    return Array.from({ length }, () => this.generateMockValue(schema.items));
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
export async function populate(opts) {
    const files = getSwaggerFiles(opts.specDir);
    if (!files.length) {
        Logger.warn(`No swagger files found in ${opts.specDir}`);
        return;
    }
    const mockGenerator = new MockGenerator(opts.specDir, opts.outDir);
    await mockGenerator.generate();
    Logger.success(`Generated mock data at ${path.join(opts.outDir, 'db.json')}`);
}
//# sourceMappingURL=mock.js.map