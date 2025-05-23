import * as fs from 'fs';
import * as path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPIV3 } from 'openapi-types';
import type { RouteConfig, ControllerConfig } from './types.js';
import pluralize from 'pluralize';

export class Generator {
  private specDir: string;
  private outDir: string;

  constructor(specDir: string, outDir: string) {
    this.specDir = specDir;
    this.outDir = outDir;
  }

  async generate(): Promise<void> {
    const specs = fs.readdirSync(this.specDir)
      .filter(file => file.endsWith('.yaml') || file.endsWith('.json'));

    for (const spec of specs) {
      const api = await SwaggerParser.parse(path.join(this.specDir, spec)) as OpenAPIV3.Document;
      const specName = path.basename(spec, path.extname(spec));
      
      await this.generateApiFiles(api, specName);
    }
  }

  private async generateApiFiles(api: OpenAPIV3.Document, specName: string): Promise<void> {
    const routes: RouteConfig[] = [];
    const controllers: ControllerConfig[] = [];
    const pathToSchemaKey: Record<string, string> = {};

    // Extract routes and controllers from paths
    for (const [pathUrl, pathItem] of Object.entries(api.paths || {})) {
      if (!pathItem) continue;

      // Remove leading slash for consistency
      const normalizedPath = pathUrl.startsWith('/') ? pathUrl.slice(1) : pathUrl;
      const segments = normalizedPath.split('/');
      // Find the base resource (e.g., 'products' in 'products/{productId}')
      const baseResource = segments.find(seg => !seg.startsWith('{') && !seg.endsWith('}')) || segments[0];
      const singularResource = pluralize.singular(baseResource);
      const pluralResource = pluralize.plural(baseResource);

      // Property endpoint detection: /resource/{id}/property
      const isPropertyEndpoint = segments.length === 3 && segments[1].startsWith('{') && !segments[2].startsWith('{');
      if (isPropertyEndpoint) {
        // Map property endpoints to the parent resource schema key
        const parentPath = segments.slice(0, 2).join('/'); // e.g., products/{productId}
        const parentSchemaKey = pathToSchemaKey[parentPath] || pathToSchemaKey[baseResource] || pluralize.singular(baseResource.charAt(0).toUpperCase() + baseResource.slice(1));
        pathToSchemaKey[normalizedPath] = parentSchemaKey;
        console.log('[GENERATOR][DEBUG] Property endpoint detected, mapping', normalizedPath, 'to parent schemaKey:', parentSchemaKey);
      } else {
        // Debug: Start processing path
        console.log('[GENERATOR][DEBUG] Processing path:', pathUrl, '| normalized:', normalizedPath);

        // Try to find schema from GET response or POST requestBody
        let schemaKey: string | null = null;
        let inlineSchema: any = null;
        let getOp = (pathItem.get || (pathItem as any)['get']) as OpenAPIV3.OperationObject | undefined;
        let postOp = (pathItem.post || (pathItem as any)['post']) as OpenAPIV3.OperationObject | undefined;
        // Prefer GET response for collections, POST requestBody for creation
        if (getOp && getOp.responses) {
          const resp = getOp.responses['200'] || getOp.responses['201'] || getOp.responses['default'];
          if (resp && (resp as any).content && (resp as any).content['application/json']) {
            const schema = (resp as any).content['application/json'].schema;
            if (schema) {
              // Debug: Show detected response schema
              console.log('[GENERATOR][DEBUG] Response schema for', pathUrl, ':', JSON.stringify(schema));
              // STRICT: Only use top-level array items or object for main resource
              if ((schema as any).type === 'array' && (schema as any).items) {
                const items = (schema as any).items;
                if (items.$ref) {
                  const match = items.$ref.match(/#\/components\/schemas\/(.+)$/);
                  if (match) {
                    schemaKey = match[1];
                    console.log('[GENERATOR][DEBUG] Array items $ref detected, schemaKey:', schemaKey);
                  }
                } else if (items.type === 'object') {
                  // Inline object schema for array items
                  inlineSchema = items;
                  console.log('[GENERATOR][DEBUG] Array items inline object detected');
                }
              } else if ((schema as any).$ref) {
                // Top-level object $ref
                const match = (schema as any).$ref.match(/#\/components\/schemas\/(.+)$/);
                if (match) {
                  schemaKey = match[1];
                  console.log('[GENERATOR][DEBUG] Top-level object $ref detected, schemaKey:', schemaKey);
                }
              } else if ((schema as any).type === 'object') {
                // Top-level inline object schema
                inlineSchema = schema;
                console.log('[GENERATOR][DEBUG] Top-level inline object detected');
              }
              // Do NOT traverse into nested properties (e.g., comments inside Post)
            }
          }
        }
        // If not found, try POST requestBody
        if (!schemaKey && postOp && postOp.requestBody) {
          const content = (postOp.requestBody as any).content;
          if (content && content['application/json'] && content['application/json'].schema) {
            const schema = content['application/json'].schema;
            if (schema.$ref) {
              const match = schema.$ref.match(/#\/components\/schemas\/(.+)$/);
              if (match) {
                schemaKey = match[1];
                console.log('[GENERATOR][DEBUG] POST requestBody $ref detected, schemaKey:', schemaKey);
              }
            } else if (schema.type === 'object') {
              inlineSchema = schema;
              console.log('[GENERATOR][DEBUG] POST requestBody inline object detected');
            }
          }
        }
        // If still not found, try PUT requestBody (for item endpoints)
        if (!schemaKey && pathItem.put && (pathItem.put as any).requestBody) {
          const content = ((pathItem.put as any).requestBody as any).content;
          if (content && content['application/json'] && content['application/json'].schema) {
            const schema = content['application/json'].schema;
            if (schema.$ref) {
              const match = schema.$ref.match(/#\/components\/schemas\/(.+)$/);
              if (match) {
                schemaKey = match[1];
                console.log('[GENERATOR][DEBUG] PUT requestBody $ref detected, schemaKey:', schemaKey);
              }
            } else if (schema.type === 'object') {
              inlineSchema = schema;
              console.log('[GENERATOR][DEBUG] PUT requestBody inline object detected');
            }
          }
        }
        // If inline schema, synthesize a singular schema key
        if (!schemaKey && inlineSchema) {
          // Use singular, capitalized baseResource for the key
          schemaKey = pluralize.singular(baseResource.charAt(0).toUpperCase() + baseResource.slice(1));
          // Add to components.schemas for mock data generator compatibility
          if (!api.components) api.components = { schemas: {} };
          if (!api.components.schemas) api.components.schemas = {};
          if (!api.components.schemas[schemaKey]) {
            api.components.schemas[schemaKey] = inlineSchema;
          }
          console.log('[GENERATOR][DEBUG] Synthesized inline schemaKey:', schemaKey);
        }
        if (schemaKey) {
          // Always set the full normalizedPath and itemPath
          pathToSchemaKey[normalizedPath] = schemaKey;
          // Only set base/plural/singular if not already set
          if (!pathToSchemaKey.hasOwnProperty(baseResource)) {
            pathToSchemaKey[baseResource] = schemaKey;
          } else {
            console.log('[GENERATOR][DEBUG] Skipping baseResource mapping for', baseResource, 'already set to', pathToSchemaKey[baseResource]);
          }
          if (!pathToSchemaKey.hasOwnProperty(singularResource)) {
            pathToSchemaKey[singularResource] = schemaKey;
          } else {
            console.log('[GENERATOR][DEBUG] Skipping singularResource mapping for', singularResource, 'already set to', pathToSchemaKey[singularResource]);
          }
          if (!pathToSchemaKey.hasOwnProperty(pluralResource)) {
            pathToSchemaKey[pluralResource] = schemaKey;
          } else {
            console.log('[GENERATOR][DEBUG] Skipping pluralResource mapping for', pluralResource, 'already set to', pathToSchemaKey[pluralResource]);
          }
          // Also map item endpoints (e.g., products/{productId})
          const itemPath = segments.length > 1 && segments[1].startsWith('{') ? `${baseResource}/{${segments[1].slice(1)}}` : null;
          if (itemPath) {
            pathToSchemaKey[itemPath] = schemaKey;
          }
          console.log('[GENERATOR][DEBUG] Final pathToSchemaKey mapping for', pathUrl, ':', schemaKey);
        } else {
          console.log('[GENERATOR][DEBUG] No schemaKey found for', pathUrl);
        }

        for (const [method, operation] of Object.entries(pathItem)) {
          if (method === 'parameters' || !operation) continue;

          const op = operation as OpenAPIV3.OperationObject;
          const operationId = op.operationId || this.generateOperationId(method, pathUrl);
          
          const parameters = [
            ...(pathItem.parameters || []) as OpenAPIV3.ParameterObject[],
            ...(op.parameters || []) as OpenAPIV3.ParameterObject[]
          ];

          routes.push({
            path: normalizedPath,
            method,
            operationId,
            parameters,
            requestBody: op.requestBody as OpenAPIV3.RequestBodyObject,
            responses: op.responses
          });

          controllers.push({
            operationId,
            method,
            parameters,
            requestBody: op.requestBody as OpenAPIV3.RequestBodyObject,
            responses: op.responses,
            path: normalizedPath
          });
        }
      }
    }

    // After collecting all routes/controllers, ensure property endpoint controllers are always generated
    for (const [normalizedPath, schemaKey] of Object.entries(pathToSchemaKey)) {
      const segments = normalizedPath.split('/');
      const isPropertyEndpoint = segments.length === 3 && segments[1].startsWith('{') && !segments[2].startsWith('{');
      if (isPropertyEndpoint) {
        // Find or synthesize operationId
        const baseResource = segments[0];
        const property = segments[2];
        const opId = `get${pluralize.singular(baseResource.charAt(0).toUpperCase() + baseResource.slice(1))}${property.charAt(0).toUpperCase() + property.slice(1)}`;
        // Only add if not already present
        if (!controllers.find(c => c.operationId === opId)) {
          controllers.push({
            operationId: opId,
            method: 'get',
            parameters: [
              { name: segments[1].slice(1, -1), in: 'path', required: true, schema: { type: 'string' } }
            ],
            path: `/${normalizedPath}`,
            responses: {},
          });
        }
        // Also add to routes if not already present
        if (!routes.find(r => r.operationId === opId)) {
          routes.push({
            path: normalizedPath,
            method: 'get',
            operationId: opId,
            parameters: [
              { name: segments[1].slice(1, -1), in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {},
          });
        }
      }
    }

    // Create directories
    const apiDir = path.join(this.outDir, specName);
    fs.mkdirSync(path.join(apiDir, 'routes'), { recursive: true });
    fs.mkdirSync(path.join(apiDir, 'controllers'), { recursive: true });

    // Generate files
    console.log('[DEBUG] Generating route file for', specName);
    await this.generateRouteFile(routes, specName);
    console.log('[DEBUG] Generating controller file for', specName, pathToSchemaKey);
    await this.generateControllers(controllers, specName, pathToSchemaKey);
  }

  private generateOperationId(method: string, pathUrl: string): string {
    const segments = pathUrl.split('/').filter(Boolean);
    const resource = segments[0];
    const action = segments.length > 1 ? segments[1] : '';
    
    if (action.startsWith('{') && action.endsWith('}')) {
      // Path has an ID parameter
      return `${method}${resource}ById`;
    }
    
    return `${method}${resource}${action ? action.charAt(0).toUpperCase() + action.slice(1) : ''}`;
  }

  private async generateRouteFile(routes: RouteConfig[], specName: string): Promise<void> {
    const routeContent = `import express from 'express';
import * as controllers from '../controllers/index.js';

const router = express.Router();

${routes.map(route => {
  const path = route.path.startsWith('/') ? route.path : '/' + route.path;
  const opId = toCamelCase(route.operationId);
  return `router.${route.method.toLowerCase()}('${path.replace(/\{([^}]+)\}/g, ':$1')}', controllers.${opId});`;
}).join('')}

// Add property endpoint routes that may not be in the OpenAPI paths
${Object.values(routes).filter(r => r.path.match(/\{[^}]+\}\/[^/]+$/)).map(route => {
  const path = route.path.startsWith('/') ? route.path : '/' + route.path;
  const opId = toCamelCase(route.operationId);
  return `router.get('${path.replace(/\{([^}]+)\}/g, ':$1')}', controllers.${opId});`;
}).join('')}

export default router;
`;

    fs.writeFileSync(
      path.join(this.outDir, specName, 'routes', 'index.ts'),
      routeContent
    );
  }

  private async generateControllers(controllers: ControllerConfig[], specName: string, pathToSchemaKey: Record<string, string>): Promise<void> {
    // Inline detectIdField helper for generated controllers
    const detectIdFieldHelper = `
function detectIdField(resourceName: string, schema: any): string {
  if (!schema || !schema.properties) return 'id';
  if (schema.properties.id) return 'id';
  const camel = resourceName.charAt(0).toLowerCase() + resourceName.slice(1) + 'Id';
  if (schema.properties[camel]) return camel;
  const snake = resourceName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() + '_id';
  if (schema.properties[snake]) return snake;
  const blid = Object.keys(schema.properties).find(k => k.toLowerCase() === 'blid');
  if (blid) return blid;
  const anyId = Object.keys(schema.properties).find(k => k.match(/id$/i));
  if (anyId) return anyId;
  return Object.keys(schema.properties)[0] || 'id';
}
`;

    // Inline the schemas object from the OpenAPI spec
    const api = await SwaggerParser.parse(path.join(this.specDir, specName + '.yaml')) as OpenAPIV3.Document;
    const schemasObj = api.components && api.components.schemas ? api.components.schemas : {};
    const schemasInline = `const schemas: Record<string, any> = ${JSON.stringify(schemasObj, null, 2)};`;

    const controllerContent = `
${detectIdFieldHelper}
${schemasInline}
import type { Request, Response } from 'express';
import db from '../../../src/db.js';
import pluralize from 'pluralize';

const pathToSchemaKey: Record<string, string> = ${JSON.stringify(pathToSchemaKey, null, 2)};
const specName = ${JSON.stringify(specName)};

${controllers.map(controller => this.generateControllerFunction(controller, true, pathToSchemaKey, true)).join('\n\n')}
`;

    fs.writeFileSync(
      path.join(this.outDir, specName, 'controllers', 'index.ts'),
      controllerContent
    );
  }

  private generateControllerFunction(controller: ControllerConfig, useNamespace = false, pathToSchemaKey?: Record<string, string>, inlineSchemas = false): string {
    const pathParams = controller.parameters
      ?.filter(p => p.in === 'path')
      .map(p => p.name) || [];

    const getPathWithParams = `req.path.replace(/\{([^}]+)\}/g, (_, p) => req.params[p])`;
    const nsPrefix = useNamespace ? '`${specName}/` + ' : '';

    const camelOpId = toCamelCase(controller.operationId);

    // The following code will be injected directly into the generated controller function
    const schemaKeyLogic = `
  let key = Object.keys(pathToSchemaKey).find(k => req.route.path.includes(k.replace(/\{[^}]+\}/g, '')))
    || pluralize.singular(req.route.path.split('/')[1])
    || pluralize.plural(req.route.path.split('/')[1]);
  let schemaKey = 'Unknown';
  if (key && pathToSchemaKey[key]) schemaKey = pathToSchemaKey[key];
`;

    // Helper: inject flexible id field detection for item endpoints
    const idFieldLogic = inlineSchemas
      ? `
  // Flexible ID field detection
  const schema = schemas && schemas[schemaKey] ? schemas[schemaKey] : undefined;
  const idField = schema ? detectIdField(schemaKey, schema) : 'id';
`
      : `
  // Flexible ID field detection
  const schemas = require('../../../swagger/' + specName + '.yaml').components.schemas;
  const schema = schemas && schemas[schemaKey] ? schemas[schemaKey] : undefined;
  const idField = schema ? detectIdField(schemaKey, schema) : 'id';
`;

    // GENERIC NESTED/RELATED RESOURCE HANDLING
    // If the path is /resource/{id}/subresource, try to return the subresource property from the parent resource
    if (controller.method === 'get' && controller.path && controller.path.match(/\{[^}]+\}\/[^/]+$/)) {
      return `export const ${controller.operationId} = async (req: Request, res: Response) => {
        console.log('[DEBUG] ROUTE HIT: ${controller.operationId}', req.method, req.originalUrl);
        let key = Object.keys(pathToSchemaKey).find(k => req.route.path.includes(k.replace(/\{[^}]+\}/g, '')))
          || pluralize.singular(req.route.path.split('/')[1])
          || pluralize.plural(req.route.path.split('/')[1]);
        let schemaKey = 'Unknown';
        if (key && pathToSchemaKey[key]) schemaKey = pathToSchemaKey[key];
        const schema = schemas && schemas[schemaKey] ? schemas[schemaKey] : undefined;
        const idField = schema ? detectIdField(schemaKey, schema) : 'id';
        const dbPath = \`${'${specName}/'}\` + schemaKey;
        const id = req.params[Object.keys(req.params)[0]];
        const dataArr = await db.get(dbPath);
        const parent = dataArr && Array.isArray(dataArr) ? dataArr.find((item: any) => item[idField] === id) : null;
        // Extract subresource name from path
        const subresource = req.route.path.split('/').pop();
        console.log('[DEBUG] Property endpoint:', { subresource, parentKeys: parent ? Object.keys(parent) : null });
        if (parent && Object.prototype.hasOwnProperty.call(parent, subresource)) {
          res.json(parent[subresource]);
          return;
        }
        // Fallback: try to look up subresource as a top-level collection using pathToSchemaKey
        let subKey = pathToSchemaKey[subresource] || pluralize.singular(subresource) || pluralize.plural(subresource);
        if (subKey && schemas[subKey]) {
          const subDbPath = \`${'${specName}/'}\` + subKey;
          const subArr = await db.get(subDbPath);
          const subId = req.params[Object.keys(req.params)[1]] || req.params[subresource + 'Id'] || req.params.id;
          const subSchema = schemas[subKey];
          const subIdField = subSchema ? detectIdField(subKey, subSchema) : 'id';
          const subData = subArr && Array.isArray(subArr) ? subArr.find((item: any) => item[subIdField] === subId) : null;
          if (subData) {
            res.json(subData);
            return;
          }
        }
        res.status(404).json({ error: 'Not found' });
      };`;
    }
    // GENERIC SINGLE RESOURCE LOOKUP
    if (controller.method === 'get' && controller.path && controller.path.match(/\{[^}]+\}$/)) {
      return `export const ${controller.operationId} = async (req: Request, res: Response) => {
        console.log('[DEBUG] ROUTE HIT: ${controller.operationId}', req.method, req.originalUrl);
        let key = Object.keys(pathToSchemaKey).find(k => req.route.path.includes(k.replace(/\{[^}]+\}/g, '')))
          || pluralize.singular(req.route.path.split('/')[1])
          || pluralize.plural(req.route.path.split('/')[1]);
        let schemaKey = 'Unknown';
        if (key && pathToSchemaKey[key]) schemaKey = pathToSchemaKey[key];
        const schema = schemas && schemas[schemaKey] ? schemas[schemaKey] : undefined;
        const idField = schema ? detectIdField(schemaKey, schema) : 'id';
        const dbPath = \`${'${specName}/'}\` + schemaKey;
        const id = req.params[Object.keys(req.params)[0]];
        const dataArr = await db.get(dbPath);
        const data = dataArr && Array.isArray(dataArr) ? dataArr.find((item: any) => item[idField] === id) : null;
        if (!data) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        res.json(data);
      };`;
    }
    // GENERIC PROPERTY LOOKUP (e.g., /resource/{id}/property)
    if (controller.method === 'get' && controller.path && controller.path.match(/\{[^}]+\}\/[^/]+$/)) {
      return `export const ${controller.operationId} = async (req: Request, res: Response) => {
        console.log('[DEBUG] ROUTE HIT: ${controller.operationId}', req.method, req.originalUrl);
        let key = Object.keys(pathToSchemaKey).find(k => req.route.path.includes(k.replace(/\{[^}]+\}/g, '')))
          || pluralize.singular(req.route.path.split('/')[1])
          || pluralize.plural(req.route.path.split('/')[1]);
        let schemaKey = 'Unknown';
        if (key && pathToSchemaKey[key]) schemaKey = pathToSchemaKey[key];
        const schema = schemas && schemas[schemaKey] ? schemas[schemaKey] : undefined;
        const idField = schema ? detectIdField(schemaKey, schema) : 'id';
        const dbPath = \`${'${specName}/'}\` + schemaKey;
        const id = req.params[Object.keys(req.params)[0]];
        const dataArr = await db.get(dbPath);
        const parent = dataArr && Array.isArray(dataArr) ? dataArr.find((item: any) => item[idField] === id) : null;
        if (!parent) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        // Extract property name from path
        const property = req.route.path.split('/').pop();
        console.log('[DEBUG] Property endpoint:', { subresource: property, parentKeys: parent ? Object.keys(parent) : null });
        if (Object.prototype.hasOwnProperty.call(parent, property)) {
          res.json(parent[property]);
        } else {
          res.status(404).json({ error: 'Not found' });
        }
      };`;
    }
    switch (controller.method.toLowerCase()) {
      case 'get':
        if (pathParams.length > 0) {
          // Item endpoint
          return `export const ${camelOpId} = async (req: Request, res: Response) => {
  console.log('[DEBUG] ROUTE HIT: ${camelOpId}', req.method, req.originalUrl);
${schemaKeyLogic}${idFieldLogic}  const dbPath = \`${'${specName}/'}\` + schemaKey;
  const dataArr = await db.get(dbPath);
  const id = req.params.${pathParams[0]};
  const data = dataArr && Array.isArray(dataArr) ? dataArr.find((item: any) => item[idField] === id) : null;
  console.log('[DEBUG] ${camelOpId}', { schemaKey, dbPath, id, idField, found: !!data });
  if (!data) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(data);
};`;
        }
        // Collection endpoint
        return `export const ${camelOpId} = async (req: Request, res: Response) => {
  console.log('[DEBUG] ROUTE HIT: ${camelOpId}', req.method, req.originalUrl);
${schemaKeyLogic}  const dbPath = \`${'${specName}/'}\` + schemaKey;
  const data = await db.get(dbPath);
  console.log('[DEBUG] ${camelOpId}', { schemaKey, dbPath, found: Array.isArray(data) ? data.length : data });
  res.json(data || []);
};`;
      case 'post':
        const postCode = `export const ${camelOpId} = async (req: Request, res: Response) => {\n  console.log('[DEBUG] ROUTE HIT: ${camelOpId}', req.method, req.originalUrl);\n  const data = await db.create(${nsPrefix}${getPathWithParams}, req.body);\n  res.status(201).json(data);\n};`;
        console.log('[DEBUG] Generating POST controller', camelOpId, postCode);
        return postCode;
      case 'put':
        const putCode = `export const ${camelOpId} = async (req: Request, res: Response) => {\n  console.log('[DEBUG] ROUTE HIT: ${camelOpId}', req.method, req.originalUrl);\n${schemaKeyLogic}${idFieldLogic}  const dbPath = \`${'${specName}/'}\` + schemaKey;\n  const id = req.params.${pathParams[0]};\n  let dataArr = await db.get(dbPath);\n  let data = dataArr && Array.isArray(dataArr) ? dataArr.find((item: any) => item[idField] === id) : null;\n  if (!data) {\n    res.status(404).json({ error: 'Not found' });\n    return;\n  }\n  data = await db.update(${nsPrefix}${getPathWithParams}, req.body);\n  res.json(data);\n};`;
        console.log('[DEBUG] Generating PUT controller', camelOpId, putCode);
        return putCode;
      case 'patch':
        const patchCode = `export const ${camelOpId} = async (req: Request, res: Response) => {\n  console.log('[DEBUG] ROUTE HIT: ${camelOpId}', req.method, req.originalUrl);\n${schemaKeyLogic}${idFieldLogic}  const dbPath = \`${'${specName}/'}\` + schemaKey;\n  const id = req.params.${pathParams[0]};\n  let dataArr = await db.get(dbPath);\n  let data = dataArr && Array.isArray(dataArr) ? dataArr.find((item: any) => item[idField] === id) : null;\n  if (!data) {\n    res.status(404).json({ error: 'Not found' });\n    return;\n  }\n  data = await db.patch(${nsPrefix}${getPathWithParams}, req.body);\n  res.json(data);\n};`;
        console.log('[DEBUG] Generating PATCH controller', camelOpId, patchCode);
        return patchCode;
      case 'delete':
        const deleteCode = `export const ${camelOpId} = async (req: Request, res: Response) => {\n  console.log('[DEBUG] ROUTE HIT: ${camelOpId}', req.method, req.originalUrl);\n${schemaKeyLogic}${idFieldLogic}  const dbPath = \`${'${specName}/'}\` + schemaKey;\n  const id = req.params.${pathParams[0]};\n  let dataArr = await db.get(dbPath);\n  let data = dataArr && Array.isArray(dataArr) ? dataArr.find((item: any) => item[idField] === id) : null;\n  if (!data) {\n    res.status(404).json({ error: 'Not found' });\n    return;\n  }\n  await db.delete(${nsPrefix}${getPathWithParams});\n  res.status(204).send();\n};`;
        console.log('[DEBUG] Generating DELETE controller', camelOpId, deleteCode);
        return deleteCode;
      default:
        const defaultCode = `export const ${camelOpId} = async (req: Request, res: Response) => {\n  console.log('[DEBUG] ROUTE HIT: ${camelOpId}', req.method, req.originalUrl);\n  res.status(501).json({ error: 'Not implemented' });\n};`;
        console.log('[DEBUG] Generating DEFAULT controller', camelOpId, defaultCode);
        return defaultCode;
    }
  }
}

// Helper to camelCase a string (e.g., getusers -> getUsers, get_users -> getUsers)
function toCamelCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
            .replace(/^(.)/, (m) => m.toLowerCase());
}

// 1. Helper: Detect the primary ID field for a schema (id, {resourceName}Id, etc.)
function detectIdField(resourceName: string, schema: any): string {
  if (!schema || !schema.properties) return 'id';
  if (schema.properties.id) return 'id';
  const camel = resourceName.charAt(0).toLowerCase() + resourceName.slice(1) + 'Id';
  if (schema.properties[camel]) return camel;
  const snake = resourceName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() + '_id';
  if (schema.properties[snake]) return snake;
  const blid = Object.keys(schema.properties).find(k => k.toLowerCase() === 'blid');
  if (blid) return blid;
  const anyId = Object.keys(schema.properties).find(k => k.match(/id$/i));
  if (anyId) return anyId;
  return Object.keys(schema.properties)[0] || 'id';
}

// 2. When generating controllers, use the detected ID field for lookups
// In generateControllerFunction, for item endpoints, replace '.id' with '[idField]'
