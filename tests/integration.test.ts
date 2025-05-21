import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import request from 'supertest';
import { Generator } from '../src/generator';
import { Server } from '../src/server';
import { createTestDirs, cleanTestDirs, createTestSwagger, createTestDb, TEST_DIRS, TEST_USER_SCHEMA, TEST_USERS } from './test-helper';
import { Server as HttpServer } from 'http';
import express from 'express';

describe('Full API Integration', () => {
  const testPort = 3002;
  let server: Server;
  let httpServer: HttpServer;
  let app: express.Application;

  before(async () => {
    createTestDirs();

    // Create test swagger file with a complete API spec
    const testSwagger = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A test API for integration testing'
      },
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: {
              '200': {
                description: 'List of users',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/User'
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            operationId: 'createUser',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/User'
                  }
                }
              }
            },
            responses: {
              '201': {
                description: 'User created',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/User'
                    }
                  }
                }
              }
            }
          }
        },
        '/users/{id}': {
          get: {
            operationId: 'getUserById',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: {
                  type: 'integer'
                }
              }
            ],
            responses: {
              '200': {
                description: 'User found',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/User'
                    }
                  }
                }
              },
              '404': {
                description: 'User not found'
              }
            }
          },
          put: {
            operationId: 'updateUser',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: {
                  type: 'integer'
                }
              }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/User'
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'User updated',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/User'
                    }
                  }
                }
              }
            }
          },
          delete: {
            operationId: 'deleteUser',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: {
                  type: 'integer'
                }
              }
            ],
            responses: {
              '204': {
                description: 'User deleted'
              }
            }
          }
        }
      },
      components: {
        schemas: {
          User: TEST_USER_SCHEMA
        }
      }
    };

    createTestSwagger('test-api', testSwagger);

    // Generate routes and controllers
    const generator = new Generator(TEST_DIRS.SPEC, TEST_DIRS.OUT);
    await generator.generate();

    // Create mock data
    createTestDb({ users: TEST_USERS });

    // Start server
    server = new Server(TEST_DIRS.SPEC, TEST_DIRS.OUT, testPort);
    await server.start();
    app = server['app'];
    httpServer = app.listen(testPort);
  });

  after(async () => {
    if (httpServer && httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
    cleanTestDirs();
  });

  describe('Generated API Endpoints', () => {
    it('should list all users', async () => {
      const response = await request(app)
        .get('/api/test-api/users')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).to.be.an('array');
      expect(response.body).to.have.lengthOf(2);
      expect(response.body[0]).to.have.all.keys(['id', 'name', 'email']);
    });

    it('should create a new user', async () => {
      const newUser = {
        id: 3,
        name: 'Test User 3',
        email: 'user3@test.com'
      };

      const response = await request(app)
        .post('/api/test-api/users')
        .send(newUser)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).to.deep.equal(newUser);

      // Verify user was added
      const listResponse = await request(app)
        .get('/api/test-api/users')
        .expect(200);

      expect(listResponse.body).to.have.lengthOf(3);
    });

    it('should get a user by id', async () => {
      const response = await request(app)
        .get('/api/test-api/users/1')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).to.deep.equal(TEST_USERS[0]);
    });

    it('should update a user', async () => {
      const updatedUser = {
        id: 1,
        name: 'Updated User 1',
        email: 'updated1@test.com'
      };

      const response = await request(app)
        .put('/api/test-api/users/1')
        .send(updatedUser)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).to.deep.equal(updatedUser);

      // Verify user was updated
      const getResponse = await request(app)
        .get('/api/test-api/users/1')
        .expect(200);

      expect(getResponse.body).to.deep.equal(updatedUser);
    });

    it('should delete a user', async () => {
      await request(app)
        .delete('/api/test-api/users/2')
        .expect(204);

      // Verify user was deleted
      const response = await request(app)
        .get('/api/test-api/users')
        .expect(200);

      expect(response.body).to.have.lengthOf(2);
      expect(response.body.find((u: any) => u.id === 2)).to.be.undefined;
    });

    it('should validate request body', async () => {
      const invalidUser = {
        id: 4,
        name: 'Invalid User' // missing required email field
      };

      const response = await request(app)
        .post('/api/test-api/users')
        .send(invalidUser)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).to.have.property('errors');
    });

    it('should handle not found errors', async () => {
      await request(app)
        .get('/api/test-api/users/999')
        .expect(404);
    });
  });
}); 