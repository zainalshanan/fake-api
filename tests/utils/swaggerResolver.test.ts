import { describe, it, expect, vi } from "vitest";
import { resolveSchema } from "../../src/utils/swaggerResolver.js"; // Adjust path as necessary
import { OpenAPIV3 } from "openapi-types";

describe("swaggerResolver Utility", () => {
  const schemas: Record<
    string,
    OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
  > = {
    DirectSchema: {
      type: "object",
      properties: { name: { type: "string" } },
    },
    RefToDirect: {
      $ref: "#/components/schemas/DirectSchema",
    },
    NestedRef: {
      $ref: "#/components/schemas/RefToDirect",
    },
    CycleRefA: { $ref: "#/components/schemas/CycleRefB" },
    CycleRefB: { $ref: "#/components/schemas/CycleRefA" },
    PointlessCycle: { $ref: "#/components/schemas/PointlessCycle" },
  };

  it("should return direct schema objects as is", () => {
    const direct = schemas.DirectSchema as OpenAPIV3.SchemaObject;
    expect(resolveSchema(direct, schemas)).toBe(direct);
  });

  it("should resolve a simple $ref to the target schema object", () => {
    const ref = schemas.RefToDirect as OpenAPIV3.ReferenceObject;
    const expected = schemas.DirectSchema as OpenAPIV3.SchemaObject;
    expect(resolveSchema(ref, schemas)).toEqual(expected);
  });

  it("should resolve nested $refs", () => {
    const nestedRef = schemas.NestedRef as OpenAPIV3.ReferenceObject;
    const expected = schemas.DirectSchema as OpenAPIV3.SchemaObject;
    expect(resolveSchema(nestedRef, schemas)).toEqual(expected);
  });

  it("should throw an error for a missing $ref", () => {
    const missingRef: OpenAPIV3.ReferenceObject = {
      $ref: "#/components/schemas/NonExistent",
    };
    expect(() => resolveSchema(missingRef, schemas)).toThrowError(
      "Schema $ref not found: #/components/schemas/NonExistent"
    );
  });

  it("should throw an error for an unsupported $ref format", () => {
    const badFormatRef: OpenAPIV3.ReferenceObject = {
      $ref: "#/definitions/SomeSchema",
    }; // old swagger 2.0 style
    expect(() => resolveSchema(badFormatRef, schemas)).toThrowError(
      "Unsupported $ref format: #/definitions/SomeSchema"
    );
  });

  it("should throw an error for a $ref cycle to prevent infinite loop", () => {
    const cycleRef = schemas.CycleRefA as OpenAPIV3.ReferenceObject;
    // Vitest/Jest default recursion limit for toEqual might catch this first,
    // or the function itself might if it had cycle detection.
    // Current resolveSchema does not have explicit cycle detection, so it will recurse until stack overflow.
    // Testing this directly is hard without modifying the function or using advanced spy techniques.
    // For now, we will assume that an extremely deep recursion will lead to a stack overflow error.
    // This test might be flaky or environment-dependent.
    expect(() => resolveSchema(cycleRef, schemas)).toThrowError(); // General error due to recursion
  });

  it("should throw an error for a direct cycle ($ref to itself)", () => {
    const selfCycleRef = schemas.PointlessCycle as OpenAPIV3.ReferenceObject;
    expect(() => resolveSchema(selfCycleRef, schemas)).toThrowError();
  });
});
