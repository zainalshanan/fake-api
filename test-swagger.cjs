const SwaggerParser = require('@apidevtools/swagger-parser');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const SWAGGER_PATH = path.join(__dirname, 'swagger', 'test-swagger.yaml');
const BASE_URL = 'http://localhost:3000/api/test-swagger/users';

async function validateSwagger() {
  try {
    const api = await SwaggerParser.validate(SWAGGER_PATH);
    console.log('Swagger is valid!\n');
    return api;
  } catch (err) {
    console.error('Swagger validation failed:', err.message);
    process.exit(1);
  }
}

async function runTests() {
  // 1. GET /users
  try {
    const res = await axios.get(BASE_URL);
    console.log('GET /users:', res.status, Array.isArray(res.data) ? 'PASS' : 'FAIL', res.data);
  } catch (e) {
    console.error('GET /users failed:', e.response?.status, e.response?.data);
  }

  // 2. GET /users?role=admin
  try {
    const res = await axios.get(BASE_URL + '?role=admin');
    console.log('GET /users?role=admin:', res.status, Array.isArray(res.data) ? 'PASS' : 'FAIL', res.data);
  } catch (e) {
    console.error('GET /users?role=admin failed:', e.response?.status, e.response?.data);
  }

  // 3. GET /users/{id} (valid/invalid)
  let userId = null;
  try {
    const res = await axios.get(BASE_URL);
    if (Array.isArray(res.data) && res.data.length > 0) {
      userId = res.data[0].id;
      const userRes = await axios.get(`${BASE_URL}/${userId}`);
      console.log(`GET /users/${userId}:`, userRes.status, userRes.data ? 'PASS' : 'FAIL', userRes.data);
    } else {
      console.log('No users found to test GET /users/{id}');
    }
  } catch (e) {
    console.error('GET /users/{id} failed:', e.response?.status, e.response?.data);
  }

  // 4. GET /users/{id} (not found)
  try {
    const res = await axios.get(`${BASE_URL}/doesnotexist`);
    console.log('GET /users/doesnotexist:', res.status, res.data);
  } catch (e) {
    if (e.response && e.response.status === 404) {
      console.log('GET /users/doesnotexist: PASS 404', e.response.data);
    } else {
      console.error('GET /users/doesnotexist failed:', e.response?.status, e.response?.data);
    }
  }
}

(async () => {
  await validateSwagger();
  await runTests();
})(); 