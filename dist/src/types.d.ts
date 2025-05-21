import { OpenAPIV3 } from 'openapi-types';
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
}
export interface ControllerConfig {
    operationId: string;
    method: string;
    parameters: OpenAPIV3.ParameterObject[];
    requestBody?: OpenAPIV3.RequestBodyObject;
    responses: OpenAPIV3.ResponsesObject;
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
