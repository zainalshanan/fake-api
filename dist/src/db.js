import { Database } from './server.js';
import * as path from 'path';
const db = new Database(path.join(process.cwd(), 'generated', 'db.json'));
export default db;
//# sourceMappingURL=db.js.map