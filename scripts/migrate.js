import 'dotenv/config';
import { initSchema } from '../src/db/db.js';
initSchema();
console.log('Schema up to date.');
