import { OpenAPIV3 } from "openapi-types";

export interface CLIOptions {
  specDir: string;
  outDir: string;
  port: number;
}

export interface RouteConfig {
  path: string;
  method: string;
  operationId: string;
  parameters: OpenAPIV3.ParameterObject[];
  requestBody?: OpenAPIV3.RequestBodyObject;
  responses: OpenAPIV3.ResponsesObject;
  middleware?: string[];
}

export interface ControllerConfig {
  operationId: string;
  method: string;
  parameters: OpenAPIV3.ParameterObject[];
  requestBody?: OpenAPIV3.RequestBodyObject;
  responses: OpenAPIV3.ResponsesObject;
  path?: string;
}

export interface MockStrategy {
  setSchemas: (
    schemas: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>
  ) => void;
  getGeneratedIds: () => Record<string, string[]>;
  clearGeneratedIds: () => void;
  generateMockItem: (
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    resourceName: string,
    depth?: number,
    maxDepth?: number
  ) => any;
  generateMockValue: (
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    resourceName: string,
    depth?: number,
    maxDepth?: number
  ) => any;
}

export interface MockConfig {
  path: string;
  method: string;
  schema: any;
  examples?: any[];
}

export interface GeneratedRoute {
  path: string;
  controllers: string[];
  routes: string;
}
