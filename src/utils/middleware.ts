import express from "express";
import { OpenAPIV3 } from "openapi-types";
import { OpenApiValidator } from "openapi-data-validator";
import { Logger } from "./logger.js";
import {
  findOpenApiPath,
  castQueryToString,
  castHeadersToString,
} from "./openapi.js";

/**
 * Extract path parameters from URL based on OpenAPI path template.
 * @param requestPath - Express request path
 * @param openapiPath - OpenAPI path template
 * @returns Record of path parameters
 */
// Exported for testing purposes
export function extractPathParams(
  requestPath: string,
  openapiPath: string
): Record<string, string> {
  const params: Record<string, string> = {};
  const requestParts = requestPath.split("/");
  const templateParts = openapiPath.split("/");

  templateParts.forEach((part, i) => {
    if (part.startsWith("{") && part.endsWith("}")) {
      const paramName = part.slice(1, -1);
      params[paramName] = requestParts[i];
    }
  });
  return params;
}

export function openApiValidatorMiddleware(
  apiSpec: OpenAPIV3.Document
): express.RequestHandler {
  const openApiValidatorInstance = new OpenApiValidator({
    apiSpec: apiSpec as any,
  });
  const validateRequest = openApiValidatorInstance.createValidator();

  return async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const openapiPath = findOpenApiPath(req.path, apiSpec.paths || {});
    Logger.debug(
      `[OpenAPI Validator] Validating: method=${req.method}, path=${openapiPath}, originalReqPath=${req.path}`
    );

    const pathParams = extractPathParams(req.path, openapiPath);
    Logger.debug(`[OpenAPI Validator] Path params:`, { params: pathParams });

    try {
      await validateRequest({
        method: req.method,
        route: openapiPath,
        query: castQueryToString(req.query as Record<string, any>),
        headers: castHeadersToString(req.headers as Record<string, any>),
        path: pathParams,
        body: req.body,
      });
      next();
    } catch (validationError: any) {
      Logger.error("OpenAPI Data Validator Error:", { error: validationError });
      const details =
        validationError.errors || validationError.message || validationError;
      res.status(400).json({ error: "Request validation failed", details });
    }
  };
}

export function stripBasePathMiddleware(
  basePath: string
): express.RequestHandler {
  return (req, _res, next) => {
    if (req.originalUrl.startsWith(basePath)) {
      const stripped = req.originalUrl.slice(basePath.length) || "/";
      Logger.debug(
        `[StripBasePath] originalUrl: ${req.originalUrl} -> ${stripped}`
      );
      (req as any).originalUrl = stripped; // Mutate for validator
      req.url = stripped; // Mutate for router
    }
    next();
  };
}
