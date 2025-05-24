import { OpenAPIV3 } from "openapi-types";

/**
 * Extract schema reference from OpenAPI response object.
 * @param responses - OpenAPI response object
 * @returns Schema reference or null
 */
export function extractSchemaRef(
  responses: OpenAPIV3.ResponsesObject
): string | null {
  const resp = responses["200"] || responses["201"] || responses["default"];
  if (
    resp &&
    (resp as any).content &&
    (resp as any).content["application/json"]
  ) {
    const schema = (resp as any).content["application/json"].schema;
    if (schema) {
      if ((schema as any).$ref) {
        return (schema as any).$ref;
      } else if (
        (schema as any).type === "array" &&
        (schema as any).items &&
        (schema as any).items.$ref
      ) {
        return (schema as any).items.$ref;
      }
    }
  }
  return null;
}

/**
 * Extract schema key from schema reference.
 * @param ref - Schema reference string
 * @returns Schema key or null
 */
export function extractSchemaKey(ref: string): string | null {
  const match = ref.match(/#\/components\/schemas\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Map Express request path to OpenAPI path template.
 * @param requestPath - Express request path
 * @param paths - OpenAPI paths object
 * @returns Matched OpenAPI path or original path
 */
export function findOpenApiPath(
  requestPath: string,
  paths: Record<string, any>
): string {
  const cleanPath = requestPath.replace(/\/$/, "");

  // Sort paths to prioritize more specific ones:
  // 1. Longer paths first.
  // 2. For paths of the same length, those with fewer placeholders first.
  const sortedOpenApiPaths = Object.keys(paths).sort((a, b) => {
    const aLength = a.split("/").length;
    const bLength = b.split("/").length;
    if (aLength !== bLength) {
      return bLength - aLength; // Longer paths first
    }
    const aPlaceholders = (a.match(/\{[^}]+\}/g) || []).length;
    const bPlaceholders = (b.match(/\{[^}]+\}/g) || []).length;
    return aPlaceholders - bPlaceholders; // Fewer placeholders first
  });

  for (const openapiPath of sortedOpenApiPaths) {
    const regex = new RegExp(
      "^" + openapiPath.replace(/\{[^}]+\}/g, "[^/]+") + "$"
    );
    if (regex.test(cleanPath)) {
      return openapiPath;
    }
  }
  return requestPath;
}

/**
 * Cast query parameters to string values.
 * @param query - Express query object
 * @returns Record of string values
 */
export function castQueryToString(
  query: Record<string, any>
): Record<string, string> {
  const castQuery: Record<string, string> = {};
  Object.entries(query).forEach(([k, v]) => {
    if (typeof v === "string") {
      castQuery[k] = v;
    } else if (Array.isArray(v) && typeof v[0] === "string") {
      castQuery[k] = v[0];
    }
  });
  return castQuery;
}

/**
 * Cast headers to string values.
 * @param headers - Express headers object
 * @returns Record of string values
 */
export function castHeadersToString(
  headers: Record<string, any>
): Record<string, string> {
  const castHeaders: Record<string, string> = {};
  Object.entries(headers).forEach(([k, v]) => {
    castHeaders[k] = Array.isArray(v) ? v[0] : (v ?? "").toString();
  });
  return castHeaders;
}
