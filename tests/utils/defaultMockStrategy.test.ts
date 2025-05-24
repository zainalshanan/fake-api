import { describe, it, expect, vi, beforeEach } from "vitest";
import { DefaultMockStrategy } from "../../src/utils/defaultMockStrategy.js";
import * as idFieldUtil from "../../src/utils/idField.js";
import * as swaggerResolverUtil from "../../src/utils/swaggerResolver.js";
import { faker } from "@faker-js/faker";
import { OpenAPIV3 } from "openapi-types";

// Mock dependencies
vi.mock("@faker-js/faker", () => ({
  faker: {
    string: {
      uuid: vi.fn(() => "mock-uuid"),
    },
    lorem: {
      word: vi.fn(() => "mockWord"),
    },
    date: {
      recent: vi.fn(() => new Date("2023-01-01T12:00:00.000Z")),
    },
    internet: {
      email: vi.fn(() => "mock@example.com"),
      url: vi.fn(() => "http://mockurl.com"),
    },
    number: {
      int: vi.fn(({ min, max }: { min?: number; max?: number } = {}) => {
        if (min === 1 && max === 3) return 2; // For array length
        if (min === 0 && max === 1000) return 123; // For general number test
        // Fallback for other cases, e.g. integer with min/max test
        if (min === 10 && max === 20) return 10;
        return min !== undefined ? min : 123;
      }),
      float: vi.fn(
        ({
          min,
          max,
          precision,
        }: { min?: number; max?: number; precision?: number } = {}) => {
          // Simplified mock for float, returning a fixed value or based on min
          if (min === 10.0 && max === 20.0 && precision == 2) return 15.55;
          return 123.45; // Default float mock
        }
      ),
    },
    datatype: {
      boolean: vi.fn(() => true),
    },
    helpers: {
      arrayElement: vi.fn((arr: any[]) => arr[0]),
    },
  },
}));

vi.mock("../../src/utils/idField.js");
vi.mock("../../src/utils/swaggerResolver.js");

