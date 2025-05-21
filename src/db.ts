import { Database } from './server';
import * as path from 'path';

const db = new Database(path.join(process.cwd(), 'db.json'));

export default db; 