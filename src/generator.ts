import * as path from "path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPIV3 } from "openapi-types";
import type { RouteConfig, ControllerConfig } from "./types.js";
import pluralize from "pluralize";
import { ensureDirs, writeJsonFile, readDir, writeFile } from "./utils/file.js";
import { extractSchemaKey } from "./utils/openapi.js";
import { Logger } from "./utils/logger.js";

export class Generator {
  private specDir: string;
  private outDir: string;

  constructor(specDir: string, outDir: string) {
    this.specDir = specDir;
    this.outDir = outDir;
  }

  private normalizePath(pathUrl: string): string {
    return pathUrl.startsWith("/") ? pathUrl.slice(1) : pathUrl;
  }

  async generate(): Promise<void> {
    ensureDirs(this.outDir);
    const specs = readDir(this.specDir).filter(
      (file: string) => file.endsWith(".yaml") || file.endsWith(".json")
    );

    for (const spec of specs) {
      const api = (await SwaggerParser.parse(
        path.join(this.specDir, spec)
      )) as OpenAPIV3.Document;
      const specName = path.basename(spec, path.extname(spec));

      await this.generateApiFiles(api, specName);
    }
  }

  private collectRoutesAndControllerConfigs(api: OpenAPIV3.Document): {
    routes: RouteConfig[];
    controllerConfigs: ControllerConfig[];
    pathToSchemaKey: Record<string, string>;
  } {
    const routes: RouteConfig[] = [];
    const controllerConfigs: ControllerConfig[] = [];
    const pathToSchemaKey: Record<string, string> = {};

    for (const [pathUrl, pathItem] of Object.entries(api.paths || {})) {
      if (!pathItem) continue;

      const normalizedPath = this.normalizePath(pathUrl);
      const segments = normalizedPath.split("/");
      const baseResource =
        segments.find((seg) => !seg.startsWith("{") && !seg.endsWith("}")) ||
        segments[0];
      const singularResource = pluralize.singular(baseResource);
      const pluralResource = pluralize.plural(baseResource);

      const isPropertyEndpoint =
        segments.length === 3 &&
        segments[1].startsWith("{") &&
        !segments[2].startsWith("{");

      if (isPropertyEndpoint) {
        const parentPath = segments.slice(0, 2).join("/");
        const parentSchemaKey =
          pathToSchemaKey[parentPath] ||
          pathToSchemaKey[baseResource] ||
          pluralize.singular(
            baseResource.charAt(0).toUpperCase() + baseResource.slice(1)
          );
        pathToSchemaKey[normalizedPath] = parentSchemaKey;
        Logger.debug("[GENERATOR][DEBUG] Property endpoint detected, mapping", {
          normalizedPath,
          parentSchemaKey,
        });
      } else {
        Logger.debug("[GENERATOR][DEBUG] Processing path:", {
          pathUrl,
          normalizedPath,
        });

        const { schemaKey, updatedApi } = this._determineSchemaKeyAndMappings(
          pathItem,
          baseResource,
          api,
          pathToSchemaKey,
          normalizedPath
        );
        api = updatedApi; // Update api if inline schemas were added

        if (schemaKey) {
          pathToSchemaKey[normalizedPath] = schemaKey;
          if (!pathToSchemaKey.hasOwnProperty(baseResource)) {
            pathToSchemaKey[baseResource] = schemaKey;
          } else {
            Logger.debug(
              "[GENERATOR][DEBUG] Skipping baseResource mapping for",
              { baseResource, existing: pathToSchemaKey[baseResource] }
            );
          }
          if (!pathToSchemaKey.hasOwnProperty(singularResource)) {
            pathToSchemaKey[singularResource] = schemaKey;
          } else {
            Logger.debug(
              "[GENERATOR][DEBUG] Skipping singularResource mapping for",
              { singularResource, existing: pathToSchemaKey[singularResource] }
            );
          }
          if (!pathToSchemaKey.hasOwnProperty(pluralResource)) {
            pathToSchemaKey[pluralResource] = schemaKey;
          } else {
            Logger.debug(
              "[GENERATOR][DEBUG] Skipping pluralResource mapping for",
              { pluralResource, existing: pathToSchemaKey[pluralResource] }
            );
          }
          const itemPath =
            segments.length > 1 && segments[1].startsWith("{")
              ? `${baseResource}/{${segments[1].slice(1)}}`
              : null;
          if (itemPath) {
            pathToSchemaKey[itemPath] = schemaKey;
          }
          Logger.debug("[GENERATOR][DEBUG] Final pathToSchemaKey mapping for", {
            pathUrl,
            schemaKey,
          });
        } else {
          Logger.debug("[GENERATOR][DEBUG] No schemaKey found for", {
            pathUrl,
          });
        }
      }

      for (const [method, operation] of Object.entries(pathItem)) {
        this._processOperation(
          method,
          operation,
          pathItem,
          normalizedPath,
          routes,
          controllerConfigs
        );
      }
    }
    // Ensure property endpoints are also in routes and controllerConfigs
    // This logic might need to be part of the loop or a post-processing step
    for (const [pathUrl, pathItem] of Object.entries(api.paths || {})) {
      const normalizedPath = this.normalizePath(pathUrl);
      const segments = normalizedPath.split("/");
      const isPropertyEndpoint =
        segments.length === 3 &&
        segments[1].startsWith("{") &&
        !segments[2].startsWith("{");

      if (isPropertyEndpoint) {
        const baseResource = segments[0];
        const propertyName = segments[2];
        const parentIdParamName = segments[1].slice(1, -1);
        const operationId = `get${pluralize.singular(
          baseResource.charAt(0).toUpperCase() + baseResource.slice(1)
        )}${propertyName.charAt(0).toUpperCase() + propertyName.slice(1)}`;

        if (!controllerConfigs.find((c) => c.operationId === operationId)) {
          controllerConfigs.push({
            operationId,
            method: "get",
            parameters: [
              {
                name: parentIdParamName,
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            path: normalizedPath,
            responses: { "200": { description: "Property value" } }, // Added default response
          });
        }
        if (!routes.find((r) => r.operationId === operationId)) {
          routes.push({
            path: normalizedPath,
            method: "get",
            operationId,
            parameters: [
              {
                name: parentIdParamName,
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "Property value" } }, // Added default response
          });
        }
      }
    }

    return { routes, controllerConfigs, pathToSchemaKey };
  }

  private async writeFiles(
    specName: string,
    routes: RouteConfig[],
    controllerConfigs: ControllerConfig[],
    pathToSchemaKey: Record<string, string>,
    api: OpenAPIV3.Document,
    finalResources: Set<string>
  ): Promise<void> {
    const apiDir = path.join(this.outDir, specName);
    ensureDirs(path.join(apiDir, "routes"));
    ensureDirs(path.join(apiDir, "controllers"));

    Logger.debug("[DEBUG] Generating route file for", { specName });
    await this.generateRouteFile(routes, specName, finalResources);

    Logger.debug("[DEBUG] Generating controller files for", {
      specName,
      resources: finalResources,
    });
    await this.generateControllers(
      controllerConfigs,
      specName,
      pathToSchemaKey,
      api,
      finalResources
    );
  }

  private async generateApiFiles(
    api: OpenAPIV3.Document,
    specName: string
  ): Promise<void> {
    const { routes, controllerConfigs, pathToSchemaKey } =
      this.collectRoutesAndControllerConfigs(api);

    const resources: Set<string> = new Set();
    Object.values(pathToSchemaKey).forEach((schemaKey) => {
      if (schemaKey)
        resources.add(schemaKey.charAt(0).toUpperCase() + schemaKey.slice(1));
    });
    if (api.components && api.components.schemas) {
      Object.keys(api.components.schemas).forEach((schemaName) => {
        resources.add(schemaName.charAt(0).toUpperCase() + schemaName.slice(1));
      });
    }
    for (const route of routes) {
      const pathSegments = route.path.split("/").filter(Boolean);
      if (pathSegments.length > 0 && !pathSegments[0].startsWith("{")) {
        const resourceName = pluralize.singular(pathSegments[0]);
        resources.add(
          resourceName.charAt(0).toUpperCase() + resourceName.slice(1)
        );
      }
    }
    // Filter out empty strings and ensure singularized uniqueness for controller generation
    const finalResources = new Set(
      Array.from(resources)
        .filter((r) => r && r.trim() !== "")
        .map((r) => pluralize.singular(r.charAt(0).toUpperCase() + r.slice(1))) // Singularize and capitalize
    );

    await this.writeFiles(
      specName,
      routes,
      controllerConfigs,
      pathToSchemaKey,
      api,
      finalResources
    );
  }

  private generateOperationId(method: string, pathUrl: string): string {
    const segments = pathUrl.split("/").filter(Boolean);
    const resource = segments[0];
    const action = segments.length > 1 ? segments[1] : "";

    if (action.startsWith("{") && action.endsWith("}")) {
      // Path has an ID parameter
      return `${method}${resource}ById`;
    }

    return `${method}${resource}${
      action ? action.charAt(0).toUpperCase() + action.slice(1) : ""
    }`;
  }

  private async generateRouteFile(
    routes: RouteConfig[],
    specName: string,
    resourceNames: Set<string>
  ): Promise<void> {
    const imports: string[] = [];
    const instantiations: string[] = [];
    const routeDefinitions: string[] = [];
    const generatedControllers = new Set<string>(); // Keep track of generated controllers

    for (const resource of resourceNames) {
      if (!resource) continue;
      const singularResourceName = pluralize.singular(resource);
      const pascalResourceName = toPascalCase(singularResourceName);
      const controllerClassName = `${pascalResourceName}Controller`;
      const controllerInstanceName = `${singularResourceName.toLowerCase()}Controller`;

      if (!generatedControllers.has(controllerClassName)) {
        imports.push(
          `import { ${controllerClassName} } from '../controllers/${controllerClassName}.js';`
        );
        instantiations.push(
          `const ${controllerInstanceName} = new ${controllerClassName}('${specName}');`
        );
        generatedControllers.add(controllerClassName);
      }
    }

    for (const route of routes) {
      const path = route.path.startsWith("/") ? route.path : "/" + route.path;
      // Convert OpenAPI path params to Express style
      const expressPath = path.replace(/\{([^}]+)\}/g, ":$1");
      const pathSegments = route.path.split("/").filter(Boolean);
      if (pathSegments.length === 0) continue;
      let baseResourcePath = pathSegments[0];
      const resourceFromFile = pluralize.singular(baseResourcePath);
      const controllerInstanceName = `${resourceFromFile.toLowerCase()}Controller`;
      // Determine if this is an item path (has a path param after resource)
      const isItemPath =
        pathSegments.length > 1 && pathSegments[1].startsWith("{");
      let actionMethod: string | null = null;
      // Extract the param name from the path, e.g., {petId} => petId
      let itemParamName = null;
      if (isItemPath) {
        const match = pathSegments[1].match(/^\{(.+)\}$/);
        if (match) itemParamName = match[1];
      }
      if (!isItemPath) {
        // Collection path
        if (route.method.toLowerCase() === "get") actionMethod = "list";
        else if (route.method.toLowerCase() === "post") actionMethod = "create";
      } else {
        // Item path
        if (route.method.toLowerCase() === "get") actionMethod = "get";
        else if (route.method.toLowerCase() === "put") actionMethod = "update";
        else if (route.method.toLowerCase() === "patch") actionMethod = "patch";
        else if (route.method.toLowerCase() === "delete")
          actionMethod = "delete";
      }
      // Middleware to map param to req.params.id if needed
      let idMapMiddleware = "";
      if (isItemPath && itemParamName && itemParamName !== "id") {
        idMapMiddleware = `(req, res, next) => { req.params.id = (req.params as any)['${itemParamName}']; next(); }, `;
      }
      if (actionMethod) {
        if (
          instantiations.some((inst) =>
            inst.startsWith(`const ${controllerInstanceName} =`)
          )
        ) {
          const middlewareString = route.middleware
            ? route.middleware.join(", ") + ", "
            : "";
          // Map path param (e.g., petId, postId) to req.params.id for controller
          let expressPathPatched = expressPath;
          let needsTsIgnore = false;
          if (isItemPath && pathSegments[1]) {
            // Use the original param name in the route (e.g., :petId)
            expressPathPatched = expressPath; // Do not replace with :id
            // Always inject id-mapping middleware for item routes
            if (idMapMiddleware) {
              needsTsIgnore = true;
            }
          }
          const routeDef = `router.${route.method.toLowerCase()} ('${expressPathPatched}', ${middlewareString}${idMapMiddleware}${controllerInstanceName}.${actionMethod}.bind(${controllerInstanceName}));`;
          if (needsTsIgnore) {
            routeDefinitions.push(`// @ts-ignore`);
            routeDefinitions.push(routeDef);
          } else {
            routeDefinitions.push(routeDef);
          }
        } else {
          Logger.debug(
            `[generateRouteFile] No controller instance for ${controllerInstanceName} from path ${route.path}. Skipping route.`
          );
        }
      } else {
        // Fallback to operationId as method name for custom operations
        const customOpId = route.operationId;
        if (
          instantiations.some((inst) =>
            inst.startsWith(`const ${controllerInstanceName} =`)
          )
        ) {
          const middlewareString = route.middleware
            ? route.middleware.join(", ") + ", "
            : "";
          // Map path param (e.g., postId) to :id for custom ops too
          let expressPathPatched = expressPath;
          let idMapMiddlewareCustom = "";
          let needsTsIgnoreCustom = false;
          if (isItemPath && pathSegments[1]) {
            expressPathPatched = expressPath.replace(
              /:([a-zA-Z0-9_]+)$/,
              ":id"
            );
            if (itemParamName && itemParamName !== "id") {
              idMapMiddlewareCustom = `(req, res, next) => { req.params.id = (req.params as any)['${itemParamName}']; next(); }, `;
            }
            if (!expressPath.includes(":id") && idMapMiddlewareCustom) {
              needsTsIgnoreCustom = true;
            }
          }
          const routeDef = `router.${route.method.toLowerCase()} ('${expressPathPatched}', ${middlewareString}${idMapMiddlewareCustom}${controllerInstanceName}.${customOpId}.bind(${controllerInstanceName})); // Custom operation`;
          if (needsTsIgnoreCustom) {
            routeDefinitions.push(`// @ts-ignore`);
            routeDefinitions.push(routeDef);
          } else {
            routeDefinitions.push(routeDef);
          }
        } else {
          Logger.debug(
            `[generateRouteFile] No controller instance for ${controllerInstanceName} (custom op ${customOpId}) from path ${route.path}. Skipping.`
          );
        }
      }
    }

    const routeContent = `import express from 'express';
${imports.join("\n")}

const router = express.Router();

${instantiations.join("\n")}

${routeDefinitions.join("\n")}

export default router;
`;

    await writeFile(
      // Use writeFile from utils
      path.join(this.outDir, specName, "routes", "index.ts"),
      routeContent
    );
  }

  private async generateControllers(
    controllersConfig: ControllerConfig[],
    specName: string,
    pathToSchemaKey: Record<string, string>,
    api: OpenAPIV3.Document,
    resourceNames: Set<string>
  ): Promise<void> {
    const controllerDir = path.join(this.outDir, specName, "controllers");
    ensureDirs(controllerDir);

    const indexFileEntries: string[] = [];

    // Collect all custom operationIds for this spec
    const customOpsByResource: Record<string, Set<string>> = {};
    for (const config of controllersConfig) {
      const pathSegments = config.path?.split("/").filter(Boolean) || [];
      if (pathSegments.length === 0) continue;
      const baseResource = pluralize.singular(pathSegments[0]).toLowerCase();
      // Determine if this is a CRUD op
      const isCollection = pathSegments.length === 1;
      const isItem = pathSegments.length > 1 && pathSegments[1].startsWith("{");
      let isCrud = false;
      if (isCollection && ["get", "post"].includes(config.method.toLowerCase()))
        isCrud = true;
      if (
        isItem &&
        ["get", "put", "patch", "delete"].includes(config.method.toLowerCase())
      )
        isCrud = true;
      if (!isCrud) {
        if (!customOpsByResource[baseResource])
          customOpsByResource[baseResource] = new Set();
        customOpsByResource[baseResource].add(config.operationId);
      }
    }

    for (const resource of resourceNames) {
      if (!resource) continue; // Skip if resource name is empty

      const singularResourceName = pluralize.singular(resource);
      const pascalResourceName = toPascalCase(singularResourceName);
      const customOpKey = singularResourceName.toLowerCase();
      const pluralResourceName = normalizeResourceKey(resource); // for resourceKey
      const controllerClassName = `${pascalResourceName}Controller`;
      const controllerFileName = `${controllerClassName}.ts`;
      const controllerFilePath = path.join(controllerDir, controllerFileName);
      const resourceTypeName = pascalResourceName;

      // Generate stubs for custom operationIds
      let customStubs = "";
      if (customOpsByResource[customOpKey]) {
        for (const opId of customOpsByResource[customOpKey]) {
          Logger.warn(
            `[GENERATOR] Generating stub for custom operationId '${opId}' in ${controllerClassName}`
          );
          customStubs += `\n  /**\n   * Custom operation stub for '${opId}'.\n   * TODO: Implement this method.\n   */\n  async ${opId}(req: Request, res: Response): Promise<void> {\n    // This is a generated stub.\n    res.status(501).json({ error: 'Not implemented: ${opId}' });\n  }\n`;
        }
      }

      const controllerFileContent = `import { BaseController } from "../../../src/controllers/BaseController.js";
import type { Request, Response } from 'express'; // For custom methods or complex hooks
// import type { ${resourceTypeName} } from "../../interfaces"; // Placeholder for type import

export class ${controllerClassName} extends BaseController<any> { // Using 'any' for now
  public resourceKey = "${pluralResourceName}";
${customStubs}
  // You can add custom hooks or override CRUD methods here.
}
`;
      await writeFile(controllerFilePath, controllerFileContent);
      indexFileEntries.push(`export * from './${controllerClassName}.js';`);
      Logger.debug(`Generated controller file: ${controllerFilePath}`);
    }

    // Generate the index.ts file for controllers
    const indexFileContent = indexFileEntries.join("\n");
    await writeFile(path.join(controllerDir, "index.ts"), indexFileContent);
    Logger.debug(
      `Generated controller index file: ${path.join(controllerDir, "index.ts")}`
    );
  }

  private _determineSchemaKeyAndMappings(
    pathItem: OpenAPIV3.PathItemObject,
    baseResource: string,
    api: OpenAPIV3.Document,
    pathToSchemaKey: Record<string, string>, // Though not directly used here for assignment, it might be in future or for context
    normalizedPath: string // For logging primarily
  ): { schemaKey: string | null; updatedApi: OpenAPIV3.Document } {
    let schemaKey: string | null = null;
    let inlineSchema: any = null;
    let getOp = (pathItem.get || (pathItem as any)["get"]) as
      | OpenAPIV3.OperationObject
      | undefined;
    let postOp = (pathItem.post || (pathItem as any)["post"]) as
      | OpenAPIV3.OperationObject
      | undefined;

    if (getOp && getOp.responses) {
      const resp =
        getOp.responses["200"] ||
        getOp.responses["201"] ||
        getOp.responses["default"];
      if (
        resp &&
        (resp as any).content &&
        (resp as any).content["application/json"]
      ) {
        const schema = (resp as any).content["application/json"].schema;
        if (schema) {
          Logger.debug("[GENERATOR][DEBUG] Response schema for", {
            pathUrl: normalizedPath,
            schema,
          });
          if ((schema as any).type === "array" && (schema as any).items) {
            const items = (schema as any).items;
            if (items.$ref) {
              schemaKey = extractSchemaKey(items.$ref);
              if (schemaKey) {
                Logger.debug(
                  "[GENERATOR][DEBUG] Array items $ref detected, schemaKey:",
                  { schemaKey }
                );
              }
            } else if (items.type === "object") {
              inlineSchema = items;
              Logger.debug(
                "[GENERATOR][DEBUG] Array items inline object detected"
              );
            }
          } else if ((schema as any).$ref) {
            schemaKey = extractSchemaKey((schema as any).$ref);
            if (schemaKey) {
              Logger.debug(
                "[GENERATOR][DEBUG] Top-level object $ref detected, schemaKey:",
                { schemaKey }
              );
            }
          } else if ((schema as any).type === "object") {
            inlineSchema = schema;
            Logger.debug("[GENERATOR][DEBUG] Top-level inline object detected");
          }
        }
      }
    }

    if (!schemaKey && postOp && postOp.requestBody) {
      const content = (postOp.requestBody as any).content;
      if (
        content &&
        content["application/json"] &&
        content["application/json"].schema
      ) {
        const schema = content["application/json"].schema;
        if (schema.$ref) {
          schemaKey = extractSchemaKey(schema.$ref);
          if (schemaKey) {
            Logger.debug(
              "[GENERATOR][DEBUG] POST requestBody $ref detected, schemaKey:",
              { schemaKey }
            );
          }
        } else if (schema.type === "object") {
          inlineSchema = schema;
          Logger.debug(
            "[GENERATOR][DEBUG] POST requestBody inline object detected"
          );
        }
      }
    }

    if (!schemaKey && pathItem.put && (pathItem.put as any).requestBody) {
      const content = ((pathItem.put as any).requestBody as any).content;
      if (
        content &&
        content["application/json"] &&
        content["application/json"].schema
      ) {
        const schema = content["application/json"].schema;
        if (schema.$ref) {
          schemaKey = extractSchemaKey(schema.$ref);
          if (schemaKey) {
            Logger.debug(
              "[GENERATOR][DEBUG] PUT requestBody $ref detected, schemaKey:",
              { schemaKey }
            );
          }
        } else if (schema.type === "object") {
          inlineSchema = schema;
          Logger.debug(
            "[GENERATOR][DEBUG] PUT requestBody inline object detected"
          );
        }
      }
    }

    if (!schemaKey && inlineSchema) {
      schemaKey = pluralize.singular(
        baseResource.charAt(0).toUpperCase() + baseResource.slice(1)
      );
      if (!api.components) api.components = { schemas: {} };
      if (!api.components.schemas) api.components.schemas = {};
      if (!api.components.schemas[schemaKey]) {
        api.components.schemas[schemaKey] = inlineSchema;
      }
      Logger.debug("[GENERATOR][DEBUG] Synthesized inline schemaKey:", {
        schemaKey,
      });
    }
    return { schemaKey, updatedApi: api };
  }

  private _processOperation(
    method: string,
    operation: any, // OpenAPIV3.OperationObject | any, but needs check
    pathItem: OpenAPIV3.PathItemObject,
    normalizedPath: string,
    routes: RouteConfig[],
    controllerConfigs: ControllerConfig[]
  ) {
    if (
      method === "parameters" ||
      !operation ||
      typeof operation !== "object" ||
      !("responses" in operation)
    )
      return;

    const op = operation as OpenAPIV3.OperationObject;
    const operationId =
      op.operationId || this.generateOperationId(method, normalizedPath);

    const parameters = [
      ...((pathItem.parameters || []) as OpenAPIV3.ParameterObject[]),
      ...((op.parameters || []) as OpenAPIV3.ParameterObject[]),
    ];

    routes.push({
      path: normalizedPath,
      method,
      operationId,
      parameters,
      requestBody: op.requestBody as OpenAPIV3.RequestBodyObject,
      responses: op.responses,
    });

    controllerConfigs.push({
      operationId,
      method,
      parameters,
      requestBody: op.requestBody as OpenAPIV3.RequestBodyObject,
      responses: op.responses,
      path: normalizedPath,
    });
  }

  // Removed generateControllerFunction and its helper detectIdField from here.
  // toCamelCase is kept as it's used by generateRouteFile.
}

// Helper to camelCase a string (e.g., get_users -> getUsers, createPostComment -> createPostComment)
function toCamelCase(str: string): string {
  // Only convert snake_case or kebab-case to camelCase, leave camelCase as is
  if (/[-_]/.test(str)) {
    return str.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
  }
  // If already camelCase or PascalCase, just lowercase the first letter
  return str.charAt(0).toLowerCase() + str.slice(1);
}

// 1. Helper: Detect the primary ID field for a schema (id, {resourceName}Id, etc.)
function detectIdField(resourceName: string, schema: any): string {
  if (!schema || !schema.properties) return "id";
  if (schema.properties.id) return "id";
  const camel =
    resourceName.charAt(0).toLowerCase() + resourceName.slice(1) + "Id";
  if (schema.properties[camel]) return camel;
  const snake =
    resourceName.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() + "_id";
  if (schema.properties[snake]) return snake;
  const blid = Object.keys(schema.properties).find(
    (k) => k.toLowerCase() === "blid"
  );
  if (blid) return blid;
  const anyId = Object.keys(schema.properties).find((k) => k.match(/id$/i));
  if (anyId) return anyId;
  return Object.keys(schema.properties)[0] || "id";
}

// 2. When generating controllers, use the detected ID field for lookups
// In generateControllerFunction, for item endpoints, replace '.id' with '[idField]'

// Helper to convert a string to PascalCase (e.g., user_input -> UserInput, post -> Post, testmockitem -> TestMockItem)
function toPascalCase(str: string): string {
  return str
    .replace(/(^|_|-|\s)+(\w)/g, (_, __, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(\w)/, (m) => m.toUpperCase());
}

// Helper to normalize resource keys to plural, lowercased form
function normalizeResourceKey(resource: string): string {
  return pluralize.plural(resource).toLowerCase();
}
