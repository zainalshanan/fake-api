import { Server } from '../src/server';
import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import sinon from 'sinon';
import request from 'supertest';
import express from 'express';
import { createTestDirs, cleanTestDirs, createTestSwagger, createTestDb, TEST_DIRS, TEST_USERS } from './test-helper';
import { Server as HttpServer } from 'http';

describe('Server', () => {
  let server: Server;
  let httpServer: HttpServer;
  let sandbox: sinon.SinonSandbox;
  const testPort = 3001;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    createTestDirs();

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

    createTestSwagger('test-api', testSwagger);
    createTestDb({ users: TEST_USERS });

    server = new Server(TEST_DIRS.SPEC, TEST_DIRS.OUT, testPort);
  });

  afterEach(async () => {
    sandbox.restore();
    cleanTestDirs();
    
    // Close server if it was started
    if (httpServer && httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  describe('start()', () => {
    it('should start server and load routes', async () => {
      const listenStub = sandbox.stub(express.application, 'listen').returns(httpServer);
      await server.start();
      expect(listenStub.calledWith(testPort)).to.be.true;
    });

    it('should load middleware', async () => {
      const useSpy = sandbox.spy(express.application, 'use');
      await server.start();
      expect(useSpy.called).to.be.true;
    });
  });

  describe('setupMiddleware()', () => {
    it('should set up JSON and URL-encoded middleware', async () => {
      const useSpy = sandbox.spy(express.application, 'use');
      await server.start();
      expect(useSpy.calledWith(sinon.match.func)).to.be.true;
      expect(useSpy.calledWith(sinon.match.func)).to.be.true;
    });
  });

  describe('setupRoutes()', () => {
    it('should load routes from generated files', async () => {
      const useSpy = sandbox.spy(express.application, 'use');
      await server.start();
      expect(useSpy.calledWith('/api/test-api', sinon.match.func)).to.be.true;
    });

    it('should handle missing route files gracefully', async () => {
      cleanTestDirs();
      createTestDirs();
      
      const useSpy = sandbox.spy(express.application, 'use');
      await server.start();
      expect(useSpy.calledWith('/api/test-api')).to.be.false;
    });
  });

  describe('API Integration', () => {
    let app: express.Application;

    beforeEach(async () => {
      await server.start();
      app = server['app'];
      httpServer = app.listen(testPort + 1); // Use a different port for integration tests
    });

    afterEach(async () => {
      if (httpServer && httpServer.listening) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
      }
    });

    it('should handle GET request', async () => {
      const response = await request(app)
        .get('/api/test-api/users')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).to.be.an('array');
      expect(response.body).to.have.lengthOf(2);
    });

    it('should handle POST request', async () => {
      const newUser = { id: 3, name: 'Test User 3' };
      const response = await request(app)
        .post('/api/test-api/users')
        .send(newUser)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).to.deep.equal(newUser);
    });

    it('should handle validation errors', async () => {
      const invalidUser = { invalid: 'data' };
      const response = await request(app)
        .post('/api/test-api/users')
        .send(invalidUser)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).to.have.property('errors');
    });

    it('should handle 404 for non-existent routes', async () => {
      await request(app)
        .get('/api/test-api/nonexistent')
        .expect(404);
    });
  });
}); 