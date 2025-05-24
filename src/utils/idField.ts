import { OpenAPIV3 } from "openapi-types";
import { resolveSchema } from "./swaggerResolver.js"; // Assuming resolveSchema is in the same directory or adjust path

/**
 * Detect the primary ID field for a schema (id, {resourceName}Id, etc.)
 * @param resourceName - The name of the resource.
 * @param schema - The schema or reference.
 * @param schemas - All schemas in the spec, for resolving references.
 * @returns The detected ID field name.
 */
export function detectIdField(
  resourceName: string,
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  schemas?: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>
): string {
  let resolvedSchema: OpenAPIV3.SchemaObject = schema as OpenAPIV3.SchemaObject;
  if ("$ref" in schema && schemas) {
    resolvedSchema = resolveSchema(schema, schemas);
  }

  if (!resolvedSchema || !resolvedSchema.properties) return "id";

  const properties = resolvedSchema.properties;

  if (properties.id) return "id";

  const camelCaseId =
    resourceName.charAt(0).toLowerCase() + resourceName.slice(1) + "Id";
  if (properties[camelCaseId]) return camelCaseId;

  const snakeCaseId =
    resourceName.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() + "_id";
  if (properties[snakeCaseId]) return snakeCaseId;

  const blid = Object.keys(properties).find((k) => k.toLowerCase() === "blid");
  if (blid) return blid;

  const anyId = Object.keys(properties).find((k) => k.match(/id$/i));
  if (anyId) return anyId;

  // Fallback: return the first property name or 'id' if no properties exist
  const firstProperty = Object.keys(properties)[0];
  return firstProperty || "id";
}
