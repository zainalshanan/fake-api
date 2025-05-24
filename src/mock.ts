//mock.ts
import * as fs from "fs";
import * as path from "path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPIV3 } from "openapi-types";
import { faker } from "@faker-js/faker";
import type { CLIOptions } from "./types.js";
import { Logger } from "./utils/logger.js";
import { ensureDirs, writeJsonFile } from "./utils/file.js";
import { getSwaggerFiles } from "./utils/swagger.js";
import { resolveSchema } from "./utils/swaggerResolver.js";
import { detectIdField } from "./utils/idField.js";
import { DefaultMockStrategy } from "./utils/defaultMockStrategy.js";
import type { MockStrategy } from "./types.js";
import pluralize from "pluralize";

/**
 * MockGenerator class for generating mock data from OpenAPI specs and schemas.
 */
export class MockGenerator {
  private specDir: string;
  private outDir: string;
  private mockStrategy: MockStrategy;

  constructor(specDir: string, outDir: string, mockStrategy?: MockStrategy) {
    this.specDir = specDir;
    this.outDir = outDir;
    this.mockStrategy = mockStrategy || new DefaultMockStrategy();
  }

  /**
   * Generate mock data for all specs in the specDir and write to db.json.
   */
  async generate(): Promise<void> {
    const specs = getSwaggerFiles(this.specDir);
    const mockData: Record<string, any> = {};

    for (const spec of specs) {
      const api = (await SwaggerParser.parse(
        path.join(this.specDir, spec)
      )) as OpenAPIV3.Document;
      const specName = path.basename(spec, path.extname(spec));
      const schemas =
        api.components && api.components.schemas ? api.components.schemas : {};
      Logger.info(`Generating mock data for spec: ${spec}`);
      this.mockStrategy.setSchemas(schemas);
      this.mockStrategy.clearGeneratedIds();
      mockData[specName] = await this.generateMockData(api, schemas);
    }

    ensureDirs(this.outDir);
    writeJsonFile(path.join(this.outDir, "db.json"), mockData);
    Logger.success(`Wrote mock DB to ${path.join(this.outDir, "db.json")}`);
  }

  /**
   * Generate mock data for all schemas and paths in a given OpenAPI document.
   * @param {OpenAPIV3.Document} api - The OpenAPI document.
   * @param {Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>} schemas - The schemas from the spec.
   * @returns {Promise<Record<string, any[]>>} The generated mock data.
   */
  private async generateMockData(
    api: OpenAPIV3.Document,
    schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>
  ): Promise<Record<string, any[]>> {
    const mockData: Record<string, any[]> = {};
    const usedResources = new Set<string>();

    // Helper to normalize resource keys to plural, lowercased form
    function normalizeResourceKey(resource: string): string {
      return pluralize.plural(resource).toLowerCase();
    }

    // First, generate mock data for each schema in components.schemas
    for (const [resourceName, schema] of Object.entries(schemas)) {
      // Only generate for object schemas
      const resolvedSchema = resolveSchema(schema, schemas);
      if (resolvedSchema && resolvedSchema.type === "object") {
        const normalizedKey = normalizeResourceKey(resourceName);
        mockData[normalizedKey] = [];
        for (let i = 0; i < 5; i++) {
          const mockItem = this.mockStrategy.generateMockItem(
            resolvedSchema,
            resourceName
          );
          const idField = detectIdField(resourceName, resolvedSchema, schemas);
          if (
            mockItem &&
            mockItem[idField] &&
            !mockData[normalizedKey].find(
              (item) => item[idField] === mockItem[idField]
            )
          ) {
            mockData[normalizedKey].push(mockItem);
          }
        }
        usedResources.add(normalizedKey);
        Logger.debug(`Generated mock data for schema: ${resourceName}`);
      }
    }

    // Then, for each path, if it has a POST with a requestBody schema, generate mock data for that resource path if not already done
    for (const [pathStr, pathItem] of Object.entries(api.paths || {})) {
      if (!pathItem) continue;
      const resourcePath = this.getResourcePath(pathStr);
      if (!resourcePath) continue;
      const normalizedKey = normalizeResourceKey(resourcePath);
      if (!mockData[normalizedKey]) {
        mockData[normalizedKey] = [];
      }
      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === "parameters" || !operation) continue;
        const op = operation as OpenAPIV3.OperationObject;
        if (method.toLowerCase() === "post" && op.requestBody) {
          const schema = this.getRequestBodySchema(
            op.requestBody as OpenAPIV3.RequestBodyObject
          );
          if (schema) {
            const resolvedSchema = resolveSchema(schema, schemas);
            for (let i = 0; i < 5; i++) {
              const mockItem = this.mockStrategy.generateMockItem(
                resolvedSchema,
                resourcePath
              );
              const idField = detectIdField(
                resourcePath,
                resolvedSchema,
                schemas
              );
              if (
                mockItem &&
                mockItem[idField] &&
                !mockData[normalizedKey].find(
                  (item) => item[idField] === mockItem[idField]
                )
              ) {
                mockData[normalizedKey].push(mockItem);
              }
            }
            usedResources.add(normalizedKey);
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
    const segments = path.split("/").filter(Boolean);
    return segments[0];
  }

  /**
   * Extract the schema object from a requestBody object, if present.
   * @param {OpenAPIV3.RequestBodyObject} requestBody - The request body object.
   * @returns {OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | null} The schema or null.
   */
  private getRequestBodySchema(
    requestBody: OpenAPIV3.RequestBodyObject
  ): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | null {
    const content = requestBody.content;
    if (!content) return null;
    const jsonContent = content["application/json"];
    if (!jsonContent || !jsonContent.schema) return null;
    return jsonContent.schema as
      | OpenAPIV3.SchemaObject
      | OpenAPIV3.ReferenceObject;
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
  Logger.success(`Generated mock data at ${path.join(opts.outDir, "db.json")}`);
}
