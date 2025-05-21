import axios from 'axios';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Server } from '../src/server.js';
import * as path from 'path';
const API_URL = 'http://localhost:3000/api/example-api';
describe('API Integration Tests', () => {
    let server;
    let testUser;
    beforeAll(async () => {
        // Generate routes and controllers
        console.log('Generating routes and controllers...');
        execSync('npm run generate');
        // Generate mock data
        console.log('Generating mock data...');
        execSync('npm run mock');
        // Start the server
        console.log('Starting server...');
        const appServer = new Server(path.join(process.cwd(), 'swagger'), path.join(process.cwd(), 'generated'), 3000);
        server = await appServer.start();
    });
    afterAll(async () => {
        // Cleanup and stop server
        if (server) {
            await new Promise((resolve) => server.close(() => resolve()));
        }
    });
    describe('User CRUD Operations', () => {
        const newUser = {
            email: `test.${uuidv4()}@example.com`,
            firstName: 'Test',
            lastName: 'User'
        };
        test('POST /users - Create a new user', async () => {
            const response = await axios.post(`${API_URL}/users`, newUser);
            expect(response.status).toBe(201);
            expect(response.data).toHaveProperty('id');
            expect(response.data.email).toBe(newUser.email);
            expect(response.data.firstName).toBe(newUser.firstName);
            expect(response.data.lastName).toBe(newUser.lastName);
            testUser = response.data;
        });
        test('GET /users - Get all users', async () => {
            const response = await axios.get(`${API_URL}/users`);
            expect(response.status).toBe(200);
            expect(Array.isArray(response.data)).toBe(true);
            expect(response.data.length).toBeGreaterThan(0);
        });
        test('GET /users/{userId} - Get user by ID', async () => {
            const response = await axios.get(`${API_URL}/users/${testUser.id}`);
            expect(response.status).toBe(200);
            expect(response.data).toEqual(testUser);
        });
        test('PUT /users/{userId} - Update user', async () => {
            const updatedUser = {
                ...newUser,
                firstName: 'Updated',
                lastName: 'Name'
            };
            const response = await axios.put(`${API_URL}/users/${testUser.id}`, updatedUser);
            expect(response.status).toBe(200);
            expect(response.data.firstName).toBe(updatedUser.firstName);
            expect(response.data.lastName).toBe(updatedUser.lastName);
            testUser = response.data;
        });
        test('PATCH /users/{userId} - Partially update user', async () => {
            const partialUpdate = {
                firstName: 'Partially'
            };
            const response = await axios.patch(`${API_URL}/users/${testUser.id}`, partialUpdate);
            expect(response.status).toBe(200);
            expect(response.data.firstName).toBe(partialUpdate.firstName);
            expect(response.data.lastName).toBe(testUser.lastName);
        });
        test('DELETE /users/{userId} - Delete user', async () => {
            const response = await axios.delete(`${API_URL}/users/${testUser.id}`);
            expect(response.status).toBe(204);
            // Verify user is deleted
            try {
                await axios.get(`${API_URL}/users/${testUser.id}`);
            }
            catch (error) {
                if (axios.isAxiosError(error) && error.response) {
                    expect(error.response.status).toBe(404);
                }
                else {
                    throw error;
                }
            }
        });
        test('GET /users with pagination', async () => {
            const response = await axios.get(`${API_URL}/users?page=1&limit=10`);
            expect(response.status).toBe(200);
            expect(Array.isArray(response.data)).toBe(true);
            expect(response.data.length).toBeLessThanOrEqual(10);
        });
    });
});
//# sourceMappingURL=api.test.js.map