// Thorough integration test script for Fake API Generator
const { execSync, spawn } = require('child_process');
const axios = require('axios');
const path = require('path');

const SERVER_PORT = 4000;
const BASE_URL = `http://localhost:${SERVER_PORT}/api/example-api`;

function logStep(msg) {
  console.log(`\n=== ${msg} ===`);
}

async function main() {
  try {
    logStep('Generating routes and controllers');
    execSync('npm run generate', { stdio: 'inherit' });

    logStep('Generating mock data');
    execSync('npm run mock', { stdio: 'inherit' });

    logStep('Starting server');
    const server = spawn('npm', ['run', 'serve', '--', '--port', SERVER_PORT], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: SERVER_PORT, NODE_ENV: 'production' },
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      let settled = false;
      server.stdout.on('data', (data) => {
        if (!settled && data.toString().includes('listening')) {
          settled = true;
          setTimeout(resolve, 1000); // Give it a moment more
        }
      });
      server.stderr.on('data', (data) => {
        if (!settled && data.toString().toLowerCase().includes('error')) {
          settled = true;
          reject(new Error(data.toString()));
        }
      });
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(); // fallback after 5s
        }
      }, 5000);
    });

    // Test endpoints
    logStep('Testing API endpoints');
    let createdUserId = null;

    // 1. GET /users
    try {
      const res = await axios.get(`${BASE_URL}/users`);
      console.log('GET /users:', res.status, res.data);
    } catch (e) {
      console.error('GET /users failed:', e.response?.status, e.response?.data);
    }

    // 2. POST /users (valid)
    let user = {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
    };
    try {
      const res = await axios.post(`${BASE_URL}/users`, user);
      console.log('POST /users:', res.status, res.data);
      createdUserId = res.data.id;
    } catch (e) {
      console.error('POST /users failed:', e.response?.status, e.response?.data);
    }

    // 3. POST /users (duplicate email)
    try {
      const res = await axios.post(`${BASE_URL}/users`, user);
      console.log('POST /users (duplicate):', res.status, res.data);
    } catch (e) {
      console.error('POST /users (duplicate) failed:', e.response?.status, e.response?.data);
    }

    // 4. POST /users (invalid input)
    try {
      const res = await axios.post(`${BASE_URL}/users`, { email: 'bad' });
      console.log('POST /users (invalid):', res.status, res.data);
    } catch (e) {
      console.error('POST /users (invalid) failed:', e.response?.status, e.response?.data);
    }

    // 5. GET /users/{userId} (valid)
    if (createdUserId) {
      try {
        const res = await axios.get(`${BASE_URL}/users/${createdUserId}`);
        console.log(`GET /users/${createdUserId}:`, res.status, res.data);
      } catch (e) {
        console.error(`GET /users/${createdUserId} failed:`, e.response?.status, e.response?.data);
      }
    }

    // 6. GET /users/{userId} (not found)
    try {
      const res = await axios.get(`${BASE_URL}/users/doesnotexist`);
      console.log('GET /users/doesnotexist:', res.status, res.data);
    } catch (e) {
      console.error('GET /users/doesnotexist failed:', e.response?.status, e.response?.data);
    }

    // 7. PUT /users/{userId} (valid)
    if (createdUserId) {
      try {
        const updated = {
          email: 'updated@example.com',
          firstName: 'Updated',
          lastName: 'User',
        };
        const res = await axios.put(`${BASE_URL}/users/${createdUserId}`, updated);
        console.log(`PUT /users/${createdUserId}:`, res.status, res.data);
      } catch (e) {
        console.error(`PUT /users/${createdUserId} failed:`, e.response?.status, e.response?.data);
      }
    }

    // 8. PUT /users/{userId} (invalid input)
    if (createdUserId) {
      try {
        const res = await axios.put(`${BASE_URL}/users/${createdUserId}`, { email: 'bad' });
        console.log(`PUT /users/${createdUserId} (invalid):`, res.status, res.data);
      } catch (e) {
        console.error(`PUT /users/${createdUserId} (invalid) failed:`, e.response?.status, e.response?.data);
      }
    }

    // 9. PUT /users/{userId} (not found)
    try {
      const updated = {
        email: 'notfound@example.com',
        firstName: 'NF',
        lastName: 'User',
      };
      const res = await axios.put(`${BASE_URL}/users/doesnotexist`, updated);
      console.log('PUT /users/doesnotexist:', res.status, res.data);
    } catch (e) {
      console.error('PUT /users/doesnotexist failed:', e.response?.status, e.response?.data);
    }

    // 10. PATCH /users/{userId} (valid)
    if (createdUserId) {
      try {
        const patch = { firstName: 'Patched' };
        const res = await axios.patch(`${BASE_URL}/users/${createdUserId}`, patch);
        console.log(`PATCH /users/${createdUserId}:`, res.status, res.data);
      } catch (e) {
        console.error(`PATCH /users/${createdUserId} failed:`, e.response?.status, e.response?.data);
      }
    }

    // 11. PATCH /users/{userId} (invalid input)
    if (createdUserId) {
      try {
        const res = await axios.patch(`${BASE_URL}/users/${createdUserId}`, {});
        console.log(`PATCH /users/${createdUserId} (invalid):`, res.status, res.data);
      } catch (e) {
        console.error(`PATCH /users/${createdUserId} (invalid) failed:`, e.response?.status, e.response?.data);
      }
    }

    // 12. PATCH /users/{userId} (not found)
    try {
      const patch = { firstName: 'NF' };
      const res = await axios.patch(`${BASE_URL}/users/doesnotexist`, patch);
      console.log('PATCH /users/doesnotexist:', res.status, res.data);
    } catch (e) {
      console.error('PATCH /users/doesnotexist failed:', e.response?.status, e.response?.data);
    }

    // 13. DELETE /users/{userId} (valid)
    if (createdUserId) {
      try {
        const res = await axios.delete(`${BASE_URL}/users/${createdUserId}`);
        console.log(`DELETE /users/${createdUserId}:`, res.status);
      } catch (e) {
        console.error(`DELETE /users/${createdUserId} failed:`, e.response?.status, e.response?.data);
      }
    }

    // 14. DELETE /users/{userId} (not found)
    try {
      const res = await axios.delete(`${BASE_URL}/users/doesnotexist`);
      console.log('DELETE /users/doesnotexist:', res.status, res.data);
    } catch (e) {
      console.error('DELETE /users/doesnotexist failed:', e.response?.status, e.response?.data);
    }

    // 15. DELETE /users/{userId} (invalid id)
    try {
      const res = await axios.delete(`${BASE_URL}/users/`);
      console.log('DELETE /users/ (invalid id):', res.status, res.data);
    } catch (e) {
      console.error('DELETE /users/ (invalid id) failed:', e.response?.status, e.response?.data);
    }

    // 16. GET /users (should be empty or not include deleted user)
    try {
      const res = await axios.get(`${BASE_URL}/users`);
      console.log('GET /users (after delete):', res.status, res.data);
    } catch (e) {
      console.error('GET /users (after delete) failed:', e.response?.status, e.response?.data);
    }

    // 17. GET /users with pagination (should return 1 user)
    try {
      const res = await axios.get(`${BASE_URL}/users?page=1&limit=1`);
      console.log('GET /users?page=1&limit=1:', res.status, res.data);
    } catch (e) {
      console.error('GET /users?page=1&limit=1 failed:', e.response?.status, e.response?.data);
    }

    // 18. GET /users (censored email)
    try {
      const res = await axios.get(`${BASE_URL}/users`);
      const allCensored = Array.isArray(res.data) && res.data.every(u => u.email === '***' || u.email === undefined);
      console.log('GET /users (censored email):', res.status, allCensored ? 'PASS' : 'FAIL', res.data);
    } catch (e) {
      console.error('GET /users (censored email) failed:', e.response?.status, e.response?.data);
    }

    // 19. GET /users/error (forced error)
    try {
      await axios.get(`${BASE_URL}/users/error`);
      console.error('GET /users/error: Expected error but got success');
    } catch (e) {
      if (e.response && e.response.status === 500 && e.response.data && e.response.data.error === 'Forced error for testing') {
        console.log('GET /users/error (forced error): PASS', e.response.status, e.response.data);
      } else {
        console.error('GET /users/error (forced error): FAIL', e.response?.status, e.response?.data);
      }
    }

    // Cleanup
    server.kill();
    logStep('Test script finished');
  } catch (err) {
    console.error('Test script error:', err);
    process.exit(1);
  }
}

main(); 