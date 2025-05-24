import { OpenAPIV3 } from "openapi-types";
import { faker } from "@faker-js/faker";
import { resolveSchema } from "./swaggerResolver.js";
import { detectIdField } from "./idField.js";
import type { MockStrategy } from "../types.js";
import { Logger } from "./logger.js";

export class DefaultMockStrategy implements MockStrategy {
  private generatedIds: Record<string, string[]> = {};
  private schemas: Record<
    string,
    OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
  > = {};

  public setSchemas(
    schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>
  ): void {
    this.schemas = schemas;
  }
  public getGeneratedIds(): Record<string, string[]> {
    return this.generatedIds;
  }

  public clearGeneratedIds(): void {
    this.generatedIds = {};
  }

  generateMockItem(
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    resourceName: string,
    depth = 0,
    maxDepth = 6
  ): any {
    const resolvedSchema = resolveSchema(schema, this.schemas);

    if (
      depth > maxDepth &&
      (resolvedSchema.type === "object" || resolvedSchema.type === "array")
    ) {
      return resolvedSchema.type === "array" ? [] : {};
    }

    if (resolvedSchema.type !== "object") {
      Logger.warn(
        `generateMockItem called with non-object schema type '${resolvedSchema.type}' for resource/key: ${resourceName}. Returning empty object.`
      );
      return {};
    }
    if (!resolvedSchema.properties) {
      Logger.debug(
        `generateMockItem for ${resourceName} has no properties. Returning empty object.`
      );
      return {};
    }

    const mockItem: any = {};
    const currentSchemaKey =
      Object.keys(this.schemas).find(
        (key) =>
          this.schemas[key] === schema ||
          resolveSchema(this.schemas[key], this.schemas) === resolvedSchema
      ) || resourceName;
    const idField = detectIdField(
      currentSchemaKey,
      resolvedSchema,
      this.schemas
    );

    if (resolvedSchema.properties) {
      for (const [key, propertySchemaOrRef] of Object.entries(
        resolvedSchema.properties
      )) {
        const propertySchema = resolveSchema(propertySchemaOrRef, this.schemas);

        // Logic for related IDs based on key naming convention (e.g. authorId -> Author)
        if (
          propertySchema.type === "string" &&
          key.toLowerCase().endsWith("id") &&
          key.length > 2 &&
          key !== idField && // Not the primary ID of the current schema
          !(propertySchema.format === "uuid") // And not already a UUID
        ) {
          const relatedResourceGuess =
            key.charAt(0).toUpperCase() + key.slice(1, -2); // Author from authorId
          if (
            this.generatedIds[relatedResourceGuess] &&
            this.generatedIds[relatedResourceGuess].length > 0
          ) {
            mockItem[key] = faker.helpers.arrayElement(
              this.generatedIds[relatedResourceGuess]
            );
            continue; // Skip to next property
          }
        }

        // Default generation: pass the original propertySchemaOrRef to retain $ref if possible for deeper resolution by generateMockValue
        mockItem[key] = this.generateMockValue(
          propertySchemaOrRef,
          key, // Pass the current property key as context for generateMockValue
          depth + 1,
          maxDepth
        );
      }
    }

    if (idField && mockItem[idField] && resolvedSchema.type === "object") {
      if (!this.generatedIds[currentSchemaKey]) {
        this.generatedIds[currentSchemaKey] = [];
      }
      if (!this.generatedIds[currentSchemaKey].includes(mockItem[idField])) {
        this.generatedIds[currentSchemaKey].push(mockItem[idField]);
      }
    }
    return mockItem;
  }

  generateMockValue(
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    fieldNameOrResourceName: string, // Can be field key or resource name
    depth = 0,
    maxDepth = 6
  ): any {
    if (
      depth > maxDepth &&
      (schema as OpenAPIV3.SchemaObject)?.type !== "object" &&
      (schema as OpenAPIV3.SchemaObject)?.type !== "array"
    ) {
      // For primitive types at max depth, still generate a value.
    } else if (depth > maxDepth) {
      // For objects/arrays exceeding depth.
      return (schema as OpenAPIV3.SchemaObject)?.type === "array" ? [] : {};
    }

    const resolvedSchema = resolveSchema(schema, this.schemas);

    switch (resolvedSchema.type) {
      case "string":
        if (resolvedSchema.enum) {
          return faker.helpers.arrayElement(resolvedSchema.enum);
        }
        // Prioritize specific formats
        if (
          resolvedSchema.format === "uuid" ||
          (fieldNameOrResourceName.toLowerCase() === "id" &&
            !resolvedSchema.format)
        ) {
          return faker.string.uuid();
        } else if (resolvedSchema.format === "date-time") {
          return faker.date.recent().toISOString();
        } else if (resolvedSchema.format === "email") {
          return faker.internet.email();
        } else if (
          resolvedSchema.format === "uri" ||
          resolvedSchema.format === "url"
        ) {
          return faker.internet.url();
        } else if (resolvedSchema.format === "byte") {
          return faker.lorem.word(); // Placeholder
        }
        return faker.lorem.word();
      case "number":
      case "integer":
        const min = resolvedSchema.minimum;
        const max = resolvedSchema.maximum;
        // Provide defaults if min/max are not specified for the main call
        const effMin = typeof min === "number" ? min : undefined;
        const effMax = typeof max === "number" ? max : undefined;

        if (
          resolvedSchema.type === "number" &&
          (resolvedSchema.format === "float" ||
            resolvedSchema.format === "double")
        ) {
          return faker.number.float({
            min: effMin,
            max: effMax,
            precision: resolvedSchema.multipleOf || 0.01,
          });
        }
        // For the test "should generate number value" which expects faker.number.int({min:0, max:1000})
        // this needs to be handled if effMin and effMax are undefined.
        const defaultMin = 0;
        const defaultMax = 1000;
        return faker.number.int({
          min: effMin === undefined ? defaultMin : effMin,
          max: effMax === undefined ? defaultMax : effMax,
        });
      case "boolean":
        return faker.datatype.boolean();
      case "array":
        if (
          !resolvedSchema.items ||
          Object.keys(resolvedSchema.items).length === 0
        ) {
          return []; // Return empty array if items schema is empty or not defined
        }
        const arrayLength = faker.number.int({ min: 1, max: 3 }); // Generate 1 to 3 items
        return Array.from({ length: arrayLength }, () =>
          this.generateMockValue(
            resolvedSchema.items as OpenAPIV3.SchemaObject, // Cast here, assuming items is a SchemaObject
            fieldNameOrResourceName, // Pass resourceName down
            depth + 1,
            maxDepth
          )
        );
      case "object":
        // For direct object values not handled by generateMockItem (e.g. nested anonymous objects)
        // This will be recursively called by generateMockItem for properties.
        // If generateMockValue is called directly with an object schema, delegate to generateMockItem.
        return this.generateMockItem(
          resolvedSchema,
          fieldNameOrResourceName,
          depth,
          maxDepth
        );
      default:
        Logger.warn(
          `Unsupported schema type: ${resolvedSchema.type} for ${fieldNameOrResourceName}`
        );
        return null;
    }
  }
}
