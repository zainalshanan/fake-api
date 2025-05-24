import { OpenAPIV3 } from "openapi-types";

/**
 * Recursively resolve a schema, following $ref pointers if necessary.
 * @param {OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject} schema - The schema or reference.
 * @param {Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>} schemas - All schemas in the spec.
 * @returns {OpenAPIV3.SchemaObject} The resolved schema object.
 */
export function resolveSchema(
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>
): OpenAPIV3.SchemaObject {
  if ("$ref" in schema) {
    // $ref is of the form '#/components/schemas/ResourceName'
    const ref = schema.$ref;
    const match = ref.match(/^#\/components\/schemas\/(.+)$/);
    if (match) {
      const refName = match[1];
      const resolved = schemas[refName];
      if (!resolved) throw new Error(`Schema $ref not found: ${ref}`);
      return resolveSchema(resolved, schemas); // Recursive call
    }
    throw new Error(`Unsupported $ref format: ${ref}`);
  }
  return schema;
}
