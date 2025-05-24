import { describe, it, expect, vi } from "vitest";
import {
  extractSchemaRef,
  extractSchemaKey,
  findOpenApiPath,
  castQueryToString,
  castHeadersToString,
} from "../../src/utils/openapi.js";
import { OpenAPIV3 } from "openapi-types";

describe("OpenAPI Utilities", () => {
  describe("extractSchemaRef", () => {
    it("should extract $ref from a direct reference in response content schema", () => {
      const responses: OpenAPIV3.ResponsesObject = {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MySchema" },
            },
          },
        },
      };
      expect(extractSchemaRef(responses)).toBe("#/components/schemas/MySchema");
    });

    it("should extract $ref from an array item reference in response content schema", () => {
      const responses: OpenAPIV3.ResponsesObject = {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/MyItemSchema" },
              },
            },
          },
        },
      };
      expect(extractSchemaRef(responses)).toBe(
        "#/components/schemas/MyItemSchema"
      );
    });

    it("should return null if no $ref is found", () => {
      const responses: OpenAPIV3.ResponsesObject = {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: { type: "string" },
            },
          },
        },
      };
      expect(extractSchemaRef(responses)).toBeNull();
    });

    it("should return null if content is not application/json", () => {
      const responses: OpenAPIV3.ResponsesObject = {
        "200": {
          description: "OK",
          content: {
            "text/plain": {
              schema: { $ref: "#/components/schemas/MySchema" } as any, // type any to bypass strict check for test
            },
          },
        },
      };
      expect(extractSchemaRef(responses)).toBeNull();
    });

    it("should return null if responses object is empty or content is missing", () => {
      expect(extractSchemaRef({})).toBeNull();
      const responses: OpenAPIV3.ResponsesObject = {
        "200": { description: "OK" },
      };
      expect(extractSchemaRef(responses)).toBeNull();
    });

    it("should prioritize 200 response, then 201, then default", () => {
      const responses200: OpenAPIV3.ResponsesObject = {
        "200": {
          content: { "application/json": { schema: { $ref: "#/200" } } },
        } as any,
        "201": {
          content: { "application/json": { schema: { $ref: "#/201" } } },
        } as any,
        default: {
          content: { "application/json": { schema: { $ref: "#/default" } } },
        } as any,
      };
      expect(extractSchemaRef(responses200)).toBe("#/200");

      const responses201: OpenAPIV3.ResponsesObject = {
        "201": {
          content: { "application/json": { schema: { $ref: "#/201" } } },
        } as any,
        default: {
          content: { "application/json": { schema: { $ref: "#/default" } } },
        } as any,
      };
      expect(extractSchemaRef(responses201)).toBe("#/201");
      const responsesDefault: OpenAPIV3.ResponsesObject = {
        default: {
          content: { "application/json": { schema: { $ref: "#/default" } } },
        } as any,
      };
      expect(extractSchemaRef(responsesDefault)).toBe("#/default");
    });
  });

  describe("extractSchemaKey", () => {
    it("should extract schema key from a valid $ref string", () => {
      const ref = "#/components/schemas/MySchemaName";
      expect(extractSchemaKey(ref)).toBe("MySchemaName");
    });

    it("should return null for an invalid $ref string format", () => {
      const ref = "#/definitions/MySchemaName"; // Old format
      expect(extractSchemaKey(ref)).toBeNull();
    });

    it("should return null for a $ref string not pointing to schemas", () => {
      const ref = "#/components/parameters/MyParam";
      expect(extractSchemaKey(ref)).toBeNull();
    });

    it("should return null for an empty string", () => {
      expect(extractSchemaKey("")).toBeNull();
    });
  });

  describe("findOpenApiPath", () => {
    const paths = {
      "/users": { get: {} },
      "/users/{userId}": { get: {} },
      "/posts/{postId}/comments": { get: {} },
      "/posts/{postId}/comments/{commentId}": { get: {} },
      "/products": { get: {} }, // No trailing slash in spec
    };

    it("should find exact match for static paths", () => {
      expect(findOpenApiPath("/users", paths)).toBe("/users");
    });

    it("should find match for paths with parameters", () => {
      expect(findOpenApiPath("/users/123", paths)).toBe("/users/{userId}");
      expect(findOpenApiPath("/posts/abc/comments", paths)).toBe(
        "/posts/{postId}/comments"
      );
      expect(findOpenApiPath("/posts/abc/comments/xyz", paths)).toBe(
        "/posts/{postId}/comments/{commentId}"
      );
    });

    it("should handle trailing slashes in request path for static paths", () => {
      expect(findOpenApiPath("/users/", paths)).toBe("/users");
    });

    it("should handle trailing slashes in request path for paths with parameters", () => {
      expect(findOpenApiPath("/users/123/", paths)).toBe("/users/{userId}");
      expect(findOpenApiPath("/posts/abc/comments/", paths)).toBe(
        "/posts/{postId}/comments"
      );
      expect(findOpenApiPath("/posts/abc/comments/xyz/", paths)).toBe(
        "/posts/{postId}/comments/{commentId}"
      );
    });

    it("should return original path if no match is found", () => {
      expect(findOpenApiPath("/nonexistent", paths)).toBe("/nonexistent");
      expect(findOpenApiPath("/users/123/orders", paths)).toBe(
        "/users/123/orders" // No matching template
      );
    });

    it("should match even if spec path has no trailing slash and request path does", () => {
      expect(findOpenApiPath("/products/", paths)).toBe("/products");
    });

    it("should prefer more specific match if regexes overlap (hypothetical)", () => {
      const specificPaths = {
        "/resources/{id}": { get: {} },
        "/resources/specific-action": { get: {} },
      };
      expect(findOpenApiPath("/resources/specific-action", specificPaths)).toBe(
        "/resources/specific-action"
      );
      expect(findOpenApiPath("/resources/some-id", specificPaths)).toBe(
        "/resources/{id}"
      );
    });
  });

  describe("castQueryToString", () => {
    it("should cast string query parameters to string", () => {
      const query = { name: "John Doe", age: "30" };
      expect(castQueryToString(query)).toEqual({ name: "John Doe", age: "30" });
    });

    it("should take the first element if query parameter is an array of strings", () => {
      const query = { skills: ["js", "ts"], city: "New York" };
      expect(castQueryToString(query)).toEqual({
        skills: "js",
        city: "New York",
      });
    });

    it("should ignore non-string and non-array-of-string parameters", () => {
      const query = { id: 123, active: true, name: "Alice" };
      expect(castQueryToString(query)).toEqual({ name: "Alice" });
    });

    it("should handle empty query object", () => {
      expect(castQueryToString({})).toEqual({});
    });

    it("should handle query object with mixed types, prioritizing strings", () => {
      const query = {
        name: "Bob",
        tags: ["developer", "engineer"],
        details: { company: "OpenAI" }, // This should be ignored
        count: 5, // This should be ignored
        flag: "true",
      };
      expect(castQueryToString(query)).toEqual({
        name: "Bob",
        tags: "developer",
        flag: "true",
      });
    });
  });

  describe("castHeadersToString", () => {
    it("should cast string header values to string", () => {
      const headers = {
        "content-type": "application/json",
        "x-request-id": "123",
      };
      expect(castHeadersToString(headers)).toEqual({
        "content-type": "application/json",
        "x-request-id": "123",
      });
    });

    it("should take the first element if header value is an array of strings", () => {
      const headers = {
        "accept-language": ["en-US", "en"],
        "user-agent": "TestAgent",
      };
      expect(castHeadersToString(headers)).toEqual({
        "accept-language": "en-US",
        "user-agent": "TestAgent",
      });
    });

    it("should cast non-string scalar header values to string", () => {
      const headers = {
        "content-length": 1024,
        "x-custom-flag": true,
        host: "example.com",
      };
      expect(castHeadersToString(headers)).toEqual({
        "content-length": "1024",
        "x-custom-flag": "true",
        host: "example.com",
      });
    });

    it("should handle empty headers object", () => {
      expect(castHeadersToString({})).toEqual({});
    });

    it("should handle headers with mixed value types", () => {
      const headers = {
        authorization: "Bearer token",
        "cache-control": ["no-cache", "no-store"],
        "x-max-retries": 5,
        "x-enabled": false,
        "x-null-header": null as any, // Test null explicitly
        "x-undefined-header": undefined,
      };
      expect(castHeadersToString(headers)).toEqual({
        authorization: "Bearer token",
        "cache-control": "no-cache",
        "x-max-retries": "5",
        "x-enabled": "false",
        "x-null-header": "", // null becomes empty string
        "x-undefined-header": "", // undefined becomes empty string
      });
    });
  });
});
