import { describe, it, expect, vi } from "vitest";
import { detectIdField } from "../../src/utils/idField.js"; // Adjust path as necessary
import * as swaggerResolver from "../../src/utils/swaggerResolver.js"; // To mock resolveSchema
import { OpenAPIV3 } from "openapi-types";

// Mock resolveSchema
vi.mock("../../src/utils/swaggerResolver.js", () => ({
  resolveSchema: vi.fn((schema) => schema), // Simple mock: returns the schema itself or the referenced part
}));

describe("idField Utility", () => {
  const schemas: Record<
    string,
    OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
  > = {
    User: {
      type: "object",
      properties: {
        userId: { type: "string" },
        name: { type: "string" },
      },
    },
    Product: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        price: { type: "number" },
      },
    },
    Order: {
      type: "object",
      properties: {
        blid: { type: "string" }, // Test for 'blid'
        amount: { type: "number" },
      },
    },
    ItemWithGenericId: {
      type: "object",
      properties: {
        customIdField: { type: "string" }, // Test for general field ending in 'Id'
        description: { type: "string" },
      },
    },
    ItemWithStandardId: {
      type: "object",
      properties: {
        id: { type: "string" },
        value: { type: "string" },
      },
    },
    FirstPropertyWins: {
      type: "object",
      properties: {
        firstProp: { type: "string" },
        anotherProp: { type: "string" },
      },
    },
    EmptyProps: {
      type: "object",
      properties: {},
    },
    NoProps: {
      type: "object",
    },
  };

  // Helper to create a reference object
  const createRef = (refName: string): OpenAPIV3.ReferenceObject => ({
    $ref: `#/components/schemas/${refName}`,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset resolveSchema mock for direct schema passthrough or simple ref resolution
    vi.mocked(swaggerResolver.resolveSchema).mockImplementation(
      (schema, allSchemas) => {
        if (typeof schema === "object" && "$ref" in schema) {
          const refKey = schema.$ref.split("/").pop()!;
          return allSchemas![refKey] as OpenAPIV3.SchemaObject;
        }
        return schema as OpenAPIV3.SchemaObject;
      }
    );
  });

  it('should detect "id" if present', () => {
    const schema: OpenAPIV3.SchemaObject = {
      type: "object",
      properties: { id: { type: "string" } },
    };
    expect(detectIdField("Resource", schema, schemas)).toBe("id");
  });

  it('should detect "{resourceName}Id" (camelCase)', () => {
    expect(detectIdField("User", schemas.User, schemas)).toBe("userId");
  });

  it('should detect "resource_name_id" (snake_case)', () => {
    // Resource name for snake_case_id should be like 'ProductName' or 'ResourceName'
    expect(detectIdField("Product", schemas.Product, schemas)).toBe(
      "product_id"
    );
  });

  it('should detect "blid"', () => {
    expect(detectIdField("Order", schemas.Order, schemas)).toBe("blid");
  });

  it('should detect any field ending in "Id" (case-insensitive)', () => {
    const schema: OpenAPIV3.SchemaObject = {
      type: "object",
      properties: { someValueID: { type: "string" } },
    };
    expect(detectIdField("Resource", schema, schemas)).toBe("someValueID");
    const schema2: OpenAPIV3.SchemaObject = {
      type: "object",
      properties: { anotherId: { type: "string" } },
    };
    expect(detectIdField("Resource", schema2, schemas)).toBe("anotherId");
  });

  it("should fall back to the first property if no specific ID pattern matches", () => {
    expect(
      detectIdField("FirstPropertyWins", schemas.FirstPropertyWins, schemas)
    ).toBe("firstProp");
  });

  it('should fall back to "id" if schema has no properties', () => {
    expect(detectIdField("EmptyProps", schemas.EmptyProps, schemas)).toBe("id");
    expect(detectIdField("NoProps", schemas.NoProps, schemas)).toBe("id");
  });

  it('should fall back to "id" if schema or properties are undefined/null', () => {
    expect(
      detectIdField("Resource", {} as OpenAPIV3.SchemaObject, schemas)
    ).toBe("id");
    expect(
      detectIdField(
        "Resource",
        { type: "object" } as OpenAPIV3.SchemaObject,
        schemas
      )
    ).toBe("id"); // No properties field
  });

  it("should correctly detect ID for a schema reference", () => {
    const userRef = createRef("User");
    expect(detectIdField("User", userRef, schemas)).toBe("userId");
  });

  it('should prioritize direct "id" even if other patterns match for a referenced schema', () => {
    const itemRef = createRef("ItemWithStandardId");
    // Mock resolveSchema to return ItemWithStandardId from our test schemas
    vi.mocked(swaggerResolver.resolveSchema).mockReturnValue(
      schemas.ItemWithStandardId as OpenAPIV3.SchemaObject
    );
    expect(detectIdField("ItemWithStandardId", itemRef, schemas)).toBe("id");
    // Verify resolveSchema was called
    expect(swaggerResolver.resolveSchema).toHaveBeenCalledWith(
      itemRef,
      schemas
    );
  });

  it("should handle resource name casing for camelCaseId (e.g. userAccount -> userAccountId)", () => {
    const schema: OpenAPIV3.SchemaObject = {
      type: "object",
      properties: { userAccountId: { type: "string" } },
    };
    expect(detectIdField("UserAccount", schema, schemas)).toBe("userAccountId");
  });

  it("should handle resource name casing for snake_case_id (e.g. UserAccount -> user_account_id)", () => {
    const schema: OpenAPIV3.SchemaObject = {
      type: "object",
      properties: { user_account_id: { type: "string" } },
    };
    expect(detectIdField("UserAccount", schema, schemas)).toBe(
      "user_account_id"
    );
  });
});
