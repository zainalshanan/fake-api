import * as fs from 'fs';
import * as path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPIV3 } from 'openapi-types';
import type { RouteConfig, ControllerConfig } from './types.js';

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

    // Extract routes and controllers from paths
    for (const [pathUrl, pathItem] of Object.entries(api.paths || {})) {
      if (!pathItem) continue;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === 'parameters' || !operation) continue;

        const op = operation as OpenAPIV3.OperationObject;
        const operationId = op.operationId || this.generateOperationId(method, pathUrl);
        
        const parameters = [
          ...(pathItem.parameters || []) as OpenAPIV3.ParameterObject[],
          ...(op.parameters || []) as OpenAPIV3.ParameterObject[]
        ];

        routes.push({
          path: pathUrl,
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
          responses: op.responses
        });
      }
    }

    // Create directories
    const apiDir = path.join(this.outDir, specName);
    fs.mkdirSync(path.join(apiDir, 'routes'), { recursive: true });
    fs.mkdirSync(path.join(apiDir, 'controllers'), { recursive: true });

    // Generate files
    await this.generateRouteFile(routes, specName);
    await this.generateControllers(controllers, specName);
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

${routes.map(route => `
router.${route.method.toLowerCase()}('${route.path}', controllers.${route.operationId});`).join('')}

export default router;
`;

    fs.writeFileSync(
      path.join(this.outDir, specName, 'routes', 'index.ts'),
      routeContent
    );
  }

  private async generateControllers(controllers: ControllerConfig[], specName: string): Promise<void> {
    const controllerContent = `import type { Request, Response } from 'express';
import db from '../../../src/db.js';

${controllers.map(controller => this.generateControllerFunction(controller)).join('\n\n')}
`;

    fs.writeFileSync(
      path.join(this.outDir, specName, 'controllers', 'index.ts'),
      controllerContent
    );
  }

  private generateControllerFunction(controller: ControllerConfig): string {
    const pathParams = controller.parameters
      ?.filter(p => p.in === 'path')
      .map(p => p.name) || [];

    const successResponse = Object.entries(controller.responses)
      .find(([code]) => code.startsWith('2'));
    
    const getPathWithParams = `req.path.replace(/\\{([^}]+)\\}/g, (_, p) => req.params[p])`;
    
    switch (controller.method.toLowerCase()) {
      case 'get':
        if (pathParams.length > 0) {
          return `export const ${controller.operationId} = async (req: Request, res: Response) => {
  const data = await db.get(${getPathWithParams});
  if (!data) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(data);
};`;
        }
        return `export const ${controller.operationId} = async (req: Request, res: Response) => {
  const data = await db.get(${getPathWithParams});
  res.json(data || []);
};`;
      
      case 'post':
        return `export const ${controller.operationId} = async (req: Request, res: Response) => {
  const data = await db.create(${getPathWithParams}, req.body);
  res.status(201).json(data);
};`;
      
      case 'put':
        return `export const ${controller.operationId} = async (req: Request, res: Response) => {
  const data = await db.update(${getPathWithParams}, req.body);
  if (!data) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(data);
};`;
      
      case 'patch':
        return `export const ${controller.operationId} = async (req: Request, res: Response) => {
  const data = await db.patch(${getPathWithParams}, req.body);
  if (!data) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(data);
};`;
      
      case 'delete':
        return `export const ${controller.operationId} = async (req: Request, res: Response) => {
  await db.delete(${getPathWithParams});
  res.status(204).send();
};`;
      
      default:
        return `export const ${controller.operationId} = async (req: Request, res: Response) => {
  res.status(501).json({ error: 'Not implemented' });
};`;
    }
  }
}
