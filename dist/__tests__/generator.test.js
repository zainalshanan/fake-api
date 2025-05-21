import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
vi.mock('fs', () => ({
    default: {
        readdirSync: vi.fn(),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
    },
    readdirSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
}));
import * as fs from 'fs';
import path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPIV3 } from 'openapi-types';
import { Generator } from '../src/generator.js';
// Mock dependencies
vi.mock('@apidevtools/swagger-parser');
describe('Generator', () => {
    const mockSpecDir = '/mock/specs';
    const mockOutDir = '/mock/out';
    let generator;
    // Mock API specification
    const mockApiSpec = {
        paths: {
            '/users': {
                get: {
                    operationId: 'getUsers',
                    responses: {
                        '200': {
                            description: 'Success'
                        }
                    }
                },
                post: {
                    operationId: 'createUser',
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object'
                                }
                            }
                        }
                    },
                    responses: {
                        '201': {
                            description: 'Created'
                        }
                    }
                }
            },
            '/users/{userId}': {
                parameters: [
                    {
                        name: 'userId',
                        in: 'path',
                        required: true,
                        schema: {
                            type: 'string'
                        }
                    }
                ],
                get: {
                    operationId: 'getUserById',
                    responses: {
                        '200': {
                            description: 'Success'
                        },
                        '404': {
                            description: 'Not Found'
                        }
                    }
                }
            }
        }
    };
    beforeEach(() => {
        vi.clearAllMocks();
        fs.readdirSync.mockReturnValue(['api.yaml']);
        fs.mkdirSync.mockImplementation(() => undefined);
        fs.writeFileSync.mockImplementation(() => undefined);
        // Mock SwaggerParser
        SwaggerParser.parse.mockResolvedValue(mockApiSpec);
        // Create generator instance
        generator = new Generator(mockSpecDir, mockOutDir);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    describe('generate', () => {
        it('should generate API files for each spec', async () => {
            await generator.generate();
            expect(fs.readdirSync).toHaveBeenCalledWith(mockSpecDir);
            expect(SwaggerParser.parse).toHaveBeenCalledWith(path.join(mockSpecDir, 'api.yaml'));
            // Check if directories are created
            expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining(path.join(mockOutDir, 'api', 'routes')), { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining(path.join(mockOutDir, 'api', 'controllers')), { recursive: true });
            // Check if files are written
            expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining(path.join(mockOutDir, 'api', 'routes', 'index.js')), expect.stringContaining('router.get'));
            expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining(path.join(mockOutDir, 'api', 'controllers', 'index.js')), expect.stringContaining('export const getUsers'));
        });
        it('should skip when no paths are defined', async () => {
            SwaggerParser.parse.mockResolvedValue({});
            await generator.generate();
            // Should still try to create directories but won't generate meaningful content
            expect(fs.mkdirSync).toHaveBeenCalledTimes(2);
            expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
        });
    });
    describe('generateOperationId', () => {
        it('should generate proper operation IDs for simple paths', () => {
            // Use any to access private method
            const operationId = generator.generateOperationId('get', '/users');
            expect(operationId).toBe('getusers');
        });
        it('should generate proper operation IDs for paths with ID parameters', () => {
            // Use any to access private method
            const operationId = generator.generateOperationId('get', '/users/{userId}');
            expect(operationId).toBe('getusersById');
        });
    });
    describe('generateControllerFunction', () => {
        it('should generate GET controller for collection', () => {
            // Use any to access private method
            const controller = generator.generateControllerFunction({
                operationId: 'getUsers',
                method: 'get',
                parameters: [],
                responses: { '200': { description: 'Success' } }
            });
            expect(controller).toContain('export const getUsers');
            expect(controller).toContain('await db.get');
            expect(controller).toContain('res.json(data || [])');
        });
        it('should generate GET controller for single resource', () => {
            // Use any to access private method
            const controller = generator.generateControllerFunction({
                operationId: 'getUserById',
                method: 'get',
                parameters: [{ name: 'userId', in: 'path' }],
                responses: { '200': { description: 'Success' } }
            });
            expect(controller).toContain('export const getUserById');
            expect(controller).toContain('res.status(404).json({ error: \'Not found\' })');
        });
        it('should generate POST controller', () => {
            // Use any to access private method
            const controller = generator.generateControllerFunction({
                operationId: 'createUser',
                method: 'post',
                parameters: [],
                responses: { '201': { description: 'Created' } }
            });
            expect(controller).toContain('export const createUser');
            expect(controller).toContain('await db.create');
            expect(controller).toContain('res.status(201).json(data)');
        });
    });
});
//# sourceMappingURL=generator.test.js.map