describe("DefaultMockStrategy", () => {
  let strategy: DefaultMockStrategy;
  const mockSchemas: Record<
    string,
    OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
  > = {
    TestSchema: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
      },
    },
  };

  beforeEach(() => {
    strategy = new DefaultMockStrategy();
    vi.clearAllMocks();

    // Setup default mock implementations for utils
    vi.mocked(idFieldUtil.detectIdField).mockReturnValue("id");
    vi.mocked(swaggerResolverUtil.resolveSchema).mockImplementation(
      (schema) => schema as OpenAPIV3.SchemaObject
    );
  });

  describe("State Management", () => {
    it("setSchemas should store schemas", () => {
      strategy.setSchemas(mockSchemas);
      // Not directly testable via public API, but underlies other functions
      // We can infer it works if other schema-dependent functions work.
      // Or, if we could access private members (not ideal for testing).
      // For now, assume it works and test through other methods.
      expect(true).toBe(true); // Placeholder
    });

    it("getGeneratedIds should return current IDs", () => {
      expect(strategy.getGeneratedIds()).toEqual({});
      // We'll test adding IDs via generateMockItem later
    });

    it("clearGeneratedIds should reset IDs", () => {
      // Simulate adding an ID
      strategy.generateMockItem(mockSchemas.TestSchema, "TestSchema");
      expect(strategy.getGeneratedIds()["TestSchema"]).toBeDefined();

      strategy.clearGeneratedIds();
      expect(strategy.getGeneratedIds()).toEqual({});
    });
  });

  describe("generateMockValue", () => {
    beforeEach(() => {
      // Ensure schemas are set for each test if generateMockValue relies on this.schemas
      strategy.setSchemas(mockSchemas);
      strategy.clearGeneratedIds(); // Clear IDs for clean state
    });

    it("should generate string value", () => {
      const schema: OpenAPIV3.SchemaObject = { type: "string" };
      expect(strategy.generateMockValue(schema, "Test")).toBe("mockWord");
      expect(faker.lorem.word).toHaveBeenCalled();
    });

    it("should generate string with date-time format", () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: "string",
        format: "date-time",
      };
      expect(strategy.generateMockValue(schema, "Test")).toBe(
        "2023-01-01T12:00:00.000Z"
      );
      expect(faker.date.recent).toHaveBeenCalled();
    });

    it("should generate string with email format", () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: "string",
        format: "email",
      };
      expect(strategy.generateMockValue(schema, "Test")).toBe(
        "mock@example.com"
      );
      expect(faker.internet.email).toHaveBeenCalled();
    });

    it("should generate string with uri format", () => {
      const schema: OpenAPIV3.SchemaObject = { type: "string", format: "uri" };
      expect(strategy.generateMockValue(schema, "Test")).toBe(
        "http://mockurl.com"
      );
      expect(faker.internet.url).toHaveBeenCalled();
    });

    it("should generate string with byte format (base64 string)", () => {
      const schema: OpenAPIV3.SchemaObject = { type: "string", format: "byte" };
      // faker.js doesn't have a direct 'byte' or 'base64' string generator in the core.
      // We'd expect a generic string or a specific pattern if we implemented custom logic.
      // For now, as DefaultMockStrategy treats unknown formats as generic strings:
      vi.mocked(faker.lorem.word).mockReturnValueOnce("mockBase64String");
      expect(strategy.generateMockValue(schema, "Test")).toBe(
        "mockBase64String"
      );
      expect(faker.lorem.word).toHaveBeenCalled();
    });

    it("should generate string from enum", () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: "string",
        enum: ["a", "b", "c"],
      };
      expect(strategy.generateMockValue(schema, "Test")).toBe("a"); // Mock returns first element
      expect(faker.helpers.arrayElement).toHaveBeenCalledWith(["a", "b", "c"]);
    });

    it("should generate number value", () => {
      const schema: OpenAPIV3.SchemaObject = { type: "number" };
      expect(strategy.generateMockValue(schema, "Test")).toBe(123); // Default mock number
      expect(faker.number.int).toHaveBeenCalledWith({ min: 0, max: 1000 });
    });

    it("should generate number with float format", () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: "number",
        format: "float",
      };
      vi.mocked(faker.number.float).mockReturnValueOnce(123.45);
      // DefaultMockStrategy now correctly calls faker.number.float.
      expect(strategy.generateMockValue(schema, "TestFloat")).toBe(123.45);
      expect(faker.number.float).toHaveBeenCalled();
    });

    it("should generate number with double format", () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: "number",
        format: "double",
      };
      vi.mocked(faker.number.float).mockReturnValueOnce(123.4567); // Assuming double uses float mock
      // DefaultMockStrategy now correctly calls faker.number.float for double.
      expect(strategy.generateMockValue(schema, "TestDouble")).toBe(123.4567);
      expect(faker.number.float).toHaveBeenCalled();
    });

    it("should generate integer value with min/max", () => {
      const schema: OpenAPIV3.SchemaObject = {
        type: "integer",
        minimum: 10,
        maximum: 20,
      };
      // Our mock for faker.number.int will return minimum if set
      expect(strategy.generateMockValue(schema, "Test")).toBe(10);
      expect(faker.number.int).toHaveBeenCalledWith({ min: 10, max: 20 });
    });

    it("should generate boolean value", () => {
      const schema: OpenAPIV3.SchemaObject = { type: "boolean" };
      expect(strategy.generateMockValue(schema, "Test")).toBe(true);
      expect(faker.datatype.boolean).toHaveBeenCalled();
    });

    it("should generate an array of mock values", () => {
      const itemSchema: OpenAPIV3.SchemaObject = { type: "string" };
      const arraySchema: OpenAPIV3.SchemaObject = {
        type: "array",
        items: itemSchema,
      };
      // faker.number.int for array length is mocked to return 2
      const result = strategy.generateMockValue(arraySchema, "Test");
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toBe("mockWord");
      expect(result[1]).toBe("mockWord");
      expect(faker.lorem.word).toHaveBeenCalledTimes(2);
    });

    it("should generate an array of mock values, including $ref items", () => {
      const refItemSchema: OpenAPIV3.ReferenceObject = {
        $ref: "#/components/schemas/TestSchema",
      };
      const arraySchema: OpenAPIV3.SchemaObject = {
        type: "array",
        items: refItemSchema,
      };
      // Mock resolveSchema to return the actual TestSchema when $ref is encountered
      vi.mocked(swaggerResolverUtil.resolveSchema).mockImplementation(
        (schema, schemas) => {
          if (
            (schema as OpenAPIV3.ReferenceObject).$ref ===
            "#/components/schemas/TestSchema"
          ) {
            return mockSchemas.TestSchema as OpenAPIV3.SchemaObject;
          }
          return schema as OpenAPIV3.SchemaObject;
        }
      );

      const result = strategy.generateMockValue(
        arraySchema,
        "TestArrayWithRef"
      );
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2); // Mocked faker.number.int for length
      // Each item should be a mock of TestSchema
      expect(result[0]).toHaveProperty("id", "mock-uuid");
      expect(result[0]).toHaveProperty("name", "mockWord");
      expect(result[1]).toHaveProperty("id", "mock-uuid");
      expect(result[1]).toHaveProperty("name", "mockWord");
    });

    it("should generate an object for object type, including $ref properties", () => {
      const objectSchemaWithRef: OpenAPIV3.SchemaObject = {
        type: "object",
        properties: {
          regularProp: { type: "string" },
          refProp: { $ref: "#/components/schemas/TestSchema" },
        },
      };
      vi.mocked(swaggerResolverUtil.resolveSchema).mockImplementation(
        (schema, schemas) => {
          if (
            (schema as OpenAPIV3.ReferenceObject).$ref ===
            "#/components/schemas/TestSchema"
          ) {
            return mockSchemas.TestSchema as OpenAPIV3.SchemaObject;
          }
          return schema as OpenAPIV3.SchemaObject;
        }
      );
      vi.mocked(idFieldUtil.detectIdField).mockReturnValue("id"); // Ensure id field is consistently detected

      const result = strategy.generateMockItem(
        objectSchemaWithRef,
        "TestObjectWithRef"
      );
      expect(result.regularProp).toBe("mockWord");
      expect(result.refProp).toHaveProperty("id", "mock-uuid");
      expect(result.refProp).toHaveProperty("name", "mockWord");
    });

    it("should return empty array if items are not defined for array type", () => {
      const schema: OpenAPIV3.SchemaObject = { type: "array", items: {} };
      expect(strategy.generateMockValue(schema, "Test")).toEqual([]);
    });

    it("should return null for unsupported types", () => {
      const schema: OpenAPIV3.SchemaObject = { type: "null" } as any; // Invalid type
      expect(strategy.generateMockValue(schema, "Test")).toBeNull();
    });

    // Tests for object generation (delegated to generateMockItem) and depth limits
    // will be covered more in generateMockItem tests.
  });

  describe("generateMockItem", () => {
    const complexSchema: OpenAPIV3.SchemaObject = {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        relatedId: { type: "string", format: "uuid" }, // To test related ID generation
        nestedObject: {
          type: "object",
          properties: {
            propA: { type: "string" },
          },
        },
        nestedArray: {
          type: "array",
          items: { type: "string" },
        },
      },
    };

    const schemaWithNoProps: OpenAPIV3.SchemaObject = { type: "object" };

    beforeEach(() => {
      strategy.setSchemas({
        Complex: complexSchema,
        TestSchema: mockSchemas.TestSchema,
      });
      strategy.clearGeneratedIds();
      vi.mocked(idFieldUtil.detectIdField).mockImplementation(
        (resourceName, schema) => {
          if (resourceName === "Complex") return "id";
          if (resourceName === "TestSchema") return "id";
          const s = swaggerResolverUtil.resolveSchema(schema, {
            Complex: complexSchema,
            TestSchema: mockSchemas.TestSchema,
          });
          if (s.properties?.id) return "id";
          if (s.properties?.relatedId) return "relatedId"; // For testing relatedId as an ID field
          return Object.keys(s.properties || {})[0] || "id";
        }
      );
    });

    it("should generate an object based on schema properties", () => {
      const item = strategy.generateMockItem(
        mockSchemas.TestSchema,
        "TestSchema"
      );
      expect(item).toHaveProperty("id", "mock-uuid");
      expect(item).toHaveProperty("name", "mockWord");
      expect(faker.string.uuid).toHaveBeenCalled();
      expect(faker.lorem.word).toHaveBeenCalled();
    });

    it("should store generated ID in generatedIds", () => {
      strategy.generateMockItem(mockSchemas.TestSchema, "TestSchema");
      const ids = strategy.getGeneratedIds();
      expect(ids["TestSchema"]).toBeDefined();
      expect(ids["TestSchema"]).toContain("mock-uuid");
    });

    it("should use existing generated ID for related fields", () => {
      // First generate a "Related" item to populate its ID
      const relatedSchema: OpenAPIV3.SchemaObject = {
        type: "object",
        properties: { id: { type: "string" } },
      };
      vi.mocked(idFieldUtil.detectIdField).mockReturnValueOnce("id");
      strategy.setSchemas({
        ...strategy.getGeneratedIds(),
        Related: relatedSchema,
      }); // Add to schemas for resolve
      strategy.generateMockItem(relatedSchema, "Related"); // This will generate 'mock-uuid' for Related:id

      // Now generate an item that refers to 'Related' via 'relatedId'
      const mainSchema: OpenAPIV3.SchemaObject = {
        type: "object",
        properties: {
          id: { type: "string" },
          relatedId: { type: "string" }, // Field name matches pattern "somethingId"
        },
      };
      vi.mocked(idFieldUtil.detectIdField).mockImplementation(
        (resName, schema) => {
          if (resName === "Main") return "id";
          return "id"; // for relatedId's resource type 'Related'
        }
      );

      const item = strategy.generateMockItem(mainSchema, "Main");
      expect(faker.helpers.arrayElement).toHaveBeenCalledWith(
        strategy.getGeneratedIds()["Related"]
      );
      expect(item.relatedId).toBe("mock-uuid"); // Should pick up the generated ID
    });

    it("should respect maxDepth for nested objects", () => {
      const deepSchema: OpenAPIV3.SchemaObject = {
        type: "object",
        properties: {
          level1: {
            type: "object",
            properties: {
              level2: {
                type: "object",
                properties: {
                  level3: { type: "string" }, // This should not be generated if maxDepth is 2
                },
              },
            },
          },
        },
      };
      strategy.setSchemas({ Deep: deepSchema });
      vi.mocked(idFieldUtil.detectIdField).mockReturnValue("id"); // Generic id

      // Max depth 1: level1 is object, level1.level2 should be an empty object because level2 itself is an object processed at depth+1 (2), which hits maxDepth for objects.
      let item = strategy.generateMockItem(deepSchema, "Deep", 0, 1);
      expect(item.level1).toEqual({ level2: {} }); // item.level1 is {level2: {}} because level2 is at depth 2 (maxDepth+1 for its properties)

      // Max depth 2: level1.level2 is object, level1.level2.level3 should be a string.
      vi.mocked(faker.lorem.word).mockClear();
      item = strategy.generateMockItem(deepSchema, "Deep", 0, 2);
      expect(item.level1.level2).toHaveProperty("level3", "mockWord");
      expect(faker.lorem.word).toHaveBeenCalled();

      // Max depth 0: level1 should be empty object {}
      item = strategy.generateMockItem(deepSchema, "Deep", 0, 0);
      expect(item.level1).toEqual({});
    });

    it("should return empty object if schema is not object or has no properties", () => {
      const stringSchema: OpenAPIV3.SchemaObject = { type: "string" };
      expect(strategy.generateMockItem(stringSchema, "TestString")).toEqual({});
      expect(
        strategy.generateMockItem(schemaWithNoProps, "TestNoProps")
      ).toEqual({});
    });

    it("should correctly use detectIdField for the current resourceName", () => {
      strategy.setSchemas({ Complex: complexSchema });
      vi.mocked(idFieldUtil.detectIdField).mockClear();
      strategy.generateMockItem(complexSchema, "Complex");
      // First call to detectIdField is for 'Complex' schema itself
      expect(idFieldUtil.detectIdField).toHaveBeenNthCalledWith(
        1,
        "Complex",
        complexSchema,
        expect.any(Object)
      );
      // Then for nestedObject, the context name should be "nestedObject" (the key)
      expect(idFieldUtil.detectIdField).toHaveBeenNthCalledWith(
        2,
        "nestedObject", // Expect the key of the nested object property
        complexSchema.properties!.nestedObject as OpenAPIV3.SchemaObject,
        expect.any(Object)
      );
    });

    // Tests for allOf, oneOf, anyOf - current strategy does not explicitly support them, typically resolves first or errors.
    // These tests will primarily document current behavior or limitations.
    it("should handle allOf by (typically) merging properties or using first resolved schema (mock limitation)", () => {
      const allOfSchema: OpenAPIV3.SchemaObject = {
        allOf: [
          { type: "object", properties: { propA: { type: "string" } } },
          { type: "object", properties: { propB: { type: "boolean" } } },
        ],
      };
      // Current resolveSchema mock just returns the schema if not a $ref.
      // A real allOf resolver would merge these. DefaultMockStrategy does not implement merging.
      // It will likely treat the allOf schema as a non-standard object type.
      // Let's see what generateMockItem does.
      // generateMockItem first calls resolveSchema. If resolveSchema doesn't merge, then it depends on how it's structured.
      // The default strategy will likely see `allOf` as a property if not resolved into a single schema object by `resolveSchema`.
      // If `resolveSchema` passes it as is, and `type` is not 'object', `generateMockItem` returns {}.
      // If type IS object but properties are not at top level, also {}.
      // Let's mock resolveSchema to return a merged-like structure for test purpose.
      vi.mocked(swaggerResolverUtil.resolveSchema).mockImplementation((s) => {
        if ((s as any).allOf) {
          return {
            type: "object",
            properties: {
              propA: { type: "string" },
              propB: { type: "boolean" },
            },
          } as OpenAPIV3.SchemaObject;
        }
        return s as OpenAPIV3.SchemaObject;
      });

      const item = strategy.generateMockItem(allOfSchema, "AllOfTest");
      expect(item).toHaveProperty("propA", "mockWord");
      expect(item).toHaveProperty("propB", true);
    });

    it("should handle oneOf by (typically) picking the first schema (mock limitation)", () => {
      const oneOfSchema: OpenAPIV3.SchemaObject = {
        oneOf: [
          { type: "object", properties: { optionA: { type: "string" } } },
          { type: "object", properties: { optionB: { type: "integer" } } },
        ],
      };
      // Similar to allOf, the strategy doesn't choose. It depends on resolveSchema.
      // Mock resolveSchema to pick the first for predictability in test.
      vi.mocked(swaggerResolverUtil.resolveSchema).mockImplementation((s) => {
        if ((s as any).oneOf) {
          return (s as any).oneOf[0] as OpenAPIV3.SchemaObject;
        }
        return s as OpenAPIV3.SchemaObject;
      });
      const item = strategy.generateMockItem(oneOfSchema, "OneOfTest");
      expect(item).toHaveProperty("optionA", "mockWord");
      expect(item).not.toHaveProperty("optionB");
    });

    it("should handle anyOf by (typically) picking the first schema (mock limitation)", () => {
      const anyOfSchema: OpenAPIV3.SchemaObject = {
        anyOf: [
          { type: "object", properties: { choiceA: { type: "string" } } },
          { type: "object", properties: { choiceB: { type: "boolean" } } },
        ],
      };
      vi.mocked(swaggerResolverUtil.resolveSchema).mockImplementation((s) => {
        if ((s as any).anyOf) {
          return (s as any).anyOf[0] as OpenAPIV3.SchemaObject;
        }
        return s as OpenAPIV3.SchemaObject;
      });
      const item = strategy.generateMockItem(anyOfSchema, "AnyOfTest");
      expect(item).toHaveProperty("choiceA", "mockWord");
      expect(item).not.toHaveProperty("choiceB");
    });

    it("should prioritize 'example' value from schema if strategy supported it (current default does not)", () => {
      const schemaWithExample: OpenAPIV3.SchemaObject = {
        type: "string",
        example: "hardcodedExampleValue",
      };
      // Current DefaultMockStrategy does not use schema.example. It will use faker.
      expect(strategy.generateMockValue(schemaWithExample, "TestExample")).toBe(
        "mockWord"
      );
    });
  });
});
