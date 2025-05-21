import * as fs from 'fs';
import * as path from 'path';

export const TEST_DIRS = {
  SPEC: 'test-swagger',
  OUT: 'test-generated'
};

export function cleanTestDirs() {
  Object.values(TEST_DIRS).forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
    }
  });
}

export function createTestDirs() {
  Object.values(TEST_DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export function createTestSwagger(name: string, spec: any) {
  fs.writeFileSync(
    path.join(TEST_DIRS.SPEC, `${name}.yaml`),
    JSON.stringify(spec, null, 2)
  );
}

export function createTestDb(data: any) {
  fs.writeFileSync(
    path.join(TEST_DIRS.OUT, 'db.json'),
    JSON.stringify(data, null, 2)
  );
}

export const TEST_USER_SCHEMA = {
  type: 'object',
  required: ['id', 'name', 'email'],
  properties: {
    id: {
      type: 'integer',
      description: 'Unique identifier'
    },
    name: {
      type: 'string',
      description: 'User name'
    },
    email: {
      type: 'string',
      format: 'email',
      description: 'User email'
    }
  }
};

export const TEST_USERS = [
  { id: 1, name: 'Test User 1', email: 'user1@test.com' },
  { id: 2, name: 'Test User 2', email: 'user2@test.com' }
]; 