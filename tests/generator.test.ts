import { Generator } from '../src/generator';
import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import sinon from 'sinon';
import SwaggerParser from '@apidevtools/swagger-parser';

describe('Generator', () => {
  let generator: Generator;
  let sandbox: sinon.SinonSandbox;
  const testSpecDir = 'test-swagger';
  const testOutDir = 'test-generated';

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    generator = new Generator(testSpecDir, testOutDir);

    // Create test directories
    if (!fs.existsSync(testSpecDir)) {
      fs.mkdirSync(testSpecDir, { recursive: true });
    }
    if (!fs.existsSync(testOutDir)) {
      fs.mkdirSync(testOutDir, { recursive: true });
    }
  });

  afterEach(() => {
    sandbox.restore();
    // Clean up test directories
    if (fs.existsSync(testSpecDir)) {
      fs.rmSync(testSpecDir, { recursive: true });
    }
    if (fs.existsSync(testOutDir)) {
      fs.rmSync(testOutDir, { recursive: true });
    }
  });

  describe('generate()', () => {
    it('should generate routes and controllers for valid swagger spec', async () => {
      // Create test swagger file
      const testSwagger = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'Success' } }
            },
            post: {
              operationId: 'createUser',
              responses: { '201': { description: 'Created' } }
            }
          }
        }
      };

      fs.writeFileSync(
        path.join(testSpecDir, 'test-api.yaml'),
        JSON.stringify(testSwagger)
      );

      await generator.generate();

      // Verify route file was generated
      const routeFile = path.join(testOutDir, 'test-api', 'routes', 'index.ts');
      expect(fs.existsSync(routeFile)).to.be.true;
      const routeContent = fs.readFileSync(routeFile, 'utf-8');
      expect(routeContent).to.include('router.get(\'/users\'');
      expect(routeContent).to.include('router.post(\'/users\'');

      // Verify controller file was generated
      const controllerFile = path.join(testOutDir, 'test-api', 'controllers', 'index.ts');
      expect(fs.existsSync(controllerFile)).to.be.true;
      const controllerContent = fs.readFileSync(controllerFile, 'utf-8');
      expect(controllerContent).to.include('export const getUsers');
      expect(controllerContent).to.include('export const createUser');
    });

    it('should handle empty paths in swagger spec', async () => {
      const testSwagger = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {}
      };

      fs.writeFileSync(
        path.join(testSpecDir, 'empty-api.yaml'),
        JSON.stringify(testSwagger)
      );

      await generator.generate();

      const routeFile = path.join(testOutDir, 'empty-api', 'routes', 'index.ts');
      expect(fs.existsSync(routeFile)).to.be.true;
      const routeContent = fs.readFileSync(routeFile, 'utf-8');
      expect(routeContent).to.include('const router = express.Router();');
    });

    it('should generate operationId if not provided in swagger', async () => {
      const testSwagger = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/items': {
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      fs.writeFileSync(
        path.join(testSpecDir, 'no-operation-id.yaml'),
        JSON.stringify(testSwagger)
      );

      await generator.generate();

      const controllerFile = path.join(testOutDir, 'no-operation-id', 'controllers', 'index.ts');
      expect(fs.existsSync(controllerFile)).to.be.true;
      const controllerContent = fs.readFileSync(controllerFile, 'utf-8');
      expect(controllerContent).to.include('export const getitems');
    });

    it('should handle parameters at path and operation level', async () => {
      const testSwagger = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            get: {
              parameters: [
                {
                  name: 'fields',
                  in: 'query',
                  schema: { type: 'string' }
                }
              ],
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      fs.writeFileSync(
        path.join(testSpecDir, 'params-api.yaml'),
        JSON.stringify(testSwagger)
      );

      await generator.generate();

      const controllerFile = path.join(testOutDir, 'params-api', 'controllers', 'index.ts');
      expect(fs.existsSync(controllerFile)).to.be.true;
      const controllerContent = fs.readFileSync(controllerFile, 'utf-8');
      expect(controllerContent).to.include('export const getUsersById');
    });
  });
}); 