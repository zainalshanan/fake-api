import { Database } from '../src/server';
import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import sinon from 'sinon';

describe('Database', () => {
  let database: Database;
  let sandbox: sinon.SinonSandbox;
  const testDbPath = path.join(process.cwd(), 'test-db.json');

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Create test database file
    const initialData = {
      users: [
        { id: 1, name: 'Test User 1' },
        { id: 2, name: 'Test User 2' }
      ],
      posts: [
        { id: 1, title: 'Test Post 1', userId: 1 }
      ]
    };
    
    fs.writeFileSync(testDbPath, JSON.stringify(initialData, null, 2));
    database = new Database(testDbPath);
  });

  afterEach(() => {
    sandbox.restore();
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (err) {
      console.error('Error cleaning up test database:', err);
    }
  });

  describe('get()', () => {
    it('should retrieve data for valid path', async () => {
      const users = await database.get('/users');
      expect(users).to.be.an('array');
      expect(users).to.have.lengthOf(2);
      expect(users[0].name).to.equal('Test User 1');
    });

    it('should return null for invalid path', async () => {
      const result = await database.get('/invalid/path');
      expect(result).to.be.null;
    });

    it('should handle nested paths', async () => {
      const post = await database.get('/posts/0');
      expect(post).to.deep.equal({ id: 1, title: 'Test Post 1', userId: 1 });
    });
  });

  describe('create()', () => {
    it('should create new record in existing collection', async () => {
      const newUser = { id: 3, name: 'Test User 3' };
      const result = await database.create('/users', newUser);
      
      expect(result).to.deep.equal(newUser);
      const users = await database.get('/users');
      expect(users).to.have.lengthOf(3);
      expect(users[2]).to.deep.equal(newUser);
    });

    it('should create new collection if it doesn\'t exist', async () => {
      const newComment = { id: 1, text: 'Test Comment' };
      await database.create('/comments', newComment);
      
      const comments = await database.get('/comments');
      expect(comments).to.be.an('array');
      expect(comments[0]).to.deep.equal(newComment);
    });

    it('should handle nested paths', async () => {
      const newItem = { id: 1, value: 'test' };
      await database.create('/nested/deep/items', newItem);
      
      const items = await database.get('/nested/deep/items');
      expect(items[0]).to.deep.equal(newItem);
    });
  });

  describe('update()', () => {
    it('should update existing record', async () => {
      const updatedUser = { id: 1, name: 'Updated User 1' };
      const result = await database.update('/users', updatedUser);
      
      expect(result).to.deep.equal(updatedUser);
      const users = await database.get('/users');
      expect(users[0]).to.deep.equal(updatedUser);
    });

    it('should return null if record not found', async () => {
      const result = await database.update('/users', { id: 999, name: 'Non-existent' });
      expect(result).to.be.null;
    });

    it('should return null if path is invalid', async () => {
      const result = await database.update('/invalid/path', { id: 1 });
      expect(result).to.be.null;
    });
  });

  describe('patch()', () => {
    it('should partially update existing record', async () => {
      const patch = { id: 1, email: 'test@example.com' };
      const result = await database.patch('/users', patch);
      
      expect(result.name).to.equal('Test User 1');
      expect(result.email).to.equal('test@example.com');
    });

    it('should handle non-existent fields', async () => {
      const patch = { id: 1, newField: 'value' };
      const result = await database.patch('/users', patch);
      
      expect(result.name).to.equal('Test User 1');
      expect(result.newField).to.equal('value');
    });
  });

  describe('delete()', () => {
    it('should delete existing record', async () => {
      await database.delete('/users/1');
      
      const users = await database.get('/users');
      expect(users).to.have.lengthOf(1);
      expect(users[0].id).to.equal(2);
    });

    it('should handle non-existent record', async () => {
      await database.delete('/users/999');
      
      const users = await database.get('/users');
      expect(users).to.have.lengthOf(2);
    });

    it('should handle invalid path', async () => {
      await database.delete('/invalid/path');
      
      const users = await database.get('/users');
      expect(users).to.have.lengthOf(2);
    });
  });
}); 